import protobuf from 'protobufjs';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';
import { promisify } from 'util';

const gunzipAsync = promisify(zlib.gunzip);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ParsedSample {
  stackTrace: string[]; // From root to leaf
  value: number;        // CPU time or memory allocated
}

let profileTypeCache: protobuf.Type | null = null;

async function loadProfileType(): Promise<protobuf.Type> {
  if (profileTypeCache) return profileTypeCache;
  const root = await protobuf.load(path.resolve(__dirname, '../profile.proto'));
  profileTypeCache = root.lookupType('perftools.profiles.Profile');
  return profileTypeCache;
}

export async function parsePprof(buffer: Uint8Array | Buffer): Promise<ParsedSample[]> {
  const Profile = await loadProfileType();
  
  let data = buffer;
  // Check for gzip magic numbers: 0x1F 0x8B
  if (data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) {
    data = await gunzipAsync(data);
  }

  const message = Profile.decode(data) as any;

  // pprof defines strings in a string_table array
  const stringTable: string[] = message.stringTable || [];
  
  // Functions map: id -> function name string
  const functions = new Map<number, string>();
  if (message.function) {
    for (const f of message.function) {
      if (f.id && f.name) {
        functions.set(Number(f.id), stringTable[Number(f.name)] || '<unknown>');
      }
    }
  }

  // Locations map: id -> array of function names (usually just one, but can be multiple for inlined functions)
  const locations = new Map<number, string[]>();
  if (message.location) {
    for (const loc of message.location) {
      if (loc.id && loc.line) {
        const funcs: string[] = [];
        for (const line of loc.line) {
          if (line.functionId) {
            funcs.push(functions.get(Number(line.functionId)) || '<unknown>');
          }
        }
        locations.set(Number(loc.id), funcs);
      }
    }
  }

  const result: ParsedSample[] = [];

  if (message.sample) {
    for (const sample of message.sample) {
      // pprof locationId array is from leaf to root
      const locationIds: number[] = sample.locationId || [];
      const stackTrace: string[] = [];

      for (const locId of locationIds) {
        const funcs = locations.get(Number(locId));
        if (funcs) {
          // If a location has multiple functions (inlined), they are ordered from callee to caller
          // We push them in order.
          stackTrace.push(...funcs);
        }
      }

      // Reverse to make it root to leaf
      stackTrace.reverse();

      // Usually sample.value is an array where the last element is the primary metric (e.g. cpu nanoseconds)
      // or we can just sum them up or take the first one. For CPU profiles, value[0] is often samples, value[1] is cpu nanoseconds.
      // We will take the last value as the default heuristic for now.
      const values: number[] = sample.value || [0];
      const val = Number(values[values.length - 1]);

      result.push({
        stackTrace,
        value: val
      });
    }
  }

  return result;
}
