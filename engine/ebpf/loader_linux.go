//go:build linux

package ebpf

//go:generate go run github.com/cilium/ebpf/cmd/bpf2go bpf xdp_hook.c -- -I/usr/include/x86_64-linux-gnu

import (
	"context"
	"errors"
	"log"
	"net"
	"os"
	"sync"
	"time"

	"github.com/cilium/ebpf/link"
	"github.com/cilium/ebpf/ringbuf"
	"github.com/your-org/uptime-engine/core"
)

func StartEBPFReader(ctx context.Context, wg *sync.WaitGroup) error {
	var objs bpfObjects
	if err := loadBpfObjects(&objs, nil); err != nil {
		return err
	}

	iface, err := net.InterfaceByName("eth0")
	if err != nil {
		log.Printf("Warning: eth0 not found, trying ens3 for XDP attachment")
		iface, err = net.InterfaceByName("ens3")
		if err != nil {
			return err
		}
	}

	// Try Native Mode first, fallback to Generic Mode
	l, err := link.AttachXDP(link.XDPOptions{
		Program:   objs.XdpPingInterceptor,
		Interface: iface.Index,
		Flags:     0, // Attempt Native Mode
	})
	if err != nil {
		log.Printf("XDP Native Mode failed (%v), falling back to Generic (SKB) Mode...", err)
		l, err = link.AttachXDP(link.XDPOptions{
			Program:   objs.XdpPingInterceptor,
			Interface: iface.Index,
			Flags:     link.XDPGenericMode,
		})
		if err != nil {
			return err
		}
	}
	
	rd, err := ringbuf.NewReader(objs.PingEvents)
	if err != nil {
		l.Close()   // don't leak the XDP link
		objs.Close()
		return err
	}

	log.Printf("XDP Hook attached successfully to interface %s. Ringbuffer started.", iface.Name)

	// Shutdown watcher: close the ringbuf reader first (unblocks Read()),
	// then detach the XDP link, then release all kernel BPF objects.
	go func() {
		<-ctx.Done()
		rd.Close()
		l.Close()
		objs.Close()
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()

		for {
			record, err := rd.Read()
			if err != nil {
				if errors.Is(err, ringbuf.ErrClosed) || errors.Is(err, os.ErrClosed) {
					return
				}
				continue
			}

				// bpf2go creates the bpfPingEventT struct automatically!
				// Wait, doing raw bytes is safer if bpfPingEventT has padding issues.
				// xdp_hook.c packed it: monitor_index (__u16), echoed_hash (__u32)
				// Total size = 6 bytes.
				if len(record.RawSample) >= 14 {
					monitorIndex := uint16(record.RawSample[0]) | uint16(record.RawSample[1])<<8
					echoedHash := uint32(record.RawSample[2]) | uint32(record.RawSample[3])<<8 | uint32(record.RawSample[4])<<16 | uint32(record.RawSample[5])<<24
					ktimeNs := uint64(record.RawSample[6]) | uint64(record.RawSample[7])<<8 | uint64(record.RawSample[8])<<16 | uint64(record.RawSample[9])<<24 | uint64(record.RawSample[10])<<32 | uint64(record.RawSample[11])<<40 | uint64(record.RawSample[12])<<48 | uint64(record.RawSample[13])<<56

					id, ok := core.PortAllocator.Lookup(monitorIndex)
					if !ok {
						continue
					}

					p := core.Store.GetPointer(id)
					if p == nil {
						continue
					}
					m := p.Load()
					if m == nil {
						continue
					}

					expectedHash := core.CalculateHash(m.TargetIP, m.ID, m.CurrentNonce)
					
					isValid := false
					if m.Type == "port" {
						isValid = echoedHash == expectedHash
					} else if m.Type == "ping" {
						isValid = uint16(echoedHash) == uint16(expectedHash)
					}

					if isValid {
						sentNs := core.SentNs[m.AssignedPort].Load()
						var latencyMs uint64
						if sentNs > 0 && ktimeNs > sentNs {
							latencyMs = (ktimeNs - sentNs) / 1000000
						} else {
							latencyMs = uint64(time.Since(m.LastProbeSentAt).Milliseconds())
						}
						
						core.SentNs[m.AssignedPort].Store(0)

						core.HandleSuccess(id, p, uint32(latencyMs))
						
						// NOTE: core.SendRST() was removed because xdp_hook.c now bounces 
						// an RST natively via XDP_TX in zero CPU cost!
					}
				}
			}
	}()
	return nil
}
