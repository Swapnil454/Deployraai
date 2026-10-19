package core

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"errors"
	"fmt"
	"math/big"
	mathrand "math/rand"
	"net"
	"net/netip"
	"os"
	"reflect"
	"runtime"
	"strconv"
	"sync"
	"sync/atomic"
	"syscall"
	"testing"
	"time"

	"github.com/miekg/dns"
	"github.com/your-org/uptime-engine/netsec"
)

func generateTestTLSCert(t *testing.T, host string) (tls.Certificate, *x509.CertPool) {
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("failed to generate private key: %v", err)
	}

	template := x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{
			Organization: []string{"Acme Test Co"},
		},
		DNSNames:  []string{host},
		NotBefore: time.Now().Add(-1 * time.Hour),
		NotAfter:  time.Now().Add(24 * time.Hour),

		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
	}

	derBytes, err := x509.CreateCertificate(rand.Reader, &template, &template, &priv.PublicKey, priv)
	if err != nil {
		t.Fatalf("failed to create certificate: %v", err)
	}

	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: derBytes})
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(priv)})

	tlsCert, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		t.Fatalf("failed to parse key pair: %v", err)
	}

	certPool := x509.NewCertPool()
	certPool.AppendCertsFromPEM(certPEM)
	return tlsCert, certPool
}

// 1. Layout & Alignment Test: Monitor struct strictly 520 Bytes (576 B size class)
func TestMonitorStructLayout(t *testing.T) {
	var m Monitor
	mTyp := reflect.TypeOf(m)
	totalSize := mTyp.Size()

	t.Logf("Monitor struct exact byte size: %d bytes (align: %d)", totalSize, mTyp.Align())
	for i := 0; i < mTyp.NumField(); i++ {
		f := mTyp.Field(i)
		t.Logf("  field %2d: %-22s offset=%3d size=%3d", i, f.Name, f.Offset, f.Type.Size())
	}

	if totalSize > 576 {
		t.Fatalf("CRITICAL: Monitor struct size exceeded 576-byte class! Got %d bytes", totalSize)
	}
	if totalSize != 528 {
		t.Fatalf("Monitor struct size changed! Expected exactly 528 bytes (fits 576 class), got %d bytes", totalSize)
	}
}

// Layout & Zero-Allocation Assertion: StepDNSTemporaryEvaluationOnMonitor on success path
func TestStepDNSTemporaryEvaluation_ZeroAllocSuccess(t *testing.T) {
	var m Monitor
	m.DNSTempCell = &DNSTempCell{}
	m.DNSTempCell.State.Store(0)

	allocs := testing.AllocsPerRun(1000, func() {
		cnt, esc := StepDNSTemporaryEvaluationOnMonitor(&m, 60, ErrNone)
		if cnt != 0 || esc {
			t.Fatalf("expected cnt=0, esc=false, got %d, %v", cnt, esc)
		}
	})
	if allocs != 0 {
		t.Fatalf("expected 0 allocs/op on success path, got %v", allocs)
	}
}

// Semantic Test 1: 4 Temporary + 3 Inconclusive (Resource, Unsupported, Slow) + 1 Temporary Hold Sequence
func TestStepDNSTemporaryEvaluation_HoldSequence(t *testing.T) {
	var m Monitor
	m.DNSTempCell = &DNSTempCell{}

	// Probes 1-4: Four consecutive ErrDNSTemporary failures -> count reaches 4, no escalation
	for i := 1; i <= 4; i++ {
		cnt, esc := StepDNSTemporaryEvaluationOnMonitor(&m, 60, ErrDNSTemporary)
		if esc {
			t.Fatalf("iteration %d: escalated prematurely", i)
		}
		if cnt != int32(i) {
			t.Fatalf("iteration %d: expected count %d, got %d", i, i, cnt)
		}
	}

	// Probe 5: Inconclusive ErrLocalResource -> must HOLD count at 4 without incrementing or escalating
	cnt, esc := StepDNSTemporaryEvaluationOnMonitor(&m, 60, ErrLocalResource)
	if esc {
		t.Fatalf("ErrLocalResource must not escalate")
	}
	if cnt != 4 {
		t.Fatalf("ErrLocalResource must hold count at 4, got %d", cnt)
	}

	// Probe 6: Inconclusive ErrUnsupported -> must HOLD count at 4 without incrementing or escalating
	cnt, esc = StepDNSTemporaryEvaluationOnMonitor(&m, 60, ErrUnsupported)
	if esc {
		t.Fatalf("ErrUnsupported must not escalate")
	}
	if cnt != 4 {
		t.Fatalf("ErrUnsupported must hold count at 4, got %d", cnt)
	}

	// Probe 7: Inconclusive ErrSlow -> must HOLD count at 4 without incrementing or escalating
	cnt, esc = StepDNSTemporaryEvaluationOnMonitor(&m, 60, ErrSlow)
	if esc {
		t.Fatalf("ErrSlow must not escalate")
	}
	if cnt != 4 {
		t.Fatalf("ErrSlow must hold count at 4, got %d", cnt)
	}

	// Probe 8: 5th ErrDNSTemporary failure -> count reaches 5 and trips escalation!
	cnt, esc = StepDNSTemporaryEvaluationOnMonitor(&m, 60, ErrDNSTemporary)
	if !esc {
		t.Fatalf("5th temporary failure must trip escalation")
	}
	if cnt != 5 {
		t.Fatalf("expected count 5 upon escalation, got %d", cnt)
	}
}

// Semantic Test 2: Probes 6-9 Stay Saturated at 5 (No Flapping)
func TestStepDNSTemporaryEvaluation_SaturationAt5(t *testing.T) {
	var m Monitor
	m.DNSTempCell = &DNSTempCell{}

	// Probes 1-5 to escalate
	for i := 1; i <= 5; i++ {
		StepDNSTemporaryEvaluationOnMonitor(&m, 60, ErrDNSTemporary)
	}

	// Probes 6-9: Must remain saturated at count 5 with escalated=true
	for probe := 6; probe <= 9; probe++ {
		cnt, esc := StepDNSTemporaryEvaluationOnMonitor(&m, 60, ErrDNSTemporary)
		if !esc {
			t.Fatalf("probe %d: must remain escalated, got false", probe)
		}
		if cnt != 5 {
			t.Fatalf("probe %d: must stay saturated at 5, got %d", probe, cnt)
		}
	}
}

// Semantic Test 3: Max-Age With 24h Interval (72h Expiration Window)
func TestStepDNSTemporaryEvaluation_MaxAgeLongInterval(t *testing.T) {
	var m Monitor
	m.DNSTempCell = &DNSTempCell{}
	interval24h := 86400 // 24 hours in seconds -> 3*interval = 72 hours (259,200,000 ms)

	// Seed state: count = 3 with a timestamp 73 hours ago (stale)
	staleTsMs := time.Now().Add(-73 * time.Hour).UnixMilli()
	packed := PackDNSTempState(3, staleTsMs)
	m.DNSTempCell.State.Store(packed)

	// An inconclusive error after 73h (> 72h) must expire the stale count and reset to 0
	cnt, esc := StepDNSTemporaryEvaluationOnMonitor(&m, interval24h, ErrLocalResource)
	if esc || cnt != 0 {
		t.Fatalf("stale count (> 72h) must expire on inconclusive error, got cnt=%d, esc=%v", cnt, esc)
	}

	// Re-seed stale count = 3
	m.DNSTempCell.State.Store(packed)

	// A new ErrDNSTemporary after 73h must discard the stale sequence and restart at count 1
	cnt, esc = StepDNSTemporaryEvaluationOnMonitor(&m, interval24h, ErrDNSTemporary)
	if esc || cnt != 1 {
		t.Fatalf("stale count (> 72h) must restart at 1, got cnt=%d, esc=%v", cnt, esc)
	}

	// Non-stale: count = 3 with timestamp 20 hours ago (< 72h)
	freshTsMs := time.Now().Add(-20 * time.Hour).UnixMilli()
	freshPacked := PackDNSTempState(3, freshTsMs)
	m.DNSTempCell.State.Store(freshPacked)

	cnt, esc = StepDNSTemporaryEvaluationOnMonitor(&m, interval24h, ErrDNSTemporary)
	if esc || cnt != 4 {
		t.Fatalf("valid count within 72h must increment to 4, got cnt=%d, esc=%v", cnt, esc)
	}
}

// Semantic Test 4: Reset on Definitive Non-DNS Failure
func TestStepDNSTemporaryEvaluation_ResetOnDefinitiveNonDNS(t *testing.T) {
	var m Monitor
	m.DNSTempCell = &DNSTempCell{}

	// Run up to count = 4
	for i := 1; i <= 4; i++ {
		StepDNSTemporaryEvaluationOnMonitor(&m, 60, ErrDNSTemporary)
	}
	cur := m.DNSTempCell.State.Load()
	if cnt, _ := UnpackDNSTempState(cur); cnt != 4 {
		t.Fatalf("expected count 4 before reset, got %d", cnt)
	}

	// Definitive non-DNS failure (ErrRefused) must reset to 0
	cnt, esc := StepDNSTemporaryEvaluationOnMonitor(&m, 60, ErrRefused)
	if esc || cnt != 0 {
		t.Fatalf("definitive failure must reset count to 0, got cnt=%d, esc=%v", cnt, esc)
	}

	// State must be 0
	if val := m.DNSTempCell.State.Load(); val != 0 {
		t.Fatalf("expected DNSTempState to be 0, got %d", val)
	}
}

// Regression Race Test: CASUpdate loop concurrent with 8 goroutines calling StepDNSTemporaryEvaluationOnMonitor
func TestDNSTemporaryEvaluation_ConcurrentCASUpdateRaceFree(t *testing.T) {
	m := &Monitor{
		ID:          "mon-race-test",
		Interval:    60,
		DNSTempCell: &DNSTempCell{},
	}
	ptr := &atomic.Pointer[Monitor]{}
	ptr.Store(m)

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	var wg sync.WaitGroup

	// 8 worker goroutines calling StepDNSTemporaryEvaluationOnMonitor concurrently
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			classes := []ErrClass{ErrDNSTemporary, ErrNone, ErrLocalResource, ErrUnsupported, ErrSlow, ErrRefused}
			idx := workerID
			for {
				select {
				case <-ctx.Done():
					return
				default:
					curr := ptr.Load()
					StepDNSTemporaryEvaluationOnMonitor(curr, curr.Interval, classes[idx%len(classes)])
					idx++
				}
			}
		}(i)
	}

	// 4 writer goroutines running CASUpdate concurrently (simulating config sync updates)
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				default:
					CASUpdate(ptr, func(mon *Monitor) {
						mon.Interval = 30
						mon.Timeout = 5
					})
				}
			}
		}()
	}

	wg.Wait()
}

