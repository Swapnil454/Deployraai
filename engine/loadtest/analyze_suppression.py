import subprocess
import json

def run_query(sql):
    cmd = [
        "docker", "compose", "-f", "/home/swapnil/uptimer_partial_50k/compose/docker-compose.yml",
        "exec", "-T", "pg15", "psql", "-U", "engine", "-d", "uptimer_cv50k_prod", "-tAc", sql
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    return res.stdout.strip()

if __name__ == "__main__":
    print("=== INCIDENT COUNT BY CAUSE AND ERROR MESSAGE ===")
    sql = "SELECT cause, first_error_message, count(id) FROM uptime_incidents GROUP BY cause, first_error_message;"
    print(run_query(sql))

    print("\n=== INCIDENT SAMPLES ===")
    sql = "SELECT id, started_at, resolved_at, cause, first_error_message FROM uptime_incidents ORDER BY started_at DESC LIMIT 10;"
    print(run_query(sql))
