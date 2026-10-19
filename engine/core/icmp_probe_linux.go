//go:build linux

package core

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"net"
	"net/netip"
	"os"
	"sync/atomic"
	"syscall"
	"time"
	"unsafe"
)

// Linux sock_extended_err from <linux/errqueue.h>
type sockExtendedErr struct {
	eeErrno  uint32
	eeOrigin uint8
	eeType   uint8
	eeCode   uint8
	eePad    uint8
	eeInfo   uint32
	eeData   uint32
}

const (
	soEEOriginICMP  uint8 = 2
	soEEOriginICMP6 uint8 = 3
)

// CheckICMPCapability tests whether unprivileged non-root ICMP sockets are permitted on this system.
// On Linux, this requires net.ipv4.ping_group_range to encompass the process group ID.
func CheckICMPCapability() (bool, error) {
	fd, err := syscall.Socket(syscall.AF_INET, syscall.SOCK_DGRAM, 1 /* IPPROTO_ICMP */)
	if err != nil {
		if errors.Is(err, syscall.EACCES) || errors.Is(err, syscall.EPERM) {
			return false, fmt.Errorf("ICMP socket creation denied: sysctl net.ipv4.ping_group_range does not include current GID (run: sysctl -w net.ipv4.ping_group_range=\"0 2147483647\") or grant CAP_NET_RAW: %w", err)
		}
		return false, fmt.Errorf("failed to open ICMP socket: %w", err)
	}
	_ = syscall.Close(fd)
	return true, nil
}

