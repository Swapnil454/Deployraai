//go:build linux

package core

import (
	"encoding/binary"
	"log"
	"net"
	"sync/atomic"
	"syscall"

	"golang.org/x/sys/unix"
)

var SentNs [65536]atomic.Uint64

func checksum(data []byte) uint16 {
	var sum uint32
	for i := 0; i < len(data)-1; i += 2 {
		sum += uint32(binary.BigEndian.Uint16(data[i : i+2]))
	}
	if len(data)%2 == 1 {
		sum += uint32(data[len(data)-1]) << 8
	}
	for (sum >> 16) > 0 {
		sum = (sum & 0xffff) + (sum >> 16)
	}
	return ^uint16(sum)
}

func sendRawSocket(m *Monitor, ptr *atomic.Pointer[Monitor], nonce uint64, hash uint32) {
	fd, err := syscall.Socket(syscall.AF_INET, syscall.SOCK_RAW, syscall.IPPROTO_RAW)
	if err != nil {
		CASUpdate(ptr, func(mon *Monitor) { mon.AwaitingResult = false })
		log.Printf("Local send error (socket): %v", err)
		return
	}
	defer syscall.Close(fd)

	if err := syscall.SetsockoptInt(fd, syscall.IPPROTO_IP, syscall.IP_HDRINCL, 1); err != nil {
		CASUpdate(ptr, func(mon *Monitor) { mon.AwaitingResult = false })
		log.Printf("Local send error (setsockopt): %v", err)
		return
	}

	ipBytes := net.ParseIP(m.TargetIP).To4()
	if ipBytes == nil {
		CASUpdate(ptr, func(mon *Monitor) { mon.AwaitingResult = false })
		log.Printf("Invalid TargetIP for raw socket: %s", m.TargetIP)
		return
	}

	var packet []byte
	isTCP := m.Type == "port"

	if isTCP {
		packet = make([]byte, 40) // 20 IPv4 + 20 TCP
	} else {
		packet = make([]byte, 28) // 20 IPv4 + 8 ICMP
	}

	// IPv4 Header
	packet[0] = 0x45
	packet[1] = 0x00
	binary.BigEndian.PutUint16(packet[2:4], uint16(len(packet)))
	binary.BigEndian.PutUint16(packet[4:6], 0)
	binary.BigEndian.PutUint16(packet[6:8], 0x4000) // DF flag
	packet[8] = 64 // TTL
	if isTCP {
		packet[9] = syscall.IPPROTO_TCP
	} else {
		packet[9] = syscall.IPPROTO_ICMP
	}
	copy(packet[12:16], outboundIP)
	copy(packet[16:20], ipBytes)

	ipChecksum := checksum(packet[0:20])
	binary.BigEndian.PutUint16(packet[10:12], ipChecksum)

	if isTCP {
		// TCP Header
		tcpStart := 20
		binary.BigEndian.PutUint16(packet[tcpStart:tcpStart+2], uint16(m.AssignedPort))
		binary.BigEndian.PutUint16(packet[tcpStart+2:tcpStart+4], GetTargetPort(m.URL))
		binary.BigEndian.PutUint32(packet[tcpStart+4:tcpStart+8], hash) // Seq Number = Hash
		binary.BigEndian.PutUint32(packet[tcpStart+8:tcpStart+12], 0) // Ack = 0
		packet[tcpStart+12] = 0x50 // Data offset (5 * 4 = 20)
		packet[tcpStart+13] = 0x02 // SYN flag
		binary.BigEndian.PutUint16(packet[tcpStart+14:tcpStart+16], 64240) // Window

		pseudo := make([]byte, 32)
		copy(pseudo[0:4], outboundIP)
		copy(pseudo[4:8], ipBytes)
		pseudo[9] = syscall.IPPROTO_TCP
		binary.BigEndian.PutUint16(pseudo[10:12], 20) // TCP length
		copy(pseudo[12:], packet[tcpStart:tcpStart+20])
		
		tcpChecksum := checksum(pseudo)
		binary.BigEndian.PutUint16(packet[tcpStart+16:tcpStart+18], tcpChecksum)
	} else {
		// ICMP Header (Echo Request)
		icmpStart := 20
		packet[icmpStart] = 8 // Type = 8 (Echo Request)
		packet[icmpStart+1] = 0 // Code = 0
		
		// Map index to ICMP ID, hash (16 bits) to Sequence
		binary.BigEndian.PutUint16(packet[icmpStart+4:icmpStart+6], uint16(m.AssignedPort))
		binary.BigEndian.PutUint16(packet[icmpStart+6:icmpStart+8], uint16(hash)) 
		
		icmpChecksum := checksum(packet[icmpStart:icmpStart+8])
		binary.BigEndian.PutUint16(packet[icmpStart+2:icmpStart+4], icmpChecksum)
	}

	var addr syscall.SockaddrInet4
	copy(addr.Addr[:], ipBytes)

	var ts unix.Timespec
	unix.ClockGettime(unix.CLOCK_MONOTONIC, &ts)
	SentNs[m.AssignedPort].Store(uint64(ts.Sec)*1e9 + uint64(ts.Nsec))

	if err := syscall.Sendto(fd, packet, 0, &addr); err != nil {
		CASUpdate(ptr, func(mon *Monitor) { mon.AwaitingResult = false })
		log.Printf("Local send error (sendto): %v", err)
		return
	}
}