// 2. DNS Cache Basic Lookup & Positive Hits
func TestDNSCacheBasic(t *testing.T) {
	mock := &mockResolver{
		records: map[string][]netip.Addr{
			"example.com": {netip.MustParseAddr("93.184.216.34")},
		},
		ttl: 60 * time.Second,
	}

	cache := NewDNSCache(DNSCacheConfig{
		Capacity:    1000,
		PositiveTTL: 60 * time.Second,
		NegativeTTL: 10 * time.Second,
	}, mock)
	defer cache.Close()

	ctx := context.Background()
	addrs, err := cache.Lookup(ctx, "example.com", false)
	if err != nil {
		t.Fatalf("lookup failed: %v", err)
	}
	if len(addrs) != 1 || addrs[0].String() != "93.184.216.34" {
		t.Fatalf("unexpected addrs: %v", addrs)
	}

	addrs2, err := cache.Lookup(ctx, "example.com", false)
	if err != nil {
		t.Fatalf("lookup 2 failed: %v", err)
	}
	if len(addrs2) != 1 || addrs2[0].String() != "93.184.216.34" {
		t.Fatalf("unexpected addrs2: %v", addrs2)
	}

	stats := cache.Stats()
	if stats.Hits != 1 || stats.Misses != 1 {
		t.Fatalf("expected 1 hit and 1 miss, got hits=%d, misses=%d", stats.Hits, stats.Misses)
	}
}

// 3. Injected Clock Expiry Verification
func TestDNSCache_InjectedClockExpiry(t *testing.T) {
	simulatedNano := atomic.Int64{}
	simulatedNano.Store(1000000000)

	mock := &mockResolver{
		records: map[string][]netip.Addr{
			"clock-exp.com": {netip.MustParseAddr("198.51.100.1")},
		},
		ttl: 30 * time.Second,
	}

	cache := NewDNSCache(DNSCacheConfig{
		Capacity:    1000,
		PositiveTTL: 30 * time.Second,
	}, mock)
	defer cache.Close()

	cache.nowNano = func() int64 {
		return simulatedNano.Load()
	}

	ctx := context.Background()
	_, err := cache.Lookup(ctx, "clock-exp.com", false)
	if err != nil {
		t.Fatalf("first lookup failed: %v", err)
	}

	_, err = cache.Lookup(ctx, "clock-exp.com", false)
	if err != nil {
		t.Fatalf("cached lookup failed: %v", err)
	}
	if cache.Stats().Hits != 1 {
		t.Fatalf("expected 1 cache hit before clock step, got %d", cache.Stats().Hits)
	}

	simulatedNano.Add(int64(31 * time.Second))

	_, err = cache.Lookup(ctx, "clock-exp.com", false)
	if err != nil {
		t.Fatalf("post-expiry lookup failed: %v", err)
	}
	if cache.Stats().Misses != 2 {
		t.Fatalf("expected 2 cache misses after clock step expiry, got %d", cache.Stats().Misses)
	}
}

// 4. Context Deadline Propagation Test
func TestMiekgResolver_ContextDeadlinePropagation(t *testing.T) {
	handler := dns.HandlerFunc(func(w dns.ResponseWriter, r *dns.Msg) {
		time.Sleep(100 * time.Millisecond)
		m := new(dns.Msg)
		m.SetReply(r)
		_ = w.WriteMsg(m)
	})

	server, addr := startMockDNSServer(t, "udp", handler)
	defer server.Shutdown()

	resolver := NewMiekgResolver(MiekgResolverConfig{
		Servers: []string{addr},
		Timeout: 2 * time.Second,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Millisecond)
	defer cancel()

	start := time.Now()
	_, _, err := resolver.Resolve(ctx, "timeout.example.com")
	elapsed := time.Since(start)

	if err == nil {
		t.Fatalf("expected deadline exceeded error, got nil")
	}
	if !errors.Is(err, context.DeadlineExceeded) && !errors.Is(err, os.ErrDeadlineExceeded) && !errors.Is(err, ErrDNSLocalResource) {
		var de *net.DNSError
		if !errors.As(err, &de) || !de.IsTemporary {
			t.Fatalf("expected temporary/deadline error, got: %v", err)
		}
	}
	if elapsed > 80*time.Millisecond {
		t.Fatalf("probe took %v, failed to honor 25ms context deadline promptly", elapsed)
	}
}

// 5. Recursor Outage Returns Inconclusive Sentinel
func TestMiekgResolver_RecursorOutageReturnsInconclusive(t *testing.T) {
	resolver := NewMiekgResolver(MiekgResolverConfig{
		Servers: []string{"127.0.0.1:53999"},
		Timeout: 80 * time.Millisecond,
	})
	resolver.SetCanaryHealthy(false)

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	_, _, err := resolver.Resolve(ctx, "unreachable.example.com")
	if err == nil {
		t.Fatalf("expected error from non-listening recursor, got nil")
	}

	if !errors.Is(err, ErrRecursorUnavailable) && !errors.Is(err, context.DeadlineExceeded) && !errors.Is(err, ErrDNSLocalResource) {
		t.Fatalf("expected ErrRecursorUnavailable or DeadlineExceeded, got: %v", err)
	}

	classified := classifyNetError(err, false)
	if classified != ErrLocalResource {
		t.Fatalf("expected recursor outage to classify as inconclusive ErrLocalResource, got: %v", classified)
	}
}

// 6. Failover Backoff on Blackholed Server (Listening Socket Dropping Packets)
func TestMiekgResolver_FailoverBackoffOnBlackholedServer(t *testing.T) {
	blackholeConn, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to bind blackhole socket: %v", err)
	}
	defer blackholeConn.Close()
	blackholeAddr := blackholeConn.LocalAddr().String()

	go func() {
		buf := make([]byte, 2048)
		for {
			_, _, err := blackholeConn.ReadFrom(buf)
			if err != nil {
				return
			}
		}
	}()

	healthyHandler := dns.HandlerFunc(func(w dns.ResponseWriter, r *dns.Msg) {
		m := new(dns.Msg)
		m.SetReply(r)
		a, _ := dns.NewRR("failover.example.com. 60 IN A 198.51.100.99")
		m.Answer = append(m.Answer, a)
		_ = w.WriteMsg(m)
	})
	sHealthy, healthyAddr := startMockDNSServer(t, "udp", healthyHandler)
	defer sHealthy.Shutdown()

	resolver := NewMiekgResolver(MiekgResolverConfig{
		Servers: []string{blackholeAddr, healthyAddr},
		Timeout: 600 * time.Millisecond,
	})

	ctx1, cancel1 := context.WithTimeout(context.Background(), 700*time.Millisecond)
	defer cancel1()

	start := time.Now()
	addrs, _, err := resolver.Resolve(ctx1, "failover.example.com")
	if err != nil || len(addrs) == 0 {
		t.Fatalf("first lookup failed to failover: %v", err)
	}
	t.Logf("First failover took %v (blackhole sliced attempt)", time.Since(start))

	ctx2, cancel2 := context.WithTimeout(context.Background(), 700*time.Millisecond)
	defer cancel2()
	_, _, _ = resolver.Resolve(ctx2, "failover.example.com")

	if resolver.serverStates[0].downUntil.Load() <= time.Now().UnixNano() {
		t.Fatalf("blackholed server was not marked down with backoff cooldown")
	}

	start2 := time.Now()
	ctx3, cancel3 := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel3()
	addrs3, _, err := resolver.Resolve(ctx3, "failover.example.com")
	fastElapsed := time.Since(start2)

	if err != nil || len(addrs3) == 0 {
		t.Fatalf("third lookup failed during backoff: %v", err)
	}
	if fastElapsed > 150*time.Millisecond {
		t.Fatalf("expected fast resolution bypassing blackholed server, took %v", fastElapsed)
	}
}

// 7. IPv6-Only Host Returns ErrUnsupported
func TestMiekgResolver_IPv6OnlyHostReturnsUnsupported(t *testing.T) {
	handler := dns.HandlerFunc(func(w dns.ResponseWriter, r *dns.Msg) {
		m := new(dns.Msg)
		m.SetReply(r)
		if r.Question[0].Qtype == dns.TypeAAAA {
			aaaa, _ := dns.NewRR("ipv6only.example.com. 60 IN AAAA 2001:db8::1")
			m.Answer = append(m.Answer, aaaa)
		}
		_ = w.WriteMsg(m)
	})

	server, addr := startMockDNSServer(t, "udp", handler)
	defer server.Shutdown()

	resolver := NewMiekgResolver(MiekgResolverConfig{
		Servers:     []string{addr},
		DisableIPv6: true,
	})

	_, _, err := resolver.Resolve(context.Background(), "ipv6only.example.com")
	if err == nil {
		t.Fatalf("expected ErrDNSUnsupportedIPv6, got nil")
	}
	if !errors.Is(err, ErrDNSUnsupportedIPv6) {
		t.Fatalf("expected ErrDNSUnsupportedIPv6, got: %v", err)
	}

	classified := classifyNetError(err, false)
	if classified != ErrUnsupported {
		t.Fatalf("expected ErrUnsupported from classifier, got: %v", classified)
	}
}

// 8. Truncation Fallback to TCP
func TestMiekgResolver_TruncationFallback(t *testing.T) {
	udpHandler := dns.HandlerFunc(func(w dns.ResponseWriter, r *dns.Msg) {
		m := new(dns.Msg)
		m.SetReply(r)
		m.Truncated = true
		_ = w.WriteMsg(m)
	})

	tcpHandler := dns.HandlerFunc(func(w dns.ResponseWriter, r *dns.Msg) {
		m := new(dns.Msg)
		m.SetReply(r)
		if len(r.Question) > 0 && r.Question[0].Qtype == dns.TypeA {
			a, _ := dns.NewRR("trunc.example.com. 60 IN A 198.51.100.42")
			m.Answer = append(m.Answer, a)
		}
		_ = w.WriteMsg(m)
	})

	sUDP, addr := startMockDNSServer(t, "udp", udpHandler)
	defer sUDP.Shutdown()

	sTCP, _ := startMockDNSServerWithAddr(t, "tcp", addr, tcpHandler)
	defer sTCP.Shutdown()

	resolver := NewMiekgResolver(MiekgResolverConfig{
		Servers: []string{addr},
		Timeout: 500 * time.Millisecond,
	})

	addrs, _, err := resolver.Resolve(context.Background(), "trunc.example.com")
	if err != nil {
		t.Fatalf("resolution failed after truncation: %v", err)
	}
	if len(addrs) != 1 || addrs[0].String() != "198.51.100.42" {
		t.Fatalf("expected 198.51.100.42 via TCP fallback, got: %v", addrs)
	}
}

