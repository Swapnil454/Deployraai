package main

import (
	"fmt"
	"github.com/your-org/uptime-engine/core"
)

func main() {
	core.InitHTTPClients(100)
	fmt.Printf("Cached WriteTimeout: %v\n", core.HTTPClients.Cached.WriteTimeout)
	fmt.Printf("FullPhase WriteTimeout: %v\n", core.HTTPClients.FullPhase.WriteTimeout)
}
