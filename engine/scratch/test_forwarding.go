package main

import (
	"fmt"
	"net"
	"time"
)

type myConn struct {
	net.Conn
}

func (c *myConn) SetWriteDeadline(t time.Time) error {
	fmt.Printf("SetWriteDeadline called with %v (zero: %v)\n", t, t.IsZero())
	return c.Conn.SetWriteDeadline(t)
}

func main() {
	// Dummy test to ensure interface forwarding works
	c, _ := net.Dial("tcp", "google.com:80")
	mc := &myConn{Conn: c}

	// Ensure interface cast works
	var nc net.Conn = mc
	nc.SetWriteDeadline(time.Now().Add(10 * time.Second))
}