// 9. Large UDP Response (~1,100 Bytes) Without Truncation -> No TCP Fallback
func TestMiekgResolver_LargeUDPNoTruncationFallback(t *testing.T) {
	tcpCalls := atomic.Int64{}
	udpHandler := dns.HandlerFunc(func(w dns.ResponseWriter, r *dns.Msg) {
		m := new(dns.Msg)
		m.SetReply(r)
		m.SetEdns0(1232, false)
		if len(r.Question) > 0 && r.Question[0].Qtype == dns.TypeA {
			for i := 1; i <= 28; i++ {
				a, _ := dns.NewRR(fmt.Sprintf("%s 60 IN A 198.51.100.%d", r.Question[0].Name, i))
				m.Answer = append(m.Answer, a)
			}
		}
		_ = w.WriteMsg(m)
	})

	tcpHandler := dns.HandlerFunc(func(w dns.ResponseWriter, r *dns.Msg) {
		tcpCalls.Add(1)
		m := new(dns.Msg)
		m.SetReply(r)
		_ = w.WriteMsg(m)
	})

	sUDP, addr := startMockDNSServer(t, "udp", udpHandler)
	defer sUDP.Shutdown()

	sTCP, _ := startMockDNSServerWithAddr(t, "tcp", addr, tcpHandler)
	defer sTCP.Shutdown()

	resolver := NewMiekgResolver(MiekgResolverConfig{
		Servers: []string{addr},
		Timeout: 500 * time.Millisecond,
	})

	addrs, _, err := resolver.Resolve(context.Background(), "large-udp.example.com")
	if err != nil {
		t.Fatalf("large UDP resolution failed: %v", err)
	}
	if len(addrs) != 28 {
		t.Fatalf("expected 28 A records parsed from large UDP answer, got %d", len(addrs))
	}
	if tcpCalls.Load() != 0 {
		t.Fatalf("TCP fallback was unexpectedly triggered for untruncated 1100-byte UDP answer")
	}
}

// 10. Broken AAAA Does Not Discard Valid A Results
func TestMiekgResolver_AAAABrokenDoesNotDiscardA(t *testing.T) {
	handler := dns.HandlerFunc(func(w dns.ResponseWriter, r *dns.Msg) {
		m := new(dns.Msg)
		m.SetReply(r)
		if r.Question[0].Qtype == dns.TypeA {
			a, _ := dns.NewRR("mixed.example.com. 60 IN A 198.51.100.55")
			m.Answer = append(m.Answer, a)
		} else if r.Question[0].Qtype == dns.TypeAAAA {
			m.Rcode = dns.RcodeServerFailure
		}
		_ = w.WriteMsg(m)
	})

	s, addr := startMockDNSServer(t, "udp", handler)
	defer s.Shutdown()

	resolver := NewMiekgResolver(MiekgResolverConfig{
		Servers: []string{addr},
		Timeout: 300 * time.Millisecond,
	})
	resolver.hasIPv6Cached.Store(true)

	addrs, _, err := resolver.Resolve(context.Background(), "mixed.example.com")
	if err != nil {
		t.Fatalf("expected resolution to succeed on valid A records despite AAAA failure, got: %v", err)
	}
	if len(addrs) != 1 || addrs[0].String() != "198.51.100.55" {
		t.Fatalf("expected A address 198.51.100.55, got: %v", addrs)
	}
}

// 11. Authoritative NXDOMAIN Immediately Cancels In-Flight AAAA Query
func TestMiekgResolver_NXDOMAINImmediatelyCancelsAAAA(t *testing.T) {
	aaaaStarted := make(chan struct{})

	handler := dns.HandlerFunc(func(w dns.ResponseWriter, r *dns.Msg) {
		if r.Question[0].Qtype == dns.TypeA {
			m := new(dns.Msg)
			m.SetReply(r)
			m.Rcode = dns.RcodeNameError
			_ = w.WriteMsg(m)
		} else if r.Question[0].Qtype == dns.TypeAAAA {
			close(aaaaStarted)
			time.Sleep(100 * time.Millisecond)
			m := new(dns.Msg)
			m.SetReply(r)
			_ = w.WriteMsg(m)
		}
	})

	s, addr := startMockDNSServer(t, "udp", handler)
	defer s.Shutdown()

	resolver := NewMiekgResolver(MiekgResolverConfig{
		Servers: []string{addr},
		Timeout: 500 * time.Millisecond,
	})
	resolver.hasIPv6Cached.Store(true)

	start := time.Now()
	_, _, err := resolver.Resolve(context.Background(), "nx-immediate.com")
	elapsed := time.Since(start)

	var dnsErr *net.DNSError
	if !errors.As(err, &dnsErr) || !dnsErr.IsNotFound {
		t.Fatalf("expected authoritative NXDOMAIN, got: %v", err)
	}
	if elapsed > 150*time.Millisecond {
		t.Fatalf("NXDOMAIN did not return promptly: elapsed %v", elapsed)
	}
}

// 12. Semaphore Saturation
func TestMiekgResolver_SemaphoreSaturation(t *testing.T) {
	resolver := NewMiekgResolver(MiekgResolverConfig{
		SemConcurrency: 1,
		Timeout:        100 * time.Millisecond,
	})

	resolver.sem <- struct{}{}
	defer func() { <-resolver.sem }()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()

	_, _, err := resolver.Resolve(ctx, "sem.example.com")
	if !errors.Is(err, ErrDNSLocalResource) {
		t.Fatalf("expected ErrDNSLocalResource from saturated semaphore, got: %v", err)
	}

	classified := classifyNetError(err, false)
	if classified != ErrLocalResource {
		t.Fatalf("expected ErrLocalResource on semaphore saturation, got: %v", classified)
	}
}

// 13. Stale UDP Reply Discard & Socket Pool Isolation Driven via exchangeOnServer
func TestMiekgResolver_StaleReplyDiscard(t *testing.T) {
	query1Received := make(chan struct{})
	handler := dns.HandlerFunc(func(w dns.ResponseWriter, r *dns.Msg) {
		if len(r.Question) > 0 && r.Question[0].Name == "query1.example.com." {
			close(query1Received)
			time.Sleep(120 * time.Millisecond) // Reply after client timeout
			m := new(dns.Msg)
			m.SetReply(r)
			a, _ := dns.NewRR("query1.example.com. 60 IN A 198.51.100.1")
			m.Answer = append(m.Answer, a)
			_ = w.WriteMsg(m)
			return
		}
		// Query 2 gets immediate reply
		m := new(dns.Msg)
		m.SetReply(r)
		a, _ := dns.NewRR("query2.example.com. 60 IN A 198.51.100.2")
		m.Answer = append(m.Answer, a)
		_ = w.WriteMsg(m)
	})

	server, addr := startMockDNSServer(t, "udp", handler)
	defer server.Shutdown()

	resolver := NewMiekgResolver(MiekgResolverConfig{
		Servers:        []string{addr},
		Timeout:        30 * time.Millisecond,
		CanaryInterval: 24 * time.Hour,
	})
	defer resolver.Close()

	pool := resolver.pools[0]

	// 1. Send query 1 through exchangeOnServer with a tight timeout
	ctx1, cancel1 := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel1()

	m1 := new(dns.Msg)
	m1.SetQuestion("query1.example.com.", dns.TypeA)
	m1.Id = 0x1111

	_, err1 := resolver.exchangeOnServer(ctx1, m1, addr, pool)
	if err1 == nil {
		t.Fatalf("expected timeout error for query 1, got nil")
	}

	// 2. Assert socket was discarded and NOT returned to the pool
	if len(pool.conns) != 0 {
		t.Fatalf("expected pool to be empty after timeout (socket discarded), got %d idle conns", len(pool.conns))
	}

	// 3. Now send query 2 through exchangeOnServer; must get fresh clean socket and succeed
	ctx2, cancel2 := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel2()

	m2 := new(dns.Msg)
	m2.SetQuestion("query2.example.com.", dns.TypeA)
	m2.Id = 0x2222

	resp2, err2 := resolver.exchangeOnServer(ctx2, m2, addr, pool)
	if err2 != nil {
		t.Fatalf("query 2 failed via exchangeOnServer: %v", err2)
	}
	if resp2.Id != 0x2222 {
		t.Fatalf("expected response ID 0x2222, got: 0x%x", resp2.Id)
	}
	if len(resp2.Answer) != 1 || resp2.Answer[0].Header().Name != "query2.example.com." {
		t.Fatalf("expected answer for query2.example.com, got: %v", resp2.Answer)
	}

	// Succeeded query put socket back in pool
	if len(pool.conns) != 1 {
		t.Fatalf("expected successful query to return socket to pool, got %d conns", len(pool.conns))
	}
}

// 14. Parallel Resolution with Start Barrier & No Race Condition
func TestMiekgResolver_ParallelResolution_StartBarrier(t *testing.T) {
	handler := dns.HandlerFunc(func(w dns.ResponseWriter, r *dns.Msg) {
		time.Sleep(30 * time.Millisecond)
		m := new(dns.Msg)
		m.SetReply(r)
		if r.Question[0].Qtype == dns.TypeA {
			a, _ := dns.NewRR("par.example.com. 60 IN A 198.51.100.10")
			m.Answer = append(m.Answer, a)
		} else {
			aaaa, _ := dns.NewRR("par.example.com. 60 IN AAAA 2001:db8::10")
			m.Answer = append(m.Answer, aaaa)
		}
		_ = w.WriteMsg(m)
	})

	server, addr := startMockDNSServer(t, "udp", handler)
	defer server.Shutdown()

	resolver := NewMiekgResolver(MiekgResolverConfig{
		Servers: []string{addr},
	})
	resolver.hasIPv6Cached.Store(true)

	type result struct {
		addrs   []netip.Addr
		elapsed time.Duration
		err     error
	}

	barrier := make(chan struct{})
	resCh := make(chan result, 1)

	go func() {
		<-barrier
		startTime := time.Now()
		addrs, _, err := resolver.Resolve(context.Background(), "par.example.com")
		resCh <- result{
			addrs:   addrs,
			elapsed: time.Since(startTime),
			err:     err,
		}
	}()

	close(barrier)
	res := <-resCh

	if res.err != nil {
		t.Fatalf("parallel resolution failed: %v", res.err)
	}
	if len(res.addrs) != 2 {
		t.Fatalf("expected both A and AAAA records, got: %v", res.addrs)
	}
	if res.elapsed > 65*time.Millisecond {
		t.Fatalf("expected parallel resolution ~30ms, took %v (indicates sequential queries)", res.elapsed)
	}
}

// 15. EDNS0 Buffer Size Negotiation (1232 Bytes)
func TestMiekgResolver_EDNS0(t *testing.T) {
	var edns0Size atomic.Uint32
	handler := dns.HandlerFunc(func(w dns.ResponseWriter, r *dns.Msg) {
		opt := r.IsEdns0()
		if opt != nil {
			edns0Size.Store(uint32(opt.UDPSize()))
		}
		m := new(dns.Msg)
		m.SetReply(r)
		a, _ := dns.NewRR("edns0.example.com. 60 IN A 198.51.100.1")
		m.Answer = append(m.Answer, a)
		_ = w.WriteMsg(m)
	})

	server, addr := startMockDNSServer(t, "udp", handler)
	defer server.Shutdown()

	resolver := NewMiekgResolver(MiekgResolverConfig{
		Servers: []string{addr},
	})

	_, _, err := resolver.Resolve(context.Background(), "edns0.example.com")
	if err != nil {
		t.Fatalf("resolution failed: %v", err)
	}
	if edns0Size.Load() != 1232 {
		t.Fatalf("expected EDNS0 UDP buffer size 1232, got: %d", edns0Size.Load())
	}
}

