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
				n, _ := c.Read(b)
				fmt.Printf("Server received %d bytes\n", n)
				n, _ = c.Write([]byte("HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\n"))
				fmt.Printf("Server wrote %d bytes of headers\n", n)
				time.Sleep(2 * time.Second)
				c.Write([]byte("a"))
				fmt.Println("Server wrote 1 byte of body")
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
	if err == nil {
		fmt.Printf("Headers received!\n")
		// now read body
		bodyReader := res.BodyStream()
		buf := make([]byte, 10)
		startBody := time.Now()
		n, err := bodyReader.Read(buf)
		fmt.Printf("Body read %d bytes after %v, err: %v\n", n, time.Since(startBody), err)
	}
}
