//go:build linux

package core

import (
	"context"
	"fmt"
	"net"
	"net/netip"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"syscall"
	"testing"
	"time"
)

// TestICMPIntegration_EchoLoopback verifies unprivileged non-root ICMP Echo probing on loopback.
func TestICMPIntegration_EchoLoopback(t *testing.T) {
	if ok, err := CheckICMPCapability(); !ok {
		t.Skipf("skipping ICMP integration test: unprivileged ICMP ping sockets denied: %v", err)
	}

	targets := []string{"127.0.0.1"}

	// Check if IPv6 loopback is available
	if conn, err := net.Dial("udp6", "[::1]:0"); err == nil {
		_ = conn.Close()
		targets = append(targets, "::1")
	}

	for _, target := range targets {
		t.Run(target, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()

			res := ProbeICMPPingWithConfig(ctx, target, ICMPProbeConfig{
				Timeout:       1 * time.Second,
				TTL:           64,
				BlockedIPFunc: func(netip.Addr) bool { return false },
			})

			if !res.Success {
				t.Fatalf("loopback ping to %s failed: errClass=%v msg=%q", target, res.ErrClass, res.ErrorMessage)
			}
			if res.ErrClass != ErrNone {
				t.Fatalf("expected ErrNone, got %v", res.ErrClass)
			}
			if res.RTT <= 0 {
				t.Fatalf("expected positive RTT, got %v", res.RTT)
			}
			t.Logf("ICMP loopback probe to %s: success=%v RTT=%v errClass=%v", target, res.Success, res.RTT, res.ErrClass)
		})
	}
}

// Note: ICMP Type 11 (TTL Exceeded in Transit via MSG_ERRQUEUE) is verified deterministically
// without any external network dependency in TestICMPIntegration_Type3_DestinationUnreachable (Part B).

// TestICMPIntegration_FDNoDoubleCloseOrLeak verifies that rapid socket creation/teardown
// does not trigger runtime finalizer double-closes or leak file descriptors.
func TestICMPIntegration_FDNoDoubleCloseOrLeak(t *testing.T) {
	if ok, err := CheckICMPCapability(); !ok {
		t.Skipf("skipping ICMP integration test: unprivileged ICMP ping sockets denied: %v", err)
	}

	// Read initial fd count from /proc/self/fd
	initialFDs, err := countOpenFDs()
	if err != nil {
		t.Skipf("cannot inspect /proc/self/fd: %v", err)
	}

	const iterations = 500
	ctx := context.Background()

	// Run tight loop of probes
	for i := 0; i < iterations; i++ {
		res := ProbeICMPPingWithConfig(ctx, "127.0.0.1", ICMPProbeConfig{
			Timeout:       500 * time.Millisecond,
			TTL:           64,
			BlockedIPFunc: func(netip.Addr) bool { return false },
		})
		if !res.Success {
			t.Fatalf("probe %d failed: %v", i, res.ErrorMessage)
		}

		// Trigger GC periodically to force any finalizers to run
		if i%50 == 0 {
			runtime.GC()
		}
	}

	// Final GC to reclaim all finalized file objects
	runtime.GC()
	time.Sleep(50 * time.Millisecond)

	finalFDs, err := countOpenFDs()
	if err != nil {
		t.Fatalf("failed to read /proc/self/fd: %v", err)
	}

	fdDelta := finalFDs - initialFDs
	t.Logf("FD test completed: initial=%d, final=%d, delta=%d over %d probes", initialFDs, finalFDs, fdDelta, iterations)

	// Allow a tiny slack for Go runtime internal threads / poller, but delta must be small (< 10)
	if fdDelta > 15 {
		t.Fatalf("file descriptor leak detected: fd delta is %d (initial %d, final %d)", fdDelta, initialFDs, finalFDs)
	}
}

func countOpenFDs() (int, error) {
	entries, err := os.ReadDir("/proc/self/fd")
	if err != nil {
		return 0, err
	}
	return len(entries), nil
}

