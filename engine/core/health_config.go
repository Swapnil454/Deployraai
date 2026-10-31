package core

import (
	"os"
	"strconv"
)

// Local-outage guard tunables. Defaults reproduce the original behaviour:
// 30 s window, unhealthy above 60% failures, recovered below 30%, >=500 samples.
type healthConfig struct {
	window       int64
	unhealthy    float64
	recoverBelow float64
	minSample    uint32
}

var hc = parseHealthConfig(os.Getenv)

func parseHealthConfig(getenv func(string) string) healthConfig {
	c := healthConfig{window: 30, unhealthy: 0.60, recoverBelow: 0.30, minSample: 500}
	if v, err := strconv.Atoi(getenv("HEALTH_WINDOW_SECS")); err == nil && v >= 1 && v <= 30 {
		c.window = int64(v)
	}
	if v, err := strconv.ParseFloat(getenv("HEALTH_UNHEALTHY_RATIO"), 64); err == nil && v > 0 && v <= 1 {
		c.unhealthy = v
	}
	if v, err := strconv.ParseFloat(getenv("HEALTH_RECOVER_RATIO"), 64); err == nil && v > 0 && v < 1 {
		c.recoverBelow = v
	}
	if v, err := strconv.Atoi(getenv("HEALTH_MIN_SAMPLES")); err == nil && v >= 1 {
		c.minSample = uint32(v)
	}
	if c.recoverBelow >= c.unhealthy {
		c.recoverBelow = c.unhealthy / 2
	}
	return c
}
