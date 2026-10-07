package core

import (
	"testing"
	"time"
)

func TestParseIMFFixdate(t *testing.T) {
	good := "Sun, 06 Nov 1994 08:49:37 GMT"
	got, ok := parseIMFFixdate([]byte(good))
	want, _ := time.Parse(time.RFC1123, good)
	if !ok || !got.Equal(want) {
		t.Fatalf("got %v ok=%v want %v", got, ok, want)
	}
	for _, bad := range []string{
		"", "Sunday, 06-Nov-94 08:49:37 GMT", "Sun Nov  6 08:49:37 1994",
		"Sun, 06 Xxx 1994 08:49:37 GMT", "Sun, 06 Nov 1994 25:49:37 GMT",
		"Sun, 06 Nov 1994 08:49:37 UTC",
	} {
		if _, ok := parseIMFFixdate([]byte(bad)); ok {
			t.Errorf("accepted %q", bad)
		}
	}
}

func TestParseIMFFixdateZeroAlloc(t *testing.T) {
	b := []byte("Sun, 06 Nov 1994 08:49:37 GMT")
	if n := testing.AllocsPerRun(1000, func() { parseIMFFixdate(b) }); n != 0 {
		t.Fatalf("allocs/op = %v, want 0", n)
	}
}
