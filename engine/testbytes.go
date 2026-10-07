//go:build ignore

package main

import (
	"crypto/tls"
	"net"
)

func main() {
	clientConn, serverConn := net.Pipe()
	go func() {
		defer serverConn.Close()
		tls.Server(serverConn, &tls.Config{}).Handshake()
	}()
	
	tlsCfg := &tls.Config{InsecureSkipVerify: true}
	c := tls.Client(clientConn, tlsCfg)
	c.Handshake()
}
