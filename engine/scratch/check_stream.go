package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"time"

	"github.com/valyala/fasthttp"
)

func main() {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusOK)
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
		time.Sleep(5 * time.Second)
		w.Write([]byte("hello"))
	}))
	defer ts.Close()

	c := &fasthttp.Client{StreamResponseBody: true}
	req := fasthttp.AcquireRequest()
	res := fasthttp.AcquireResponse()

	req.SetRequestURI(ts.URL)
	if err := c.Do(req, res); err != nil {
		fmt.Printf("err: %v\n", err)
		return
	}
	stream := res.BodyStream()
	fmt.Printf("stream: %T\n", stream)

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		buf := make([]byte, 1024)
		start := time.Now()
		n, err := stream.Read(buf)
		fmt.Printf("stream.Read returned n=%d err=%v after %v\n", n, err, time.Since(start))
	}()

	time.Sleep(500 * time.Millisecond)
	fmt.Println("Calling res.CloseBodyStream()...")
	err := res.CloseBodyStream()
	fmt.Printf("CloseBodyStream err: %v\n", err)

	wg.Wait()
}