// executeICMPProbePlatform executes a non-blocking dual-stack ICMP ping on Linux.
func executeICMPProbePlatform(ctx context.Context, targetIP netip.Addr, cfg ICMPProbeConfig) ICMPProbeResult {
	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = 2 * time.Second
	}

	targetIP = targetIP.Unmap()
	isV6 := targetIP.Is6()
	var family, proto int
	if isV6 {
		family = syscall.AF_INET6
		proto = 58 // IPPROTO_ICMPV6
	} else {
		family = syscall.AF_INET
		proto = 1 // IPPROTO_ICMP
	}

	// Step 1: Open unprivileged datagram socket
	fd, sockErr := syscall.Socket(family, syscall.SOCK_DGRAM, proto)
	if sockErr != nil {
		if errors.Is(sockErr, syscall.EMFILE) || errors.Is(sockErr, syscall.ENFILE) || errors.Is(sockErr, syscall.ENOBUFS) {
			return ICMPProbeResult{
				Success:      false,
				ErrClass:     ErrLocalResource,
				ErrorMessage: fmt.Sprintf("local socket resource exhaustion: %v", sockErr),
				RemoteAddr:   targetIP.String(),
			}
		}
		if errors.Is(sockErr, syscall.EACCES) || errors.Is(sockErr, syscall.EPERM) {
			return ICMPProbeResult{
				Success:      false,
				ErrClass:     ErrUnsupported,
				ErrorMessage: fmt.Sprintf("ICMP ping socket requires sysctl net.ipv4.ping_group_range: %v", sockErr),
				RemoteAddr:   targetIP.String(),
			}
		}
		if errors.Is(sockErr, syscall.EAFNOSUPPORT) || errors.Is(sockErr, syscall.EPROTONOSUPPORT) {
			return ICMPProbeResult{
				Success:      false,
				ErrClass:     ErrUnsupported,
				ErrorMessage: fmt.Sprintf("protocol family not supported on this host: %v", sockErr),
				RemoteAddr:   targetIP.String(),
			}
		}
		return ICMPProbeResult{
			Success:      false,
			ErrClass:     ErrNet,
			ErrorMessage: fmt.Sprintf("ICMP socket open error: %v", sockErr),
			RemoteAddr:   targetIP.String(),
		}
	}

	// Must wrap fd in *os.File and defer f.Close() to prevent runtime finalizer double-close
	f := os.NewFile(uintptr(fd), "icmp-poller")
	defer f.Close()

	// Apply socket TTL if requested
	if cfg.TTL > 0 {
		if isV6 {
			_ = syscall.SetsockoptInt(fd, syscall.IPPROTO_IPV6, syscall.IPV6_UNICAST_HOPS, cfg.TTL)
		} else {
			_ = syscall.SetsockoptInt(fd, syscall.IPPROTO_IP, syscall.IP_TTL, cfg.TTL)
		}
	}

	// Step 2: Enable IP_RECVERR / IPV6_RECVERR for kernel error queue delivery of ICMP Type 3 and Type 11
	if isV6 {
		_ = syscall.SetsockoptInt(fd, syscall.IPPROTO_IPV6, 25 /* IPV6_RECVERR */, 1)
	} else {
		_ = syscall.SetsockoptInt(fd, syscall.IPPROTO_IP, 11 /* IP_RECVERR */, 1)
	}

	// Step 3: Register non-blocking socket with Go runtime poller via net.FilePacketConn
	if err := syscall.SetNonblock(fd, true); err != nil {
		return ICMPProbeResult{
			Success:      false,
			ErrClass:     ErrLocalResource,
			ErrorMessage: fmt.Sprintf("failed to set non-blocking: %v", err),
			RemoteAddr:   targetIP.String(),
		}
	}

	pc, err := net.FilePacketConn(f)
	if err != nil {
		return ICMPProbeResult{
			Success:      false,
			ErrClass:     ErrLocalResource,
			ErrorMessage: fmt.Sprintf("failed to wrap in FilePacketConn: %v", err),
			RemoteAddr:   targetIP.String(),
		}
	}
	defer pc.Close()

	// Step 4: Construct and transmit ICMP Echo Request
	seq1 := uint16(atomic.AddUint32(&icmpGlobalSeq, 1) & 0xFFFF)
	pkt1 := buildICMPPacket(isV6, seq1)

	var dstAddr net.Addr
	if isV6 {
		dstAddr = &net.UDPAddr{IP: targetIP.AsSlice(), Port: 0}
	} else {
		dstAddr = &net.UDPAddr{IP: targetIP.AsSlice(), Port: 0}
	}

	sendStart := time.Now()
	_, sendErr := pc.WriteTo(pkt1, dstAddr)
	if sendErr != nil {
		if errors.Is(sendErr, syscall.ENOBUFS) || errors.Is(sendErr, syscall.ENOMEM) {
			atomic.AddUint64(&LocalResourceExhaustionCount, 1)
			return ICMPProbeResult{
				Success:      false,
				ErrClass:     ErrLocalResource,
				ErrorMessage: fmt.Sprintf("buffer exhaustion on sendto: %v", sendErr),
				RemoteAddr:   targetIP.String(),
			}
		}
		if errors.Is(sendErr, syscall.ENETUNREACH) {
			atomic.AddUint64(&LocalRoutingFailureCount, 1)
			atomic.AddUint64(&LocalResourceExhaustionCount, 1)
			return ICMPProbeResult{
				Success:      false,
				ErrClass:     ErrUnsupported,
				ErrorMessage: fmt.Sprintf("no local route to network on this host: %v", sendErr),
				RemoteAddr:   targetIP.String(),
			}
		}
		return ICMPProbeResult{
			Success:      false,
			ErrClass:     ErrNet,
			ErrorMessage: fmt.Sprintf("ICMP send error: %v", sendErr),
			RemoteAddr:   targetIP.String(),
		}
	}

	// Step 5: Read from Go runtime poller with 2-echo confirmation retry.
	// Initial deadline is set to timeout/2 so if Echo 1 is dropped silently,
	// we wake up on timeout/2, transmit Echo 2, and extend deadline to full timeout.
	var sentEcho2 bool
	var seq2 uint16
	var sendStart2 time.Time

	firstDeadline := sendStart.Add(timeout / 2)
	_ = pc.SetReadDeadline(firstDeadline)

	recvBuf := make([]byte, 256)

	for {
		n, raddr, readErr := pc.ReadFrom(recvBuf)
		if readErr == nil {
			// Validate reply source IP matches target IP
			var remoteIPStr string
			if udpAddr, ok := raddr.(*net.UDPAddr); ok {
				remoteIPStr = udpAddr.IP.String()
			}
			if remoteIPStr != targetIP.String() {
				continue // Stale or mismatched source
			}

			if n < 8 {
				continue
			}

			replyType := recvBuf[0]
			recvSeq := binary.BigEndian.Uint16(recvBuf[6:8])

			// Validate Echo Reply matching
			if (!isV6 && replyType == ICMPTypeEchoReply) || (isV6 && replyType == ICMP6TypeEchoReply) {
				if recvSeq == seq1 {
					return ICMPProbeResult{
						Success:    true,
						RTT:        time.Since(sendStart),
						Retried:    sentEcho2,
						ErrClass:   ErrNone,
						RemoteAddr: targetIP.String(),
					}
				} else if sentEcho2 && recvSeq == seq2 {
					return ICMPProbeResult{
						Success:    true,
						RTT:        time.Since(sendStart2),
						Retried:    true,
						ErrClass:   ErrNone,
						RemoteAddr: targetIP.String(),
					}
				}
			}
			continue
		}

		// Read failed: check MSG_ERRQUEUE for ICMP Type 3, Type 11, etc. delivered by kernel error queue
		if errQueueRes, ok := checkMsgErrQueue(pc, isV6, targetIP.String()); ok {
			return errQueueRes
		}

		// Handle deadline expiration
		if errors.Is(readErr, context.DeadlineExceeded) || os.IsTimeout(readErr) {
			if !sentEcho2 && time.Now().Before(sendStart.Add(timeout)) {
				// Transmit Echo 2 retry
				seq2 = uint16(atomic.AddUint32(&icmpGlobalSeq, 1) & 0xFFFF)
				pkt2 := buildICMPPacket(isV6, seq2)
				sendStart2 = time.Now()
				_, _ = pc.WriteTo(pkt2, dstAddr)
				sentEcho2 = true
				_ = pc.SetReadDeadline(sendStart.Add(timeout))
				continue
			}
			return ICMPProbeResult{
				Success:      false,
				ErrClass:     ErrTimeout,
				ErrorMessage: "ICMP echo reply timeout (no response within deadline)",
				RemoteAddr:   targetIP.String(),
			}
		}

		var sysErr syscall.Errno
		if errors.As(readErr, &sysErr) {
			switch sysErr {
			case syscall.EHOSTUNREACH, syscall.ENETUNREACH:
				return ICMPProbeResult{
					Success:      false,
					ErrClass:     ErrUnreachable,
					ErrorMessage: "host or network unreachable",
					RemoteAddr:   targetIP.String(),
				}
			case syscall.ECONNREFUSED:
				return ICMPProbeResult{
					Success:      false,
					ErrClass:     ErrRefused,
					ErrorMessage: "connection refused (ICMP destination unreachable)",
					RemoteAddr:   targetIP.String(),
				}
			}
		}

		return ICMPProbeResult{
			Success:      false,
			ErrClass:     ErrTimeout,
			ErrorMessage: fmt.Sprintf("ICMP probe timeout / read failure: %v", readErr),
			RemoteAddr:   targetIP.String(),
		}
	}
}

