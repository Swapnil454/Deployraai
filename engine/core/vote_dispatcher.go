package core

import (
	"log"
)

// VoteDispatch is called when the state machine needs secondary PoPs to confirm a failure.
// In a distributed deployment, this would publish a message to a Redis/NATS topic
// that other PoPs listen to. For this single-binary engine, we simulate it or use
// local evidence.
func VoteDispatch(monitorID string, req EffectRequestVotes) *EventVoteResult {
	// 1. Check Evidence Cache FIRST (Mass Outage Shield)
	m := Store.Get(monitorID)
	if m == nil {
		return nil
	}
	ip, port := GetEvidenceIPAndPort(m)
	if ip == "" {
		return nil
	}

	callerPoP := "pop-local"
	if len(req.ExcludePoPs) > 0 {
		callerPoP = req.ExcludePoPs[0]
	}
	callerASN := "asn-local"
	if len(req.ExcludeASNs) > 0 {
		callerASN = req.ExcludeASNs[0]
	}

	// Try to gather evidence from the cache
	ev, ok := Evidence.Lookup(ip, port, callerPoP, callerASN, req.RoundOpenedAt)
	if ok {
		log.Printf("[machine/%s] Evidence Cache HIT for %s:%s! Bypassing remote probe.", monitorID, ip, port)
		return &EventVoteResult{
			PoP:       ev.PoP,
			ASN:       ev.ASN,
			Epoch:     req.Epoch,
			Round:     req.Round,
			Ok:        false,
			ErrClass:  ev.ErrClass,
			FromCache: true, // Prevent refreshing TTL loop
		}
	}

	if req.Count > 0 {
		// In a real distributed deployment, we would publish to a Redis/NATS topic here
		// for other PoPs to perform a live check.
		// For this single-node build, we DO NOT simulate rubber-stamp votes.
		// If evidence cache missed, the round will simply time out without quorum.
		log.Printf("[machine/%s] Requesting %d remote votes (Stubbed)", monitorID, req.Count)
	}
	return nil
}
