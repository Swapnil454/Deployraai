//go:build loadtest

package main

import (
	"log"
	"net/http"
	_ "net/http/pprof"
)

func init() {
	go func() {
		log.Println("PPROF server starting on :6060 (loadtest build flag active)")
		if err := http.ListenAndServe("0.0.0.0:6060", nil); err != nil {
			log.Printf("PPROF server failed: %v", err)
		}
	}()
}
