import subprocess
import os

print("Adding 198.20.0.1 to 198.20.0.16 to lo...")
for i in range(1, 17):
    ip = f"198.20.0.{i}/32"
    subprocess.run(["sudo", "ip", "addr", "add", ip, "dev", "lo"], capture_output=True)

# Verify
res = subprocess.run(["ip", "addr", "show", "dev", "lo"], capture_output=True, text=True)
count = sum(1 for line in res.stdout.splitlines() if "198.20.0." in line)
print(f"Verified {count} IPs on lo interface.")

# Sysctl
subprocess.run(["sudo", "sysctl", "-w", "net.core.somaxconn=65535", "net.ipv4.tcp_max_syn_backlog=65535", "net.ipv4.ip_local_port_range=1024 65535"])

# Generate /etc/hosts entries round-robin across 16 IPs
print("Generating /etc/hosts mappings for mock targets...")
hosts_entries = []
# Base mappings
hosts_entries.append("127.0.0.1 localhost\n")
hosts_entries.append("::1 localhost\n")
for i in range(1, 17):
    hosts_entries.append(f"198.20.0.{i} mock mock-{i}.mock.local\n")

# Deliberate failure canaries
hosts_entries.append("# Deliberate failure canaries\n")
for i in range(10):
    hosts_entries.append(f"198.20.0.1 mock-fail-http-{i}.mock.local mock-fail-api-{i}.mock.local mock-fail-kw-{i}.mock.local\n")

# 37,500 mock targets (mock-0 through mock-37499)
print("Mapping 37,500 hosts round-robin across 16 IPs...")
for i in range(37500):
    ip_idx = (i % 16) + 1
    hosts_entries.append(f"198.20.0.{ip_idx} mock-{i}.mock.local\n")

hosts_content = "".join(hosts_entries)
with open("/tmp/new_hosts", "w") as f:
    f.write(hosts_content)

subprocess.run(["sudo", "cp", "/tmp/new_hosts", "/etc/hosts"])
print(f"Successfully wrote {len(hosts_entries)} host entries to /etc/hosts.")
