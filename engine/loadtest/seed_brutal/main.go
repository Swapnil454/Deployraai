package main

// Brutal Soak Seed — 8 monitor types equally split, all at 30s interval.
//
// Monitor catalogue (12.5% each, 8 types):
//
//   Type          | Split  | Mix of real + mock endpoints
//   --------------|--------|-------------------------------------------------
//   http          | 12.5%  | 80% mock /mock/up, 20% real HTTPS sites
//   keyword       | 12.5%  | 80% mock /mock/keyword, 20% real sites with known keyword
//   ping          | 12.5%  | 80% mock host, 20% real public IPs (8.8.8.8, 1.1.1.1, etc.)
//   port          | 12.5%  | 80% mock host:8443, 20% real port-80/443 sites
//   heartbeat     | 12.5%  | 100% mock (heartbeat = inbound ping, no outbound target)
//   dns           | 12.5%  | 80% mock host, 20% real domains (google.com, github.com, etc.)
//   api           | 12.5%  | 80% mock /mock/up with JSON header, 20% real public APIs
//   udp           | 12.5%  | 80% mock, 20% public DNS:53 UDP
//
// All monitors at interval_seconds=30, timeout_seconds=10.
// ~2% are forced-down (HTTP 503) and ~0.5% are forced-timeout for incident correctness checks.

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"os"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// realHTTPSites — real HTTPS sites for http/keyword/api monitors across the public internet.
var realHTTPSites = []struct {
	url     string
	keyword string
	tag     string
	mType   string
}{
	{"https://www.google.com", "", "real_http", "http"},
	{"https://www.github.com", "", "real_http", "http"},
	{"https://www.cloudflare.com", "", "real_http", "http"},
	{"https://httpbin.org/status/200", "", "real_http", "http"},
	{"https://www.wikipedia.org", "", "real_http", "http"},
	{"https://jsonplaceholder.typicode.com/todos/1", "", "real_http", "http"},
	{"https://www.fastly.com", "", "real_http", "http"},
	{"https://www.mozilla.org", "", "real_http", "http"},
	{"https://www.microsoft.com", "", "real_http", "http"},
	{"https://www.apple.com", "", "real_http", "http"},
	{"https://www.amazon.com", "", "real_http", "http"},
	{"https://www.reddit.com", "", "real_http", "http"},
	{"https://www.python.org", "", "real_http", "http"},
	{"https://go.dev", "", "real_http", "http"},
	{"https://www.rust-lang.org", "", "real_http", "http"},
	{"https://www.npmjs.com", "", "real_http", "http"},
	{"https://pypi.org", "", "real_http", "http"},
	{"https://hub.docker.com", "", "real_http", "http"},
	{"https://stackoverflow.com", "", "real_http", "http"},
	{"https://duckduckgo.com", "", "real_http", "http"},
	{"https://www.bing.com", "", "real_http", "http"},
	{"https://www.apache.org", "", "real_http", "http"},
	{"https://www.debian.org", "", "real_http", "http"},
	{"https://ubuntu.com", "", "real_http", "http"},

	// Keyword monitors — check for known strings on real pages
	{"https://www.google.com", "Google", "real_keyword", "keyword"},
	{"https://www.github.com", "GitHub", "real_keyword", "keyword"},
	{"https://httpbin.org/get", "\"url\"", "real_keyword", "keyword"},
	{"https://jsonplaceholder.typicode.com/todos/1", "userId", "real_keyword", "keyword"},
	{"https://www.cloudflare.com", "Cloudflare", "real_keyword", "keyword"},
	{"https://www.wikipedia.org", "Wikipedia", "real_keyword", "keyword"},
	{"https://www.mozilla.org", "Mozilla", "real_keyword", "keyword"},
	{"https://go.dev", "Go", "real_keyword", "keyword"},
	{"https://www.python.org", "Python", "real_keyword", "keyword"},

	// API monitors — real public APIs returning JSON
	{"https://api.github.com", "current_user_url", "real_api", "api"},
	{"https://jsonplaceholder.typicode.com/posts/1", "title", "real_api", "api"},
	{"https://httpbin.org/json", "slideshow", "real_api", "api"},
	{"https://httpbin.org/get", "headers", "real_api", "api"},
}

// realDNSDomains — 30 real domains for dns monitors
var realDNSDomains = []string{
	"google.com", "github.com", "cloudflare.com", "mozilla.org",
	"wikipedia.org", "fastly.com", "amazonaws.com", "azure.com",
	"microsoft.com", "apple.com", "reddit.com", "wordpress.org",
	"medium.com", "python.org", "go.dev", "rust-lang.org",
	"npmjs.com", "pypi.org", "docker.com", "stackoverflow.com",
	"duckduckgo.com", "bing.com", "yahoo.com", "bbc.com",
	"cnn.com", "apache.org", "debian.org", "ubuntu.com",
	"kernel.org", "gnu.org",
}

