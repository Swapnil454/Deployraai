package main

import (
	"fmt"
	"time"

	"github.com/valyala/fasthttp"
)

func main() {
	client := &fasthttp.Client{
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	req := fasthttp.AcquireRequest()
	req.SetRequestURI("https://mock/")
	res := fasthttp.AcquireResponse()

	// Do a request that fails so it populates the host client
	client.DoTimeout(req, res, 10*time.Second)

	fmt.Printf("Client WriteTimeout: %v\n", client.WriteTimeout)

	// We can't access c.m easily since it's unexported, but we can see the effect.
	// Actually, let's just create a HostClient directly like fasthttp does:
	hc := &fasthttp.HostClient{
		WriteTimeout: client.WriteTimeout,
	}
	fmt.Printf("HostClient WriteTimeout: %v\n", hc.WriteTimeout)
}
