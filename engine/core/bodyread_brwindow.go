package core

// maxBrWindowBits caps the brotli sliding window we accept. RFC 7932 defines
// window sizes 10..24 as valid; the "large-window" extension (signalled by the
// reserved pattern, brWindowBits returns -1) is not part of the HTTP coding.
// Setting this to 24 (the maximum valid value) keeps us compatible with any
// conforming server. Our 64 KB decoded window prevents the ring buffer from
// materialising in full regardless of what the stream declares.
const maxBrWindowBits = 24

// brWindowBits decodes WBITS from the first byte of a brotli stream
// (RFC 7932 section 9.1, bits are read LSB-first). It returns -1 for the
// reserved/large-window encodings.
func brWindowBits(b0 byte) int {
	if b0&1 == 0 {
		return 16
	}
	if n := (b0 >> 1) & 7; n != 0 {
		return 17 + int(n) // 18..24
	}
	switch m := (b0 >> 4) & 7; m {
	case 0:
		return 17
	case 1:
		return -1 // large-window extension, not standard
	default:
		return 8 + int(m) // 10..15
	}
}
