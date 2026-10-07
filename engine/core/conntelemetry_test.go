package core

import (
	"crypto/tls"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestTelemetryConnByteCountingAndTLSClassification(t *testing.T) {
	EnableConnTelemetry = true
	defer func() { EnableConnTelemetry = false }()
	ResetConnStats()

	// Plain HTTP Server
	plainTS := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Hello Plain"))
	}))
	defer plainTS.Close()

	// TLS HTTP Server
	tlsTS := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Hello TLS"))
	}))
	defer tlsTS.Close()

	// Custom dialer wrapping connections with telemetryConn
	dialer := func(cohort int) func(network, addr string) (net.Conn, error) {
		return func(network, addr string) (net.Conn, error) {
			c, err := net.Dial(network, addr)
			if err != nil {
				return nil, err
			}
			return newTelemetryConn(c, cohort), nil
		}
	}

	// Plain HTTP Request
	plainClient := &http.Client{
		Transport: &http.Transport{
			Dial:              dialer(0),
			DisableKeepAlives: true,
		},
	}
	resp1, err := plainClient.Get(plainTS.URL)
	if err != nil {
		t.Fatalf("plain request failed: %v", err)
	}
	io.ReadAll(resp1.Body)
	resp1.Body.Close()

	// TLS HTTP Request
	tlsCfg := tlsTS.Client().Transport.(*http.Transport).TLSClientConfig.Clone()
	if tlsCfg == nil {
		tlsCfg = &tls.Config{}
	}
	tlsCfg.InsecureSkipVerify = true
	tlsClient := &http.Client{
		Transport: &http.Transport{
			DialTLS: func(network, addr string) (net.Conn, error) {
				rawConn, err := net.Dial(network, addr)
				if err != nil {
					return nil, err
				}
				tConn := newTelemetryConn(rawConn, 0)
				tlsConn := tls.Client(tConn, tlsCfg)
				if err := tlsConn.Handshake(); err != nil {
					tlsConn.Close()
					return nil, err
				}
				return tlsConn, nil
			},
			DisableKeepAlives: true,
		},
	}
	resp2, err := tlsClient.Get(tlsTS.URL)
	if err != nil {
		t.Fatalf("TLS request failed: %v", err)
	}
	io.ReadAll(resp2.Body)
	resp2.Body.Close()

	// Wait for net/http Transport to asynchronously close the connections
	time.Sleep(100 * time.Millisecond)

	// Verify Plain Stats
	aggPlain := &connAggs[0][0] // cohort 0, plain (isTLS=false)
	if aggPlain.conns.Load() != 1 {
		t.Errorf("expected 1 plain connection, got %d", aggPlain.conns.Load())
	}
	if aggPlain.bytesIn.Load() <= 0 || aggPlain.bytesOut.Load() <= 0 {
		t.Errorf("expected positive bytes for plain conn, got in=%d out=%d", aggPlain.bytesIn.Load(), aggPlain.bytesOut.Load())
	}

	// Verify TLS Stats
	aggTLS := &connAggs[0][1] // cohort 0, TLS (isTLS=true)
	if aggTLS.conns.Load() != 1 {
		t.Errorf("expected 1 TLS connection, got %d", aggTLS.conns.Load())
	}
	if aggTLS.bytesIn.Load() <= 0 || aggTLS.bytesOut.Load() <= 0 {
		t.Errorf("expected positive bytes for TLS conn, got in=%d out=%d", aggTLS.bytesIn.Load(), aggTLS.bytesOut.Load())
	}
}

func TestTelemetryConnUnusedAndIdempotentClose(t *testing.T) {
	EnableConnTelemetry = true
	defer func() { EnableConnTelemetry = false }()
	ResetConnStats()

	clientConn, serverConn := net.Pipe()
	defer serverConn.Close()

	tConn := newTelemetryConn(clientConn, 0)

	// Closing an unused connection (no Write performed) should NOT record stats
	tConn.Close()

	agg := &connAggs[0][0]
	if agg.conns.Load() != 0 {
		t.Errorf("expected 0 conns recorded for unused conn, got %d", agg.conns.Load())
	}

	// Test idempotent Close on written conn
	clientConn2, serverConn2 := net.Pipe()
	go func() {
		buf := make([]byte, 100)
		serverConn2.Read(buf)
		serverConn2.Close()
	}()

	tConn2 := newTelemetryConn(clientConn2, 0)
	tConn2.Write([]byte("GET / HTTP/1.1\r\n\r\n"))
	
	// Double Close
	tConn2.Close()
	tConn2.Close()

	if agg.conns.Load() != 1 {
		t.Errorf("expected 1 conn recorded after double close, got %d", agg.conns.Load())
	}
}

type dummyConn struct{ net.Conn }
func (dummyConn) Read(p []byte) (int, error)  { return len(p), nil }
func (dummyConn) Write(p []byte) (int, error) { return len(p), nil }

func TestTelemetryConnZeroAllocations(t *testing.T) {
	EnableConnTelemetry = true
	defer func() { EnableConnTelemetry = false }()

	tConn := newTelemetryConn(dummyConn{}, 0).(*telemetryConn)
	writeBuf := []byte("hello world data")
	readBuf := make([]byte, 64)

	// Verify Read allocs == 0
	if allocs := testing.AllocsPerRun(1000, func() {
		tConn.Write(writeBuf)
		tConn.Read(readBuf)
	}); allocs != 0 {
		t.Fatalf("telemetryConn Read/Write allocs/op = %v, want 0", allocs)
	}
}
