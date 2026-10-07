package core

func init() {
	DisableSSRFBlocker = true
	TLSInsecureSkipVerify = true
	if globalTLSConfig != nil {
		globalTLSConfig.InsecureSkipVerify = true
	}
}
