//go:build ignore

package main

import (
	"bufio"
	"bytes"
	"fmt"
	"github.com/valyala/fasthttp"
)

func main() {
	var rawResponse = []byte("HTTP/1.1 200 OK\r\nDate: Sun, 04 Oct 2026 10:05:00 GMT\r\nLast-Modified: Sun, 04 Oct 2026 10:00:00 GMT\r\n\r\n")
	var res fasthttp.Response
	r := bufio.NewReader(bytes.NewReader(rawResponse))
	res.Read(r)
	fmt.Printf("Peek: %q\n", res.Header.Peek("Date"))
}
