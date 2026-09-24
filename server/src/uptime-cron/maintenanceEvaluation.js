import { uptimeDb } from "./db.js";
import { DateTime } from "luxon";

// In-memory cache per worker process
// { [monitorId]: [ { window_id, ...windowData } ] }
let maintenanceCache = new Map();
let lastCacheRefresh = 0;
const CACHE_TTL_MS = 30000; // 30 seconds

export async function refreshMaintenanceCache() {
  const now = Date.now();
  if (now - lastCacheRefresh < CACHE_TTL_MS) return;

  try {
    const { rows } = await uptimeDb.query(`
      SELECT w.*, m.monitor_id
      FROM uptime_maintenance_windows w
      LEFT JOIN uptime_maintenance_window_monitors m ON w.id = m.window_id
      WHERE w.active = true
    `);

    const newCache = new Map();

    for (const row of rows) {
      // If monitor_id is null, it's global.
      // We'll store global windows under a special key '*'.
      const key = row.monitor_id || '*';
      if (!newCache.has(key)) {
        newCache.set(key, []);
      }
      newCache.get(key).push(row);
    }

    maintenanceCache = newCache;
    lastCacheRefresh = now;
  } catch (err) {
    console.error("Failed to refresh maintenance cache:", err);
  }
}

export function isMonitorUnderMaintenance(monitorId, atTimestamp = Date.now()) {
  const globalWindows = maintenanceCache.get('*') || [];
  const monitorWindows = maintenanceCache.get(monitorId) || [];
  const applicableWindows = [...globalWindows, ...monitorWindows];

  if (applicableWindows.length === 0) return null;

  for (const win of applicableWindows) {
    if (isTimeInWindow(atTimestamp, win)) {
      return win.id; // Returns the window ID that suppresses it
    }
  }

  return null;
}

const LUXON_WEEKDAYS = {
  1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA', 7: 'SU'
};

function checkWindowForDate(timestampMs, anchorDt, win) {
  const dayCode = LUXON_WEEKDAYS[anchorDt.weekday];
  if (!win.days_of_week || !win.days_of_week.includes(dayCode)) return false;

  const [hours, minutes] = win.start_time.split(':').map(Number);
  
  const windowStartDt = anchorDt.set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });
  const startMs = windowStartDt.toMillis();
  const endMs = startMs + win.duration_minutes * 60000;

  return timestampMs >= startMs && timestampMs < endMs;
}

function isTimeInWindow(timestampMs, win) {
  if (win.recurrence_type === 'one_time') {
    const startMs = new Date(win.one_time_start_at).getTime();
    const endMs = startMs + win.duration_minutes * 60000;
    return timestampMs >= startMs && timestampMs < endMs;
  }
  
  if (win.recurrence_type === 'weekly') {
    const dt = DateTime.fromMillis(timestampMs, { zone: win.timezone });
    if (!dt.isValid) return false;

    // Evaluate today's window
    if (checkWindowForDate(timestampMs, dt, win)) return true;
    
    // Evaluate yesterday's window (in case a window started yesterday and is still active)
    const yesterdayDt = dt.minus({ days: 1 });
    if (checkWindowForDate(timestampMs, yesterdayDt, win)) return true;
  }
  
  return false;
}