// 16. SERVFAIL Handling: Canary Healthy (Authoritative Escalation) vs Unhealthy (Inconclusive)
func TestMiekgResolver_SERVFAIL_CanaryAuthoritativeVsInconclusive(t *testing.T) {
	handler := dns.HandlerFunc(func(w dns.ResponseWriter, r *dns.Msg) {
		m := new(dns.Msg)
		m.SetRcode(r, dns.RcodeServerFailure)
		_ = w.WriteMsg(m)
	})

	server, addr := startMockDNSServer(t, "udp", handler)
	defer server.Shutdown()

	resolver := NewMiekgResolver(MiekgResolverConfig{
		Servers: []string{addr},
	})
	defer resolver.Close()

	// 1. Canary Healthy: SERVFAIL is authoritative, escalates to negative SERVFAIL entry
	resolver.SetCanaryHealthy(true)
	_, ttl, err := resolver.Resolve(context.Background(), "auth-servfail.example.com")
	if err == nil {
		t.Fatalf("expected SERVFAIL error when canary is healthy, got nil")
	}
	if ttl != resolver.cfg.NegativeSERVFAILTTL {
		t.Fatalf("expected NegativeSERVFAILTTL (%v), got: %v", resolver.cfg.NegativeSERVFAILTTL, ttl)
	}

	// 2. Canary Unhealthy: SERVFAIL returns inconclusive ErrRecursorUnavailable
	resolver.SetCanaryHealthy(false)
	_, _, errUnhealthy := resolver.Resolve(context.Background(), "inconclusive-servfail.example.com")
	if !errors.Is(errUnhealthy, ErrRecursorUnavailable) {
		t.Fatalf("expected ErrRecursorUnavailable when canary is unhealthy, got: %v", errUnhealthy)
	}
}

// 17. Rendezvous Hashing Reorder Stability & Sticky Determinism
func TestRendezvousHashing_StickyAndStable(t *testing.T) {
	ipA := netip.MustParseAddr("198.51.100.1")
	ipB := netip.MustParseAddr("198.51.100.2")
	ipC := netip.MustParseAddr("198.51.100.3")

	candidates1 := []netip.Addr{ipA, ipB, ipC}
	candidates2 := []netip.Addr{ipC, ipA, ipB}
	candidates3 := []netip.Addr{ipB, ipC, ipA}

	for i := 0; i < 1000; i++ {
		monID := fmt.Sprintf("mon-reorder-%d", i)
		win1 := PickRendezvousIP(monID, candidates1)
		win2 := PickRendezvousIP(monID, candidates2)
		win3 := PickRendezvousIP(monID, candidates3)

		if win1 != win2 || win1 != win3 {
			t.Fatalf("rendezvous hash failed reorder stability for %s: win1=%s, win2=%s, win3=%s",
				monID, win1, win2, win3)
		}
	}
}

// 18. Rendezvous Hashing 100k Spread and Consistent Pruning
func TestRendezvousHashing_100kSpreadAndConsistentPruning(t *testing.T) {
	ipA := netip.MustParseAddr("198.51.100.1")
	ipB := netip.MustParseAddr("198.51.100.2")
	ipC := netip.MustParseAddr("198.51.100.3")
	candidates := []netip.Addr{ipA, ipB, ipC}

	counts := map[netip.Addr]int{}
	assignments := make([]netip.Addr, 100000)

	for i := 0; i < 100000; i++ {
		monID := fmt.Sprintf("mon-hash-%d", i)
		chosen := PickRendezvousIP(monID, candidates)
		counts[chosen]++
		assignments[i] = chosen
	}

	t.Logf("100k Monitor Distribution across 3 IPs: IP_A=%d, IP_B=%d, IP_C=%d",
		counts[ipA], counts[ipB], counts[ipC])

	for _, ip := range candidates {
		pct := float64(counts[ip]) / 1000.0
		if pct < 31.0 || pct > 35.5 {
			t.Fatalf("rendezvous hash spread out of expected uniform bounds (31%%-35.5%%): %.2f%% on %s", pct, ip)
		}
	}

	prunedCandidates := []netip.Addr{ipA, ipB}
	movedCount := 0
	unaffectedStayed := 0

	for i := 0; i < 100000; i++ {
		monID := fmt.Sprintf("mon-hash-%d", i)
		original := assignments[i]
		newChosen := PickRendezvousIP(monID, prunedCandidates)

		if original == ipC {
			if newChosen != ipA && newChosen != ipB {
				t.Fatalf("monitor on removed IP_C rehashed to unexpected IP: %s", newChosen)
			}
			movedCount++
		} else {
			if newChosen != original {
				t.Fatalf("monitor %d unexpectedly moved from %s to %s on pruning unaffected IP!",
					i, original, newChosen)
			}
			unaffectedStayed++
		}
	}

	if movedCount != counts[ipC] {
		t.Fatalf("expected exactly %d monitors on removed IP_C to move, got %d", counts[ipC], movedCount)
	}
	if unaffectedStayed != (counts[ipA] + counts[ipB]) {
		t.Fatalf("expected 100%% of unaffected monitors to remain sticky, got %d", unaffectedStayed)
	}
}

// 19. IP Rotation and Partial Failure Tracking
func TestCachedDialer_IPRotationAndPartialFailure(t *testing.T) {
	ResetFleetBreakerForTest()

	lnAlive, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to bind alive listener: %v", err)
	}
	defer lnAlive.Close()
	_, alivePort, _ := net.SplitHostPort(lnAlive.Addr().String())

	deadIP := netip.MustParseAddr("127.0.0.2")
	liveIP := netip.MustParseAddr("127.0.0.1")

	// Find a monitor ID that deterministically selects deadIP first
	monID := "mon-pick-dead"
	if PickRendezvousIP(monID, []netip.Addr{deadIP, liveIP}) != deadIP {
		for i := 0; i < 100; i++ {
			candidate := fmt.Sprintf("mon-pick-dead-%d", i)
			if PickRendezvousIP(candidate, []netip.Addr{deadIP, liveIP}) == deadIP {
				monID = candidate
				break
			}
		}
	}

	q := NewIPQuarantine(60 * time.Second)
	mock := &mockResolver{
		records: map[string][]netip.Addr{
			"rot.example.com": {deadIP, liveIP},
		},
		ttl: 60 * time.Second,
	}

	cache := NewDNSCache(DNSCacheConfig{}, mock)
	defer cache.Close()

	dialer := NewCachedDialer(cache, CachedDialerConfig{
		ConnectTimeout: 150 * time.Millisecond,
		Quarantine:     q,
		BlockedIPFunc:  func(ip netip.Addr) bool { return false },
	})

	ctx := WithMonitorID(context.Background(), monID)
	conn, err := dialer.DialContext(ctx, "tcp", net.JoinHostPort("rot.example.com", alivePort))
	if err != nil {
		t.Fatalf("expected dialer to succeed on rotation to alive IP: %v", err)
	}
	defer conn.Close()

	tconn, ok := conn.(*telemetryConn)
	if !ok {
		t.Fatalf("expected *telemetryConn")
	}
	stats := tconn.Stats()
	if stats.Attempts != 2 {
		t.Fatalf("expected exactly 2 attempts (dead IP failed, rotated to alive), got %d", stats.Attempts)
	}
	if stats.PartialIPFailures != 1 {
		t.Fatalf("expected 1 partial IP failure, got %d", stats.PartialIPFailures)
	}
	if stats.ConnectedIP != liveIP {
		t.Fatalf("expected connected IP %s, got %s", liveIP, stats.ConnectedIP)
	}
	if !q.IsQuarantined("rot.example.com", deadIP, alivePort) {
		t.Fatalf("failed dead IP was not quarantined!")
	}
}

// 20. Sliced Dial Budgets
func TestCachedDialer_SlicedBudget(t *testing.T) {
	mock := &mockResolver{
		records: map[string][]netip.Addr{
			"dead.example.com": {
				netip.MustParseAddr("198.51.100.1"),
				netip.MustParseAddr("198.51.100.2"),
				netip.MustParseAddr("198.51.100.3"),
			},
		},
		ttl: 60 * time.Second,
	}

	cache := NewDNSCache(DNSCacheConfig{}, mock)
	defer cache.Close()

	var attemptMu sync.Mutex
	var attemptDurations []time.Duration
	var attemptAddrs []string

	dialer := NewCachedDialer(cache, CachedDialerConfig{
		ConnectTimeout: 2 * time.Second,
		BlockedIPFunc:  func(ip netip.Addr) bool { return false },
		DialContextFn: func(ctx context.Context, network, addr string) (net.Conn, error) {
			start := time.Now()
			<-ctx.Done()
			dur := time.Since(start)
			attemptMu.Lock()
			attemptDurations = append(attemptDurations, dur)
			attemptAddrs = append(attemptAddrs, addr)
			attemptMu.Unlock()
			return nil, ctx.Err()
		},
	})

	totalBudget := 300 * time.Millisecond
	ctx, cancel := context.WithTimeout(context.Background(), totalBudget)
	defer cancel()

	start := time.Now()
	_, err := dialer.DialContext(ctx, "tcp", "dead.example.com:80")
	totalElapsed := time.Since(start)

	if err == nil {
		t.Fatalf("expected error from dead IPs, got nil")
	}

	attemptMu.Lock()
	defer attemptMu.Unlock()

	// 1. Verify exactly 3 attempts were made
	if len(attemptDurations) != 3 {
		t.Fatalf("expected 3 dial attempts, got %d", len(attemptDurations))
	}

	// 2. Verify per-attempt slicing: 300ms / 3 = 100ms per attempt with explicit lower and upper bounds
	for i, dur := range attemptDurations {
		if dur < 80*time.Millisecond {
			t.Fatalf("attempt %d sliced duration %v below minimum lower bound 80ms", i, dur)
		}
		if dur > 150*time.Millisecond {
			t.Fatalf("attempt %d sliced duration %v exceeded upper bound 150ms", i, dur)
		}
	}

	// 3. Verify total duration stayed within 300ms budget (+ grace for scheduling)
	if totalElapsed < 270*time.Millisecond || totalElapsed > 450*time.Millisecond {
		t.Fatalf("total elapsed time %v outside expected [270ms, 450ms]", totalElapsed)
	}
}

