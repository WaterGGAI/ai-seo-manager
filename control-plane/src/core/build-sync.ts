import { readManagedSiteRecord } from "./managed-sites";
import type { BootstrapBuildSyncSeed } from "../connectors/seeds/types";
import type { SeoBuildSyncConfig } from "./seo-types";

const MAX_TEXT_FIELD_LENGTH = 2_000;
const PROVIDERS = [
  "github-actions-repository-dispatch",
  "cloudflare-pages-deploy-hook"
] as const;
const PUBLIC_FEED_FORMATS = ["json"] as const;
const SYNC_MODES = ["build-time-api-sync"] as const;

type BuildSyncConfigRow = {
  site_id: string;
  provider: SeoBuildSyncConfig["provider"];
  label: string;
  sync_mode: SeoBuildSyncConfig["syncMode"];
  public_feed_url: string;
  public_feed_format: SeoBuildSyncConfig["publicFeedFormat"];
  public_single_url_template: string | null;
  sync_script_path: string | null;
  output_directory: string | null;
  deploy_target: string | null;
  deploy_repository: string | null;
  deploy_branch: string | null;
  deploy_event_type: string | null;
  deploy_hook_secret_name: string | null;
  metadata_json: string | null;
  updated_at: string;
};

type BuildSyncPayload = BootstrapBuildSyncSeed;

export class BuildSyncError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "BuildSyncError";
    this.status = status;
  }
}

function getRequiredDatabase(env: Cloudflare.Env) {
  if (!env.DB) {
    throw new BuildSyncError("D1 binding is not configured yet.", 503);
  }

  return env.DB;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseObject(value: string | null) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function serializeObject(value: unknown) {
  if (!value || !isRecord(value) || Object.keys(value).length === 0) {
    return null;
  }

  return JSON.stringify(value);
}

function readRequiredString(input: Record<string, unknown>, field: string, maxLength = MAX_TEXT_FIELD_LENGTH) {
  const value = input[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new BuildSyncError(`Field "${field}" is required.`);
  }

  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new BuildSyncError(`Field "${field}" exceeds the maximum allowed length.`);
  }

  return normalized;
}

function readOptionalString(input: Record<string, unknown>, field: string, maxLength = MAX_TEXT_FIELD_LENGTH) {
  const value = input[field];
  if (value == null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new BuildSyncError(`Field "${field}" must be a string when provided.`);
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length > maxLength) {
    throw new BuildSyncError(`Field "${field}" exceeds the maximum allowed length.`);
  }

  return normalized;
}

function normalizeUrl(value: string, field: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BuildSyncError(`Field "${field}" must be a valid absolute URL.`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new BuildSyncError(`Field "${field}" must use http or https.`);
  }

  return url.toString();
}

function normalizeProvider(value: string): SeoBuildSyncConfig["provider"] {
  if (!PROVIDERS.includes(value as SeoBuildSyncConfig["provider"])) {
    throw new BuildSyncError('Field "provider" is invalid.');
  }

  return value as SeoBuildSyncConfig["provider"];
}

function normalizeFeedFormat(value: string | null | undefined): SeoBuildSyncConfig["publicFeedFormat"] {
  if (!value) {
    return "json";
  }

  if (!PUBLIC_FEED_FORMATS.includes(value as SeoBuildSyncConfig["publicFeedFormat"])) {
    throw new BuildSyncError('Field "publicFeedFormat" is invalid.');
  }

  return value as SeoBuildSyncConfig["publicFeedFormat"];
}

function normalizeSyncMode(value: string): SeoBuildSyncConfig["syncMode"] {
  if (!SYNC_MODES.includes(value as SeoBuildSyncConfig["syncMode"])) {
    throw new BuildSyncError('Field "syncMode" is invalid.');
  }

  return value as SeoBuildSyncConfig["syncMode"];
}

function normalizeBuildSyncPayload(input: unknown): BuildSyncPayload {
  if (!isRecord(input)) {
    throw new BuildSyncError("Request body must be a JSON object.");
  }

  return {
    provider: normalizeProvider(readRequiredString(input, "provider", 120)),
    label: readRequiredString(input, "label", 200),
    syncMode: normalizeSyncMode(readRequiredString(input, "syncMode", 120)),
    publicFeedUrl: normalizeUrl(readRequiredString(input, "publicFeedUrl", 500), "publicFeedUrl"),
    publicFeedFormat: normalizeFeedFormat(readOptionalString(input, "publicFeedFormat", 40)),
    publicSingleUrlTemplate: readOptionalString(input, "publicSingleUrlTemplate", 500),
    syncScriptPath: readOptionalString(input, "syncScriptPath", 500),
    outputDirectory: readOptionalString(input, "outputDirectory", 500),
    deployTarget: readOptionalString(input, "deployTarget", 300),
    deployRepository: readOptionalString(input, "deployRepository", 300),
    deployBranch: readOptionalString(input, "deployBranch", 120),
    deployEventType: readOptionalString(input, "deployEventType", 120),
    deployHookSecretName: readOptionalString(input, "deployHookSecretName", 120),
    metadata: isRecord(input.metadata) ? input.metadata : {}
  };
}

