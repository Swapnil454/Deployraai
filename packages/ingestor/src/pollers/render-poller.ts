import { logWriter } from '../writers/logs.js';

function normalizeRenderLog(line: string, projectId: string) {
  // Try to parse Render's log format (usually looks like: `[timestamp] level: message`)
  // Fallback to raw line if unparseable
  let timestamp = new Date();
  let message = line;
  let level: 'info' | 'error' | 'warn' | 'debug' = 'info';

  try {
    const jsonMatch = line.match(/^({.*})$/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.timestamp) timestamp = new Date(parsed.timestamp);
      if (parsed.message) message = parsed.message;
      if (parsed.level) {
        const l = parsed.level.toLowerCase();
        if (l.includes('err') || l.includes('fatal')) level = 'error';
        else if (l.includes('warn')) level = 'warn';
        else if (l.includes('debug')) level = 'debug';
      }
    }
  } catch (e) {
    // If not JSON, use simple string matching
    const lower = line.toLowerCase();
    if (lower.includes('error') || lower.includes('exception')) level = 'error';
    else if (lower.includes('warn')) level = 'warn';
  }

  return {
    projectId,
    source: 'render',
    timestamp,
    message,
    level,
    requestId: null,
    region: 'unknown',
    deployId: 'unknown',
    raw: line,
  };
}

class RenderPollerRegistry {
  private pollers = new Map<string, AbortController>();

  start(projectId: string, renderToken: string, serviceId: string) {
    if (this.pollers.has(projectId)) return; // already polling

    const controller = new AbortController();
    this.pollers.set(projectId, controller);

    this.poll(projectId, renderToken, serviceId, controller.signal);
  }

  stop(projectId: string) {
    this.pollers.get(projectId)?.abort();
    this.pollers.delete(projectId);
  }

  private async poll(projectId: string, token: string, serviceId: string, signal: AbortSignal) {
    try {
      const res = await fetch(
        `https://api.render.com/v1/services/${serviceId}/logs?tail=true`,
        { headers: { Authorization: `Bearer ${token}` }, signal }
      );

      if (!res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
            console.log(`[RenderPoller] Stream gracefully closed by provider for ${projectId}, reconnecting in 5s...`);
            if (!signal.aborted) setTimeout(() => this.poll(projectId, token, serviceId, signal), 5000);
            break;
        }
        if (signal.aborted) break;

        const lines = decoder.decode(value).split('\n').filter(Boolean);
        if (lines.length > 0) {
            await logWriter.write(lines.map(l => normalizeRenderLog(l, projectId))).catch(() => {});
        }
      }
    } catch (err) {
      if (!signal.aborted) {
        console.error(`[RenderPoller] Connection dropped for ${projectId}, reconnecting in 5s...`);
        // Connection dropped — reconnect after 5s
        setTimeout(() => this.poll(projectId, token, serviceId, signal), 5000);
      }
    }
  }
}

export const renderPollerRegistry = new RenderPollerRegistry();
