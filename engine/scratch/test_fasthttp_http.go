package main

import (
	"fmt"
	"github.com/valyala/fasthttp"
	"net/http"
	"time"
)

func main() {
	// Start an HTTP server that sleeps 20s
	go func() {
		http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			time.Sleep(20 * time.Second)
		})
		http.ListenAndServe("127.0.0.1:8889", nil)
	}()
	time.Sleep(1 * time.Second) // wait for server to start

	client := &fasthttp.Client{
		ReadTimeout:  0,
		WriteTimeout: 0,
	}

	req := fasthttp.AcquireRequest()
	req.SetRequestURI("http://127.0.0.1:8889/")
	res := fasthttp.AcquireResponse()

	start := time.Now()
	fmt.Println("Starting DoTimeout with 2s timeout for HTTP request...")
	err := client.DoTimeout(req, res, 2*time.Second)
	fmt.Printf("DoTimeout returned after %v, err: %v\n", time.Since(start), err)
}