function mapBuildSyncRow(row: BuildSyncConfigRow): SeoBuildSyncConfig {
  return {
    siteId: row.site_id,
    provider: row.provider,
    label: row.label,
    syncMode: row.sync_mode,
    publicFeedUrl: row.public_feed_url,
    publicFeedFormat: row.public_feed_format,
    publicSingleUrlTemplate: row.public_single_url_template,
    syncScriptPath: row.sync_script_path,
    outputDirectory: row.output_directory,
    deployTarget: row.deploy_target,
    deployRepository: row.deploy_repository,
    deployBranch: row.deploy_branch,
    deployEventType: row.deploy_event_type,
    deployHookSecretName: row.deploy_hook_secret_name,
    metadata: parseObject(row.metadata_json),
    updatedAt: row.updated_at ?? null
  };
}

async function ensureSiteExists(env: Cloudflare.Env, siteId: string) {
  const site = await readManagedSiteRecord(env, siteId);
  if (!site) {
    throw new BuildSyncError(`Unknown site: ${siteId}`, 404);
  }

  return site;
}

export async function readBuildSyncConfig(env: Cloudflare.Env, siteId: string): Promise<SeoBuildSyncConfig | null> {
  await ensureSiteExists(env, siteId);

  if (!env.DB) {
    return null;
  }

  const row = await env.DB.prepare(
    `
    SELECT *
    FROM managed_site_build_sync_configs
    WHERE site_id = ?1
    LIMIT 1
    `
  )
    .bind(siteId)
    .first<BuildSyncConfigRow>();

  return row ? mapBuildSyncRow(row) : null;
}

export async function upsertBuildSyncConfig(envOrDb: Cloudflare.Env | D1Database, siteId: string, input: unknown) {
  const isDatabase = typeof (envOrDb as D1Database).prepare === "function";
  const db = isDatabase ? (envOrDb as D1Database) : getRequiredDatabase(envOrDb as Cloudflare.Env);

  if (!isDatabase) {
    await ensureSiteExists(envOrDb as Cloudflare.Env, siteId);
  }

  const payload = normalizeBuildSyncPayload(input);

  await db
    .prepare(
      `
      INSERT INTO managed_site_build_sync_configs (
        site_id,
        provider,
        label,
        sync_mode,
        public_feed_url,
        public_feed_format,
        public_single_url_template,
        sync_script_path,
        output_directory,
        deploy_target,
        deploy_repository,
        deploy_branch,
        deploy_event_type,
        deploy_hook_secret_name,
        metadata_json,
        updated_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, CURRENT_TIMESTAMP)
      ON CONFLICT(site_id) DO UPDATE SET
        provider = excluded.provider,
        label = excluded.label,
        sync_mode = excluded.sync_mode,
        public_feed_url = excluded.public_feed_url,
        public_feed_format = excluded.public_feed_format,
        public_single_url_template = excluded.public_single_url_template,
        sync_script_path = excluded.sync_script_path,
        output_directory = excluded.output_directory,
        deploy_target = excluded.deploy_target,
        deploy_repository = excluded.deploy_repository,
        deploy_branch = excluded.deploy_branch,
        deploy_event_type = excluded.deploy_event_type,
        deploy_hook_secret_name = excluded.deploy_hook_secret_name,
        metadata_json = excluded.metadata_json,
        updated_at = CURRENT_TIMESTAMP
      `
    )
    .bind(
      siteId,
      payload.provider,
      payload.label,
      payload.syncMode,
      payload.publicFeedUrl,
      payload.publicFeedFormat ?? "json",
      payload.publicSingleUrlTemplate ?? null,
      payload.syncScriptPath ?? null,
      payload.outputDirectory ?? null,
      payload.deployTarget ?? null,
      payload.deployRepository ?? null,
      payload.deployBranch ?? null,
      payload.deployEventType ?? null,
      payload.deployHookSecretName ?? null,
      serializeObject(payload.metadata)
    )
    .run();

  if (isDatabase) {
    const row = await db
      .prepare(
        `
        SELECT *
        FROM managed_site_build_sync_configs
        WHERE site_id = ?1
        LIMIT 1
        `
      )
      .bind(siteId)
      .first<BuildSyncConfigRow>();

    if (!row) {
      throw new BuildSyncError("Build sync config could not be read after write.", 500);
    }

    return mapBuildSyncRow(row);
  }

  const item = await readBuildSyncConfig(envOrDb as Cloudflare.Env, siteId);
  if (!item) {
    throw new BuildSyncError("Build sync config could not be read after write.", 500);
  }

  return item;
}
