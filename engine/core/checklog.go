package core

import "time"

// CheckLogEvent represents a single check outcome to be recorded in PostgreSQL uptime_checks_log.
type CheckLogEvent struct {
	MonitorID    string
	CheckedAt    time.Time
	Success      bool
	StatusCode   int
	LatencyMs    int
	LatencyUs    int
	ErrorMessage string
	Location     string
}

// CheckLogQueue buffers events destined for uptime_checks_log.
var CheckLogQueue = make(chan CheckLogEvent, 10000)

// EmitCheckLog pushes a check event into the buffer non-blockingly.
func EmitCheckLog(evt CheckLogEvent) {
	select {
	case CheckLogQueue <- evt:
	default:
		// Queue full; drop rather than stall worker threads
	}
}
