package core

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"testing"
)

func TestAdminAddrIsLoopback(t *testing.T) {
	tests := []struct {
		addr string
		want bool
	}{
		{"127.0.0.1:9101", true},
		{"localhost:9101", true},
		{"[::1]:9101", true},
		{"0.0.0.0:9101", false},
		{"192.168.1.10:9101", false},
		{"invalid", false},
	}

	for _, tt := range tests {
		got := adminAddrIsLoopback(tt.addr)
		if got != tt.want {
			t.Errorf("adminAddrIsLoopback(%q) = %v; want %v", tt.addr, got, tt.want)
		}
	}
}

func TestAdminAuthUnsetTokenForbidden(t *testing.T) {
	orig := os.Getenv("ADMIN_TOKEN")
	os.Unsetenv("ADMIN_TOKEN")
	defer os.Setenv("ADMIN_TOKEN", orig)

	handler := adminAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/admin/compression", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden when ADMIN_TOKEN unset, got %d", rec.Code)
	}
}

func TestAdminAuthTokenValidation(t *testing.T) {
	orig := os.Getenv("ADMIN_TOKEN")
	os.Setenv("ADMIN_TOKEN", "secret123")
	defer os.Setenv("ADMIN_TOKEN", orig)

	handler := adminAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))

	// Case 1: Missing auth header
	req1 := httptest.NewRequest(http.MethodGet, "/admin/compression", nil)
	rec1 := httptest.NewRecorder()
	handler.ServeHTTP(rec1, req1)
	if rec1.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 Unauthorized for missing header, got %d", rec1.Code)
	}

	// Case 2: Wrong token
	req2 := httptest.NewRequest(http.MethodGet, "/admin/compression", nil)
	req2.Header.Set("Authorization", "Bearer wrongtoken")
	rec2 := httptest.NewRecorder()
	handler.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 Unauthorized for wrong token, got %d", rec2.Code)
	}

	// Case 3: Valid token
	req3 := httptest.NewRequest(http.MethodGet, "/admin/compression", nil)
	req3.Header.Set("Authorization", "Bearer secret123")
	rec3 := httptest.NewRecorder()
	handler.ServeHTTP(rec3, req3)
	if rec3.Code != http.StatusOK {
		t.Errorf("expected 200 OK for valid token, got %d", rec3.Code)
	}
}

func TestAdminServerValidation(t *testing.T) {
	orig := os.Getenv("ADMIN_TOKEN")
	os.Setenv("ADMIN_TOKEN", "testtoken")
	defer os.Setenv("ADMIN_TOKEN", orig)

	mux := http.NewServeMux()
	mux.HandleFunc("/admin/compression", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			pStr := r.URL.Query().Get("pct")
			p, err := strconv.Atoi(pStr)
			if err != nil || p < 0 || p > 100 {
				http.Error(w, "pct must be 0-100", http.StatusBadRequest)
				return
			}
			CompressionPercent.Store(int32(p))
			w.WriteHeader(http.StatusOK)
		}
	})
	handler := adminAuth(mux)

	// Test invalid pct values
	invalidPcts := []string{"-1", "101", "abc", ""}
	for _, inv := range invalidPcts {
		req := httptest.NewRequest(http.MethodPost, "/admin/compression?pct="+inv, nil)
		req.Header.Set("Authorization", "Bearer testtoken")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected 400 Bad Request for pct=%q, got %d", inv, rec.Code)
		}
	}
}

func TestKillSwitchDrill(t *testing.T) {
	// Step 1: Ramp up to 50%
	CompressionPercent.Store(50)
	enabledCount := 0
	sampleMonitors := []string{"mon-1", "mon-2", "mon-3", "mon-4", "mon-5", "mon-6", "mon-7", "mon-8", "mon-9", "mon-10"}
	for _, id := range sampleMonitors {
		if compressionEnabledFor(id) {
			enabledCount++
		}
	}

	if enabledCount == 0 {
		t.Fatalf("expected some monitors enabled at pct=50, got 0")
	}

	// Step 2: Fire Kill Switch (set pct=0)
	CompressionPercent.Store(0)

	// Step 3: Verify 100% of monitors now return false (canary completely stopped)
	for _, id := range sampleMonitors {
		if compressionEnabledFor(id) {
			t.Errorf("kill switch failed: monitor %s still has compression enabled at pct=0", id)
		}
	}

	if CompressionPercent.Load() != 0 {
		t.Fatalf("expected CompressionPercent 0 after kill switch drill, got %d", CompressionPercent.Load())
	}
}
