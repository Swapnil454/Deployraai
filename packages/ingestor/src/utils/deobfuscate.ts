import { SourceMapConsumer } from 'source-map';
// @ts-ignore
import LRUCache from 'lru-cache';
import { db } from '../db.js';

// Cache: key = "projectId:deployId:fileName", value = SourceMapConsumer
// Max 50 entries × ~3MB each = ~150MB RAM max — acceptable for ingestor
const mapCache = new LRUCache<string, SourceMapConsumer>({
  max: 50,
  dispose: (consumer: SourceMapConsumer) => {
    // Free WASM memory when evicted from cache (if using v0.7.x)
    if (typeof (consumer as any).destroy === 'function') {
      (consumer as any).destroy();
    }
  },
});

async function getConsumer(projectId: string, deployId: string, fileName: string): Promise<SourceMapConsumer | null> {
  const cacheKey = `${projectId}:${deployId}:${fileName}`;

  if (mapCache.has(cacheKey)) {
    return mapCache.get(cacheKey)!;
  }

  const result = await db.query(
    'SELECT map_content FROM sourcemaps WHERE project_id=$1 AND deploy_id=$2 AND file_name=$3',
    [projectId, deployId, fileName]
  );

  if (!result.rows[0]) return null;

  const rawMap = JSON.parse(result.rows[0].map_content);
  const consumer = await new SourceMapConsumer(rawMap);

  mapCache.set(cacheKey, consumer);
  return consumer;
}

export async function deobfuscateStackTrace(
  stackTrace: string,
  projectId: string,
  deployId: string
): Promise<{ deobfuscated: string; status: string }> {
  if (!deployId) return { deobfuscated: stackTrace, status: 'missing_deploy_id' };
  if (!stackTrace) return { deobfuscated: stackTrace, status: 'missing_stacktrace' };

  const frameRegex = /at .+ \((.+):(\d+):(\d+)\)/g;
  let result = stackTrace;
  
  const replacements: { original: string, mapped: string }[] = [];

  let match;
  const regex = new RegExp(frameRegex);
  
  let mapAttempted = false;
  let mapSuccess = false;
  let mapFailed = false;
  let mapMissing = false;

  while ((match = regex.exec(stackTrace)) !== null) {
    mapAttempted = true;
    const fullMatch = match[0];
    const filePath = match[1];
    const line = parseInt(match[2], 10);
    const col = parseInt(match[3], 10);

    const fileName = filePath.split('/').pop() + '.map';

    try {
      const consumer = await getConsumer(projectId, deployId, fileName);
      if (!consumer) {
        mapMissing = true;
        continue;
      }

      const original = consumer.originalPositionFor({
        line: line,
        column: col,
      });

      if (original.source) {
        const readable = `at ${original.name ?? 'anonymous'} (${original.source}:${original.line}:${original.column})`;
        replacements.push({ original: fullMatch, mapped: readable });
        mapSuccess = true;
      } else {
        mapFailed = true;
      }
    } catch (err) {
      mapFailed = true;
      console.error(`Failed to deobfuscate frame: ${fullMatch}`, err);
    }
  }

  for (const { original, mapped } of replacements) {
    result = result.replace(original, mapped);
  }

  let finalStatus = 'success';
  if (!mapAttempted) finalStatus = 'no_minified_frames';
  else if (mapSuccess) finalStatus = 'success';
  else if (mapMissing) finalStatus = 'missing_sourcemap';
  else if (mapFailed) finalStatus = 'map_failed';

  return { deobfuscated: result, status: finalStatus };
}

export function looksMinified(trace: string): boolean {
  return trace.includes('webpack://') ||
    trace.includes('_next/static') ||
    /:\d+:\d{4,}/.test(trace); // column > 999 = almost certainly minified
}
