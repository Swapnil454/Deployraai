import pg from "pg";

const { Pool, types } = pg;

if (!process.env.UPTIMER_DB) {
  throw new Error("UPTIMER_DB is required for the Uptime Cron Job service.");
}

// ──────────────────────────────────────────────────────────────────────────────
// Fix: pg driver does NOT parse TEXT[] (OID 1009) as a JS array by default.
// Without this, up_status_codes and tags come back as raw strings like
// "{2xx,3xx}" — causing "object is not iterable" in the checker loop.
// ──────────────────────────────────────────────────────────────────────────────

function parsePgTextArray(raw) {
  if (!raw || raw === "{}") return [];
  // Strip outer braces, then split on commas (handles quoted elements too)
  return raw
    .slice(1, -1)
    .match(/("(?:[^"\\]|\\.)*"|[^,]+)/g)
    ?.map((s) => (s.startsWith('"') ? s.slice(1, -1).replace(/\\"/g, '"') : s)) ?? [];
}

// OID 1009 = TEXT[] in PostgreSQL
types.setTypeParser(1009, parsePgTextArray);

// OID 1043 = VARCHAR[] — just in case
types.setTypeParser(1015, parsePgTextArray);

export const uptimeDb = new Pool({
  connectionString: process.env.UPTIMER_DB,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
});