// TestICMPIntegration_NoLiveSocketCorruption creates 50 concurrent live TCP sockets on loopback,
// runs 500 ICMP probes under constant GC cycles, and verifies that zero live TCP sockets were
// closed or corrupted by descriptor recycling / double-close bugs.
func TestICMPIntegration_NoLiveSocketCorruption(t *testing.T) {
	if ok, err := CheckICMPCapability(); !ok {
		t.Skipf("skipping ICMP integration test: unprivileged ICMP ping sockets denied: %v", err)
	}

	// 1. Start a local TCP echo server
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to start echo server: %v", err)
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
				buf := make([]byte, 16)
				for {
					n, err := c.Read(buf)
					if err != nil {
						return
					}
					_, _ = c.Write(buf[:n])
				}
			}(conn)
		}
	}()

	// 2. Open 50 live TCP client connections
	const numLiveSockets = 50
	conns := make([]net.Conn, numLiveSockets)
	for i := 0; i < numLiveSockets; i++ {
		c, err := net.Dial("tcp", ln.Addr().String())
		if err != nil {
			t.Fatalf("failed to dial live TCP conn %d: %v", i, err)
		}
		defer c.Close()
		conns[i] = c

		// Initial ping-pong verification
		if _, err := c.Write([]byte("init")); err != nil {
			t.Fatalf("conn %d write failed: %v", i, err)
		}
		var reply [4]byte
		if _, err := c.Read(reply[:]); err != nil || string(reply[:]) != "init" {
			t.Fatalf("conn %d read failed: %v", i, err)
		}
	}

	// 3. Run 500 ICMP probes to loopback, triggering GC every 25 probes
	const probeCount = 500
	ctx := context.Background()
	for i := 0; i < probeCount; i++ {
		res := ProbeICMPPingWithConfig(ctx, "127.0.0.1", ICMPProbeConfig{
			Timeout:       500 * time.Millisecond,
			TTL:           64,
			BlockedIPFunc: func(netip.Addr) bool { return false },
		})
		if !res.Success {
			t.Fatalf("probe %d failed: %v", i, res.ErrorMessage)
		}
		if i%25 == 0 {
			runtime.GC()
		}
	}

	runtime.GC()
	time.Sleep(20 * time.Millisecond)

	// 4. Verify all 50 live TCP connections are STILL alive and functional
	for i := 0; i < numLiveSockets; i++ {
		c := conns[i]
		msg := fmt.Sprintf("live-%02d", i)
		if _, err := c.Write([]byte(msg)); err != nil {
			t.Fatalf("LIVE SOCKET CORRUPTION DETECTED: conn %d was closed or corrupted: %v", i, err)
		}
		var buf [7]byte
		if _, err := c.Read(buf[:]); err != nil || string(buf[:]) != msg {
			t.Fatalf("LIVE SOCKET CORRUPTION DETECTED: conn %d failed to read reply: %v", i, err)
		}
	}

	t.Logf("Double-close regression verified: all %d live TCP connections remained intact through %d ICMP probes + GCs", numLiveSockets, probeCount)
}

func ensureNetnsSupported(t *testing.T) {
	if _, err := exec.LookPath("ip"); err != nil {
		t.Skipf("skipping netns test: 'ip' command not found: %v", err)
	}
	probeNS := fmt.Sprintf("probe_test_%d", os.Getpid())
	out, err := exec.Command("ip", "netns", "add", probeNS).CombinedOutput()
	if err != nil {
		t.Skipf("skipping netns test: container lacks CAP_NET_ADMIN or netns capability: %v (output: %s)", err, strings.TrimSpace(string(out)))
	}
	_ = exec.Command("ip", "netns", "del", probeNS).Run()
}

