import { clickhouse } from '../clickhouse.js';

export interface MetricRecord {
  projectId: string;
  timestamp: Date;
  metricName: string;
  metricType: string;
  value: number;
  hostName: string;
  k8sPodName: string;
  k8sNamespaceName: string;
  containerName: string;
  attributes: Record<string, string>;
}

class MetricsWriter {
  private buffer: MetricRecord[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 5000;
  private readonly FLUSH_INTERVAL_MS = 2000;
  private isFlushing = false;

  write(metrics: MetricRecord[]): Promise<void> {
    if (this.buffer.length > 100000) {
      console.warn('[MetricsWriter] Load shedding: Buffer exceeded 100,000 items, dropping incoming batch to prevent OOM.');
      return Promise.resolve();
    }

    this.buffer.push(...metrics);

    if (this.buffer.length >= this.BATCH_SIZE) {
      this.flush().catch(err => console.error('[MetricsWriter] Unhandled flush error:', err));
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush().catch(err => console.error('[MetricsWriter] Unhandled flush timer error:', err)), this.FLUSH_INTERVAL_MS);
    }

    return Promise.resolve();
  }

  private async flush(): Promise<void> {
    if (this.isFlushing) return;
    this.isFlushing = true;
    
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    try {
      while (this.buffer.length > 0) {
        const batch = this.buffer.splice(0, this.BATCH_SIZE);
        if (batch.length === 0) break;

        const chBatch = batch.map(m => ({
          project_id: m.projectId,
          timestamp: m.timestamp.getTime(),
          metric_name: m.metricName,
          metric_type: m.metricType,
          host_name: m.hostName,
          k8s_pod_name: m.k8sPodName,
          k8s_namespace_name: m.k8sNamespaceName,
          container_name: m.containerName,
          value: m.value,
          attributes: m.attributes
        }));

        try {
          if (chBatch.length > 0) {
            await clickhouse.insert({
              table: 'infrastructure_metrics',
              values: chBatch,
              format: 'JSONEachRow'
            });
          }
        } catch (chErr: any) {
          console.error('[MetricsWriter] Clickhouse unavailable or failed insertion:', chErr.message);
          
          this.buffer.unshift(...batch);
          if (this.buffer.length > 100000) {
            console.warn('[MetricsWriter] Buffer exceeded 100,000 items, dropping oldest metrics to prevent OOM.');
            this.buffer.splice(0, this.buffer.length - 100000);
          }
          break;
        }
      }
    } finally {
      this.isFlushing = false;
      if (this.buffer.length > 0 && !this.flushTimer) {
        this.flushTimer = setTimeout(() => this.flush().catch(err => console.error('[MetricsWriter] Unhandled flush timer error:', err)), this.FLUSH_INTERVAL_MS);
      }
    }
  }
}

export const metricsWriter = new MetricsWriter();
