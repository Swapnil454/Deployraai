package main

import (
	"fmt"
	"net"
	"runtime"
	"time"

	"github.com/valyala/fasthttp"
	"github.com/your-org/uptime-engine/core"
)

func main() {
	ln, _ := net.Listen("tcp4", "127.0.0.1:0")
	defer ln.Close()

	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func(c net.Conn) {
				defer c.Close()
				buf := make([]byte, 4096)
				c.Read(buf) // wait for request
				c.Write([]byte("HTTP/1.1 200 OK\r\nContent-Length: 1000000\r\n\r\n"))
				for i := 0; i < 10; i++ {
					time.Sleep(1 * time.Second)
					_, err := c.Write([]byte("x"))
					if err != nil {
						return
					}
				}
			}(c)
		}
	}()

	core.DisableSSRFBlocker = true
	core.InitTLSConfig(100) // Initialize real HTTP clients
	cl := core.GetHTTPClient(&core.Monitor{Type: "keyword", ID: "123"}, 0)

	var m runtime.MemStats
	
	startGoroutines := runtime.NumGoroutine()

	fmt.Println("Running 1 request with real client...")
	req := fasthttp.AcquireRequest()
	req.SetRequestURI("http://" + ln.Addr().String() + "/")
	res := fasthttp.AcquireResponse()
	
	start := time.Now()
	// Production DoTimeout is 10s usually, but we'll use 5s for the test
	err := cl.DoTimeout(req, res, 5*time.Second)
	dDo := time.Since(start)
	if err == nil {
		fmt.Printf("DoTimeout err == nil (headers arrived) in %v\n", dDo)
		startRead := time.Now()
		br, readErr := core.ReadKeywordBody(res, 65536)
		dRead := time.Since(startRead)
		fmt.Printf("ReadKeywordBody returned err: %v in %v\n", readErr, dRead)
		if readErr == nil {
		    br.Release()
		}
	} else {
	    fmt.Printf("DoTimeout err: %v in %v\n", err, dDo)
	}
	
	fasthttp.ReleaseRequest(req)
	fasthttp.ReleaseResponse(res)
	
	time.Sleep(1 * time.Second) // allow cleanup
	runtime.GC()
	runtime.ReadMemStats(&m)
	
	endGoroutines := runtime.NumGoroutine()
	fmt.Printf("Start goroutines: %d, End goroutines: %d\n", startGoroutines, endGoroutines)
}