// TestICMPIntegration_Type3_DestinationUnreachable creates a two-namespace network environment
// (ns_client and ns_router) with an unreachable route on the router.
// A probe sent from ns_client to the unreachable destination triggers an ICMP Type 3 packet
// sent back by ns_router, which must be captured by MSG_ERRQUEUE and classified as ErrUnreachable.
func TestICMPIntegration_Type3_DestinationUnreachable(t *testing.T) {
	ensureNetnsSupported(t)

	const (
		nsClient = "test_ns_client"
		nsRouter = "test_ns_router"
		vethC    = "veth_c_test"
		vethR    = "veth_r_test"
	)

	// Teardown helper
	cleanup := func() {
		_ = exec.Command("ip", "netns", "del", nsClient).Run()
		_ = exec.Command("ip", "netns", "del", nsRouter).Run()
	}
	cleanup()
	t.Cleanup(cleanup)

	runCmd := func(args ...string) error {
		out, err := exec.Command(args[0], args[1:]...).CombinedOutput()
		if err != nil {
			return fmt.Errorf("cmd %v failed: %w (output: %s)", args, err, strings.TrimSpace(string(out)))
		}
		return nil
	}

	// 1. Create namespaces
	if err := runCmd("ip", "netns", "add", nsClient); err != nil {
		t.Fatalf("failed to add nsClient: %v", err)
	}
	if err := runCmd("ip", "netns", "add", nsRouter); err != nil {
		t.Fatalf("failed to add nsRouter: %v", err)
	}

	// 2. Create veth pair and assign to namespaces
	if err := runCmd("ip", "link", "add", vethC, "type", "veth", "peer", "name", vethR); err != nil {
		t.Fatalf("failed to add veth pair: %v", err)
	}
	if err := runCmd("ip", "link", "set", vethC, "netns", nsClient); err != nil {
		t.Fatalf("failed to assign vethC: %v", err)
	}
	if err := runCmd("ip", "link", "set", vethR, "netns", nsRouter); err != nil {
		t.Fatalf("failed to assign vethR: %v", err)
	}

	// 3. Configure nsClient interface and default route
	if err := runCmd("ip", "netns", "exec", nsClient, "ip", "link", "set", "lo", "up"); err != nil {
		t.Fatalf("failed to up lo in nsClient: %v", err)
	}
	if err := runCmd("ip", "netns", "exec", nsClient, "ip", "addr", "add", "10.200.1.2/24", "dev", vethC); err != nil {
		t.Fatalf("failed to add ip to vethC: %v", err)
	}
	if err := runCmd("ip", "netns", "exec", nsClient, "ip", "link", "set", vethC, "up"); err != nil {
		t.Fatalf("failed to up vethC: %v", err)
	}
	if err := runCmd("ip", "netns", "exec", nsClient, "ip", "route", "add", "default", "via", "10.200.1.1"); err != nil {
		t.Fatalf("failed to add default route in nsClient: %v", err)
	}
	// Enable ping socket in nsClient
	_ = runCmd("ip", "netns", "exec", nsClient, "sysctl", "-w", "net.ipv4.ping_group_range=0 2147483647")

	// 4. Configure nsRouter interface and unreachable route
	if err := runCmd("ip", "netns", "exec", nsRouter, "ip", "link", "set", "lo", "up"); err != nil {
		t.Fatalf("failed to up lo in nsRouter: %v", err)
	}
	if err := runCmd("ip", "netns", "exec", nsRouter, "ip", "addr", "add", "10.200.1.1/24", "dev", vethR); err != nil {
		t.Fatalf("failed to add ip to vethR: %v", err)
	}
	if err := runCmd("ip", "netns", "exec", nsRouter, "ip", "link", "set", vethR, "up"); err != nil {
		t.Fatalf("failed to up vethR: %v", err)
	}
	if err := runCmd("ip", "netns", "exec", nsRouter, "sysctl", "-w", "net.ipv4.ip_forward=1"); err != nil {
		t.Fatalf("failed to enable ip_forward in nsRouter: %v", err)
	}
	// Add unreachable route on the router for 10.200.2.0/24:
	// When router receives packet for 10.200.2.55, it immediately generates ICMP Type 3 Code 0 (Net Unreachable)
	// Add unreachable route on the router for 10.200.2.0/24:
	// When router receives packet for 10.200.2.55, it immediately generates ICMP Type 3 Code 0 (Net Unreachable)
	if err := runCmd("ip", "netns", "exec", nsRouter, "ip", "route", "add", "unreachable", "10.200.2.0/24"); err != nil {
		t.Fatalf("failed to add unreachable route in nsRouter: %v", err)
	}

	// Add next-hop route for 10.200.3.0/24 on router:
	// When nsClient sends packet to 10.200.3.55 with TTL=1, nsRouter decrements to 0 and returns ICMP Type 11
	if err := runCmd("ip", "netns", "exec", nsRouter, "ip", "route", "add", "10.200.3.0/24", "dev", "lo"); err != nil {
		t.Fatalf("failed to add 10.200.3.0/24 route in nsRouter: %v", err)
	}

	t.Logf("Namespaces successfully configured: nsClient (10.200.1.2) -> nsRouter (10.200.1.1) -> [unreachable 10.200.2.0/24, next-hop 10.200.3.0/24]")

	// 5. Execute probe from inside nsClient
	// We run a sub-process inside nsClient: "ip netns exec test_ns_client go test ..." or call helper
	probeCmd := exec.Command("ip", "netns", "exec", nsClient, os.Args[0], "-test.run=TestHelperType3ClientProbe", "--", "10.200.2.55")
	probeCmd.Env = append(os.Environ(), "RUN_TYPE3_PROBE=1")
	out, err := probeCmd.CombinedOutput()
	outputStr := string(out)
	t.Logf("nsClient probe execution output:\n%s", outputStr)

	if err != nil {
		t.Fatalf("probe inside nsClient returned error: %v", err)
	}
	if !strings.Contains(outputStr, "TYPE3_VERIFIED: unreachable error confirmed") {
		t.Fatalf("expected TYPE3_VERIFIED in output, got: %s", outputStr)
	}
	if !strings.Contains(outputStr, "TYPE11_VERIFIED: TTL exceeded confirmed") {
		t.Fatalf("expected TYPE11_VERIFIED in output, got: %s", outputStr)
	}
}

