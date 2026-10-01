//go:build loadtest

package core

import (
	"context"
	"log"
	"net"
	"strings"
)

var TLSInsecureSkipVerify bool = true

func init() {
	log.Println("=====================================================")
	log.Println(" WARNING: RUNNING WITH LOADTEST BUILD TAGS ENABLED!  ")
	log.Println(" SSRF RESTRICTIONS ARE DISABLED!                     ")
	log.Println(" TLS VERIFICATION IS DISABLED!                       ")
	log.Println("=====================================================")
}

func resolveHost(ctx context.Context, host string) ([]net.IP, error) {
	if strings.HasSuffix(host, ".mock.local") {
		ip, err := net.DefaultResolver.LookupIP(ctx, "ip", "mock")
		if err == nil && len(ip) > 0 {
			return ip, nil
		}
		return []net.IP{net.ParseIP("127.0.0.1")}, nil
	}
	return net.DefaultResolver.LookupIP(ctx, "ip", host)
}

func isRestrictedIP(ip net.IP) bool {
	return false
}
