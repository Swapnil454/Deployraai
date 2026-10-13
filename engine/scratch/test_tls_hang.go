package main

import (
	"fmt"
	"net"
	"time"

	"github.com/valyala/fasthttp"
)

func main() {
	// 1. Start a dummy TCP server that accepts connections but sends NOTHING
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
			// Just hold the connection open forever! No TLS response!
			_ = conn
		}
	}()

	addr := l.Addr().String()
	fmt.Printf("Started blackhole server on %s\n", addr)

	// 2. Setup fasthttp client identical to FullPhase
	client := &fasthttp.Client{
		MaxIdleConnDuration: 1 * time.Nanosecond,
		ReadTimeout:         1 * time.Second,
		WriteTimeout:        1 * time.Second,
	}

	// 3. Make a request to it!
	req := fasthttp.AcquireRequest()
	req.SetRequestURI("https://" + addr + "/")
	res := fasthttp.AcquireResponse()

	fmt.Println("Making request...")
	start := time.Now()

	err = client.DoTimeout(req, res, 2*time.Second)

	fmt.Printf("Request finished in %v. Error: %v\n", time.Since(start), err)
}
