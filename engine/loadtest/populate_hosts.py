import subprocess
import re

print("Fetching all hosts from postgres (url and target_host)...")
cmd = [
    "docker", "compose", "-f", "/home/swapnil/uptimer_partial_50k/compose/docker-compose.yml",
    "exec", "-T", "pg15", "psql", "-U", "engine", "-d", "uptimer_cv50k_prod", "-tAc",
    "SELECT DISTINCT COALESCE(url, target_host) FROM uptime_monitors WHERE COALESCE(url, target_host) IS NOT NULL;"
]
out = subprocess.check_output(cmd).decode()

hosts = set()
for line in out.splitlines():
    line = line.strip()
    m = re.search(r"https?://([^:/]+)", line)
    if m:
        hosts.add(m.group(1))
    elif "mock.local" in line:
        hosts.add(line.split(":")[0])

print(f"Found {len(hosts)} distinct hosts across all 50k monitors")

# Read current /etc/hosts
with open("/etc/hosts", "r") as f:
    base_hosts = f.read()

# Filter out old mock entries
clean_lines = [l for l in base_hosts.splitlines() if "mock.local" not in l]

with open("/tmp/new_hosts", "w") as f:
    for l in clean_lines:
        f.write(l + "\n")
    for h in sorted(hosts):
        f.write(f"198.20.0.1 {h}\n")

print("Created /tmp/new_hosts successfully")
