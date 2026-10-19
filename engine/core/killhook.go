//go:build killhook

package core

// SigkillHook is a testing hook invoked immediately after ClickHouse batch.Send() completes,
// simulating an abrupt process termination (kill -9) in the window between ClickHouse commit
// and spool segment acknowledgement/deletion (Window 1).
var SigkillHook func()

func triggerSigkillHook() {
	if SigkillHook != nil {
		SigkillHook()
	}
}