// checkMsgErrQueue reads extended error descriptors from the socket error queue.
func checkMsgErrQueue(pc net.PacketConn, isV6 bool, targetIP string) (ICMPProbeResult, bool) {
	var res ICMPProbeResult
	var found bool

	rawConn, err := pc.(*net.UDPConn).SyscallConn()
	if err != nil {
		return res, false
	}

	cmsgBuf := make([]byte, 512)
	dataBuf := make([]byte, 128)

	_ = rawConn.Control(func(rawFd uintptr) {
		iov := syscall.Iovec{
			Base: &dataBuf[0],
			Len:  uint64(len(dataBuf)),
		}
		msg := syscall.Msghdr{
			Iov:        &iov,
			Iovlen:     1,
			Control:    &cmsgBuf[0],
			Controllen: uint64(len(cmsgBuf)),
		}
		// MSG_ERRQUEUE = 0x2000
		_, _, errno := syscall.Syscall(syscall.SYS_RECVMSG, rawFd, uintptr(unsafe.Pointer(&msg)), 0x2000)
		if errno != 0 {
			return
		}

		cmsgs, err := syscall.ParseSocketControlMessage(cmsgBuf[:msg.Controllen])
		if err != nil {
			return
		}

		expectedLevel := syscall.IPPROTO_IP
		expectedType := 11 // IP_RECVERR
		expectedOrigin := soEEOriginICMP
		if isV6 {
			expectedLevel = syscall.IPPROTO_IPV6
			expectedType = 25 // IPV6_RECVERR
			expectedOrigin = soEEOriginICMP6
		}

		for _, cm := range cmsgs {
			if cm.Header.Level == int32(expectedLevel) && cm.Header.Type == int32(expectedType) {
				if len(cm.Data) < int(unsafe.Sizeof(sockExtendedErr{})) {
					continue
				}
				extErr := (*sockExtendedErr)(unsafe.Pointer(&cm.Data[0]))
				if extErr.eeOrigin == expectedOrigin {
					icmpType := extErr.eeType
					icmpCode := extErr.eeCode

					if (!isV6 && icmpType == ICMPTypeDestinationUnreachable) || (isV6 && icmpType == ICMP6TypeDestinationUnreachable) {
						found = true
						var codeDesc string
						switch icmpCode {
						case ICMPCodeNetUnreachable:
							codeDesc = "network unreachable"
						case ICMPCodeHostUnreachable:
							codeDesc = "host unreachable"
						case ICMPCodeProtoUnreachable:
							codeDesc = "protocol unreachable"
						case ICMPCodePortUnreachable:
							codeDesc = "port unreachable"
						case ICMPCodeFragNeeded:
							codeDesc = "fragmentation needed (DF set)"
						default:
							codeDesc = fmt.Sprintf("destination unreachable (code %d)", icmpCode)
						}
						res = ICMPProbeResult{
							Success:      false,
							ErrClass:     ErrUnreachable,
							ErrorMessage: fmt.Sprintf("ICMP unreachable error: %s", codeDesc),
							RemoteAddr:   targetIP,
						}
						return
					}

					if (!isV6 && icmpType == ICMPTypeTimeExceeded) || (isV6 && icmpType == ICMP6TypeTimeExceeded) {
						found = true
						res = ICMPProbeResult{
							Success:      false,
							ErrClass:     ErrTimeout,
							ErrorMessage: "ICMP time exceeded: TTL expired in transit (routing loop)",
							RemoteAddr:   targetIP,
						}
						return
					}

					// Unrecognized ICMP error type: return ErrNet with type and code
					found = true
					res = ICMPProbeResult{
						Success:      false,
						ErrClass:     ErrNet,
						ErrorMessage: fmt.Sprintf("ICMP error received (type %d, code %d)", icmpType, icmpCode),
						RemoteAddr:   targetIP,
					}
					return
				}
			}
		}
	})

	return res, found
}

func buildICMPPacket(isV6 bool, seq uint16) []byte {
	pkt := make([]byte, 16)
	if isV6 {
		pkt[0] = ICMP6TypeEchoRequest // Type 128
	} else {
		pkt[0] = ICMPTypeEchoRequest // Type 8
	}
	pkt[1] = 0 // Code 0
	binary.BigEndian.PutUint16(pkt[6:8], seq)
	binary.BigEndian.PutUint64(pkt[8:16], uint64(time.Now().UnixNano()))

	if !isV6 {
		// IPv4 requires internet checksum computed in userspace
		cs := CalculateICMPChecksum(pkt)
		binary.BigEndian.PutUint16(pkt[2:4], cs)
	}
	// For ICMPv6, kernel computes the checksum with IPv6 pseudo-header automatically
	return pkt
}
