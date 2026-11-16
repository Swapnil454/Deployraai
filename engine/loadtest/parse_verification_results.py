import re, os

results_dir = "/home/swapnil/stale_skip_verification_results"

def parse_lag_file(filepath):
    p50s, p95s, p99s, maxs = [], [], [], []
    with open(filepath) as f:
        for line in f:
            m50 = re.search(r'p50:\s*([0-9\.]+[a-zµ]+)', line)
            m95 = re.search(r'p95:\s*([0-9\.]+[a-zµ]+)', line)
            m99 = re.search(r'p99:\s*([0-9\.]+[a-zµ]+)', line)
            mmax = re.search(r'max:\s*([0-9\.]+[a-zµ]+)', line)
            if m50 and m95 and m99 and mmax:
                def to_ms(s):
                    if s.endswith('ms'): return float(s[:-2])
                    if s.endswith('µs') or s.endswith('us'): return float(s[:-2])/1000.0
                    if s.endswith('s'): return float(s[:-1])*1000.0
                    return 0.0
                p50s.append(to_ms(m50.group(1)))
                p95s.append(to_ms(m95.group(1)))
                p99s.append(to_ms(m99.group(1)))
                maxs.append(to_ms(mmax.group(1)))
    return p50s, p95s, p99s, maxs

print("=== LAG STATS ANALYSIS ===")
for run in ["R1", "R2", "R3"]:
    p = os.path.join(results_dir, f"lag_stats_{run}.log")
    if os.path.exists(p):
        p50, p95, p99, mmax = parse_lag_file(p)
        print(f"{run} ({len(p50)} windows):")
        print(f"  p50 range: {min(p50):.2f} ms to {max(p50):.2f} ms")
        print(f"  p95 range: {min(p95):.2f} ms to {max(p95):.2f} ms")
        print(f"  p99 range: {min(p99):.2f} ms to {max(p99):.2f} ms")
        print(f"  max range: {min(mmax):.2f} ms to {max(mmax):.2f} ms")
        print(f"  Max p99 observed: {max(p99)/1000.0:.3f} s")

# Check suppression events in R3
sup_events = 0
with open(os.path.join(results_dir, "guard_R3.log")) as f:
    for line in f:
        # Check if suppressed contains anything other than map[]
        m = re.search(r'suppressed=map\[(.*?)\]', line)
        if m and m.group(1).strip():
            sup_events += 1
print(f"\nR3 True Suppression Events: {sup_events}")

