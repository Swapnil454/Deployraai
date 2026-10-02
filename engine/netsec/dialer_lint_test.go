package netsec

import (
	"os/exec"
	"strings"
	"testing"
)

func TestNoRawDialer(t *testing.T) {
	// Look for literal net.Dialer{} outside of the netsec package
	cmd := exec.Command("git", "grep", "-n", "net.Dialer{")
	cmd.Dir = "../"
	
	out, err := cmd.Output()
	if err != nil {
		// git grep returns exit status 1 if no matches are found, which is what we want
		return
	}
	
	lines := strings.Split(string(out), "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}
		
		if strings.HasPrefix(line, "netsec/ssrf.go") || strings.HasSuffix(line, "_test.go") || strings.Contains(line, "_test.go:") {
			continue
		}
		if strings.HasPrefix(line, "db/") {
			continue
		}
		
		// It's in some other package or file
		t.Errorf("Raw net.Dialer literal found: %s. Use netsec.NewDialer() instead.", line)
	}
}
