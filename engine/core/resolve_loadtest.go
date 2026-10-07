//go:build loadtest

package core

import (
	"context"
	"log"
	"net"
	"net/netip"
	"strings"
	"sync"
)

var TLSInsecureSkipVerify bool = true
var DisableSSRFBlocker bool = true

func init() {
	log.Println("=====================================================")
	log.Println(" WARNING: RUNNING WITH LOADTEST BUILD TAGS ENABLED!  ")
	log.Println(" SSRF RESTRICTIONS ARE DISABLED!                     ")
	log.Println(" TLS VERIFICATION IS DISABLED!                       ")
	log.Println("=====================================================")
}

var (
	mockIPMu sync.Mutex
	mockIP   []net.IP
)

func resolveHost(ctx context.Context, host string) ([]net.IP, error) {
	if strings.HasSuffix(host, ".mock.local") {
		mockIPMu.Lock()
		defer mockIPMu.Unlock()
		
		if mockIP != nil {
			return mockIP, nil
		}
		
		ip, err := net.DefaultResolver.LookupIP(ctx, "ip", "mock")
		if err == nil && len(ip) > 0 {
			mockIP = ip
			return ip, nil
		}
		fallback := []net.IP{net.ParseIP("127.0.0.1")}
		mockIP = fallback // Cache the fallback to prevent serialization bottleneck
		return fallback, nil
	}
	return net.DefaultResolver.LookupIP(ctx, "ip", host)
}

func isBlockedIP(addr netip.Addr) bool {
	return false
}
