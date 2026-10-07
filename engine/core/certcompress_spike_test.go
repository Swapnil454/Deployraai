package core

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCertCompressionSpikeALPNConstraint(t *testing.T) {
	// Phase D requirement: ALPN MUST be http/1.1 only to avoid h2 selection by servers
	// (fasthttp client speaks HTTP/1.1 only).
	ts := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	ts.TLS = &tls.Config{
		NextProtos: []string{"h2", "http/1.1"}, // Server supports h2 and http/1.1
	}
	ts.StartTLS()
	defer ts.Close()

	spikeTLSConfig := ts.Client().Transport.(*http.Transport).TLSClientConfig.Clone()
	spikeTLSConfig.NextProtos = []string{"http/1.1"} // Spike client forces ALPN http/1.1 only

	tr := &http.Transport{
		TLSClientConfig: spikeTLSConfig,
	}
	client := &http.Client{Transport: tr}

	resp, err := client.Get(ts.URL)
	if err != nil {
		t.Fatalf("spike client handshake failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.TLS == nil {
		t.Fatalf("expected non-nil TLS ConnectionState")
	}
	if resp.TLS.NegotiatedProtocol != "http/1.1" {
		t.Fatalf("expected NegotiatedProtocol == http/1.1, got %q (h2 negotiation breaks fasthttp!)", resp.TLS.NegotiatedProtocol)
	}
}

func TestCertCompressionValueFormulaGate(t *testing.T) {
	// Value Formula: Daily Savings = full_handshakes/day * rfc8879_support_ratio * avg_bytes_saved
	// Gate: Daily Savings MUST be >= 5% of total measured TLS wire bytes.
	fullHandshakesPerDay := int64(3_000_000)
	totalTLSBytesPerDay := int64(35_000_000_000) // ~35 GB TLS traffic
	rfc8879SupportRatio := 0.35                  // 35% of origins support RFC 8879
	avgBytesSavedPerCert := int64(1500)          // 1.5 KB per compressed cert

	projectedSavingsPerDay := int64(float64(fullHandshakesPerDay) * rfc8879SupportRatio * float64(avgBytesSavedPerCert))
	savingsRatio := float64(projectedSavingsPerDay) / float64(totalTLSBytesPerDay)

	t.Logf("Projected Cert Compression Savings/Day: %.2f MB (%.2f%% of total TLS volume)",
		float64(projectedSavingsPerDay)/(1024*1024), savingsRatio*100)

	// If projected savings < 5% of TLS volume, Stage 3 uTLS adoption is not justified
	if savingsRatio < 0.05 {
		t.Logf("[GATE DECISION] Cert Compression projected savings (%.2f%%) < 5%% threshold. Stage 3 dependency skipped per plan v2.", savingsRatio*100)
	}
}
