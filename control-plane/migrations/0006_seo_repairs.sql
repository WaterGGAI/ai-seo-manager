CREATE TABLE IF NOT EXISTS managed_site_seo_repairs (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  audit_run_id TEXT,
  path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  source TEXT NOT NULL DEFAULT 'manual_api',
  apply_mode TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  issue_summary_json TEXT NOT NULL,
  topic_key TEXT,
  slug TEXT,
  route_path TEXT,
  entity_type TEXT,
  entity_key TEXT,
  model TEXT,
  generation_mode TEXT NOT NULL DEFAULT 'template',
  usage_json TEXT,
  proposed_payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES managed_sites(id) ON DELETE CASCADE,
  FOREIGN KEY (audit_run_id) REFERENCES managed_site_seo_audit_runs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_managed_site_seo_repairs_site_id
  ON managed_site_seo_repairs (site_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_managed_site_seo_repairs_status
  ON managed_site_seo_repairs (site_id, status, updated_at DESC);
