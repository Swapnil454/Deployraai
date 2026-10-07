package main

import (
	"fmt"
	"net"
	"time"
	"github.com/valyala/fasthttp"
)

func main() {
	ln, _ := net.Listen("tcp4", "127.0.0.1:0")
	go func() {
		for {
			c, _ := ln.Accept()
			go func() {
				defer c.Close()
				b := make([]byte, 1024)
				c.Read(b)
				c.Write([]byte("HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\n"))
				time.Sleep(2 * time.Second)
				c.Write([]byte("a"))
			}()
		}
	}()

	url := "http://" + ln.Addr().String()
	cl := &fasthttp.Client{StreamResponseBody: true}
	req := fasthttp.AcquireRequest()
	req.SetRequestURI(url)
	res := fasthttp.AcquireResponse()
	
	start := time.Now()
	err := cl.DoTimeout(req, res, 200*time.Millisecond)
	fmt.Printf("DoTimeout returned after %v, err: %v\n", time.Since(start), err)
}
