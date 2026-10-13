package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
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
		// Hang forever
		time.Sleep(10 * time.Second)
	}))
	defer ts.Close()

	c := &fasthttp.Client{
		StreamResponseBody: true,
		ReadTimeout:        10 * time.Second,
	}
	req := fasthttp.AcquireRequest()
	res := fasthttp.AcquireResponse()
	defer fasthttp.ReleaseRequest(req)
	defer fasthttp.ReleaseResponse(res)

	req.SetRequestURI(ts.URL)
	start := time.Now()
	timeout := 2 * time.Second
	// Call DoTimeout with 2s
	if err := c.DoTimeout(req, res, timeout); err != nil {
		fmt.Printf("DoTimeout err: %v after %v\n", err, time.Since(start))
		return
	}
	fmt.Printf("DoTimeout success after %v. Now reading body...\n", time.Since(start))

	stream := res.BodyStream()
	buf := make([]byte, 1024)
	readStart := time.Now()
	n, rerr := stream.Read(buf)
	fmt.Printf("stream.Read returned n=%d err=%v after %v (total: %v)\n",
		n, rerr, time.Since(readStart), time.Since(start))
}
