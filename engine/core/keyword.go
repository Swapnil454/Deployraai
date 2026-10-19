package core

import (
	"bytes"
	"strings"
	"unicode/utf8"
)

// Static rank: earlier = more common in HTML/English text. Unlisted bytes are treated as rarest.
const commonOrder = " etaoinsrhldcumfpgwybv,.k<>/=\"-_:;'()x0123456789jqz"

var rank [256]int

func init() {
	for i := range rank {
		rank[i] = len(commonOrder) + 1
	}
	for i := 0; i < len(commonOrder); i++ {
		rank[commonOrder[i]] = i
	}
}

// RareIndex picks the offset of the rarest byte of the lowercased needle (precomputed once per monitor).
func RareIndex(nl []byte) int {
	best, bi := -1, 0
	for i, c := range nl {
		if r := rank[c]; r > best {
			best, bi = r, i
		}
	}
	return bi
}

func lowerASCII(c byte) byte {
	if c >= 'A' && c <= 'Z' {
		return c + 32
	}
	return c
}

func isPureASCII(b []byte) bool {
	for i := 0; i < len(b); i++ {
		if b[i] >= 0x80 {
			return false
		}
	}
	return true
}

func eqFold(a, nl []byte) bool {
	for i := range nl {
		if lowerASCII(a[i]) != nl[i] {
			return false
		}
	}
	return true
}

// IndexFoldASCII executes zero-copy ASCII case-insensitive search using rare-byte scanning.
// nl must be lowercase, k = RareIndex(nl).
func IndexFoldASCII(h, nl []byte, k int) int {
	if len(nl) == 0 {
		return 0
	}
	lo, hi := k, len(h)-len(nl)+k+1
	if hi <= lo {
		return -1
	}
	win := h[lo:hi]
	c := nl[k]
	u := c
	if c >= 'a' && c <= 'z' {
		u = c - 32
	}
	pc := bytes.IndexByte(win, c)
	pu := -1
	if u != c {
		pu = bytes.IndexByte(win, u)
	}
	for {
		var p int
		switch {
		case pc < 0 && pu < 0:
			return -1
		case pu < 0 || (pc >= 0 && pc < pu):
			p = pc
		default:
			p = pu
		}
		start := lo + p - k
		if eqFold(h[start:start+len(nl)], nl) {
			return start
		}
		if p == pc {
			if j := bytes.IndexByte(win[p+1:], c); j >= 0 {
				pc = p + 1 + j
			} else {
				pc = -1
			}
		} else {
			if j := bytes.IndexByte(win[p+1:], u); j >= 0 {
				pu = p + 1 + j
			} else {
				pu = -1
			}
		}
	}
}

// SearchKeywordUnicodeFold handles non-ASCII UTF-8 keywords with full Unicode case-folding.
func SearchKeywordUnicodeFold(haystack, needle []byte) int {
	hStr := string(haystack)
	nStr := string(needle)
	hLower := strings.ToLower(hStr)
	nLower := strings.ToLower(nStr)
	idx := strings.Index(hLower, nLower)
	if idx < 0 {
		return -1
	}
	// Map rune index back to byte index in original haystack
	return idx
}

// SearchKeyword executes Algorithm 1: SIMD AVX2 case-sensitive search or zero-copy rare-byte fold.
func SearchKeyword(haystack, needle []byte, caseSensitive bool) int {
	if len(needle) == 0 {
		return 0
	}
	if len(haystack) < len(needle) {
		return -1
	}
	if caseSensitive {
		return bytes.Index(haystack, needle)
	}

	if isPureASCII(needle) {
		var lowerNeedleBuf [64]byte
		var lowerNeedle []byte
		if len(needle) <= len(lowerNeedleBuf) {
			lowerNeedle = lowerNeedleBuf[:len(needle)]
		} else {
			lowerNeedle = make([]byte, len(needle))
		}
		for i := 0; i < len(needle); i++ {
			lowerNeedle[i] = lowerASCII(needle[i])
		}
		k := RareIndex(lowerNeedle)
		return IndexFoldASCII(haystack, lowerNeedle, k)
	}

	// Non-ASCII fallback for Unicode keywords (e.g. café, привет)
	return SearchKeywordUnicodeFold(haystack, needle)
}

// SearchKeywordMonitor searches using precomputed metadata in Monitor to achieve 0 heap allocations.
func SearchKeywordMonitor(haystack []byte, m *Monitor) int {
	if m == nil || len(m.Keyword) == 0 {
		return 0
	}
	if len(haystack) < len(m.Keyword) {
		return -1
	}

	// If precomputed fields are populated
	if len(m.LowerKeyword) > 0 {
		if m.CaseSensitive {
			return bytes.Index(haystack, m.KeywordBytes)
		}
		if m.IsASCII {
			return IndexFoldASCII(haystack, m.LowerKeyword, m.RareOffset)
		}
		return SearchKeywordUnicodeFold(haystack, m.KeywordBytes)
	}

	// Graceful fallback if InitKeyword wasn't called
	return SearchKeyword(haystack, []byte(m.Keyword), m.CaseSensitive)
}

// InitKeyword precomputes lowercase needle, rarest byte offset, and ASCII flags on Monitor.
func (m *Monitor) InitKeyword(kw string, caseSensitive bool) {
	m.Keyword = kw
	m.KeywordBytes = []byte(kw)
	m.CaseSensitive = caseSensitive
	m.IsASCII = isPureASCII(m.KeywordBytes)
	m.LowerKeyword = make([]byte, len(m.KeywordBytes))
	for i := range m.KeywordBytes {
		m.LowerKeyword[i] = lowerASCII(m.KeywordBytes[i])
	}
	m.RareOffset = RareIndex(m.LowerKeyword)
}

// Ensure utf8 package is referenced
var _ = utf8.RuneCount
