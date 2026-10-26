import re,sys
src=open(sys.argv[1]).read()
cols=re.search(r"export function getTelemetryTableColumnsDDL\(\)\s*\{\s*return `(.*?)`;",src,re.S).group(1)
ver=re.search(r"KEEPER_SCHEMA_VERSION\s*=\s*['\"]?([^'\";\s]+)",src).group(1)
t=re.search(r"export function getTelemetryReplicatedDDL\([^)]*\)\s*\{\s*return `(.*?)`;\s*\}",src,re.S).group(1)
t=t.replace("${getTelemetryTableColumnsDDL()}",cols).replace("${tableName}",sys.argv[2]).replace("${version}",ver)
assert "ReplicatedMergeTree" in t and "${" not in t and "generation UInt64" in t
print(t)
