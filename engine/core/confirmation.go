package core

// confirmation.go — Confirmation Dispatcher: the Shell that wires the pure
// state machine (machine.go / shell.go) to the real world.
//
// Architecture overview:
//
//   HandleSuccess / HandleFailure (dispatcher.go)
//       │
//       ▼
//   shardBuses[N]  (128 sharded buffered channels, one per monitor-shard)
//       │
//       ▼
//   State Worker (per shard, serializes events per monitor via StateStore)
//       │
//       ├── EffectPersistTransition  → persistBuses[N]  → Persist Worker
//       ├── EffectEmitAlert          → persistBuses[N]  → Persist Worker
//       ├── EffectScheduleDeadline   → Timers.Schedule
//       ├── EffectCancelHedge        → Timers.Cancel
//       ├── EffectRequestVotes       → VoteDispatcher
//       └── EffectLog                → log.Printf
//
// Persist Worker:
//   Writes to IncidentQueue (in-memory channel consumed by the alert sender).
//   If IncidentQueue is full after retries, the event is spooled to an in-memory
//   overflow list and retried in a background goroutine.  The persist worker
//   ALWAYS feeds EventPersistResult{Ok:true} back to the state worker after
//   accepting the job into the spool — queue-full is an infrastructure problem,
//   not a CAS epoch conflict.  EffectReloadState is reserved for real epoch
//   mismatches reported by the DB stub (FetchGroundTruth).
//
// Serialization contract:
//   Events for the SAME monitor are processed in arrival order: the sharded
//   bus guarantees FIFO per shard, and per-monitor entry locking in
//   StateStore.Apply ensures no interleaving.
//
// Scaling:
//   At 35K monitors @ 30s interval, the bus handles ~1,167 events/s steady-state.
//   During a mass outage the shard buses absorb the spike; the 5s fast-recheck
//   applies only for the first two failures per monitor.

import (
	"context"
	"hash/fnv"
	"log"
	"sync"
	"time"
)

// monitorEvent is a single state-machine input delivered to the confirmation bus.
type monitorEvent struct {
	monitorID string
	event     Event
}

const numShards = 128
var shardBuses [numShards]chan monitorEvent

type persistJob struct {
	monitorID string
	effect    Effect
}
var persistBuses [numShards]chan persistJob

// incidentSpool holds incidents that couldn't be delivered to IncidentQueue
// due to back-pressure. A background goroutine (started with a ctx in
// StartConfirmationDispatcher) drains and retries them every 500ms.
//
// FIFO contract: deliverOrSpool bypasses the spool ONLY when the spool is
// empty. If the spool is non-empty, every new event is appended, so DOWN
// can never overtake a queued UP.
//
// Cap: the spool is bounded at maxSpoolSize. Events beyond the cap trigger
// OnIncidentOverflow (dead-letter). This prevents unbounded growth during a
// sustained IncidentQueue consumer outage.
const maxSpoolSize = 50_000
var incidentSpool   []IncidentEvent
var incidentSpoolMu sync.Mutex

func init() {
	for i := 0; i < numShards; i++ {
		shardBuses[i] = make(chan monitorEvent, 1000)
		persistBuses[i] = make(chan persistJob, 1000)
	}
}

func getShard(monitorID string) int {
	h := fnv.New32a()
	h.Write([]byte(monitorID))
	return int(h.Sum32() % numShards)
}

// machineConfig is the global MachineConfig used by all monitors.
// Values: RecoveryN=2 (2 consecutive passes to recover), VoteDeadline=5s,
// RoundGrace=2s (force-close a stale open round after deadline+grace),
// BlockedNoticeN=3 (fire BLOCKED alert after 3 consecutive blocked checks).
var machineConfig = MachineConfig{
	RecoveryN:      2,
	VoteDeadline:   5 * time.Second,
	RoundGrace:     2 * time.Second,
	BlockedNoticeN: 3,
	SingleNodeMode: true,
}

// States is the authoritative StateStore for all monitors.
var States = NewStateStore()

// noopDB is a stub for the DatabaseStub interface.
// In production, EffectReloadState will be wired to db.FetchGroundTruth.
type noopDB struct{}
func (noopDB) FetchGroundTruth(monitorID string) MonitorState {
	// Fallback: return a fresh UP state. The next reconciliation loop will fix it.
	log.Printf("[WARN] EffectReloadState fired for %s but no DB stub is wired — using fresh UP state", monitorID)
	return MonitorState{ID: monitorID, Status: StatusUp}
}

var globalDB DatabaseStub = noopDB{}

