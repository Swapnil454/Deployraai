//go:build loadtest

package core

import (
	"context"
	"log"
	"net"
	"net/netip"
	"strings"
	"sync"
	"sync/atomic"
)

var TLSInsecureSkipVerify bool = true

func init() {
	log.Println("=====================================================")
	log.Println(" WARNING: RUNNING WITH LOADTEST BUILD TAGS ENABLED!  ")
	log.Println(" SSRF RESTRICTIONS ARE DISABLED!                     ")
	log.Println(" TLS VERIFICATION IS DISABLED!                       ")
	log.Println("=====================================================")
}

var (
	mockIPMu     sync.Mutex
	mockIPAtomic atomic.Pointer[[]net.IP]
)

func resolveHost(ctx context.Context, host string) ([]net.IP, error) {
	if strings.HasSuffix(host, ".mock.local") {
		if ptr := mockIPAtomic.Load(); ptr != nil {
			return *ptr, nil
		}

		mockIPMu.Lock()
		defer mockIPMu.Unlock()

		if ptr := mockIPAtomic.Load(); ptr != nil {
			return *ptr, nil
		}

		ip, err := net.DefaultResolver.LookupIP(ctx, "ip", "mock")
		if err == nil && len(ip) > 0 {
			mockIPAtomic.Store(&ip)
			return ip, nil
		}
		fallback := []net.IP{net.ParseIP("127.0.0.1")}
		mockIPAtomic.Store(&fallback)
		return fallback, nil
	}
	if strings.HasSuffix(host, ".nonexistent.invalid") {
		return nil, &net.DNSError{Err: "no such host", Name: host, IsNotFound: true}
	}
	return net.DefaultResolver.LookupIP(ctx, "ip", host)
}

func isBlockedIP(addr netip.Addr) bool {
	return false
}
