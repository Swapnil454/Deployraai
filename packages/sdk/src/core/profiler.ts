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
    
    // Start the first profiling session
    pprof.time.start(1000000, 10000); // interval: 1000us (1ms), duration is arbitrary since we control when to stop

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
      // Stop current profile and start next one immediately
      const profile = pprof.time.stop();
      pprof.time.start(1000000, 10000); 

      // Serialize profile to protobuf
      const buffer = await pprof.encode(profile);

      // pprof.encode already gzip compresses it!
      await fetch(this.options.ingestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-protobuf',
          'X-Project-ID': this.options.projectId,
          'X-Service-Name': this.options.serviceName,
          'X-Profile-Type': 'cpu'
        },
        body: buffer as any
      });
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
