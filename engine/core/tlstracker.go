package core

import (
	"crypto/tls"
	"log"
	"sync/atomic"
)

type TLSStats struct {
	Total   atomic.Int64
	Resumed atomic.Int64
	Full    atomic.Int64
	TLS13   atomic.Int64
	TLS12   atomic.Int64
	MLKEM   atomic.Int64
}

// tlsStats[0] = default cohort, tlsStats[1] = classical key-share cohort
var tlsStats [2]TLSStats

func GetTLSStats(cohort int) TLSStats {
	if cohort < 0 || cohort >= len(tlsStats) {
		return TLSStats{}
	}
	s := &tlsStats[cohort]
	var snapshot TLSStats
	snapshot.Total.Store(s.Total.Load())
	snapshot.Resumed.Store(s.Resumed.Load())
	snapshot.Full.Store(s.Full.Load())
	snapshot.TLS13.Store(s.TLS13.Load())
	snapshot.TLS12.Store(s.TLS12.Load())
	snapshot.MLKEM.Store(s.MLKEM.Load())
	return snapshot
}

func (s *TLSStats) observe(cs *tls.ConnectionState) {
	s.Total.Add(1)
	if cs.DidResume {
		s.Resumed.Add(1)
	} else {
		s.Full.Add(1)
	}
	switch cs.Version {
	case tls.VersionTLS13:
		s.TLS13.Add(1)
	case tls.VersionTLS12:
		s.TLS12.Add(1)
	}

	// TLS 1.3 key exchange metrics
}

func installTLSObserver(cfg *tls.Config, cohort int) {
	if cfg == nil || cohort < 0 || cohort >= len(tlsStats) {
		return
	}
	prev := cfg.VerifyConnection
	s := &tlsStats[cohort]
	cfg.VerifyConnection = func(cs tls.ConnectionState) error {
		s.observe(&cs)
		if prev != nil {
			return prev(cs)
		}
		return nil
	}
}

func ResetTLSStats() {
	for i := range tlsStats {
		s := &tlsStats[i]
		s.Total.Store(0)
		s.Resumed.Store(0)
		s.Full.Store(0)
		s.TLS13.Store(0)
		s.TLS12.Store(0)
		s.MLKEM.Store(0)
	}
}

func LogTLSStats() {
	for cohort := range tlsStats {
		s := &tlsStats[cohort]
		tot := s.Total.Load()
		if tot == 0 {
			continue
		}
		res := s.Resumed.Load()
		full := s.Full.Load()
		t13 := s.TLS13.Load()
		t12 := s.TLS12.Load()
		mlkem := s.MLKEM.Load()
		resPct := 0.0
		if tot > 0 {
			resPct = 100.0 * float64(res) / float64(tot)
		}
		log.Printf("[TLS_STATS] cohort=%d handshakes=%d resumed=%d (%.1f%%) full=%d tls13=%d tls12=%d mlkem=%d",
			cohort, tot, res, resPct, full, t13, t12, mlkem)
	}
}