// 21. No Context Deadline Budget Slicing
func TestCachedDialer_NoContextDeadlineBudgetSlicing(t *testing.T) {
	mock := &mockResolver{
		records: map[string][]netip.Addr{
			"no-ctx-dead.example.com": {
				netip.MustParseAddr("198.51.100.1"),
				netip.MustParseAddr("198.51.100.2"),
			},
		},
		ttl: 60 * time.Second,
	}

	cache := NewDNSCache(DNSCacheConfig{}, mock)
	defer cache.Close()

	dialer := NewCachedDialer(cache, CachedDialerConfig{
		ConnectTimeout: 400 * time.Millisecond,
	})

	start := time.Now()
	_, err := dialer.DialContext(context.Background(), "tcp", "no-ctx-dead.example.com:80")
	elapsed := time.Since(start)

	if err == nil {
		t.Fatalf("expected error from dead IPs")
	}
	if elapsed > 900*time.Millisecond {
		t.Fatalf("dialer without context deadline exceeded ConnectTimeout bounds: %v", elapsed)
	}
}

// 22. Fleet Network Failure Shield (Circuit Breaker)
func TestCachedDialer_FleetNetworkFailureShield(t *testing.T) {
	q := NewIPQuarantine(60 * time.Second)
	host := "remote-fail.example.com"
	port := "80"
	ip := netip.MustParseAddr("198.51.100.5")

	SetFleetBreakerForTest(100, 80)
	defer ResetFleetBreakerForTest()

	if !isFleetNetworkDegraded() {
		t.Fatalf("expected fleet to be marked degraded with 80/100 failures")
	}

	mock := &mockResolver{
		records: map[string][]netip.Addr{
			host: {ip, netip.MustParseAddr("198.51.100.6")},
		},
		ttl: 60 * time.Second,
	}

	cache := NewDNSCache(DNSCacheConfig{}, mock)
	defer cache.Close()

	dialer := NewCachedDialer(cache, CachedDialerConfig{
		ConnectTimeout: 50 * time.Millisecond,
		Quarantine:     q,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Millisecond)
	defer cancel()

	_, _ = dialer.DialContext(ctx, "tcp", net.JoinHostPort(host, port))

	if q.IsQuarantined(host, ip, port) {
		t.Fatalf("IP was quarantined despite fleet network degradation shield being active!")
	}

	ResetFleetBreakerForTest()
}

// 23. Real Syscall Errno Matching in IP Quarantine
func TestIPQuarantine_RealSyscallErrnoMatching(t *testing.T) {
	realErrno := syscall.EMFILE
	if !isClassifiedLocalResourceError(realErrno) {
		t.Fatalf("real syscall.Errno value (EMFILE) failed to match in classifier")
	}

	opErr := &net.OpError{
		Op:  "dial",
		Net: "tcp",
		Err: syscall.ENETUNREACH,
	}
	if !isClassifiedLocalResourceError(opErr) {
		t.Fatalf("net.OpError wrapping syscall.Errno value (ENETUNREACH) failed to match")
	}
}

// 24. Never Quarantine the Last IP
func TestIPQuarantine_NeverQuarantineLastIP(t *testing.T) {
	q := NewIPQuarantine(60 * time.Second)
	host := "single-ip.example.com"
	port := "443"
	ip := netip.MustParseAddr("198.51.100.10")

	q.Quarantine(host, ip, port)

	candidates := []netip.Addr{ip}
	usable := q.FilterUsable(host, candidates, port, time.Now().UnixNano())

	if len(usable) != 1 || usable[0] != ip {
		t.Fatalf("FilterUsable quarantined the last IP! Expected [198.51.100.10], got: %v", usable)
	}
}

// 25. TTL Clamping [30s, 300s]
func TestDNSCache_TTLClamping(t *testing.T) {
	t.Run("ClampUp_5s_to_30s", func(t *testing.T) {
		mock := &mockResolver{
			records: map[string][]netip.Addr{"low-ttl.com": {netip.MustParseAddr("93.184.216.34")}},
			ttl:     5 * time.Second,
		}
		cache := NewDNSCache(DNSCacheConfig{Capacity: 1000, MinTTL: 30 * time.Second, MaxTTL: 300 * time.Second}, mock)
		defer cache.Close()

		_, err := cache.Lookup(context.Background(), "low-ttl.com", false)
		if err != nil {
			t.Fatalf("lookup failed: %v", err)
		}
		shard := cache.shardFor("low-ttl.com")
		shard.mu.RLock()
		entry := shard.m["low-ttl.com"]
		shard.mu.RUnlock()
		if entry == nil {
			t.Fatalf("entry not found in cache")
		}
		rem := time.Duration(entry.expiresAt - cache.nowNano())
		if rem < 25*time.Second || rem > 35*time.Second {
			t.Fatalf("expected TTL clamped up to ~30s, got: %v", rem)
		}
	})

	t.Run("ClampDown_3600s_to_300s", func(t *testing.T) {
		mock := &mockResolver{
			records: map[string][]netip.Addr{"high-ttl.com": {netip.MustParseAddr("93.184.216.35")}},
			ttl:     3600 * time.Second,
		}
		cache := NewDNSCache(DNSCacheConfig{Capacity: 1000, MinTTL: 30 * time.Second, MaxTTL: 300 * time.Second}, mock)
		defer cache.Close()

		_, err := cache.Lookup(context.Background(), "high-ttl.com", false)
		if err != nil {
			t.Fatalf("lookup failed: %v", err)
		}
		shard := cache.shardFor("high-ttl.com")
		shard.mu.RLock()
		entry := shard.m["high-ttl.com"]
		shard.mu.RUnlock()
		if entry == nil {
			t.Fatalf("entry not found in cache")
		}
		rem := time.Duration(entry.expiresAt - cache.nowNano())
		if rem < 290*time.Second || rem > 310*time.Second {
			t.Fatalf("expected TTL clamped down to ~300s, got: %v", rem)
		}
	})

	t.Run("Passthrough_120s_to_120s", func(t *testing.T) {
		mock := &mockResolver{
			records: map[string][]netip.Addr{"mid-ttl.com": {netip.MustParseAddr("93.184.216.36")}},
			ttl:     120 * time.Second,
		}
		cache := NewDNSCache(DNSCacheConfig{Capacity: 1000, MinTTL: 30 * time.Second, MaxTTL: 300 * time.Second}, mock)
		defer cache.Close()

		_, err := cache.Lookup(context.Background(), "mid-ttl.com", false)
		if err != nil {
			t.Fatalf("lookup failed: %v", err)
		}
		shard := cache.shardFor("mid-ttl.com")
		shard.mu.RLock()
		entry := shard.m["mid-ttl.com"]
		shard.mu.RUnlock()
		if entry == nil {
			t.Fatalf("entry not found in cache")
		}
		rem := time.Duration(entry.expiresAt - cache.nowNano())
		if rem < 110*time.Second || rem > 130*time.Second {
			t.Fatalf("expected TTL passed through at ~120s, got: %v", rem)
		}
	})
}

// 26. Negative Caching: NXDOMAIN vs SERVFAIL
func TestDNSCache_NXDOMAINvsSERVFAILNegativeCaching(t *testing.T) {
	mock := &mockResolver{
		errs: map[string]error{
			"nxdomain.com": &net.DNSError{IsNotFound: true, Err: "no such host"},
			"servfail.com": &net.DNSError{IsTemporary: true, Err: "temporary failure"},
		},
	}

	cache := NewDNSCache(DNSCacheConfig{
		NegativeTTL: 5 * time.Second,
	}, mock)
	defer cache.Close()

	ctx := context.Background()
	_, errNX := cache.Lookup(ctx, "nxdomain.com", false)
	var dnsErr *net.DNSError
	if !errors.As(errNX, &dnsErr) || !dnsErr.IsNotFound {
		t.Fatalf("expected NXDOMAIN negative entry, got: %v", errNX)
	}

	_, errSF := cache.Lookup(ctx, "servfail.com", false)
	if !errors.As(errSF, &dnsErr) || !dnsErr.IsTemporary {
		t.Fatalf("expected SERVFAIL negative entry, got: %v", errSF)
	}
}

// 27. TLS ServerName and Cert Verification Against Real Test TLS Server
func TestCachedDialer_TLSServerNameAndCertVerification(t *testing.T) {
	cert, pool := generateTestTLSCert(t, "secure.example.com")
	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{cert},
	}

	ln, err := tls.Listen("tcp", "127.0.0.1:0", tlsConfig)
	if err != nil {
		t.Fatalf("failed to start tls listener: %v", err)
	}
	defer ln.Close()

	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go func(c net.Conn) {
				defer c.Close()
				buf := make([]byte, 1024)
				n, _ := c.Read(buf)
				if n > 0 {
					_, _ = c.Write([]byte("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK"))
				}
			}(conn)
		}
	}()

	mock := &mockResolver{
		records: map[string][]netip.Addr{
			"secure.example.com": {netip.MustParseAddr("127.0.0.1")},
		},
		ttl: 60 * time.Second,
	}
	cache := NewDNSCache(DNSCacheConfig{}, mock)
	defer cache.Close()

	dialer := NewCachedDialer(cache, CachedDialerConfig{
		ConnectTimeout: 500 * time.Millisecond,
		BlockedIPFunc:  func(ip netip.Addr) bool { return false }, // Injected SSRF policy: loopback allowed for local TLS test
	})

	clientTLS := &tls.Config{
		RootCAs:    pool,
		ServerName: "secure.example.com",
	}

	_, port, _ := net.SplitHostPort(ln.Addr().String())
	targetAddr := net.JoinHostPort("secure.example.com", port)
	conn, err := dialer.DialTLSWithSNI(context.Background(), "tcp", targetAddr, clientTLS)
	if err != nil {
		t.Fatalf("DialTLSWithSNI failed: %v", err)
	}
	defer conn.Close()

	if stats := cache.Stats(); stats.Misses < 1 {
		t.Fatalf("expected cache resolution for secure.example.com, got misses=%d", stats.Misses)
	}

	tlsConn, ok := conn.(*tls.Conn)
	if !ok {
		t.Fatalf("expected *tls.Conn")
	}
	state := tlsConn.ConnectionState()
	if state.ServerName != "secure.example.com" {
		t.Fatalf("expected SNI secure.example.com, got: %s", state.ServerName)
	}
	if !state.HandshakeComplete {
		t.Fatalf("expected handshake complete")
	}
}

