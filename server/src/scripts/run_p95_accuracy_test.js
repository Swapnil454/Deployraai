import { createClient } from "@clickhouse/client";

const client = createClient({
  url: "http://localhost:8123",
  username: "engine",
  password: "password",
  database: "default"
});

async function runP95AccuracyTest() {
  console.log("=== ClickHouse P95 Estimator Accuracy Benchmark vs quantileExact(0.95) ===");

  // 1. Query 1,000 monitors comparing True P95, Midpoint P95, and Interpolated P95
  // using exact fractional bounds without artificial floor/ceil widening:
  // L_k = pow(1.04, k - 1), U_k = pow(1.04, k)
  // Midpoint = (2 * pow(1.04, k)) / 2.04
  const query = `
    WITH
      -- 1. Exact P95 from raw telemetry (Element at rank ceil(0.95 * N))
      raw_p95 AS (
        SELECT
          monitor_id,
          toStartOfDay(checked_at) AS day,
          countIf(success = 1) AS total_successful,
          quantileExact(0.95)(response_time_ms) AS quantile_exact,
          arraySort(groupArray(response_time_ms))[toUInt64(ceil(0.95 * countIf(success = 1)))] AS true_p95_exact
        FROM t_src_real
        WHERE success = 1
        GROUP BY monitor_id, day
        HAVING total_successful > 50
        LIMIT 2000
      ),
      -- 2. Histogram P95 from hourly rollups (summed over the day)
      hist_p95 AS (
        SELECT
          monitor_id,
          toStartOfDay(window_start) AS day,
          sum(successful_checks) AS total_success,
          sumMap(latency_bucketsMap) AS hist,
          mapKeys(hist) AS raw_keys,
          arraySort(raw_keys) AS sorted_keys,
          arrayMap(k -> hist[k], sorted_keys) AS counts,
          arrayCumSum(counts) AS cum_counts,
          toUInt64(ceil(0.95 * total_success)) AS rank_target,
          arrayFirstIndex(c -> c >= rank_target, cum_counts) AS target_idx,
          sorted_keys[target_idx] AS target_bucket_key,
          counts[target_idx] AS bucket_count,
          if(target_idx > 1, cum_counts[target_idx - 1], toUInt64(0)) AS prev_cum_count,
          -- Exact bounds
          pow(1.04, toFloat64(target_bucket_key - 1)) AS lower_bound,
          pow(1.04, toFloat64(target_bucket_key)) AS upper_bound,
          -- Estimator A: Guaranteed geometric midpoint
          (2.0 * pow(1.04, toFloat64(target_bucket_key))) / 2.04 AS midpoint_p95,
          -- Estimator B: Linear rank interpolation
          if(target_bucket_key = 281, 60000.0,
            lower_bound + ((rank_target - prev_cum_count) / toFloat64(greatest(bucket_count, 1))) * (upper_bound - lower_bound)
          ) AS interpolated_p95
        FROM t_roll_real
        GROUP BY monitor_id, day
      )
    SELECT
      r.monitor_id,
      r.day,
      r.total_successful,
      toFloat64(r.true_p95_exact) AS true_p95,
      h.target_bucket_key,
      h.midpoint_p95,
      h.interpolated_p95,
      abs(h.midpoint_p95 - r.true_p95_exact) / toFloat64(r.true_p95_exact) * 100.0 AS midpoint_err_pct,
      abs(h.interpolated_p95 - r.true_p95_exact) / toFloat64(r.true_p95_exact) * 100.0 AS interp_err_pct
    FROM raw_p95 AS r
    INNER JOIN hist_p95 AS h ON r.monitor_id = h.monitor_id AND r.day = h.day
  `;

  console.log("Executing comparison query against live ClickHouse dataset...");
  const t0 = Date.now();
  const res = await client.query({ query, format: "JSONEachRow" });
  const rows = await res.json();
  console.log(`Evaluated ${rows.length} (monitor, day) pairs in ${((Date.now() - t0) / 1000).toFixed(2)}s.`);

  if (rows.length === 0) {
    console.error("No rows found for evaluation.");
    return;
  }

  // Partition into two buckets: True P95 < 50ms and True P95 >= 50ms
  const lowLatency = rows.filter(r => r.true_p95 < 50);
  const highLatency = rows.filter(r => r.true_p95 >= 50);

  function getStats(arr, key) {
    if (arr.length === 0) return { median: "N/A", p99: "N/A", max: "N/A" };
    const vals = arr.map(r => r[key]).sort((a, b) => a - b);
    const median = vals[Math.floor(vals.length * 0.5)].toFixed(3);
    const p99 = vals[Math.floor(vals.length * 0.99)].toFixed(3);
    const max = vals[vals.length - 1].toFixed(3);
    return { median: `${median}%`, p99: `${p99}%`, max: `${max}%` };
  }

  console.log("\n=== Accuracy Benchmark Results ===");
  console.log(`Population 1: True P95 >= 50 ms (n = ${highLatency.length})`);
  console.log("--------------------------------------------------------------------------------");
  console.log("Estimator               Median Error    P99 Error       Max Relative Error");
  console.log("--------------------------------------------------------------------------------");
  const midHigh = getStats(highLatency, "midpoint_err_pct");
  const interpHigh = getStats(highLatency, "interp_err_pct");
  console.log(`Midpoint Estimator:     ${midHigh.median.padEnd(16)}${midHigh.p99.padEnd(16)}${midHigh.max}`);
  console.log(`Linear Interpolation:   ${interpHigh.median.padEnd(16)}${interpHigh.p99.padEnd(16)}${interpHigh.max}`);

  console.log("\nPopulation 2: True P95 < 50 ms (n = ${lowLatency.length}) [Integer quantization zone]");
  console.log("--------------------------------------------------------------------------------");
  console.log("Estimator               Median Error    P99 Error       Max Relative Error");
  console.log("--------------------------------------------------------------------------------");
  const midLow = getStats(lowLatency, "midpoint_err_pct");
  const interpLow = getStats(lowLatency, "interp_err_pct");
  console.log(`Midpoint Estimator:     ${midLow.median.padEnd(16)}${midLow.p99.padEnd(16)}${midLow.max}`);
  console.log(`Linear Interpolation:   ${interpLow.median.padEnd(16)}${interpLow.p99.padEnd(16)}${interpLow.max}`);

  // Sample comparison rows
  console.log("\nSample 5 Comparisons (>= 50 ms):");
  console.table(highLatency.slice(0, 5).map(r => ({
    true_p95: r.true_p95,
    key: r.target_bucket_key,
    midpoint: Number(r.midpoint_p95.toFixed(1)),
    mid_err: `${r.midpoint_err_pct.toFixed(2)}%`,
    interp: Number(r.interpolated_p95.toFixed(1)),
    interp_err: `${r.interp_err_pct.toFixed(2)}%`
  })));

  if (lowLatency.length > 0) {
    console.log("\nSample 5 Comparisons (< 50 ms):");
    console.table(lowLatency.slice(0, 5).map(r => ({
      true_p95: r.true_p95,
      key: r.target_bucket_key,
      midpoint: Number(r.midpoint_p95.toFixed(1)),
      mid_err: `${r.midpoint_err_pct.toFixed(2)}%`,
      interp: Number(r.interpolated_p95.toFixed(1)),
      interp_err: `${r.interp_err_pct.toFixed(2)}%`
    })));
  }
}

runP95AccuracyTest().catch(err => {
  console.error("Accuracy test error:", err);
  process.exit(1);
});
