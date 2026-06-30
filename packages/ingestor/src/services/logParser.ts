import { LRUCache } from 'lru-cache';

// Simple native fallback for Grok compilation since grok-js fails on Windows
function compileGrokToRegex(pattern: string): RegExp {
  let regexStr = pattern;
  // Map common Grok patterns to regex
  const replacements = {
    '%{IP:([^}]+)}': '(?<$1>(?:[0-9]{1,3}\\.){3}[0-9]{1,3})',
    '%{WORD:([^}]+)}': '(?<$1>\\b\\w+\\b)',
    '%{NUMBER:([^}]+)}': '(?<$1>\\d+)',
    '%{GREEDYDATA:([^}]+)}': '(?<$1>.*)',
    '%{TIMESTAMP_ISO8601:([^}]+)}': '(?<$1>\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2}))',
    '%{HTTPDATE:([^}]+)}': '(?<$1>\\d{2}/[A-Z][a-z]{2}/\\d{4}:\\d{2}:\\d{2}:\\d{2} [+-]\\d{4})'
  };
  
  for (const [grok, regex] of Object.entries(replacements)) {
    regexStr = regexStr.replace(new RegExp(grok, 'g'), regex);
  }
  return new RegExp(regexStr);
}

interface PipelineRule {
  _id: string;
  name: string;
  patternType: 'regex' | 'grok';
  pattern: string;
  active: boolean;
}

interface ParsedPipeline {
  rule: PipelineRule;
  regex?: RegExp;
  grokPattern?: any;
}

const cache = new LRUCache<string, ParsedPipeline[]>({
  max: 500, // store pipelines for 500 active projects
  ttl: 1000 * 60, // 1 minute TTL
});

// Prevent Cache Stampede: track in-flight requests to the backend
const inFlightRequests = new Map<string, Promise<ParsedPipeline[]>>();

export async function parseMessage(projectId: string, message: string): Promise<Record<string, string> | null> {
  if (!message) return null;

  // ReDoS Protection: Restrict parsing to the first 2000 characters
  // Extremely long log lines (e.g. stack traces or minified JSON) exponentially increase regex evaluation time.
  const safeMessage = message.length > 2000 ? message.substring(0, 2000) : message;

  let pipelines = cache.get(projectId);
  
  if (!pipelines) {
    if (inFlightRequests.has(projectId)) {
      // Wait for the existing request to finish instead of hammering the API
      pipelines = await inFlightRequests.get(projectId);
    } else {
      const promise = fetchPipelines(projectId);
      inFlightRequests.set(projectId, promise);
      pipelines = await promise;
      inFlightRequests.delete(projectId);
      cache.set(projectId, pipelines || []);
    }
  }

  if (!pipelines || pipelines.length === 0) return null;

  for (const p of pipelines) {
    try {
      if (p.rule.patternType === 'regex' && p.regex) {
        const match = safeMessage.match(p.regex);
        if (match && match.groups) {
          // Sanitize groups: remove undefined, convert all to string
          const sanitized: Record<string, string> = {};
          for (const [k, v] of Object.entries(match.groups)) {
            if (v !== undefined && v !== null) {
              sanitized[k] = String(v);
            }
          }
          if (Object.keys(sanitized).length > 0) return sanitized;
        }
      } else if (p.rule.patternType === 'grok' && p.regex) {
        // We compile Grok into a native Regex and use it the same way!
        const match = safeMessage.match(p.regex);
        if (match && match.groups) {
          const sanitized: Record<string, string> = {};
          for (const [k, v] of Object.entries(match.groups)) {
            if (v !== undefined && v !== null) {
              sanitized[k] = String(v);
            }
          }
          if (Object.keys(sanitized).length > 0) return sanitized;
        }
      }
    } catch (err) {
      // Ignore parsing errors (e.g. timeout or mismatch) and try next pipeline
      continue;
    }
  }

  return null; // no pipelines matched
}

async function fetchPipelines(projectId: string): Promise<ParsedPipeline[]> {
  try {
    const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/internal/projects/${projectId}/log-pipelines`;
    const secret = process.env.INTERNAL_API_SECRET || '';

    const res = await fetch(url, {
      headers: {
        'x-internal-secret': secret,
      },
    });

    if (!res.ok) {
      return [];
    }

    const rules: PipelineRule[] = await res.json();
    
    // Pre-compile regex and grok patterns
    const parsed: ParsedPipeline[] = [];
    for (const rule of rules) {
      try {
        if (rule.patternType === 'regex') {
          parsed.push({
            rule,
            regex: new RegExp(rule.pattern)
          });
        } else if (rule.patternType === 'grok') {
          parsed.push({
            rule,
            regex: compileGrokToRegex(rule.pattern)
          });
        }
      } catch (err) {
        console.warn(`[LogParser] Failed to compile pattern for pipeline ${rule.name}:`, err);
      }
    }

    return parsed;
  } catch (err) {
    console.error(`[LogParser] Error fetching pipelines for ${projectId}:`, err);
    return [];
  }
}