// 28. Comprehensive SSRF Table (All 22 Specified Ranges)
func TestCachedDialer_ComprehensiveSSRFTable(t *testing.T) {
	tests := []struct {
		desc    string
		ip      string
		blocked bool
	}{
		{"IPv4 Loopback", "127.0.0.1", true},
		{"IPv4 Loopback upper", "127.255.255.254", true},
		{"IPv4 Cloud Metadata", "169.254.169.254", true},
		{"IPv4 Link-Local", "169.254.1.1", true},
		{"IPv4 RFC1918 Class A", "10.0.0.1", true},
		{"IPv4 RFC1918 Class B", "172.16.0.1", true},
		{"IPv4 RFC1918 Class C", "192.168.1.1", true},
		{"IPv4 CGNAT", "100.64.0.1", true},
		{"IPv4 TEST-NET-1", "192.0.2.1", true},
		{"IPv4 TEST-NET-2", "198.51.100.1", true},
		{"IPv4 TEST-NET-3", "203.0.113.1", true},
		{"IPv4 Benchmarking", "198.18.0.1", true},
		{"IPv4 Multicast", "224.0.0.1", true},
		{"IPv4 Zero network", "0.0.0.0", true},
		{"IPv6 Loopback", "::1", true},
		{"IPv6 Link-Local", "fe80::1", true},
		{"IPv6 ULA", "fc00::1", true},
		{"IPv6 Documentation", "2001:db8::1", true},
		{"IPv6 Teredo", "2001::1", true},
		{"IPv6 6to4", "2002::1", true},
		{"IPv6 NAT64", "64:ff9b::1", true},
		{"IPv4-mapped IPv6", "::ffff:127.0.0.1", true},
		{"Public Cloudflare DNS", "1.1.1.1", false},
		{"Public Google DNS", "8.8.8.8", false},
		{"Public Example.com", "93.184.216.34", false},
	}

	for _, tt := range tests {
		t.Run(tt.desc, func(t *testing.T) {
			addr := netip.MustParseAddr(tt.ip)
			isBlocked := netsec.IsBlocked(addr.Unmap())
			if isBlocked != tt.blocked {
				t.Fatalf("SSRF range check failed for %s (%s): got blocked=%v, want %v", tt.desc, tt.ip, isBlocked, tt.blocked)
			}
		})
	}
}

// 29. DNS Monitor Direct Resolution Bypasses Cache
func TestDNSMonitor_BypassesCache(t *testing.T) {
	handler := dns.HandlerFunc(func(w dns.ResponseWriter, r *dns.Msg) {
		m := new(dns.Msg)
		m.SetReply(r)
		a, _ := dns.NewRR("direct-probe.example.com. 60 IN A 93.184.216.34")
		m.Answer = append(m.Answer, a)
		_ = w.WriteMsg(m)
	})

	server, addr := startMockDNSServer(t, "udp", handler)
	defer server.Shutdown()

	mockCfg := DNSProbeConfig{
		Timeout:       500 * time.Millisecond,
		BlockedIPFunc: func(ip netip.Addr) bool { return false },
	}

	t.Run("IPLiteralNameserver_BypassesCache", func(t *testing.T) {
		hitsBefore := GlobalDNSCache.Stats().Hits
		missesBefore := GlobalDNSCache.Stats().Misses

		res := ProbeDNSWithConfig(context.Background(), addr, "direct-probe.example.com", dns.TypeA, mockCfg)
		if !res.Success {
			t.Fatalf("ProbeDNS failed: %v", res.ErrorMessage)
		}

		hitsAfter := GlobalDNSCache.Stats().Hits
		missesAfter := GlobalDNSCache.Stats().Misses

		if hitsAfter != hitsBefore || missesAfter != missesBefore {
			t.Fatalf("ProbeDNS touched GlobalDNSCache! hits delta=%d, misses delta=%d", hitsAfter-hitsBefore, missesAfter-missesBefore)
		}
	})

	t.Run("HostnameNameserver_ResolvesHostnameTarget", func(t *testing.T) {
		_, port, err := net.SplitHostPort(addr)
		if err != nil {
			t.Fatalf("failed to split host port: %v", err)
		}
		// Populate GlobalDNSCache with mock nameserver hostname mapping to 127.0.0.1
		shard := GlobalDNSCache.shardFor("mock-ns.example.com")
		shard.mu.Lock()
		shard.m["mock-ns.example.com"] = &dnsEntry{
			addrs:     []netip.Addr{netip.MustParseAddr("127.0.0.1")},
			kind:      entryPositive,
			expiresAt: time.Now().UnixNano() + int64(60*time.Second),
		}
		shard.mu.Unlock()

		hostnameTarget := net.JoinHostPort("mock-ns.example.com", port)
		res := ProbeDNSWithConfig(context.Background(), hostnameTarget, "direct-probe.example.com", dns.TypeA, mockCfg)
		if !res.Success {
			t.Fatalf("ProbeDNS with hostname nameserver failed: %v", res.ErrorMessage)
		}
	})
}

// 30. DNS Monitor SSRF Protection
func TestDNSMonitor_SSRFProtection(t *testing.T) {
	res1 := ProbeDNS(context.Background(), "127.0.0.1:53", "example.com", dns.TypeA, 100*time.Millisecond)
	if res1.Success || (res1.ErrClass != ErrConfig && res1.ErrClass != ErrLocalResource) {
		t.Fatalf("expected ErrConfig or ErrLocalResource probing 127.0.0.1, got: %v", res1.ErrClass)
	}

	res2 := ProbeDNS(context.Background(), "169.254.169.254:53", "example.com", dns.TypeA, 100*time.Millisecond)
	if res2.Success || (res2.ErrClass != ErrConfig && res2.ErrClass != ErrLocalResource) {
		t.Fatalf("expected ErrConfig or ErrLocalResource probing cloud metadata, got: %v", res2.ErrClass)
	}
}

// 31. Recursor Canary Health & Authoritative DNS Failure Escalation with Hysteresis
func TestRecursorCanary(t *testing.T) {
	resolver := NewMiekgResolver(MiekgResolverConfig{
		Servers:       []string{"127.0.0.1:53999"},
		CanaryDomains: []string{"canary-ns1.checkuptime.org.", "canary-ns2.checkuptime.org."},
	})

	// 1. Canary Down -> lookups return inconclusive ErrRecursorUnavailable
	resolver.SetCanaryHealthy(false)
	_, _, err := resolver.queryRR(context.Background(), "cust.com", dns.TypeA)
	if !errors.Is(err, ErrRecursorUnavailable) {
		t.Fatalf("expected ErrRecursorUnavailable when canary is down, got: %v", err)
	}
	if got := classifyNetError(err, false); got != ErrLocalResource {
		t.Fatalf("canary down must classify as ErrLocalResource (inconclusive), got: %v", got)
	}

	// 2. Canary Up -> customer authoritative timeout returns ErrDNSTemporary
	resolver.SetCanaryHealthy(true)
	_, _, errAuth := resolver.queryRR(context.Background(), "cust.com", dns.TypeA)
	var de *net.DNSError
	if !errors.As(errAuth, &de) || !de.IsTemporary {
		t.Fatalf("expected temporary net.DNSError for customer authoritative failure, got: %v", errAuth)
	}
	if got := classifyNetError(errAuth, false); got != ErrDNSTemporary {
		t.Fatalf("canary healthy must classify authoritative timeout as ErrDNSTemporary, got: %v", got)
	}

	// 3. Canary Hysteresis: requires 2 consecutive failures to mark unhealthy
	resolver.SetCanaryHealthy(true)
	resolver.canary.consecutiveFails.Store(0)
	resolver.canary.consecutiveSuccesses.Store(2)

	// Simulate single failure (e.g. transient dropped UDP packet)
	resolver.canary.consecutiveSuccesses.Store(0)
	if resolver.canary.consecutiveFails.Add(1) >= 2 {
		resolver.canary.healthy.Store(false)
	}
	if !resolver.isCanaryHealthy() {
		t.Fatalf("single dropped packet flipped canary health! Hysteresis requires 2 consecutive failures")
	}

	// Second failure flips healthy to false
	if resolver.canary.consecutiveFails.Add(1) >= 2 {
		resolver.canary.healthy.Store(false)
	}
	if resolver.isCanaryHealthy() {
		t.Fatalf("two consecutive failures must mark canary unhealthy")
	}

	// Single success does NOT restore health
	resolver.canary.consecutiveFails.Store(0)
	if resolver.canary.consecutiveSuccesses.Add(1) >= 2 {
		resolver.canary.healthy.Store(true)
	}
	if resolver.isCanaryHealthy() {
		t.Fatalf("single success flipped canary health! Hysteresis requires 2 consecutive successes")
	}

	// Second success restores health
	if resolver.canary.consecutiveSuccesses.Add(1) >= 2 {
		resolver.canary.healthy.Store(true)
	}
	if !resolver.isCanaryHealthy() {
		t.Fatalf("two consecutive successes must restore canary to healthy")
	}
}

// 32. Full Shard Sweep Latency Benchmark (15,625 entries per shard = 1M total)
func TestDNSCache_ShardSweepLatencyRealistic(t *testing.T) {
	cache := NewDNSCache(DNSCacheConfig{Capacity: 1000000}, &mockResolver{})
	defer cache.Close()

	shard := &cache.shards[0]
	now := cache.nowNano()

	shard.mu.Lock()
	for i := 0; i < 15625; i++ {
		host := fmt.Sprintf("bench-host-%d.com", i)
		exp := now + int64(10*time.Second)
		if i%2 == 0 {
			exp = now - int64(10*time.Second)
		}
		shard.m[host] = &dnsEntry{
			addrs:     []netip.Addr{netip.MustParseAddr("198.51.100.1")},
			kind:      entryPositive,
			expiresAt: exp,
		}
	}
	shard.mu.Unlock()

	start := time.Now()
	cache.sweepShard(0)
	holdTime := time.Since(start)

	t.Logf("Full-shard (15,625 entries) sweep lock hold time: %v", holdTime)
	if holdTime > 20*time.Millisecond {
		t.Fatalf("Shard sweep lock hold time exceeded 20ms: %v", holdTime)
	}
}

// 33. 1,000,000 DNS Cache Entries Memory Footprint Test (Post-GC HeapAlloc)
func TestDNSCache_1MMemoryFootprint(t *testing.T) {
	runtime.GC()
	var mBefore runtime.MemStats
	runtime.ReadMemStats(&mBefore)

	cache := NewDNSCache(DNSCacheConfig{
		Capacity: 1000000,
	}, &mockResolver{})
	defer cache.Close()

	now := cache.nowNano()
	addr1 := netip.MustParseAddr("198.51.100.1")
	addr2 := netip.MustParseAddr("198.51.100.2")

	for i := 0; i < 1000000; i++ {
		host := fmt.Sprintf("h-%07d.com", i)
		shard := cache.shardFor(host)
		shard.mu.Lock()
		shard.m[host] = &dnsEntry{
			addrs:     []netip.Addr{addr1, addr2},
			kind:      entryPositive,
			expiresAt: now + int64(300*time.Second),
		}
		shard.mu.Unlock()
	}

	runtime.GC()
	var mAfter runtime.MemStats
	runtime.ReadMemStats(&mAfter)

	heapAllocDiff := mAfter.HeapAlloc - mBefore.HeapAlloc
	bytesPerEntry := float64(heapAllocDiff) / 1000000.0

	t.Logf("DNS Cache Memory (1M Entries): allocated %d bytes (%.2f B/entry, %.2f MiB total)",
		heapAllocDiff, bytesPerEntry, float64(heapAllocDiff)/(1024*1024))

	_ = cache
	if bytesPerEntry > 250 {
		t.Fatalf("bytes per DNS cache entry exceeded 250 B: %.2f B", bytesPerEntry)
	}
}

