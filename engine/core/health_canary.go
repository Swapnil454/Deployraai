package core
import (
"net"
"os"
"strings"
"sync"
"sync/atomic"
"time"
)
var healthCanaryEndpoints = parseHealthCanaryEndpoints(os.Getenv("HEALTH_CANARIES"))
var healthCanaryProbe = defaultHealthCanaryProbe
var healthCanaryLast atomic.Int64
var healthCanaryOK atomic.Bool
var healthCanaryRunning atomic.Bool
func parseHealthCanaryEndpoints(s string) []string {
s = strings.TrimSpace(s)
if strings.EqualFold(s, "off") {
return nil
}
if s == "" {
return []string{"1.1.1.1:443", "8.8.8.8:443", "9.9.9.9:443"}
}
var out []string
for _, p := range strings.Split(s, ",") {
if p = strings.TrimSpace(p); p != "" {
out = append(out, p)
}
}
return out
}
func defaultHealthCanaryProbe(addr string) bool {
c, err := net.DialTimeout("tcp", addr, 2*time.Second)
if err != nil {
return false
}
c.Close()
return true
}
func localNetworkCanaryOK() bool {
if len(healthCanaryEndpoints) == 0 {
return false
}
if time.Now().UnixNano()-healthCanaryLast.Load() >= int64(5*time.Second) && healthCanaryRunning.CompareAndSwap(false, true) {
go func() {
var ok atomic.Bool
var wg sync.WaitGroup
for _, ep := range healthCanaryEndpoints {
wg.Add(1)
go func(a string) {
defer wg.Done()
if healthCanaryProbe(a) {
ok.Store(true)
}
}(ep)
}
wg.Wait()
healthCanaryOK.Store(ok.Load())
healthCanaryLast.Store(time.Now().UnixNano())
healthCanaryRunning.Store(false)
}()
}
return healthCanaryOK.Load()
}
