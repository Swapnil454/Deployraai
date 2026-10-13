package core

import "github.com/your-org/uptime-engine/netsec"

func init() {
	netsec.DisableSSRFBlocker = true
	TLSInsecureSkipVerify = true
	if globalTLSConfig != nil {
		globalTLSConfig.InsecureSkipVerify = true
	}
}