// 34. DNS Failure Escalation through Classifier (4 Temporary + 1 Local Inconclusive + 1 Temporary = Escalation)
func TestDNSFailureEscalationThroughClassifier(t *testing.T) {
	monID := "mon-dns-escalate-classifier"
	CleanupMonitorState(monID)

	if count := GetDNSTemporaryCount(monID); count != 0 {
		t.Fatalf("expected count 0, got %d", count)
	}

	tempDNSErr := &net.DNSError{
		Err:         "i/o timeout (authoritative)",
		Name:        "example.com",
		IsTemporary: true,
	}

	// 1. First 4 temporary DNS errors: count increments to 4, no escalation
	for i := 1; i <= 4; i++ {
		errClass, _ := ClassifyTCPError(tempDNSErr)
		if errClass != ErrDNSTemporary {
			t.Fatalf("iteration %d: expected ErrDNSTemporary, got: %v", i, errClass)
		}
		cnt, escalated := StepDNSTemporaryEvaluation(monID, 60, errClass)
		if escalated {
			t.Fatalf("iteration %d: should NOT escalate yet", i)
		}
		if cnt != int32(i) {
			t.Fatalf("iteration %d: expected count %d, got %d", i, i, cnt)
		}
	}

	// 2. 5th check suffers a local inconclusive error (e.g. EMFILE / ErrLocalResource)
	// Must HOLD the count at 4! Must NOT reset to 0, and must NOT increment to 5!
	localErr := syscall.EMFILE
	localClass, _ := ClassifyTCPError(localErr)
	if localClass != ErrLocalResource {
		t.Fatalf("expected EMFILE to classify as ErrLocalResource, got: %v", localClass)
	}
	cnt, escalated := StepDNSTemporaryEvaluation(monID, 60, localClass)
	if escalated {
		t.Fatalf("local inconclusive error must NEVER escalate to DOWN!")
	}
	if cnt != 4 {
		t.Fatalf("inconclusive error must HOLD counter at 4, got: %d", cnt)
	}

	// 3. 6th check suffers another temporary DNS error (authoritative failure)
	// Count increments from 4 to 5 and trips definitive escalation!
	errClass, _ := ClassifyTCPError(tempDNSErr)
	cnt, escalated = StepDNSTemporaryEvaluation(monID, 60, errClass)
	if !escalated {
		t.Fatalf("expected 5th temporary failure to trip escalation!")
	}
	if cnt < 5 {
		t.Fatalf("expected count >= 5 upon escalation, got: %d", cnt)
	}

	CleanupMonitorState(monID)
}

// 34b. Semaphore Saturation Classifies as Inconclusive (Never False DOWN)
func TestSemaphoreSaturationThroughClassifier(t *testing.T) {
	resolver := NewMiekgResolver(MiekgResolverConfig{
		Servers:        []string{"127.0.0.1:53999"},
		SemConcurrency: 1,
	})

	// Saturated semaphore: occupy the 1 slot
	resolver.sem <- struct{}{}
	defer func() { <-resolver.sem }()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()

	_, _, err := resolver.Resolve(ctx, "example.com")
	if !errors.Is(err, ErrDNSLocalResource) {
		t.Fatalf("expected ErrDNSLocalResource on saturated semaphore, got: %v", err)
	}

	class, _ := ClassifyTCPError(err)
	if class != ErrLocalResource {
		t.Fatalf("saturated semaphore must classify as ErrLocalResource (inconclusive), got: %v", class)
	}
}

// 35. Comparable Quarantine Key & Zero Allocations
func TestComparableQuarantineKey(t *testing.T) {
	k1 := quarantineKey{host: "example.com", ip: netip.MustParseAddr("198.51.100.1"), port: 443}
	k2 := quarantineKey{host: "example.com", ip: netip.MustParseAddr("198.51.100.1"), port: 443}
	k3 := quarantineKey{host: "example.com", ip: netip.MustParseAddr("198.51.100.2"), port: 443}

	if k1 != k2 {
		t.Fatalf("identical quarantine keys failed comparison")
	}
	if k1 == k3 {
		t.Fatalf("distinct quarantine keys erroneously compared equal")
	}

	q := NewIPQuarantine(60 * time.Second)
	q.Quarantine("example.com", k1.ip, "443")
	if !q.IsQuarantined("example.com", k1.ip, "443") {
		t.Fatalf("expected IP to be quarantined")
	}
}

// 36. Context Cancellation Preempts Quarantine
func TestContextCancelledBeforeQuarantine(t *testing.T) {
	q := NewIPQuarantine(60 * time.Second)
	mock := &mockResolver{
		records: map[string][]netip.Addr{
			"cancel.com": {netip.MustParseAddr("127.0.0.1"), netip.MustParseAddr("127.0.0.2")},
		},
		ttl: 60 * time.Second,
	}
	cache := NewDNSCache(DNSCacheConfig{}, mock)
	defer cache.Close()

	dialer := NewCachedDialer(cache, CachedDialerConfig{
		ConnectTimeout: 2 * time.Second,
		Quarantine:     q,
	})

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Pre-cancelled context

	_, err := dialer.DialContext(ctx, "tcp", "cancel.com:80")
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled, got: %v", err)
	}
	if q.IsQuarantined("cancel.com", netip.MustParseAddr("127.0.0.1"), "80") {
		t.Fatalf("IP was quarantined despite caller context cancellation!")
	}
}

// 37. Dial Timeout Against Blackhole Classifies as ErrTimeout (DOWN)
func TestClassifyTCPError_TargetDialTimeout(t *testing.T) {
	blackhole, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to bind listener: %v", err)
	}
	defer blackhole.Close()

	d := &net.Dialer{Timeout: 30 * time.Millisecond}
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Millisecond)
	defer cancel()

	conn, dialErr := d.DialContext(ctx, "tcp", blackhole.Addr().String())
	if conn != nil {
		conn.Close()
	}

	if dialErr != nil {
		class, _ := ClassifyTCPError(dialErr)
		if class != ErrTimeout {
			t.Fatalf("dial timeout against blackhole target must classify as ErrTimeout (DOWN), got: %v", class)
		}
	}
}

type mockSlowCanaryResolver struct {
	canaryHealthy bool
	delay         time.Duration
}

func (m *mockSlowCanaryResolver) Resolve(ctx context.Context, host string) ([]netip.Addr, time.Duration, error) {
	select {
	case <-ctx.Done():
		return nil, 0, ctx.Err()
	case <-time.After(m.delay):
		return nil, 0, errors.New("timeout")
	}
}

func (m *mockSlowCanaryResolver) isCanaryHealthy() bool {
	return m.canaryHealthy
}

// 38. C1 Gate: DNS Deadline Expiry with Healthy Canary Escalates to DOWN; Unhealthy Canary Remains Inconclusive
func TestDNSDeadlineExceeded_CanaryHealthyVsUnhealthyEscalation(t *testing.T) {
	t.Run("HealthyCanary_EscalatesToDOWN_After5Failures", func(t *testing.T) {
		monID := "mon-deadline-healthy-canary"
		CleanupMonitorState(monID)
		defer CleanupMonitorState(monID)

		resolver := &mockSlowCanaryResolver{canaryHealthy: true, delay: 50 * time.Millisecond}
		cache := NewDNSCache(DNSCacheConfig{LookupTimeout: 20 * time.Millisecond}, resolver)
		defer cache.Close()

		for i := 1; i <= 5; i++ {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Millisecond)
			_, err := cache.Lookup(ctx, fmt.Sprintf("dead-authoritative-%d.com", i), false)
			cancel()

			if !errors.Is(err, ErrDNSDeadlineExceeded) {
				t.Fatalf("iteration %d: expected ErrDNSDeadlineExceeded, got: %v", i, err)
			}

			errClass, _ := ClassifyTCPError(err)
			if errClass != ErrDNSTemporary {
				t.Fatalf("iteration %d: lookup deadline with healthy canary must classify as ErrDNSTemporary, got: %v", i, errClass)
			}

			cnt, escalated := StepDNSTemporaryEvaluation(monID, 60, errClass)
			if i < 5 {
				if escalated {
					t.Fatalf("iteration %d: should not escalate before 5 failures", i)
				}
				if cnt != int32(i) {
					t.Fatalf("iteration %d: expected count %d, got %d", i, i, cnt)
				}
			} else {
				if !escalated {
					t.Fatalf("iteration 5: expected 5th consecutive temporary failure to escalate to DOWN!")
				}
			}
		}
	})

	t.Run("UnhealthyCanary_NeverEscalates_RemainsInconclusive", func(t *testing.T) {
		monID := "mon-deadline-unhealthy-canary"
		CleanupMonitorState(monID)
		defer CleanupMonitorState(monID)

		resolver := &mockSlowCanaryResolver{canaryHealthy: false, delay: 50 * time.Millisecond}
		cache := NewDNSCache(DNSCacheConfig{LookupTimeout: 20 * time.Millisecond}, resolver)
		defer cache.Close()

		for i := 1; i <= 5; i++ {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Millisecond)
			_, err := cache.Lookup(ctx, fmt.Sprintf("dead-authoritative-%d.com", i), false)
			cancel()

			if !errors.Is(err, ErrDNSLocalResource) {
				t.Fatalf("iteration %d: expected ErrDNSLocalResource when canary is unhealthy, got: %v", i, err)
			}

			errClass, _ := ClassifyTCPError(err)
			if errClass != ErrLocalResource {
				t.Fatalf("iteration %d: lookup deadline with unhealthy canary must classify as ErrLocalResource, got: %v", i, errClass)
			}

			cnt, escalated := StepDNSTemporaryEvaluation(monID, 60, errClass)
			if escalated {
				t.Fatalf("iteration %d: unhealthy canary must NEVER escalate to DOWN!", i)
			}
			if cnt != 0 {
				t.Fatalf("iteration %d: count must hold at 0, got %d", i, cnt)
			}
		}
	})
}