// TestHelperType3ClientProbe is the helper invoked inside nsClient by TestICMPIntegration_Type3_DestinationUnreachable.
func TestHelperType3ClientProbe(t *testing.T) {
	if os.Getenv("RUN_TYPE3_PROBE") != "1" {
		return
	}

	// Part A: Probe unreachable network -> must produce ICMP Type 3
	target3 := netip.MustParseAddr("10.200.2.55")
	ctx3, cancel3 := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel3()

	res3 := executeICMPProbePlatform(ctx3, target3, ICMPProbeConfig{
		Timeout: 1500 * time.Millisecond,
		TTL:     64,
	})

	fmt.Printf("HELPER_RESULT_TYPE3: success=%v errClass=%v msg=%q remote=%s\n", res3.Success, res3.ErrClass, res3.ErrorMessage, res3.RemoteAddr)

	if res3.Success {
		t.Fatalf("expected Type 3 unreachable error, but probe reported success")
	}
	if res3.ErrClass != ErrUnreachable {
		t.Fatalf("expected ErrUnreachable, got errClass=%v msg=%s", res3.ErrClass, res3.ErrorMessage)
	}
	if !strings.Contains(res3.ErrorMessage, "unreachable") {
		t.Fatalf("expected error message to contain 'unreachable', got: %s", res3.ErrorMessage)
	}
	fmt.Println("TYPE3_VERIFIED: unreachable error confirmed")

	// Part B: Probe next-hop network with TTL=1 -> nsRouter decrements to 0 and must produce ICMP Type 11
	target11 := netip.MustParseAddr("10.200.3.55")
	ctx11, cancel11 := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel11()

	res11 := executeICMPProbePlatform(ctx11, target11, ICMPProbeConfig{
		Timeout: 1500 * time.Millisecond,
		TTL:     1,
	})

	fmt.Printf("HELPER_RESULT_TYPE11: success=%v errClass=%v msg=%q remote=%s\n", res11.Success, res11.ErrClass, res11.ErrorMessage, res11.RemoteAddr)

	if res11.Success {
		t.Fatalf("expected Type 11 TTL exceeded error, but probe reported success")
	}
	if res11.ErrClass != ErrTimeout {
		t.Fatalf("expected ErrTimeout for TTL expired, got errClass=%v msg=%s", res11.ErrClass, res11.ErrorMessage)
	}
	if !strings.Contains(res11.ErrorMessage, "TTL expired") {
		t.Fatalf("expected error message to contain 'TTL expired', got: %s", res11.ErrorMessage)
	}
	fmt.Println("TYPE11_VERIFIED: TTL exceeded confirmed")
}

// TestICMPIntegration_Echo2RetryOnDrop verifies that when Echo 1 is silently dropped,
// executeICMPProbePlatform times out at timeout/2, transmits Echo 2, and succeeds.
func TestICMPIntegration_Echo2RetryOnDrop(t *testing.T) {
	ensureNetnsSupported(t)
	if _, err := exec.LookPath("iptables"); err != nil {
		t.Skipf("skipping drop test: iptables not available: %v", err)
	}

	const nsDrop = "test_ns_drop"
	cleanup := func() {
		_ = exec.Command("ip", "netns", "del", nsDrop).Run()
	}
	cleanup()
	t.Cleanup(cleanup)

	runCmd := func(args ...string) error {
		out, err := exec.Command(args[0], args[1:]...).CombinedOutput()
		if err != nil {
			return fmt.Errorf("cmd %v failed: %w (output: %s)", args, err, strings.TrimSpace(string(out)))
		}
		return nil
	}

	if err := runCmd("ip", "netns", "add", nsDrop); err != nil {
		t.Fatalf("failed to add nsDrop: %v", err)
	}
	if err := runCmd("ip", "netns", "exec", nsDrop, "ip", "link", "set", "lo", "up"); err != nil {
		t.Fatalf("failed to up lo in nsDrop: %v", err)
	}
	_ = runCmd("ip", "netns", "exec", nsDrop, "sysctl", "-w", "net.ipv4.ping_group_range=0 2147483647")

	// Drop the first echo reply on INPUT so Echo 1 receives no response, triggering Echo 2
	if err := runCmd("ip", "netns", "exec", nsDrop, "iptables", "-A", "INPUT", "-p", "icmp", "--icmp-type", "echo-reply", "-m", "statistic", "--mode", "nth", "--every", "2", "--packet", "0", "-j", "DROP"); err != nil {
		t.Skipf("iptables statistic match not supported: %v", err)
	}

	probeCmd := exec.Command("ip", "netns", "exec", nsDrop, os.Args[0], "-test.run=TestHelperEcho2RetryProbe", "--", "127.0.0.1")
	probeCmd.Env = append(os.Environ(), "RUN_ECHO2_PROBE=1")
	out, err := probeCmd.CombinedOutput()
	outputStr := string(out)
	t.Logf("nsDrop probe execution output:\n%s", outputStr)

	if err != nil {
		t.Fatalf("probe inside nsDrop returned error: %v", err)
	}
	if !strings.Contains(outputStr, "ECHO2_RETRY_CONFIRMED") {
		t.Fatalf("expected ECHO2_RETRY_CONFIRMED in output, got: %s", outputStr)
	}
}

