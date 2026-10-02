//go:build linux

package core

import (
	"crypto/tls"
	"net"
	"syscall"

	"golang.org/x/sys/unix"
)

// getTCPBytes uses TCP_INFO to get acked and received bytes.
func getTCPBytes(conn net.Conn) (in, out int) {
	// Unwrap *tls.Conn
	if tc, ok := conn.(*tls.Conn); ok {
		conn = tc.NetConn()
	}

	sysConn, ok := conn.(syscall.Conn)
	if !ok {
		return 0, 0
	}
	raw, err := sysConn.SyscallConn()
	if err != nil {
		return 0, 0
	}

	raw.Control(func(fd uintptr) {
		info, err := unix.GetsockoptTCPInfo(int(fd), unix.IPPROTO_TCP, unix.TCP_INFO)
		if err == nil {
			// TCP_INFO excludes TCP/IP headers. We estimate payload + headers.
			// Roughly segs_in/segs_out * 52 (IPv4) or 72 (IPv6).
			// We'll use 52 for standard IPv4 estimation. 
			in = int(info.Bytes_received) + int(info.Segs_in)*52
			out = int(info.Bytes_acked) + int(info.Segs_out)*52 + int(info.Bytes_retrans)
			// Excludes teardown (FIN/ACK) since this is read before Close.
		}
	})
	return in, out
}