// SetDatabaseStub wires the real Postgres ground-truth loader.
// Call this from main.go before StartConfirmationDispatcher.
func SetDatabaseStub(db DatabaseStub) {
	globalDB = db
}

func SubmitCheckResult(monitorID string, ev EventCheckResult) {
	if ev.ErrClass == ErrCanceled {
		return // Drop canceled checks completely
	}
	if ev.Ok || isConnectLevelError(ev.ErrClass) {
		Health.RecordResult(ev.Ok)
	}
	if !Health.IsHealthy() && !ev.Ok && isConnectLevelError(ev.ErrClass) {
		// Suppress primary failure if local node is suffering a network glitch
		return
	}
	shard := getShard(monitorID)
	me := monitorEvent{monitorID: monitorID, event: ev}

	select {
	case shardBuses[shard] <- me:
		return
	default:
	}

	// Bounded wait: failures get 10 ms (urgent), passes also get 10 ms.
	// A 2 s wait here stalls HTTP worker goroutines and drains the worker pool
	// during backpressure. Dropping a pass is safe — the monitor stays UP.
	timer := time.NewTimer(10 * time.Millisecond)
	defer timer.Stop()
	select {
	case shardBuses[shard] <- me:
	case <-timer.C:
		log.Printf("[WARN] shard %d bus full, dropping EventCheckResult for %s (Ok: %v)", shard, monitorID, ev.Ok)
	}
}

func SubmitVoteResult(monitorID string, ev EventVoteResult) {
	shard := getShard(monitorID)
	me := monitorEvent{monitorID: monitorID, event: ev}
	
	select {
	case shardBuses[shard] <- me:
		return
	default:
	}

	// Votes are critical, give them a longer wait
	timer := time.NewTimer(50 * time.Millisecond)
	defer timer.Stop()
	select {
	case shardBuses[shard] <- me:
	case <-timer.C:
		log.Printf("[WARN] shard %d bus full, dropping EventVoteResult for %s", shard, monitorID)
	}
}

var startDispatcherOnce sync.Once

// StartConfirmationDispatcher runs the shell event loop.
// It reads from confirmationBus and dispatches effects.
// workerCount controls how many parallel monitor events can be processed;
// since per-monitor ordering is enforced by the entry mutex, parallelism is safe.
func StartConfirmationDispatcher(ctx context.Context, wg *sync.WaitGroup, _ int) {
	startDispatcherOnce.Do(func() {
		Evidence.StartEvictionLoop(ctx)

		var stateWg sync.WaitGroup

		for i := 0; i < numShards; i++ {
			wg.Add(2) // 1 for state worker, 1 for persist worker
			stateWg.Add(1)
			shardID := i
			
			// Persist Outbox Worker
			go func() {
				defer wg.Done()
				for job := range persistBuses[shardID] {
					switch e := job.effect.(type) {
					case EffectPersistTransition:
						newStatus := string(e.NewState)
						cause := "Quorum: state machine transition"
						idemp := ""
						if e.Alert != nil {
							cause = string(e.Alert.Status)
							idemp = e.Alert.IdempotencyKey
						}
						evt := buildIncidentEvent(job.monitorID, idemp, string(e.OldState), newStatus, cause, "", e.IncidentStart, e.IncidentEnd)
						deliverOrSpool(evt)

						// NOTE: EventPersistResult feedback intentionally omitted.
						// It would always be Ok:true (queue-full != CAS conflict), so
						// the state machine never acts on it. A blocked send back into
						// shardBuses creates a deadlock cycle under backpressure.
						// Real epoch-mismatch needs FetchGroundTruth + epoch in Effect.

					case EffectEmitAlert:
						alertEvt := buildIncidentEvent(job.monitorID, e.Alert.IdempotencyKey,
							string(e.Alert.Status), string(e.Alert.Status),
							string(e.Alert.Status)+" notice", "", time.Now(), time.Time{})
						deliverOrSpool(alertEvt)
					}
				}
			}()

			// State Worker
			go func() {
				defer wg.Done()
				defer stateWg.Done()
				outbox := &Outbox{} // Still kept if States.Apply uses it, though we rely on persistBuses
				for {
					select {
					case <-ctx.Done():
						// Drain remaining events before exiting
						for {
							select {
							case me := <-shardBuses[shardID]:
								processMonitorEvent(me, outbox)
							default:
								return
							}
						}
					case me := <-shardBuses[shardID]:
						processMonitorEvent(me, outbox)
					}
				}
			}()
		}
	
	// Start the global stale round sweeper (fixes dropped EventVoteDeadline bugs)
	wg.Add(1)
	go func() {
		defer wg.Done()
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				States.GarbageCollectAndSweep(5*time.Minute, func(monID string) {
					shard := getShard(monID)
					select {
					case shardBuses[shard] <- monitorEvent{monitorID: monID, event: EventSweep{}}:
					default:
					}
				})
			}
		}
	}()
	// Spool drain goroutine: retries spooled incidents every 500 ms.
	// Started here (not in init) so it has a ctx for clean shutdown.
	wg.Add(1)
	go func() {
		defer wg.Done()
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()
		drainSpool := func() {
			incidentSpoolMu.Lock()
			defer incidentSpoolMu.Unlock()
			if len(incidentSpool) == 0 {
				return
			}
			remaining := incidentSpool[:0]
			for _, evt := range incidentSpool {
				select {
				case IncidentQueue <- evt:
					// delivered
				default:
					remaining = append(remaining, evt)
				}
			}
			incidentSpool = remaining
			if len(incidentSpool) > 0 {
				log.Printf("[WARN] incident spool still has %d undelivered events", len(incidentSpool))
			}
		}
		for {
			select {
			case <-ctx.Done():
				// Final flush: drain whatever is left before this goroutine exits.
				drainSpool()
				return
			case <-ticker.C:
				drainSpool()
			}
		}
	}()
	// Closer: wait for state workers to drain, then close persistBuses so
	// persist workers can exit cleanly.
	go func() {
		<-ctx.Done()
		stateWg.Wait()
		for i := 0; i < numShards; i++ {
			close(persistBuses[i])
		}
	}()
	})
}

