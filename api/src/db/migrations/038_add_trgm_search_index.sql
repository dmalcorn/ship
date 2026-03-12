-- Enable pg_trgm extension for GIN-accelerated ILIKE search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN index converts ILIKE '%term%' from O(N) seq scan to O(1) index scan
CREATE INDEX IF NOT EXISTS idx_documents_title_trgm
  ON documents USING GIN (title gin_trgm_ops);
