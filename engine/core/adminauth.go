package core

import (
	"crypto/subtle"
	"net"
	"net/http"
	"os"
	"time"
)

// adminAuth wraps an admin handler with a mandatory bearer token.
//   - ADMIN_TOKEN unset => every request is refused (fail closed).
//   - The Authorization header is a non-simple header, so a web page cannot
//     POST to http://127.0.0.1:9101 from a visitor's browser without a CORS
//     preflight (which this server never approves): no drive-by changes.
func adminAuth(next http.Handler) http.Handler {
	token := os.Getenv("ADMIN_TOKEN")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if token == "" {
			http.Error(w, "admin disabled: ADMIN_TOKEN not set", http.StatusForbidden)
			return
		}
		got := []byte(r.Header.Get("Authorization"))
		want := []byte("Bearer " + token)
		if subtle.ConstantTimeCompare(got, want) != 1 {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// adminAddrIsLoopback reports whether addr binds only to the local host.
func adminAddrIsLoopback(addr string) bool {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return false
	}
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// newAdminServer builds the server with timeouts so a slow client can't pin it.
func newAdminServer(addr string, h http.Handler) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           adminAuth(h),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       30 * time.Second,
	}
}
