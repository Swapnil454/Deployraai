package core

// countsTowardLocalHealth reports whether a check result feeds the local
// health tracker. ErrSlow (connected, then stalled) counts as a failure:
// on pooled keep-alive connections that is how a local outage appears.
func countsTowardLocalHealth(ev EventCheckResult) bool {
	return ev.Ok || isConnectLevelError(ev.ErrClass) || ev.ErrClass == ErrSlow
}

// shouldSuppressFailure attributes a failed check to a local network problem.
// Requires BOTH an unhealthy tracker and failing canaries; the canary is only
// consulted when the cheaper conditions already hold.
func shouldSuppressFailure(ev EventCheckResult, localUnhealthy bool, canaryOK func() bool) bool {
	if ev.Ok || !localUnhealthy {
		return false
	}
	if ev.ErrClass != ErrTimeout && ev.ErrClass != ErrDNS && ev.ErrClass != ErrSlow {
		return false
	}
	return !canaryOK()
}
