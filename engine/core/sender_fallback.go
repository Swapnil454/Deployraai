//go:build !linux

package core

import (
	"log"
	"sync/atomic"
)

func sendRawSocket(m *Monitor, ptr *atomic.Pointer[Monitor], nonce uint64, hash uint32) {
	log.Printf("[Fallback] Dispatched raw packet for %s (nonce: %d, hash: %d, port: %d)", m.ID, nonce, hash, m.AssignedPort)
}

func SendRST(targetIP string, sourcePort uint16, destPort uint16, hash uint32) {
	log.Printf("[Fallback] Sent RST to %s:%d from port %d (seq=%d)", targetIP, destPort, sourcePort, hash+1)
}
