CREATE TABLE IF NOT EXISTS managed_sites (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  site_type TEXT NOT NULL,
  primary_language TEXT NOT NULL,
  publish_mode TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  connector_name TEXT NOT NULL,
  source_project_path TEXT NOT NULL,
  migration_priority INTEGER NOT NULL DEFAULT 999,
  is_active INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS site_keywords (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  keyword TEXT NOT NULL,
  intent TEXT,
  cluster_name TEXT,
  priority INTEGER NOT NULL DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'active',
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES managed_sites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS seo_templates (
  id TEXT PRIMARY KEY,
  site_id TEXT,
  connector_name TEXT,
  content_type TEXT NOT NULL,
  template_name TEXT NOT NULL,
  prompt_template TEXT NOT NULL,
  output_schema_json TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES managed_sites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS seo_jobs (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL,
  trigger_source TEXT NOT NULL,
  payload_json TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES managed_sites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS seo_job_events (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES seo_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_managed_sites_priority
  ON managed_sites (migration_priority, is_active);

CREATE INDEX IF NOT EXISTS idx_site_keywords_site_id
  ON site_keywords (site_id, status);

CREATE INDEX IF NOT EXISTS idx_seo_jobs_site_id
  ON seo_jobs (site_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_seo_job_events_job_id
  ON seo_job_events (job_id, created_at);

