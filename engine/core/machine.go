package core

import (
	"fmt"
	"time"
)

type Status string
const (
	StatusUp       Status = "UP"
	StatusDown     Status = "DOWN"
	StatusDegraded Status = "DEGRADED"
	StatusBlocked     Status = "BLOCKED"
	StatusConfigError Status = "CONFIG_ERROR"
)

type Role string
const (
	RolePrimary Role = "PRIMARY"
	RoleVoter   Role = "VOTER"
	RoleHedge   Role = "HEDGE"
)

type ErrClass string
const (
	ErrNone      ErrClass = ""
	ErrTimeout   ErrClass = "TIMEOUT"
	ErrBlocked   ErrClass = "BLOCKED"
	ErrNet       ErrClass = "NETWORK"
	ErrTLS       ErrClass = "TLS"
	ErrStatus    ErrClass = "STATUS"
	ErrKeyword   ErrClass = "KEYWORD"
	ErrDegraded  ErrClass = "DEGRADED"
	ErrRedirect  ErrClass = "REDIRECT"
	ErrDNS       ErrClass = "DNS"
	ErrSSRF      ErrClass = "SSRF"
	ErrUnsupported ErrClass = "UNSUPPORTED"
	ErrCanceled    ErrClass = "CANCELED"
	ErrRefused     ErrClass = "REFUSED"
	ErrSlow        ErrClass = "SLOW"
	ErrConfig      ErrClass = "CONFIG_ERROR"
)

func (e ErrClass) ToOk() bool {
	return e == ErrNone || e == ErrDegraded
}

type MachineConfig struct {
	RecoveryN      int
	VoteDeadline   time.Duration
	RoundGrace     time.Duration
	BlockedNoticeN int
	SingleNodeMode bool
}

type MonitorState struct {
	ID                 string
	Status             Status
	Epoch              uint64
	Round              uint64
	RoundOpen          bool
	RoundOpenedAt      time.Time
	FirstFailAt        time.Time
	IncidentStart      time.Time
	FirstPassAt        time.Time
	ConsecutivePass    int
	ConsecutiveBlocked int
	ConsecutiveFails   int
	VotesRequested     int
	Votes              map[string]Vote // keyed by PoP, first write wins
	HedgeInFlight      bool
}

type Vote struct {
	PoP   string
	ASN   string
	Epoch    uint64
	Round    uint64
	Ok       bool
	ErrClass ErrClass
}

// Events
type Event interface{ isEvent() }

type EventCheckResult struct {
	Role     Role
	PoP      string
	ASN      string
	Ok       bool
	ErrClass ErrClass
}
func (e EventCheckResult) isEvent() {}

type EventVoteResult struct {
	PoP   string
	ASN   string
	Epoch    uint64
	Round    uint64
	Ok       bool
	ErrClass ErrClass
	FromCache bool
}
func (e EventVoteResult) isEvent() {}

type EventHedgeTimerFired struct {
	Epoch uint64
	Round uint64
}
func (e EventHedgeTimerFired) isEvent() {}

type EventVoteDeadline struct {
	Epoch uint64
	Round uint64
}
func (e EventVoteDeadline) isEvent() {}

type EventPersistResult struct {
	Ok bool
}
func (e EventPersistResult) isEvent() {}

type EventSweep struct{}
func (e EventSweep) isEvent() {}

// Effects
type Effect interface{ isEffect() }

type EffectRequestVotes struct {
	Epoch       uint64
	Round       uint64
	Count         int
	ExcludePoPs   []string
	ExcludeASNs   []string
	RoundOpenedAt time.Time
}
func (e EffectRequestVotes) isEffect() {}

type EffectCancelHedge struct{}
func (e EffectCancelHedge) isEffect() {}

type EffectScheduleDeadline struct {
	Epoch uint64
	Round uint64
	After time.Duration
}
func (e EffectScheduleDeadline) isEffect() {}

type EffectReloadState struct{}
func (e EffectReloadState) isEffect() {}

type AlertPayload struct {
	IdempotencyKey string
	Status         Status
}

type EffectEmitAlert struct {
	Alert AlertPayload
}
func (e EffectEmitAlert) isEffect() {}

