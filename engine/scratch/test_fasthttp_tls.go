package main

import (
	"fmt"
	"github.com/valyala/fasthttp"
	"net"
	"time"
)

func main() {
	// Start a dummy server that accepts but does NOT handshake TLS
	l, err := net.Listen("tcp", "127.0.0.1:8888")
	if err != nil {
		panic(err)
	}
	go func() {
		for {
			c, err := l.Accept()
			if err != nil {
				return
			}
			// Just sleep, don't do TLS handshake
			time.Sleep(20 * time.Second)
			c.Close()
		}
	}()

	client := &fasthttp.Client{
		ReadTimeout:  0,
		WriteTimeout: 0,
	}

	req := fasthttp.AcquireRequest()
	req.SetRequestURI("https://127.0.0.1:8888/")
	res := fasthttp.AcquireResponse()

	start := time.Now()
	fmt.Println("Starting DoTimeout with 2s timeout...")
	err = client.DoTimeout(req, res, 2*time.Second)
	fmt.Printf("DoTimeout returned after %v, err: %v\n", time.Since(start), err)
}
