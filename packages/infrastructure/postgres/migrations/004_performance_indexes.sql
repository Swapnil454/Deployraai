CREATE INDEX IF NOT EXISTS spans_root_idx 
  ON spans (project_id, start_time DESC) 
  WHERE (parent_span_id IS NULL OR parent_span_id = '');

-- Note: btree_gin extension is required for composite GIN indexes with scalar types like project_id
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE INDEX IF NOT EXISTS logs_project_fts 
  ON logs USING GIN (project_id, to_tsvector('english', message));
