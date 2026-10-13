package main

import (
	"fmt"
	"net"
	"time"
)

type telemetryConn struct {
	net.Conn
}

func (c *telemetryConn) SetWriteDeadline(t time.Time) error {
	c.Conn.SetReadDeadline(t)
	return c.Conn.SetWriteDeadline(t)
}

func main() {
	c, _ := net.DialTimeout("tcp", "google.com:80", 3*time.Second)
	tc := &telemetryConn{Conn: c}

	var conn net.Conn = tc

	_, isTLSAlready := conn.(interface{ Handshake() error })
	fmt.Printf("isTLSAlready: %v\n", isTLSAlready)
}
