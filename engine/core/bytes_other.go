//go:build !linux

package core

import "net"

func getTCPBytes(conn net.Conn) (in, out int) {
	return 0, 0
}
