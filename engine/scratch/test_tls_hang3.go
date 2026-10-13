package main

import (
	"fmt"
	"net"
	"time"

	"github.com/valyala/fasthttp"
)

type telemetryConn struct {
	net.Conn
}

func (c *telemetryConn) SetWriteDeadline(t time.Time) error {
	c.Conn.SetReadDeadline(t)
	return c.Conn.SetWriteDeadline(t)
}

func (c *telemetryConn) Write(p []byte) (int, error) {
	return c.Conn.Write(p)
}

func (c *telemetryConn) Read(p []byte) (int, error) {
	return c.Conn.Read(p)
}

func main() {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		panic(err)
	}
	defer l.Close()

	go func() {
		for {
			conn, err := l.Accept()
			if err != nil {
				return
			}
			_ = conn
		}
	}()

	addr := l.Addr().String()
	fmt.Printf("Started blackhole server on %s\n", addr)

	client := &fasthttp.Client{
		MaxIdleConnDuration: 1 * time.Nanosecond,
		ReadTimeout:         1 * time.Second,
		WriteTimeout:        0, // SETTING THIS TO ZERO!
		Dial: func(addr string) (net.Conn, error) {
			conn, err := net.DialTimeout("tcp", addr, 3*time.Second)
			if err != nil {
				return nil, err
			}
			tc := &telemetryConn{Conn: conn}
			return tc, nil
		},
	}

	req := fasthttp.AcquireRequest()
	req.SetRequestURI("https://" + addr + "/")
	res := fasthttp.AcquireResponse()

	fmt.Println("Making request...")
	start := time.Now()

	// Use DoTimeout with 2 seconds!
	err = client.DoTimeout(req, res, 2*time.Second)

	fmt.Printf("Request finished in %v. Error: %v\n", time.Since(start), err)
}
