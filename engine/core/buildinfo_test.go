package core

import "testing"

func TestBuildInfoHelpersNonEmpty(t *testing.T) {
	if buildCommit() == "" || buildTags() == "" {
		t.Fatal("buildCommit/buildTags must never return empty")
	}
}
