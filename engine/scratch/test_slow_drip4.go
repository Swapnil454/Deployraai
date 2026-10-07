package main

import (
	"bytes"
	"fmt"
	"net"
	"time"

	"github.com/valyala/fasthttp"
	"github.com/your-org/uptime-engine/core"
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
				c.Write([]byte("HTTP/1.1 200 OK\r\nContent-Length: 1000000\r\n\r\n"))
				time.Sleep(5 * time.Second)
				c.Write([]byte("a"))
			}()
		}
	}()

	url := "http://" + ln.Addr().String()
	core.InitHTTPClients(1)
	cl := core.HTTPClients.Cached
	
	req := fasthttp.AcquireRequest()
	req.SetRequestURI(url)
	res := fasthttp.AcquireResponse()
	
	start := time.Now()
	err := cl.DoTimeout(req, res, 200*time.Millisecond)
	fmt.Printf("DoTimeout returned after %v, err: %v\n", time.Since(start), err)
	if err == nil {
		fmt.Printf("Headers received!\n")
		br, rerr := core.ReadKeywordBody(res, 65536)
		_ = bytes.Contains
		fmt.Printf("ReadKeywordBody err: %v, len(body): %v\n", rerr, len(br.Body))
	}
}
