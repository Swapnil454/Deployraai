package main

import (
	"crypto/tls"
	"fmt"
	"io"
	"net/http"
	"time"
)

func main() {
	client := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
			MaxIdleConns:    10,
			IdleConnTimeout: 90 * time.Second,
		},
	}

	req, _ := http.NewRequest("GET", "https://localhost:8443/mock/up", nil)

	fmt.Println("Req 1:")
	resp1, err := client.Do(req)
	if err != nil {
		fmt.Println("Err 1:", err)
		return
	}
	io.ReadAll(resp1.Body)
	resp1.Body.Close()
	fmt.Println("Req 1 done")

	fmt.Println("Waiting 30 seconds...")
	time.Sleep(30 * time.Second)

	fmt.Println("Req 2:")
	resp2, err := client.Do(req)
	if err != nil {
		fmt.Println("Err 2:", err)
		return
	}
	io.ReadAll(resp2.Body)
	resp2.Body.Close()
	fmt.Println("Req 2 done")
}