func processMonitorEvent(me monitorEvent, outbox *Outbox) {
	events := []Event{me.event}
	for len(events) > 0 {
		ev := events[0]
		events = events[1:]
		
		switch evTyped := ev.(type) {
		case EventCheckResult:
			if !evTyped.Ok && isConnectLevelError(evTyped.ErrClass) {
				if m := Store.Get(me.monitorID); m != nil {
					ip, port := GetEvidenceIPAndPort(m)
					if ip != "" {
						Evidence.Record(ip, port, evTyped.PoP, evTyped.ASN, evTyped.ErrClass)
					}
				}
			}
		case EventVoteResult:
			if !evTyped.Ok && isConnectLevelError(evTyped.ErrClass) && !evTyped.FromCache {
				if m := Store.Get(me.monitorID); m != nil {
					ip, port := GetEvidenceIPAndPort(m)
					if ip != "" {
						Evidence.Record(ip, port, evTyped.PoP, evTyped.ASN, evTyped.ErrClass)
					}
				}
			}
		}

		effects := States.Apply(me.monitorID, ev, machineConfig, outbox, globalDB)
		newEvents := dispatchEffects(me.monitorID, effects)
		events = append(events, newEvents...)
	}
}

func dispatchEffects(monitorID string, effects []Effect) []Event {
	var localEvents []Event
	for _, eff := range effects {
		switch e := eff.(type) {

		case EffectScheduleDeadline:
			Timers.Schedule(monitorID, e.Epoch, e.Round, e.After, func(ev EventVoteDeadline) {
				shard := getShard(monitorID)
				me := monitorEvent{monitorID: monitorID, event: ev}
				select {
				case shardBuses[shard] <- me:
					return
				default:
				}
				timer := time.NewTimer(50 * time.Millisecond)
				defer timer.Stop()
				select {
				case shardBuses[shard] <- me:
				case <-timer.C:
					log.Printf("[WARN] shard %d bus full, dropped EventVoteDeadline for %s", shard, monitorID)
				}
			})

		case EffectCancelHedge:
			// Disarm any pending deadline timer for this monitor.
			Timers.Cancel(monitorID)

		case EffectRequestVotes:
			// Dispatch secondary probes to confirm/deny the failure.
			if ev := VoteDispatch(monitorID, e); ev != nil {
				localEvents = append(localEvents, *ev)
			}

		case EffectPersistTransition:
			shard := getShard(monitorID)
			persistBuses[shard] <- persistJob{monitorID: monitorID, effect: e}

		case EffectEmitAlert:
			shard := getShard(monitorID)
			persistBuses[shard] <- persistJob{monitorID: monitorID, effect: e}

		case EffectLog:
			log.Printf("[machine/%s] %s", monitorID, e.Message)

		case EffectReloadState:
			// Handled inside StateStore.Apply — no extra action needed here.
		}
	}
	return localEvents
}
