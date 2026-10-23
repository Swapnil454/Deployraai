package core

import (
	"runtime/debug"
	"strings"
)

// BuildCommit can be injected at link time:
//
//	-ldflags "-X github.com/your-org/uptime-engine/core.BuildCommit=<sha>"
var BuildCommit string

func buildCommit() string {
	if BuildCommit != "" {
		return BuildCommit
	}
	if bi, ok := debug.ReadBuildInfo(); ok {
		for _, s := range bi.Settings {
			if s.Key == "vcs.revision" && s.Value != "" {
				if len(s.Value) > 12 {
					return s.Value[:12]
				}
				return s.Value
			}
		}
	}
	return "unknown"
}

func buildTags() string {
	if bi, ok := debug.ReadBuildInfo(); ok {
		for _, s := range bi.Settings {
			if s.Key == "-tags" && s.Value != "" {
				return strings.ReplaceAll(s.Value, ",", "+")
			}
		}
	}
	return "none"
}
