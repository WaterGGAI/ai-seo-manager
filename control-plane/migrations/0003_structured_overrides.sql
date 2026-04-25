ALTER TABLE managed_site_seo_settings ADD COLUMN metadata_json TEXT;

CREATE TABLE IF NOT EXISTS managed_site_structured_overrides (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  route_path TEXT NOT NULL,
  title TEXT,
  description TEXT,
  heading TEXT,
  intro TEXT,
  content TEXT,
  faq_json TEXT,
  last_task_type TEXT,
  last_model_key TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT,
  FOREIGN KEY (site_id) REFERENCES managed_sites(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_managed_site_structured_overrides_entity
  ON managed_site_structured_overrides (site_id, entity_type, entity_key);

CREATE INDEX IF NOT EXISTS idx_managed_site_structured_overrides_route
  ON managed_site_structured_overrides (site_id, route_path, updated_at);
