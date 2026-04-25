CREATE TABLE IF NOT EXISTS managed_site_seo_settings (
  site_id TEXT PRIMARY KEY,
  site_url TEXT NOT NULL,
  daily_audit_enabled INTEGER NOT NULL DEFAULT 1,
  automation_enabled INTEGER NOT NULL DEFAULT 0,
  auto_publish_enabled INTEGER NOT NULL DEFAULT 0,
  auto_queue_for_sync INTEGER NOT NULL DEFAULT 0,
  auto_deploy_enabled INTEGER NOT NULL DEFAULT 0,
  schedule_local_time TEXT NOT NULL DEFAULT '03:15',
  schedule_timezone TEXT NOT NULL DEFAULT 'Asia/Taipei',
  schedule_cron_utc TEXT NOT NULL DEFAULT '15 19 * * *',
  ai_provider TEXT NOT NULL DEFAULT 'workers-ai',
  fallback_provider TEXT NOT NULL DEFAULT 'template',
  generation_model TEXT,
  topic_cursor INTEGER NOT NULL DEFAULT 0,
  last_scheduled_draft_date TEXT,
  last_audit_at TEXT,
  last_generated_at TEXT,
  last_published_at TEXT,
  last_deploy_requested_at TEXT,
  last_deploy_status TEXT NOT NULL DEFAULT 'idle',
  last_deploy_message TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES managed_sites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS managed_site_seo_topics (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  topic_key TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  focus_keyword TEXT NOT NULL,
  audience TEXT,
  category TEXT,
  search_intent TEXT,
  summary TEXT,
  metadata_json TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES managed_sites(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_managed_site_seo_topics_site_key
  ON managed_site_seo_topics (site_id, topic_key);

CREATE TABLE IF NOT EXISTS managed_site_seo_drafts (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  topic_key TEXT,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  hero_summary TEXT,
  heading TEXT,
  kicker TEXT,
  focus_keyword TEXT,
  keywords_json TEXT,
  category TEXT,
  audience TEXT,
  search_intent TEXT,
  intro TEXT,
  sections_json TEXT,
  faq_json TEXT,
  internal_links_json TEXT,
  cta_title TEXT,
  cta_body TEXT,
  mdx TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'draft',
  sync_status TEXT NOT NULL DEFAULT 'pending_deploy',
  generation_mode TEXT NOT NULL DEFAULT 'template',
  model TEXT,
  usage_json TEXT,
  generation_notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES managed_sites(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_managed_site_seo_drafts_site_id
  ON managed_site_seo_drafts (site_id, created_at);

CREATE TABLE IF NOT EXISTS managed_site_seo_published_articles (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  draft_id TEXT,
  topic_key TEXT,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  hero_summary TEXT,
  heading TEXT,
  kicker TEXT,
  focus_keyword TEXT,
  keywords_json TEXT,
  category TEXT,
  audience TEXT,
  search_intent TEXT,
  intro TEXT,
  sections_json TEXT,
  faq_json TEXT,
  internal_links_json TEXT,
  cta_title TEXT,
  cta_body TEXT,
  mdx TEXT,
  author TEXT,
  tags_json TEXT,
  schema_type TEXT NOT NULL DEFAULT 'Article',
  source TEXT NOT NULL DEFAULT 'manual',
  published_source TEXT NOT NULL DEFAULT 'manual',
  sync_status TEXT NOT NULL DEFAULT 'pending_deploy',
  model TEXT,
  usage_json TEXT,
  generation_notes TEXT,
  generated_at TEXT,
  published_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  live_url TEXT,
  FOREIGN KEY (site_id) REFERENCES managed_sites(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_managed_site_seo_published_site_slug
  ON managed_site_seo_published_articles (site_id, slug);

CREATE TABLE IF NOT EXISTS managed_site_seo_audit_runs (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  base_url TEXT NOT NULL,
  schedule_label TEXT,
  summary_json TEXT NOT NULL,
  targets_json TEXT NOT NULL,
  issues_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES managed_sites(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_managed_site_seo_audit_runs_site_id
  ON managed_site_seo_audit_runs (site_id, created_at);

CREATE TABLE IF NOT EXISTS managed_site_seo_ranking_snapshots (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  status TEXT NOT NULL,
  sync_at TEXT NOT NULL,
  site_url TEXT NOT NULL,
  permission_level TEXT,
  available_date TEXT,
  current_window_json TEXT,
  previous_window_json TEXT,
  top_pages_json TEXT NOT NULL,
  top_queries_json TEXT NOT NULL,
  daily_trend_json TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES managed_sites(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_managed_site_seo_ranking_site_id
  ON managed_site_seo_ranking_snapshots (site_id, sync_at);

CREATE TABLE IF NOT EXISTS managed_site_seo_usage_events (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  provider TEXT NOT NULL,
  source TEXT NOT NULL,
  topic_key TEXT,
  slug TEXT,
  model TEXT,
  estimated_input_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_neurons INTEGER,
  estimated_usd REAL,
  used_fallback_chain INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT,
  FOREIGN KEY (site_id) REFERENCES managed_sites(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_managed_site_seo_usage_site_id
  ON managed_site_seo_usage_events (site_id, created_at);

