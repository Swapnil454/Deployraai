import threading
import time
import gzip
import urllib.request
import urllib.error
import yappi
import sys
import logging

from . import profile_pb2

logger = logging.getLogger(__name__)

class ContinuousProfiler:
    def __init__(self, project_id, service_name, ingest_url="http://localhost:4317/v1/profiles", flush_interval_ms=10000):
        self.project_id = project_id
        self.service_name = service_name
        self.ingest_url = ingest_url
        self.flush_interval = flush_interval_ms / 1000.0
        self._stop_event = threading.Event()
        self._thread = None

    def start(self):
        yappi.set_clock_type("cpu")
        yappi.start()
        
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        logger.info(f"[TracePilot Python] Continuous profiling started for {self.service_name}")

    def stop(self):
        if self._thread:
            self._stop_event.set()
            self._thread.join()
        yappi.stop()
        yappi.clear_stats()

    def _loop(self):
        while not self._stop_event.is_set():
            time.sleep(self.flush_interval)
            
            # Stop, fetch stats, clear, and restart
            yappi.stop()
            stats = yappi.get_func_stats()
            yappi.clear_stats()
            yappi.start()
            
            self._flush(stats)

    def _flush(self, stats):
        try:
            profile = profile_pb2.Profile()
            
            # Very basic string table: index 0 is empty string
            profile.string_table.append("")
            
            def get_string_id(s):
                if s not in profile.string_table:
                    profile.string_table.append(s)
                return profile.string_table.index(s)
            
            # Generate samples from yappi stats
            for stat in stats:
                if stat.ttot == 0:
                    continue
                    
                sample = profile.sample.add()
                
                # Yappi gives us the function name, module, and lineno
                func_name = f"{stat.module}:{stat.name}"
                
                # Create a function
                func = profile.function.add()
                func.id = len(profile.function)
                func.name = get_string_id(func_name)
                
                # Create a location
                loc = profile.location.add()
                loc.id = len(profile.location)
                line = loc.line.add()
                line.function_id = func.id
                
                sample.location_id.append(loc.id)
                
                # Use total cpu time (ttot is in seconds, convert to nanoseconds)
                sample.value.append(int(stat.ttot * 1e9))

            # Serialize and compress
            data = profile.SerializeToString()
            compressed = gzip.compress(data)

            # Upload
            req = urllib.request.Request(self.ingest_url, data=compressed, method="POST")
            req.add_header("Content-Type", "application/x-protobuf")
            req.add_header("X-Project-ID", self.project_id)
            req.add_header("X-Service-Name", self.service_name)
            req.add_header("X-Profile-Type", "cpu")
            
            with urllib.request.urlopen(req, timeout=5) as response:
                pass
                
        except urllib.error.URLError as e:
            logger.warning(f"[TracePilot Python] Profiler backend unreachable: {e.reason}")
        except Exception as e:
            logger.error(f"[TracePilot Python] Profiler flush failed: {e}")