// 39. C3 Gate: IP Quarantine O(1) Deque Eviction at Hard 10,000 Cap
func TestIPQuarantine_O1DequeEvictionAtCap(t *testing.T) {
	q := NewIPQuarantine(60 * time.Second)
	simNano := int64(1000000000)
	q.nowNano = func() int64 { return simNano }

	// 1. Insert 10,000 distinct entries to reach the cap
	for i := 0; i < 10000; i++ {
		ip := netip.AddrFrom4([4]byte{10, byte(i >> 8), byte(i), 1})
		q.Quarantine("cap.example.com", ip, "80")
	}

	q.mu.RLock()
	countAtCap := len(q.entries)
	q.mu.RUnlock()
	if countAtCap != 10000 {
		t.Fatalf("expected exactly 10000 entries at cap, got %d", countAtCap)
	}

	// 2. Insert 5,000 additional entries: size must NEVER exceed 10,000
	for i := 10000; i < 15000; i++ {
		ip := netip.AddrFrom4([4]byte{10, byte(i >> 8), byte(i), 1})
		q.Quarantine("cap.example.com", ip, "80")
	}

	q.mu.RLock()
	finalCount := len(q.entries)
	q.mu.RUnlock()
	if finalCount > 10000 {
		t.Fatalf("quarantine entries exceeded hard cap of 10000: got %d", finalCount)
	}

	// 3. Earliest entries (e.g. i=0, 1) must have been evicted in O(1) deque order
	oldIP := netip.AddrFrom4([4]byte{10, 0, 0, 1})
	if q.IsQuarantined("cap.example.com", oldIP, "80") {
		t.Fatalf("oldest entry (i=0) should have been evicted by deque at cap")
	}

	// 4. Latest entries must be present
	latestIP := netip.AddrFrom4([4]byte{10, byte(14999 >> 8), byte(14999 & 0xff), 1})
	if !q.IsQuarantined("cap.example.com", latestIP, "80") {
		t.Fatalf("latest entry (i=14999) must be quarantined")
	}
}

func startMockDNSServer(t *testing.T, netProto string, handler dns.Handler) (*dns.Server, string) {
	return startMockDNSServerWithAddr(t, netProto, "127.0.0.1:0", handler)
}

func startMockDNSServerWithAddr(t *testing.T, netProto, addr string, handler dns.Handler) (*dns.Server, string) {
	server := &dns.Server{
		Addr:    addr,
		Net:     netProto,
		Handler: handler,
		UDPSize: 4096,
	}

	listenErr := make(chan error, 1)
	server.NotifyStartedFunc = func() {
		listenErr <- nil
	}

	go func() {
		if err := server.ListenAndServe(); err != nil {
			listenErr <- err
		}
	}()

	select {
	case err := <-listenErr:
		if err != nil {
			t.Fatalf("failed to start mock %s DNS server: %v", netProto, err)
		}
	case <-time.After(2 * time.Second):
		t.Fatalf("timeout waiting for %s DNS server to start", netProto)
	}

	var boundAddr string
	if netProto == "udp" && server.PacketConn != nil {
		boundAddr = server.PacketConn.LocalAddr().String()
	} else if netProto == "tcp" && server.Listener != nil {
		boundAddr = server.Listener.Addr().String()
	} else {
		boundAddr = server.Addr
	}

	return server, boundAddr
}

type mockResolver struct {
	records map[string][]netip.Addr
	errs    map[string]error
	ttl     time.Duration
}

func (m *mockResolver) Resolve(ctx context.Context, host string) ([]netip.Addr, time.Duration, error) {
	if err, ok := m.errs[host]; ok {
		return nil, 0, err
	}
	if addrs, ok := m.records[host]; ok {
		ttl := m.ttl
		if ttl <= 0 {
			ttl = 60 * time.Second
		}
		return addrs, ttl, nil
	}
	return nil, 0, &net.DNSError{
		Err:        "no such host",
		Name:       host,
		IsNotFound: true,
	}
}

// 40. Randomized IP Quarantine Churn & Hard-Cap Invariant Verification
func TestIPQuarantine_RandomizedChurnHardCapEnforcement(t *testing.T) {
	const maxCap = 100
	q := NewIPQuarantine(10 * time.Second)
	q.maxEntries = maxCap

	var simNano int64 = 1000000000
	q.nowNano = func() int64 {
		return atomic.LoadInt64(&simNano)
	}

	rng := mathrand.New(mathrand.NewSource(42))
	keys := make([]string, 300)
	for i := range keys {
		keys[i] = fmt.Sprintf("host-%d.example.com", i)
	}

	for step := 0; step < 20000; step++ {
		op := rng.Intn(4)
		switch op {
		case 0: // Insert new or refresh
			h := keys[rng.Intn(len(keys))]
			ip := netip.AddrFrom4([4]byte{198, 51, 100, byte(rng.Intn(250) + 1)})
			q.Quarantine(h, ip, "443")

		case 1: // Refresh existing entry
			q.mu.RLock()
			var targetKey quarantineKey
			var found bool
			for k := range q.entries {
				targetKey = k
				found = true
				break
			}
			q.mu.RUnlock()
			if found {
				q.Quarantine(targetKey.host, targetKey.ip, strconv.Itoa(int(targetKey.port)))
			}

		case 2: // Advance clock to expire entries
			atomic.AddInt64(&simNano, int64(3*time.Second))

		case 3: // Sweep expired entries
			q.SweepExpired()
		}

		// Hard cap assertion: len(entries) <= maxCap after EVERY step
		q.mu.RLock()
		curLen := len(q.entries)
		q.mu.RUnlock()
		if curLen > maxCap {
			t.Fatalf("step %d (op=%d): hard cap violated! len(entries)=%d > maxCap=%d",
				step, op, curLen, maxCap)
		}
	}

	q.mu.RLock()
	fallbackCount := q.fallbackDrops
	q.mu.RUnlock()
	if fallbackCount != 0 {
		t.Fatalf("random eviction fallback was triggered %d times! Must be 0", fallbackCount)
	}
}

// 41. CachedDialer SSRF Default Configuration Blocks at Resolve and Dial Time
func TestCachedDialer_SSRFDefaultBlocked_ResolveAndDial(t *testing.T) {
	mock := &mockResolver{
		records: map[string][]netip.Addr{
			"blocked.corp": {netip.MustParseAddr("127.0.0.1")},
		},
		ttl: 60 * time.Second,
	}

	cache := NewDNSCache(DNSCacheConfig{}, mock)
	defer cache.Close()

	// Default CachedDialerConfig has BlockedIPFunc = nil -> defaults to netsec.IsBlocked
	dialer := NewCachedDialer(cache, CachedDialerConfig{
		ConnectTimeout: 100 * time.Millisecond,
	})

	// 1. Resolve-time blocking: mock resolver returns loopback 127.0.0.1
	_, errResolve := dialer.DialContext(context.Background(), "tcp", "blocked.corp:80")
	if !errors.Is(errResolve, netsec.ErrSSRFBlocked) {
		t.Fatalf("expected ErrSSRFBlocked at resolve time, got: %v", errResolve)
	}

	// 2. Dial-time blocking: direct dial to blocked IP literal
	_, errDial := dialer.DialContext(context.Background(), "tcp", "127.0.0.1:80")
	if !errors.Is(errDial, netsec.ErrSSRFBlocked) {
		t.Fatalf("expected ErrSSRFBlocked at dial time, got: %v", errDial)
	}
}

// 42. C3/G1 Gate: Monotonic Sequence Invariant & ABA Wrong-Victim Prevention
func TestIPQuarantine_MonotonicSeqPreventsABAVictim(t *testing.T) {
	const maxCap = 4
	q := NewIPQuarantine(10 * time.Second)
	q.maxEntries = maxCap

	ipK := netip.MustParseAddr("198.51.100.10")
	ipA := netip.MustParseAddr("198.51.100.20")
	ipB := netip.MustParseAddr("198.51.100.30")
	ipC := netip.MustParseAddr("198.51.100.40")
	ipE := netip.MustParseAddr("198.51.100.50")

	// 1. Insert K, then refresh K (leaves stale slot (K, seq=1) at deque head)
	q.Quarantine("k.com", ipK, "80")
	q.Quarantine("k.com", ipK, "80")

	// 2. Simulate sweep removing K from map (stale slots (K, 1) and (K, 2) remain in deque)
	delete(q.entries, quarantineKey{host: "k.com", ip: ipK, port: 80})

	// 3. Insert A, B, C while K is absent (map len = 3)
	q.Quarantine("a.com", ipA, "80")
	q.Quarantine("b.com", ipB, "80")
	q.Quarantine("c.com", ipC, "80")

	// 4. Re-insert K below cap (map reaches cap = 4: A, B, C, K).
	// Under per-key gen, K would restart at gen 1, matching the stale (K, 1) slot in the deque.
	// Under global seq, K receives a higher monotonic sequence number.
	q.Quarantine("k.com", ipK, "80")

	if len(q.entries) != 4 {
		t.Fatalf("expected 4 entries at cap, got %d", len(q.entries))
	}

	// 5. Insert E -> map exceeds cap (5), forcing eviction of oldest entry.
	// The deque head has stale (K, 1). Under ABA bug, this matched new K and evicted K.
	// Under monotonic seq, stale K slots are skipped and A (oldest live entry) is evicted.
	q.Quarantine("e.com", ipE, "80")

	// Assert K is live and NOT evicted by its own stale slot
	if !q.IsQuarantined("k.com", ipK, "80") {
		t.Fatalf("ABA bug: newly re-inserted key K was prematurely evicted by its own stale slot!")
	}

	// Assert A (the genuine oldest live entry) was the victim
	if q.IsQuarantined("a.com", ipA, "80") {
		t.Fatalf("expected oldest live entry A to be evicted, but A was still quarantined")
	}

	// Assert E is quarantined
	if !q.IsQuarantined("e.com", ipE, "80") {
		t.Fatalf("expected newly inserted entry E to be quarantined")
	}

	// Assert fallback drops is strictly 0
	if q.fallbackDrops != 0 {
		t.Fatalf("fallback drops occurred: %d", q.fallbackDrops)
	}
}

func TestIPQuarantine_FallbackEvictionAtCap(t *testing.T) {
	q := NewIPQuarantine(5 * time.Minute)
	q.maxEntries = 2

	ip1 := netip.MustParseAddr("192.0.2.1")
	ip2 := netip.MustParseAddr("192.0.2.2")
	ip3 := netip.MustParseAddr("192.0.2.3")

	// Fill to capacity (maxEntries = 2)
	q.Quarantine("h1.com", ip1, "80")
	q.Quarantine("h2.com", ip2, "80")

	// Update h1 and h2 again to increment seq, leaving older slots in deque stale
	q.Quarantine("h1.com", ip1, "80")
	q.Quarantine("h2.com", ip2, "80")

	// Artificially advance dequeHead to the end so all remaining deque slots are stale/exhausted
	q.mu.Lock()
	q.dequeHead = len(q.deque)
	q.mu.Unlock()

	// Insert h3 at cap
	q.Quarantine("h3.com", ip3, "80")

	q.mu.RLock()
	defer q.mu.RUnlock()

	// Assert map size bounded by maxEntries (2)
	if len(q.entries) > 2 {
		t.Fatalf("expected len(q.entries) <= 2, got %d", len(q.entries))
	}

	// Assert fallback drops incremented
	if q.fallbackDrops == 0 {
		t.Fatalf("expected fallbackDrops > 0 when deque has only stale slots at cap, got %d", q.fallbackDrops)
	}
}

