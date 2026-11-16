import subprocess

cmd = [
    "docker", "compose", "-f", "/home/swapnil/uptimer_partial_50k/compose/docker-compose.yml",
    "exec", "-T", "pg15", "psql", "-U", "engine", "-d", "uptimer_cv50k_prod", "-tAc",
    "SELECT id, monitor_type, url, target_host FROM uptime_monitors WHERE id = 'a40a9a58-f2a4-4d1e-b9f8-aef467aad022';"
]
print(subprocess.check_output(cmd).decode())