// SendRST sends a TCP RST using the Seq=Hash+1 logic for half-open teardown.
func SendRST(targetIP string, sourcePort uint16, destPort uint16, hash uint32) {
	fd, err := syscall.Socket(syscall.AF_INET, syscall.SOCK_RAW, syscall.IPPROTO_RAW)
	if err != nil {
		return
	}
	defer syscall.Close(fd)

	if err := syscall.SetsockoptInt(fd, syscall.IPPROTO_IP, syscall.IP_HDRINCL, 1); err != nil {
		return
	}

	ipBytes := net.ParseIP(targetIP).To4()
	if ipBytes == nil {
		return
	}

	packet := make([]byte, 40)
	packet[0] = 0x45
	packet[1] = 0x00
	binary.BigEndian.PutUint16(packet[2:4], 40)
	binary.BigEndian.PutUint16(packet[4:6], 0)
	binary.BigEndian.PutUint16(packet[6:8], 0x4000)
	packet[8] = 64
	packet[9] = syscall.IPPROTO_TCP
	copy(packet[12:16], outboundIP)
	copy(packet[16:20], ipBytes)

	ipChecksum := checksum(packet[0:20])
	binary.BigEndian.PutUint16(packet[10:12], ipChecksum)

	tcpStart := 20
	binary.BigEndian.PutUint16(packet[tcpStart:tcpStart+2], sourcePort)
	binary.BigEndian.PutUint16(packet[tcpStart+2:tcpStart+4], destPort)
	binary.BigEndian.PutUint32(packet[tcpStart+4:tcpStart+8], hash+1) // RST seq = original seq + 1 (the server's ACK expectation)
	binary.BigEndian.PutUint32(packet[tcpStart+8:tcpStart+12], 0)
	packet[tcpStart+12] = 0x50 // 20 bytes
	packet[tcpStart+13] = 0x04 // RST flag
	binary.BigEndian.PutUint16(packet[tcpStart+14:tcpStart+16], 0) // Window 0

	pseudo := make([]byte, 32)
	copy(pseudo[0:4], outboundIP)
	copy(pseudo[4:8], ipBytes)
	pseudo[9] = syscall.IPPROTO_TCP
	binary.BigEndian.PutUint16(pseudo[10:12], 20)
	copy(pseudo[12:], packet[tcpStart:tcpStart+20])
	
	tcpChecksum := checksum(pseudo)
	binary.BigEndian.PutUint16(packet[tcpStart+16:tcpStart+18], tcpChecksum)

	var addr syscall.SockaddrInet4
	copy(addr.Addr[:], ipBytes)
	syscall.Sendto(fd, packet, 0, &addr)
}
