import subprocess
import datetime

def run_query(sql):
    cmd = [
        "docker", "compose", "-f", "/home/swapnil/uptimer_partial_50k/compose/docker-compose.yml",
        "exec", "-T", "pg15", "psql", "-U", "engine", "-d", "uptimer_cv50k_prod", "-tAc", sql
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    return res.stdout.strip()

if __name__ == "__main__":
    sql = """
    SELECT 
        date_trunc('minute', started_at) + INTERVAL '10 second' * (FLOOR(date_part('second', started_at) / 10)) AS bucket,
        count(id)
    FROM uptime_incidents
    WHERE started_at >= '2026-10-31 11:23:00+00' AND started_at <= '2026-10-31 11:28:00+00'
    GROUP BY bucket
    ORDER BY bucket;
    """
    print("=== INCIDENTS PER 10s BUCKET IN ITEM 1 ===")
    print(run_query(sql))
