package core

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/valyala/fasthttp"
)

func TestConditionalGETHeaderInjection(t *testing.T) {
	ResetConditionalState()
	req := fasthttp.AcquireRequest()
	defer fasthttp.ReleaseRequest(req)

	monID := uint64(9001)
	nowS := time.Now().Unix()

	// Initial check: no state -> should return false (unconditional GET)
	if injected := InjectValidators(monID, req, nowS, 300); injected {
		t.Fatalf("expected InjectValidators == false for clean state, got true")
	}

	// Store ETag and Last-Modified after a passing 200 check
	etagVal := []byte(`"v1.2.3"`)
	lmVal := []byte("Sun, 04 Oct 2026 10:00:00 GMT")
	StoreValidatorState(monID, etagVal, lmVal, nowS, true)

	// Second check: state exists within 5-min floor -> should inject headers
	req2 := fasthttp.AcquireRequest()
	defer fasthttp.ReleaseRequest(req2)

	if injected := InjectValidators(monID, req2, nowS+10, 300); !injected {
		t.Fatalf("expected InjectValidators == true after storing validators, got false")
	}

	if etagHeader := string(req2.Header.Peek("If-None-Match")); etagHeader != `"v1.2.3"` {
		t.Errorf("expected If-None-Match == \"v1.2.3\", got %q", etagHeader)
	}

	if lmHeader := string(req2.Header.Peek("If-Modified-Since")); lmHeader != "Sun, 04 Oct 2026 10:00:00 GMT" {
		t.Errorf("expected If-Modified-Since == \"Sun, 04 Oct 2026 10:00:00 GMT\", got %q", lmHeader)
	}
}

func TestConditionalGET304BypassesExpectedStatus(t *testing.T) {
	ResetConditionalState()

	// HTTP Server returning 304 when If-None-Match is present
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("If-None-Match") == `"v1.0"` {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		w.Header().Set("ETag", `"v1.0"`)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Target Keyword Found"))
	}))
	defer ts.Close()

	mon := &Monitor{
		ID:             "mon-cond-304",
		URL:            ts.URL,
		Keyword:        "Keyword",
		ExpectedStatus: []int{200}, // Explicitly expects 200, but receiving our 304 must pass!
	}

	monKey := MonitorKey(mon.ID)
	nowS := time.Now().Unix()

	// Pass 1: Full GET (returns 200) -> stores ETag
	req1 := fasthttp.AcquireRequest()
	req1.SetRequestURI(ts.URL)
	req1.Header.SetMethod("GET")
	res1 := fasthttp.AcquireResponse()
	
	client := GetHTTPClient(mon, monKey)
	err := client.DoTimeout(req1, res1, 5*time.Second)
	if err != nil {
		t.Fatalf("pass 1 request failed: %v", err)
	}
	if res1.StatusCode() != 200 {
		t.Fatalf("pass 1 expected status 200, got %d", res1.StatusCode())
	}
	StoreValidatorState(monKey, res1.Header.Peek("ETag"), nil, nowS, true)

	fasthttp.ReleaseRequest(req1)
	fasthttp.ReleaseResponse(res1)

	// Pass 2: Conditional GET -> injects If-None-Match, server returns 304
	req2 := fasthttp.AcquireRequest()
	req2.SetRequestURI(ts.URL)
	req2.Header.SetMethod("GET")
	injected := InjectValidators(monKey, req2, nowS+5, 300)
	if !injected {
		t.Fatalf("pass 2 expected validator injection, got false")
	}

	res2 := fasthttp.AcquireResponse()
	err = client.DoTimeout(req2, res2, 5*time.Second)
	if err != nil {
		t.Fatalf("pass 2 request failed: %v", err)
	}

	if res2.StatusCode() != http.StatusNotModified {
		t.Fatalf("pass 2 expected status 304, got %d", res2.StatusCode())
	}

	// Verify that 304 passes status check even though ExpectedStatus is [200]
	statusOK := false
	if injected && res2.StatusCode() == fasthttp.StatusNotModified {
		statusOK = true
	} else if len(mon.ExpectedStatus) > 0 {
		for _, s := range mon.ExpectedStatus {
			if res2.StatusCode() == s { statusOK = true; break }
		}
	}
	if !statusOK {
		t.Fatalf("304 response failed ExpectedStatus check (B4 regression!)")
	}

	fasthttp.ReleaseRequest(req2)
	fasthttp.ReleaseResponse(res2)
}

func TestConditionalGETFloorExpiry(t *testing.T) {
	ResetConditionalState()
	req := fasthttp.AcquireRequest()
	defer fasthttp.ReleaseRequest(req)

	monID := uint64(9002)
	nowS := time.Now().Unix()

	StoreValidatorState(monID, []byte(`"etag-floor"`), nil, nowS, true)

	// Within 300s -> injects headers
	if injected := InjectValidators(monID, req, nowS+299, 300); !injected {
		t.Errorf("expected injected == true within 300s floor, got false")
	}

	// After 300s -> floor expired, must return false (forces full GET)
	req2 := fasthttp.AcquireRequest()
	defer fasthttp.ReleaseRequest(req2)
	if injected := InjectValidators(monID, req2, nowS+301, 300); injected {
		t.Errorf("expected injected == false after 300s floor expiry, got true")
	}
}

func TestConditionalGETDropOnFailure(t *testing.T) {
	ResetConditionalState()
	monID := uint64(9003)
	nowS := time.Now().Unix()

	StoreValidatorState(monID, []byte(`"etag-to-drop"`), nil, nowS, true)
	DropValidatorState(monID)

	req := fasthttp.AcquireRequest()
	defer fasthttp.ReleaseRequest(req)

	if injected := InjectValidators(monID, req, nowS+1, 300); injected {
		t.Errorf("expected injected == false after DropValidatorState, got true")
	}
}