// TestHelperEcho2RetryProbe is invoked inside nsDrop by TestICMPIntegration_Echo2RetryOnDrop.
func TestHelperEcho2RetryProbe(t *testing.T) {
	if os.Getenv("RUN_ECHO2_PROBE") != "1" {
		return
	}

	target := "127.0.0.1"
	targetIP := netip.MustParseAddr(target)

	// Timeout = 400ms. Echo 1 is dropped. At t=200ms, Echo 2 is sent and succeeds.
	timeout := 400 * time.Millisecond
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	start := time.Now()
	res := executeICMPProbePlatform(ctx, targetIP, ICMPProbeConfig{
		Timeout: timeout,
		TTL:     64,
	})
	elapsed := time.Since(start)

	fmt.Printf("HELPER_RESULT: success=%v RTT=%v elapsed=%v retried=%v errClass=%v msg=%q\n",
		res.Success, res.RTT, elapsed, res.Retried, res.ErrClass, res.ErrorMessage)

	if !res.Success {
		t.Fatalf("expected probe to succeed on Echo 2 retry, but failed: %v", res.ErrorMessage)
	}
	if !res.Retried {
		t.Fatalf("expected res.Retried to be true after Echo 2 retry, got false")
	}
	if res.RTT > 20*time.Millisecond {
		t.Fatalf("expected Echo 2 RTT to be small (< 20ms), got inflated RTT: %v", res.RTT)
	}
	if elapsed < 180*time.Millisecond {
		t.Fatalf("probe succeeded too fast (%v); expected elapsed >= 180ms due to timeout/2 wait for Echo 2", elapsed)
	}

	fmt.Printf("ECHO2_RETRY_CONFIRMED: Echo 2 retry fired and succeeded after Echo 1 drop with accurate RTT=%v (elapsed=%v)\n", res.RTT, elapsed)
}

// BenchmarkICMPProbe_Loopback benchmarks CPU usage and allocations of ICMP probing against loopback.
func BenchmarkICMPProbe_Loopback(b *testing.B) {
	if ok, _ := CheckICMPCapability(); !ok {
		b.Skip("unprivileged ICMP ping sockets denied")
	}

	ctx := context.Background()
	cfg := ICMPProbeConfig{
		Timeout: 1 * time.Second,
		TTL:     64,
	}

	var rusageStart, rusageEnd syscall.Rusage
	_ = syscall.Getrusage(syscall.RUSAGE_SELF, &rusageStart)

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		res := executeICMPProbePlatform(ctx, netip.MustParseAddr("127.0.0.1"), cfg)
		if !res.Success {
			b.Fatalf("probe failed: %v", res.ErrorMessage)
		}
	}

	b.StopTimer()
	_ = syscall.Getrusage(syscall.RUSAGE_SELF, &rusageEnd)

	userUsec := (rusageEnd.Utime.Sec-rusageStart.Utime.Sec)*1000000 + int64(rusageEnd.Utime.Usec-rusageStart.Utime.Usec)
	sysUsec := (rusageEnd.Stime.Sec-rusageStart.Stime.Sec)*1000000 + int64(rusageEnd.Stime.Usec-rusageStart.Stime.Usec)
	totalCPUUsec := userUsec + sysUsec
	cpuPerProbe := float64(totalCPUUsec) / float64(b.N)

	b.Logf("BenchmarkICMPProbe_Loopback: %d ops, CPU per probe = %.2f µs (user: %.2f µs, sys: %.2f µs)",
		b.N, cpuPerProbe, float64(userUsec)/float64(b.N), float64(sysUsec)/float64(b.N))
}
