CREATE TABLE IF NOT EXISTS managed_site_build_sync_configs (
  site_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  label TEXT NOT NULL,
  sync_mode TEXT NOT NULL,
  public_feed_url TEXT NOT NULL,
  public_feed_format TEXT NOT NULL DEFAULT 'json',
  public_single_url_template TEXT,
  sync_script_path TEXT,
  output_directory TEXT,
  deploy_target TEXT,
  deploy_repository TEXT,
  deploy_branch TEXT,
  deploy_event_type TEXT,
  deploy_hook_secret_name TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES managed_sites(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_managed_site_build_sync_provider
  ON managed_site_build_sync_configs (provider, updated_at);