type EffectPersistTransition struct {
	ExpectedEpoch uint64
	OldState      Status
	NewState      Status
	IncidentStart time.Time
	IncidentEnd   time.Time
	Alert         *AlertPayload
}
func (e EffectPersistTransition) isEffect() {}

type EffectLog struct {
	Message string
}
func (e EffectLog) isEffect() {}


// Step executes the pure state machine logic.
func Step(state MonitorState, event Event, now time.Time, cfg MachineConfig) (MonitorState, []Effect) {
	var effects []Effect

	mutatedVotes := false
	cloneVotes := func() {
		if !mutatedVotes {
			newVotes := make(map[string]Vote)
			for k, v := range state.Votes {
				newVotes[k] = v
			}
			state.Votes = newVotes
			mutatedVotes = true
		}
	}

	closeRound := func(s *MonitorState, fx *[]Effect) {
		s.RoundOpen = false
		if s.HedgeInFlight {
			s.HedgeInFlight = false
			*fx = append(*fx, EffectCancelHedge{})
		}
		if mutatedVotes {
			s.Votes = make(map[string]Vote)
		} else if len(s.Votes) > 0 {
			cloneVotes()
			s.Votes = make(map[string]Vote)
		}
		s.VotesRequested = 0
	}

	// 3. Round lifetime enforcement on ANY event
	if state.RoundOpen {
		if now.Sub(state.RoundOpenedAt) > (cfg.VoteDeadline + cfg.RoundGrace) {
			effects = append(effects, EffectLog{Message: "round force-closed due to age"})
			closeRound(&state, &effects)
		}
	}

	switch ev := event.(type) {

	case EventPersistResult:
		if !ev.Ok {
			effects = append(effects, EffectReloadState{})
		}
		return state, effects

	case EventCheckResult:
		if ev.Role == RolePrimary {
			
			if ev.ErrClass == ErrBlocked || ev.ErrClass == ErrConfig {
				// 4. BLOCKED/CONFIG: silent from UP. From DOWN stays DOWN. 
				// Never closes an incident. Persistent BLOCKED sends a single notice.
				closeRound(&state, &effects)
				state.ConsecutiveFails = 0
				state.ConsecutivePass = 0
				
				targetStatus := StatusBlocked
				if ev.ErrClass == ErrConfig {
					targetStatus = StatusConfigError
				}
				
				if state.Status != StatusDown && state.Status != targetStatus {
					oldState := state.Status
					state.Status = targetStatus
					state.Epoch++
					state.ConsecutiveBlocked = 1
					effects = append(effects, EffectPersistTransition{
						ExpectedEpoch: state.Epoch - 1,
						OldState:      oldState,
						NewState:      targetStatus,
					})
				} else if state.Status == targetStatus {
					state.ConsecutiveBlocked++
					if state.ConsecutiveBlocked == cfg.BlockedNoticeN {
						effects = append(effects, EffectEmitAlert{
							Alert: AlertPayload{
								IdempotencyKey: fmt.Sprintf("%s-%d-%s", state.ID, state.Epoch, targetStatus),
								Status:         targetStatus,
							},
						})
					}
				}
				return state, effects
			}
			state.ConsecutiveBlocked = 0

			if ev.Ok {
				closeRound(&state, &effects)
				state.ConsecutiveFails = 0

				if state.Status == StatusDown {
					if state.ConsecutivePass == 0 {
						state.FirstPassAt = now
					}
					state.ConsecutivePass++
					
					if state.ConsecutivePass >= cfg.RecoveryN {
						state.Status = StatusUp
						state.Epoch++
						
						alert := &AlertPayload{
							IdempotencyKey: fmt.Sprintf("%s-%d-%s", state.ID, state.Epoch, StatusUp),
							Status:         StatusUp,
						}
						
						effects = append(effects, EffectPersistTransition{
							ExpectedEpoch: state.Epoch - 1,
							OldState:      StatusDown,
							NewState:      StatusUp,
							IncidentStart: state.IncidentStart,
							IncidentEnd:   state.FirstPassAt,
							Alert:         alert,
						})
						state.IncidentStart = time.Time{}
						state.ConsecutivePass = 0
					}
				} else if state.Status != StatusUp {
					oldState := state.Status
					state.Status = StatusUp
					state.Epoch++
					effects = append(effects, EffectPersistTransition{
						ExpectedEpoch: state.Epoch - 1,
						OldState:      oldState,
						NewState:      StatusUp,
					})
					state.ConsecutivePass = 0
				} else {
					state.ConsecutivePass = 0
				}
				
			} else {
				// Primary Failed (Standard Failure)
				if cfg.SingleNodeMode {
					if state.Status == StatusDown {
						state.ConsecutivePass = 0
						return state, effects
					}
					
					if state.ConsecutiveFails == 0 {
						state.FirstFailAt = now
					}
					state.ConsecutiveFails++
					if state.ConsecutiveFails >= 2 {
						oldState := state.Status
						state.Status = StatusDown
						state.Epoch++
						state.IncidentStart = state.FirstFailAt
						state.ConsecutiveFails = 0
						state.ConsecutivePass = 0
						
						alert := &AlertPayload{
							IdempotencyKey: fmt.Sprintf("%s-%d-%s", state.ID, state.Epoch, StatusDown),
							Status:         StatusDown,
						}
						effects = append(effects, EffectPersistTransition{
							ExpectedEpoch: state.Epoch - 1,
							OldState:      oldState,
							NewState:      StatusDown,
							IncidentStart: state.IncidentStart,
							Alert:         alert,
						})
					}
					return state, effects
				}

				if state.Status != StatusDown {
					if !state.RoundOpen {
						state.Round++
						state.RoundOpen = true
						state.RoundOpenedAt = now
						state.FirstFailAt = now
						state.VotesRequested = 0
						effects = append(effects, EffectScheduleDeadline{
							Epoch: state.Epoch,
							Round: state.Round,
							After: cfg.VoteDeadline,
						})
					} else if state.FirstFailAt.IsZero() {
						state.FirstFailAt = now 
					}
					
					cloneVotes()
					if _, exists := state.Votes[ev.PoP]; !exists {
						state.Votes[ev.PoP] = Vote{PoP: ev.PoP, ASN: ev.ASN, Epoch: state.Epoch, Round: state.Round, Ok: false}
					}
					
					needed := 2 - state.VotesRequested
					if needed > 0 {
						effects = append(effects, EffectRequestVotes{
							Epoch:         state.Epoch,
							Round:         state.Round,
							Count:         needed,
							ExcludePoPs:   []string{ev.PoP},
							ExcludeASNs:   []string{ev.ASN},
							RoundOpenedAt: state.RoundOpenedAt,
						})
						state.VotesRequested += needed
					}
				} else {
					// 5. Recovery: While DOWN, uncorroborated failure is logged, counter kept.
					// If counter is already 0, there is nothing to reset, so no need to fan out.
					if state.ConsecutivePass == 0 {
						return state, effects
					}

					if !state.RoundOpen {
						state.Round++
						state.RoundOpen = true
						state.RoundOpenedAt = now
						state.FirstFailAt = now
						state.VotesRequested = 0
						effects = append(effects, EffectScheduleDeadline{
							Epoch: state.Epoch,
							Round: state.Round,
							After: cfg.VoteDeadline,
						})
					}
					
					cloneVotes()
					if _, exists := state.Votes[ev.PoP]; !exists {
						state.Votes[ev.PoP] = Vote{PoP: ev.PoP, ASN: ev.ASN, Epoch: state.Epoch, Round: state.Round, Ok: false}
					}
					
					needed := 2 - state.VotesRequested
					if needed > 0 {
						effects = append(effects, EffectRequestVotes{
							Epoch:         state.Epoch,
							Round:         state.Round,
							Count:         needed,
							ExcludePoPs:   []string{ev.PoP},
							ExcludeASNs:   []string{ev.ASN},
							RoundOpenedAt: state.RoundOpenedAt,
						})
						state.VotesRequested += needed
					}
				}
			}
		}

	case EventVoteResult:
		if ev.Epoch != state.Epoch || ev.Round != state.Round || !state.RoundOpen {
			return state, effects
		}
		
		cloneVotes()
		if _, exists := state.Votes[ev.PoP]; !exists {
			state.Votes[ev.PoP] = Vote{
				PoP:      ev.PoP,
				ASN:      ev.ASN,
				Epoch:    ev.Epoch,
				Round:    ev.Round,
				Ok:       ev.Ok,
				ErrClass: ev.ErrClass,
			}
		}
		state, effects = evaluateQuorum(state, effects, now, closeRound, cfg)

	case EventVoteDeadline:
		if ev.Epoch != state.Epoch || ev.Round != state.Round || !state.RoundOpen {
			return state, effects
		}
		
		state, effects = evaluateQuorum(state, effects, now, closeRound, cfg)
		if state.RoundOpen {
			effects = append(effects, EffectLog{Message: "quorum unavailable"})
			closeRound(&state, &effects)
		}
		
	case EventHedgeTimerFired:
		if cfg.SingleNodeMode {
			return state, effects
		}
		if ev.Epoch == state.Epoch {
			// If timer is for the next round and it hasn't opened yet
			if !state.RoundOpen && (state.Status == StatusUp || state.Status == StatusBlocked) && ev.Round == state.Round+1 {
				state.Round++
				state.RoundOpen = true
				state.RoundOpenedAt = now
				state.FirstFailAt = time.Time{}
				state.HedgeInFlight = true
				state.VotesRequested = 0
				
				effects = append(effects, EffectScheduleDeadline{
					Epoch: state.Epoch,
					Round: state.Round,
					After: cfg.VoteDeadline,
				})
				
				needed := 1
				effects = append(effects, EffectRequestVotes{
					Epoch:         state.Epoch,
					Round:         state.Round,
					Count:         needed,
					RoundOpenedAt: state.RoundOpenedAt,
				})
				state.VotesRequested += needed
			}
			// If round is open but hedge fired later, and we haven't set HedgeInFlight, 
			// and no primary failure has happened (but primary failure opens round without HedgeInFlight).
			// Actually, a timer for a round that already has a primary vote is ignored.
		}
	}

	return state, effects
}

