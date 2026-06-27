-- Create the profiles table for continuous profiling data
CREATE TABLE IF NOT EXISTS profiles
(
    project_id UUID,
    service_name String,
    profile_type Enum8('cpu' = 1, 'memory' = 2),
    timestamp DateTime64(3, 'UTC'),
    
    -- An array of function names (or resolved symbol strings) representing the call stack.
    -- E.g., ['runtime.main', 'net/http.Serve', 'myHandler', 'slowFunction']
    -- The root of the stack is at index 0.
    stack_trace Array(String),
    
    -- The value of this sample (e.g., CPU nanoseconds or Memory bytes allocated)
    value UInt64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (project_id, service_name, profile_type, timestamp, stack_trace)
TTL toDateTime(timestamp) + INTERVAL 30 DAY;
