CREATE TABLE IF NOT EXISTS managed_site_seo_ranking_configs (
  site_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  site_url TEXT NOT NULL,
  metadata_json TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES managed_sites(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_managed_site_seo_ranking_configs_enabled
  ON managed_site_seo_ranking_configs (enabled, updated_at);
