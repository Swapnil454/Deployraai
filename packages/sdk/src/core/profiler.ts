import * as pprof from 'pprof';

export interface ProfilerOptions {
  enabled?: boolean;
  ingestUrl?: string;
  projectId: string;
  serviceName: string;
  flushIntervalMs?: number;
}

export class ContinuousProfiler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private options: Required<ProfilerOptions>;
  private stopCpuProfile: (() => any) | null = null;

  constructor(options: ProfilerOptions) {
    this.options = {
      enabled: options.enabled ?? false,
      ingestUrl: options.ingestUrl || 'http://localhost:4317/v1/profiles',
      projectId: options.projectId,
      serviceName: options.serviceName,
      flushIntervalMs: options.flushIntervalMs || 10000,
    };
  }

  public start() {
    if (!this.options.enabled) return;
    
    // Start the first profiling session (interval: 1000us / 1ms)
    this.stopCpuProfile = pprof.time.start(1000, 'cpu');
    pprof.heap.start(512 * 1024, 64); // start heap allocation profiling (intervalBytes: 512KB, stackDepth: 64)

    this.timer = setInterval(async () => {
      await this.flush();
    }, this.options.flushIntervalMs);
    
    console.log(`[TracePilot Node] Continuous profiling started for ${this.options.serviceName}`);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async flush() {
    try {
      // Stop current CPU profile and start next one immediately
      let cpuProfile;
      if (this.stopCpuProfile) {
        cpuProfile = this.stopCpuProfile();
      }
      this.stopCpuProfile = pprof.time.start(1000, 'cpu');

      // Capture current Heap memory profile (runs continuously)
      const memProfile = pprof.heap.profile();

      // Serialize profiles to protobuf
      const [cpuBuffer, memBuffer] = await Promise.all([
        pprof.encode(cpuProfile),
        pprof.encode(memProfile)
      ]);

      // Flush both profiles to ingestor
      await Promise.all([
        fetch(this.options.ingestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-protobuf',
            'X-Project-ID': this.options.projectId,
            'X-Service-Name': this.options.serviceName,
            'X-Profile-Type': 'cpu'
          },
          body: cpuBuffer as any
        }),
        fetch(this.options.ingestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-protobuf',
            'X-Project-ID': this.options.projectId,
            'X-Service-Name': this.options.serviceName,
            'X-Profile-Type': 'memory'
          },
          body: memBuffer as any
        })
      ]);
    } catch (err: any) {
      // Suppress connection errors if backend goes down temporarily
      if (err.cause?.code === 'ECONNREFUSED' || err.code === 'ECONNREFUSED') {
        console.warn(`[TracePilot Node] Profiler backend unreachable: ${this.options.ingestUrl}`);
      } else {
        console.error('[TracePilot Node] Profiler flush failed:', err);
      }
    }
  }
}