func evaluateQuorum(state MonitorState, effects []Effect, now time.Time, closeRound func(*MonitorState, *[]Effect), cfg MachineConfig) (MonitorState, []Effect) {
	if cfg.SingleNodeMode {
		closeRound(&state, &effects)
		return state, effects
	}

	failingASNs := make(map[string]bool)
	passingASNs := make(map[string]bool)

	for _, v := range state.Votes {
		if v.Ok {
			passingASNs[v.ASN] = true
		} else if v.ErrClass != ErrBlocked {
			failingASNs[v.ASN] = true
		}
	}
	
	// A passing vote in an ASN overrides a failing vote in the same ASN
	for asn := range passingASNs {
		delete(failingASNs, asn)
	}

	if state.Status == StatusDown {
		// Recovery check: if corroborated failure, reset pass count
		if len(failingASNs) >= 2 {
			state.ConsecutivePass = 0
			closeRound(&state, &effects)
		} else if len(passingASNs) >= 2 {
			effects = append(effects, EffectLog{Message: "uncorroborated failure while DOWN"})
			closeRound(&state, &effects)
		}
		return state, effects
	}

	if len(failingASNs) >= 2 {
		goto TransitionDown
	}
	if len(passingASNs) >= 2 {
		state.ConsecutiveFails = 0
		closeRound(&state, &effects)
		return state, effects
	}

	return state, effects

TransitionDown:
	oldState := state.Status
	state.Status = StatusDown
	state.Epoch++
	if state.FirstFailAt.IsZero() {
		state.IncidentStart = now
	} else {
		state.IncidentStart = state.FirstFailAt
	}
	
	effects = append(effects, EffectPersistTransition{
		ExpectedEpoch: state.Epoch - 1,
		OldState:      oldState,
		NewState:      StatusDown,
		IncidentStart: state.IncidentStart,
		Alert: &AlertPayload{
			IdempotencyKey: fmt.Sprintf("%s-%d-%s", state.ID, state.Epoch, StatusDown),
			Status:         StatusDown,
		},
	})
	closeRound(&state, &effects)
	return state, effects
}