// realPingHosts — public hosts that respond to ping / DNS / HTTPS
var realPingHosts = []string{
	"https://8.8.8.8", "https://1.1.1.1", "https://9.9.9.9",
	"https://208.67.222.222", "https://64.6.64.6", "https://8.8.4.4",
	"https://1.0.0.1", "https://185.228.168.9", "https://76.76.2.0",
}

// realPortSites — sites to TCP connect on port 443
var realPortSites = []string{
	"https://www.google.com:443",
	"https://www.github.com:443",
	"https://httpbin.org:443",
	"https://www.cloudflare.com:443",
	"https://www.microsoft.com:443",
	"https://www.apple.com:443",
	"https://www.wikipedia.org:443",
	"https://www.amazon.com:443",
	"https://www.reddit.com:443",
	"https://www.mozilla.org:443",
	"https://www.python.org:443",
	"https://go.dev:443",
	"https://www.rust-lang.org:443",
}

func main() {
	dsn := os.Getenv("UPTIMER_DB")
	if dsn == "" {
		log.Fatal("UPTIMER_DB not set")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	count := 8000 // default: 8000 total = 1000 per type
	if len(os.Args) > 1 {
		fmt.Sscanf(os.Args[1], "%d", &count)
	}
	// Enforce divisibility by 8 for equal splits
	count = (count / 8) * 8
	if count < 8 {
		count = 8
	}
	perType := count / 8
	log.Printf("Brutal soak seed: %d monitors total, %d per type, all at 30s interval", count, perType)

	log.Println("Truncating existing monitors and incidents...")
	_, err = pool.Exec(ctx, "TRUNCATE uptime_monitors CASCADE")
	if err != nil {
		log.Fatalf("Truncate failed: %v", err)
	}

	rng := rand.New(rand.NewSource(42))
	var rows [][]interface{}
	tagCounts := map[string]int{}

	// The 8 monitor types to generate equally:
	monitorTypes := []string{"http", "keyword", "ping", "port", "heartbeat", "dns", "api", "udp"}

	for typeIdx, mType := range monitorTypes {
		for i := 0; i < perType; i++ {
			globalIdx := typeIdx*perType + i

			var (
				monURL  string
				keyword string
				tag     string
				timeout = 10
			)

			// ~2% of http monitors are forced-down, ~0.5% forced-timeout, rest healthy
			isDown    := (i % 50) == 0   // 2%
			isTimeout := (i % 200) == 1  // 0.5%

			// Enable real public internet URLs across 50+ unique domains
			useReal := true

			switch mType {
			case "http":
				if isDown {
					monURL = fmt.Sprintf("https://mock-%d.mock.local:8443/mock/down", globalIdx)
					tag = "down"
				} else if isTimeout {
					monURL = fmt.Sprintf("https://mock-%d.mock.local:8443/mock/timeout", globalIdx)
					tag = "timeout"
					timeout = 5
				} else if useReal && len(realHTTPSites) > 0 {
					site := realHTTPSites[i%len(realHTTPSites)]
					if site.mType == "http" {
						monURL = site.url
						tag = site.tag
					} else {
						monURL = fmt.Sprintf("https://mock-%d.mock.local:8443/mock/up", globalIdx)
						tag = "up_http"
					}
				} else {
					monURL = fmt.Sprintf("https://mock-%d.mock.local:8443/mock/up", globalIdx)
					tag = "up_http"
				}

			case "keyword":
				if isDown {
					monURL = fmt.Sprintf("https://mock-%d.mock.local:8443/mock/down", globalIdx)
					tag = "down"
					keyword = "HEALTHY"
				} else if useReal {
					// Pick a real keyword site
					sites := []struct{ url string; keyword string; tag string; mType string }{}
					for _, s := range realHTTPSites {
						if s.mType == "keyword" {
							sites = append(sites, s)
						}
					}
					if len(sites) > 0 {
						site := sites[i%len(sites)]
						monURL = site.url
						keyword = site.keyword
						tag = site.tag
					} else {
						monURL = fmt.Sprintf("https://mock-%d.mock.local:8443/mock/keyword", globalIdx)
						keyword = "HEALTHY"
						tag = "up_keyword"
					}
				} else {
					monURL = fmt.Sprintf("https://mock-%d.mock.local:8443/mock/keyword", globalIdx)
					keyword = "HEALTHY"
					tag = "up_keyword"
				}

			case "ping":
				if isDown {
					monURL = fmt.Sprintf("https://192.0.2.%d", rng.Intn(254)+1) // RFC5737 documentation range = unreachable
					tag = "down"
				} else if useReal && len(realPingHosts) > 0 {
					monURL = realPingHosts[i%len(realPingHosts)]
					tag = "real_ping"
				} else {
					monURL = fmt.Sprintf("https://mock-%d.mock.local:8443/mock/up", globalIdx)
					tag = "up_ping"
				}

			case "port":
				if isDown {
					monURL = fmt.Sprintf("https://192.0.2.%d:9999", rng.Intn(254)+1) // RFC5737 unreachable
					tag = "down"
				} else if useReal && len(realPortSites) > 0 {
					monURL = realPortSites[i%len(realPortSites)]
					tag = "real_port"
				} else {
					monURL = fmt.Sprintf("https://mock-%d.mock.local:8443", globalIdx)
					tag = "up_port"
				}

			case "heartbeat":
				// Heartbeat is inbound — engine accepts a push from external source.
				// For the load test, we simulate as an http check against mock/up
				// to produce real check records. Tag clearly as heartbeat.
				if isDown {
					monURL = fmt.Sprintf("https://mock-%d.mock.local:8443/mock/down", globalIdx)
					tag = "down"
				} else {
					monURL = fmt.Sprintf("https://mock-%d.mock.local:8443/mock/up", globalIdx)
					tag = "up_heartbeat"
				}

			case "dns":
				if isDown {
					monURL = fmt.Sprintf("https://nx-%d.nonexistent.invalid", globalIdx) // NXDOMAIN guaranteed
					tag = "down"
				} else if useReal && len(realDNSDomains) > 0 {
					domain := realDNSDomains[i%len(realDNSDomains)]
					monURL = fmt.Sprintf("https://%s", domain)
					tag = "real_dns"
				} else {
					monURL = fmt.Sprintf("https://mock-%d.mock.local:8443/mock/up", globalIdx)
					tag = "up_dns"
				}

			case "api":
				if isDown {
					monURL = fmt.Sprintf("https://mock-%d.mock.local:8443/mock/down", globalIdx)
					tag = "down"
				} else if isTimeout {
					monURL = fmt.Sprintf("https://mock-%d.mock.local:8443/mock/timeout", globalIdx)
					tag = "timeout"
					timeout = 5
				} else if useReal {
					sites := []struct{ url string; keyword string; tag string; mType string }{}
					for _, s := range realHTTPSites {
						if s.mType == "api" {
							sites = append(sites, s)
						}
					}
					if len(sites) > 0 {
						site := sites[i%len(sites)]
						monURL = site.url
						keyword = site.keyword
						tag = site.tag
					} else {
						monURL = fmt.Sprintf("https://mock-%d.mock.local:8443/mock/up", globalIdx)
						tag = "up_api"
					}
				} else {
					monURL = fmt.Sprintf("https://mock-%d.mock.local:8443/mock/up", globalIdx)
					tag = "up_api"
				}

			case "udp":
				// UDP: engine currently routes to HTTP check (eBPF UDP not yet implemented)
				// Simulate against mock. Mark real ones as DNS:53
				if isDown {
					monURL = fmt.Sprintf("https://192.0.2.%d", rng.Intn(254)+1)
					tag = "down"
				} else if useReal {
					monURL = "https://8.8.8.8" // Google public DNS, UDP 53
					tag = "real_udp"
				} else {
					monURL = fmt.Sprintf("https://mock-%d.mock.local:8443/mock/up", globalIdx)
					tag = "up_udp"
				}
			}

			rows = append(rows, []interface{}{
				uuid.New().String(), // id
				"brutal-soak",       // user_id
				mType,               // monitor_type
				monURL,              // url
				keyword,             // keyword
				[]string{tag},       // tags
				30,                  // interval_seconds  ← ALL 30s
				timeout,             // timeout_seconds
				"up",                // status
				false,               // is_paused
				"engine",            // managed_by
			})
			tagCounts[tag]++
		}
	}

	log.Printf("Inserting %d monitor rows...", len(rows))
	_, err = pool.CopyFrom(ctx,
		[]string{"uptime_monitors"},
		[]string{"id", "user_id", "monitor_type", "url", "keyword", "tags", "interval_seconds", "timeout_seconds", "status", "is_paused", "managed_by"},
		pgx.CopyFromRows(rows),
	)
	if err != nil {
		log.Fatalf("CopyFrom failed: %v", err)
	}

	log.Println("\n=== Seeding complete. Distribution: ===")
	log.Printf("%-20s  %6s  %5s", "TAG", "COUNT", "PCT")
	total := 0
	for _, tag := range []string{
		"up_http","real_http","down","timeout",
		"up_keyword","real_keyword",
		"up_ping","real_ping",
		"up_port","real_port",
		"up_heartbeat",
		"up_dns","real_dns",
		"up_api","real_api",
		"up_udp","real_udp",
	} {
		if n, ok := tagCounts[tag]; ok {
			log.Printf("  %-20s  %6d  %5.1f%%", tag, n, float64(n)*100/float64(count))
			total += n
		}
	}
	// Any remaining tags
	for tag, n := range tagCounts {
		found := false
		for _, known := range []string{"up_http","real_http","down","timeout","up_keyword","real_keyword","up_ping","real_ping","up_port","real_port","up_heartbeat","up_dns","real_dns","up_api","real_api","up_udp","real_udp"} {
			if tag == known { found = true; break }
		}
		if !found {
			log.Printf("  %-20s  %6d  %5.1f%%", tag, n, float64(n)*100/float64(count))
			total += n
		}
	}
	log.Printf("  %-20s  %6d  100.0%%", "TOTAL", total)
	log.Printf("\nAll monitors: interval_seconds=30, timeout_seconds=10 (forced-down/timeout get 5s)")
}
