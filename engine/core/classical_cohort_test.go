package core

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/valyala/fasthttp"
)

func TestClassicalCohortSelectionAndCredentialOptOut(t *testing.T) {
	SetTLSClassicalPercentForTest(100)
	defer SetTLSClassicalPercentForTest(0)

	InitHTTPClients(50000)

	// Monitor without credentials -> should select classical cohort client
	mNoCreds := &Monitor{
		ID:              "mon-public-100",
		LastFullPhaseAt: time.Now(),
	}
	cNoCreds := GetHTTPClient(mNoCreds, MonitorKey(mNoCreds.ID))
	if cNoCreds.TLSConfig == nil || len(cNoCreds.TLSConfig.CurvePreferences) == 0 {
		t.Fatalf("expected non-empty CurvePreferences for classical cohort client")
	}
	if cNoCreds.TLSConfig.CurvePreferences[0] != tls.X25519 {
		t.Errorf("expected X25519 as first curve preference, got %v", cNoCreds.TLSConfig.CurvePreferences[0])
	}

	// Monitor with credentials -> should opt out of classical cohort (stay in default post-quantum config)
	mWithCreds := &Monitor{
		ID:              "mon-auth-100",
		LastFullPhaseAt: time.Now(),
		Headers: map[string]string{
			"Authorization": "Bearer secret-token-123",
		},
	}
	cWithCreds := GetHTTPClient(mWithCreds, MonitorKey(mWithCreds.ID))
	if cWithCreds.TLSConfig != globalTLSConfig {
		t.Errorf("expected monitor with credentials to opt out to globalTLSConfig")
	}
}

func TestClassicalCohortHandshakeRouting(t *testing.T) {
	SetTLSClassicalPercentForTest(100)
	defer SetTLSClassicalPercentForTest(0)

	ResetTLSStats()
	InitHTTPClients(50000)

	ts := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	// Update classical client's TLSConfig RootCAs so it trusts the httptest server
	tlsConfigClassical.RootCAs = ts.Client().Transport.(*http.Transport).TLSClientConfig.RootCAs

	m := &Monitor{ID: "mon-test-classical-1", LastFullPhaseAt: time.Now()}
	client := GetHTTPClient(m, MonitorKey(m.ID))

	req := acquireFastHTTPRequest(ts.URL)
	defer releaseFastHTTPRequest(req)
	res := acquireFastHTTPResponse()
	defer releaseFastHTTPResponse(res)

	err := client.DoTimeout(req, res, 5*time.Second)
	if err != nil {
		t.Fatalf("classical client request failed: %v", err)
	}

	s0 := GetTLSStats(0)
	s1 := GetTLSStats(1)

	if s0.Total.Load() != 0 {
		t.Errorf("expected Cohort 0 total handshakes == 0, got %d", s0.Total.Load())
	}
	if s1.Total.Load() < 1 {
		t.Errorf("expected Cohort 1 total handshakes >= 1, got %d", s1.Total.Load())
	}
}

func acquireFastHTTPRequest(url string) *fasthttp.Request {
	req := fasthttp.AcquireRequest()
	req.SetRequestURI(url)
	return req
}

func releaseFastHTTPRequest(req *fasthttp.Request) {
	fasthttp.ReleaseRequest(req)
}

func acquireFastHTTPResponse() *fasthttp.Response {
	return fasthttp.AcquireResponse()
}

func releaseFastHTTPResponse(res *fasthttp.Response) {
	fasthttp.ReleaseResponse(res)
}
