import sys
import os
import time

def get_proc_stat(pid):
    with open(f"/proc/{pid}/stat", "r") as f:
        content = f.read()
    fields = content.split(")")[-1].strip().split()
    utime = int(fields[11])
    stime = int(fields[12])
    return utime, stime

def get_cgroup_usage():
    try:
        with open("/sys/fs/cgroup/cpu.stat", "r") as f:
            for line in f:
                if line.startswith("usage_usec"):
                    return int(line.split()[1])
    except Exception:
        pass
    return None

if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "snapshot":
        pid = sys.argv[2]
        u, s = get_proc_stat(pid)
        cg = get_cgroup_usage() or 0
        t = time.time()
        print(f"{t} {u} {s} {cg}")
    elif cmd == "calc":
        # python3 calc_cpu.py calc t0 u0 s0 cg0 t1 u1 s1 cg1 checks_delta
        t0 = float(sys.argv[2])
        u0 = int(sys.argv[3])
        s0 = int(sys.argv[4])
        cg0 = int(sys.argv[5])
        t1 = float(sys.argv[6])
        u1 = int(sys.argv[7])
        s1 = int(sys.argv[8])
        cg1 = int(sys.argv[9])
        checks = int(sys.argv[10])

        elapsed = t1 - t0
        clk_tck = 100
        cpu_ticks = (u1 - u0) + (s1 - s0)
        proc_cpu_sec = cpu_ticks / clk_tck
        cores = proc_cpu_sec / elapsed if elapsed > 0 else 0
        us_per_check = (proc_cpu_sec * 1_000_000.0) / checks if checks > 0 else 0

        cg_delta_usec = cg1 - cg0
        cg_cores = (cg_delta_usec / 1_000_000.0) / elapsed if elapsed > 0 else 0

        print(f"elapsed_sec={elapsed:.3f}")
        print(f"proc_cpu_sec={proc_cpu_sec:.3f}")
        print(f"cores={cores:.3f}")
        print(f"us_per_check={us_per_check:.1f}")
        print(f"cgroup_cores={cg_cores:.3f}")
