package core

// localOutageClass reports whether a failed check's error class can be a
// symptom of the engine's own network being down rather than the target.
// NETWORK and UNREACHABLE cover fast-fail outages (no route, network
// unreachable) that never produce timeouts.
func localOutageClass(c ErrClass) bool {
	switch c {
	case ErrTimeout, ErrDNS, ErrSlow, ErrNet, ErrUnreachable:
		return true
	}
	return false
}

// countsTowardLocalHealth reports whether a check result feeds the local
// health tracker. ErrSlow (connected, then stalled) counts as a failure:
// on pooled keep-alive connections that is how a local outage appears.
func countsTowardLocalHealth(ev EventCheckResult) bool {
	return ev.Ok || isConnectLevelError(ev.ErrClass) || ev.ErrClass == ErrSlow ||
		ev.ErrClass == ErrNet || ev.ErrClass == ErrUnreachable
}

// shouldSuppressFailure attributes a failed check to a local network problem.
// Requires BOTH an unhealthy tracker and failing canaries; the canary is only
// consulted when the cheaper conditions already hold.
func shouldSuppressFailure(ev EventCheckResult, localUnhealthy bool, canaryOK func() bool) bool {
	if ev.Ok || !localUnhealthy {
		return false
	}
	if !localOutageClass(ev.ErrClass) {
		return false
	}
	return !canaryOK()
}
