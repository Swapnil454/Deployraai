package main

import (
	"fmt"
	"net"
	"time"

	"github.com/valyala/fasthttp"
)

func main() {
	ln, _ := net.Listen("tcp4", "127.0.0.1:0")
	defer ln.Close()

	go func() {
		c, err := ln.Accept()
		if err != nil {
			return
		}
		go func(c net.Conn) {
			defer c.Close()
			buf := make([]byte, 4096)
			c.Read(buf) // wait for request
			c.Write([]byte("HTTP/1.1 200 OK\r\nContent-Length: 1000000\r\n\r\n"))
			time.Sleep(5 * time.Second)
		}(c)
	}()

	cl := &fasthttp.Client{StreamResponseBody: true}
	req := fasthttp.AcquireRequest()
	req.SetRequestURI("http://" + ln.Addr().String() + "/")
	res := fasthttp.AcquireResponse()
	
	start := time.Now()
	err := cl.Do(req, res)
	d := time.Since(start)
	
	fmt.Printf("Do returned in %v with err: %v\n", d, err)
}
