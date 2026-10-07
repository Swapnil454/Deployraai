//go:build ignore

package main

import (
	"fmt"
	"github.com/valyala/fasthttp"
)

func main() {
	res := &fasthttp.Response{}
	res.Header.Set("Last-Modified", "Sun, 04 Oct 2026 10:00:00 GMT")
	res.Header.Set("Date", "Sun, 04 Oct 2026 10:05:00 GMT")

	fmt.Printf("Raw Headers:\n%s\n", res.Header.String())
}
