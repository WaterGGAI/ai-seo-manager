import { readManagedSiteRecord } from "./managed-sites";
import { matchesScheduledTick } from "./cron-schedule";
import { runSeoJob } from "./seo-jobs";
import type {
  SeoJobTriggerSource,
  SeoRankingDimensionMetrics,
  SeoRankingDimensionRow,
  SeoRankingSnapshot,
  SeoRankingState,
  SeoRankingTrendPoint,
  SeoRankingWindowMetrics
} from "./seo-types";

const GOOGLE_OAUTH_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_SEARCH_CONSOLE_ENDPOINT = "https://www.googleapis.com/webmasters/v3";
const DEFAULT_TIMEZONE = "Asia/Taipei";
const DEFAULT_HISTORY_LIMIT = 10;
const MAX_DIMENSION_ROWS = 8;
const MAX_STORED_SNAPSHOTS = 40;
const MAX_SITE_URL_LENGTH = 600;

type GoogleSearchConsoleEnv = {
  GSC_SERVICE_ACCOUNT_EMAIL?: string;
  GSC_SERVICE_ACCOUNT_PRIVATE_KEY?: string;
  GSC_SERVICE_ACCOUNT_KEY_ID?: string;
};

type GoogleSearchAnalyticsRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

type GoogleSearchAnalyticsResponse = {
  rows?: GoogleSearchAnalyticsRow[];
};

type GoogleSiteResource = {
  siteUrl?: string;
  permissionLevel?: string;
};

type RankingConfigRow = {
  site_id: string;
  enabled: number;
  site_url: string;
  metadata_json: string | null;
  updated_at: string;
};

type RankingSnapshotRow = {
  id: string;
  status: string;
  sync_at: string;
  site_url: string;
  permission_level: string | null;
  available_date: string | null;
  current_window_json: string | null;
  previous_window_json: string | null;
  top_pages_json: string;
  top_queries_json: string;
  daily_trend_json: string;
  error_message: string | null;
};

type SiteSettingsFallbackRow = {
  site_url: string | null;
  schedule_cron_utc: string | null;
  automation_enabled: number | null;
};

type SeoRankingConfigPayload = {
  enabled: boolean;
  siteUrl: string;
  metadata: Record<string, unknown>;
};

type SeoRankingConfigRecord = {
  enabled: boolean;
  siteUrl: string;
  metadata: Record<string, unknown>;
  updatedAt: string | null;
};

type ScheduledRankingTarget = {
  siteId: string;
  label: string;
  scheduleCronUtc: string | null;
};

type RankingEventCallback = (eventType: string, message: string, metadata?: Record<string, unknown>) => Promise<void> | void;

export class SeoRankingError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "SeoRankingError";
    this.status = status;
  }
}

function getRequiredDatabase(env: Cloudflare.Env) {
  if (!env.DB) {
    throw new SeoRankingError("D1 binding is not configured yet.", 503);
  }

  return env.DB;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseObject(value: string | null) {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseArray<T>(value: string | null): T[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serializeObject(value: unknown) {
  if (!value || !isRecord(value) || Object.keys(value).length === 0) {
    return null;
  }

  return JSON.stringify(value);
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeNonEmptyString(value: unknown) {
  return normalizeText(value);
}

function normalizeInteger(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return 0;
  }

  return Math.max(0, Math.round(number));
}

function normalizeDecimal(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }

  return Math.round(number * 10) / 10;
}

function normalizePercent(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }

  const normalized = number <= 1 ? number * 100 : number;
  return Math.round(normalized * 10) / 10;
}

function normalizePemPrivateKey(value: unknown): string | null {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  return normalized.includes("\\n") ? normalized.replace(/\\n/g, "\n") : normalized;
}

function normalizeSeoRankingSiteUrl(value: unknown): string | null {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("sc-domain:")) {
    return normalized;
  }

  try {
    const url = new URL(/^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`);
    if (!url.pathname || url.pathname === "") {
      url.pathname = "/";
    }
    if (!url.pathname.endsWith("/")) {
      url.pathname = `${url.pathname}/`;
    }
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeMetrics(value: unknown): SeoRankingDimensionMetrics {
  if (!value || typeof value !== "object") {
    return {
      clicks: 0,
      impressions: 0,
      ctr: 0,
      position: 0
    };
  }

  const record = value as Partial<SeoRankingDimensionMetrics>;
  return {
    clicks: normalizeInteger(record.clicks),
    impressions: normalizeInteger(record.impressions),
    ctr: normalizePercent(record.ctr),
    position: normalizeDecimal(record.position)
  };
}

function normalizeWindowMetrics(value: unknown): SeoRankingWindowMetrics | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Partial<SeoRankingWindowMetrics>;
  const startDate = normalizeNonEmptyString(record.startDate);
  const endDate = normalizeNonEmptyString(record.endDate);
  if (!startDate || !endDate) {
    return null;
  }

  return {
    startDate,
    endDate,
    clicks: normalizeInteger(record.clicks),
    impressions: normalizeInteger(record.impressions),
    ctr: normalizePercent(record.ctr),
    position: normalizeDecimal(record.position)
  };
}

function normalizeDimensionRows(value: unknown): SeoRankingDimensionRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Partial<SeoRankingDimensionRow>;
      const key = normalizeNonEmptyString(record.key);
      const label = normalizeNonEmptyString(record.label) || key;
      if (!key || !label) {
        return null;
      }

      return {
        key,
        label,
        current: normalizeMetrics(record.current),
        previous: normalizeMetrics(record.previous)
      };
    })
    .filter((item): item is SeoRankingDimensionRow => Boolean(item));
}

function normalizeTrend(value: unknown): SeoRankingTrendPoint[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Partial<SeoRankingTrendPoint>;
      const date = normalizeNonEmptyString(record.date);
      if (!date) {
        return null;
      }

      return {
        date,
        clicks: normalizeInteger(record.clicks),
        impressions: normalizeInteger(record.impressions),
        ctr: normalizePercent(record.ctr),
        position: normalizeDecimal(record.position)
      };
    })
    .filter((item): item is SeoRankingTrendPoint => Boolean(item))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function getGoogleSearchConsoleCredentials(env: Cloudflare.Env) {
  const googleEnv = env as Cloudflare.Env & GoogleSearchConsoleEnv;
  return {
    email: normalizeNonEmptyString(googleEnv.GSC_SERVICE_ACCOUNT_EMAIL) || null,
    privateKey: normalizePemPrivateKey(googleEnv.GSC_SERVICE_ACCOUNT_PRIVATE_KEY),
    keyId: normalizeNonEmptyString(googleEnv.GSC_SERVICE_ACCOUNT_KEY_ID) || null
  };
}

async function readSiteSettingsFallback(env: Cloudflare.Env, siteId: string) {
  if (!env.DB) {
    return {
      siteUrl: null,
      scheduleCronUtc: null,
      automationEnabled: false
    };
  }

  const row = await env.DB
    .prepare("SELECT site_url, schedule_cron_utc, automation_enabled FROM managed_site_seo_settings WHERE site_id = ?1 LIMIT 1")
    .bind(siteId)
    .first<SiteSettingsFallbackRow>();

  return {
    siteUrl: row?.site_url ? normalizeSeoRankingSiteUrl(row.site_url) : null,
    scheduleCronUtc: row?.schedule_cron_utc ?? null,
    automationEnabled: row?.automation_enabled === 1
  };
}

async function ensureSiteExists(env: Cloudflare.Env, siteId: string) {
  const site = await readManagedSiteRecord(env, siteId);
  if (!site) {
    throw new SeoRankingError(`Unknown site: ${siteId}`, 404);
  }

  return site;
}

async function readRankingConfigRow(db: D1Database, siteId: string) {
  return db
    .prepare(
      `
      SELECT site_id, enabled, site_url, metadata_json, updated_at
      FROM managed_site_seo_ranking_configs
      WHERE site_id = ?1
      LIMIT 1
      `
    )
    .bind(siteId)
    .first<RankingConfigRow>();
}

function mapRankingConfigRow(row: RankingConfigRow | null, fallbackSiteUrl: string): SeoRankingConfigRecord {
  return {
    enabled: row?.enabled === 1,
    siteUrl: normalizeSeoRankingSiteUrl(row?.site_url) ?? fallbackSiteUrl,
    metadata: parseObject(row?.metadata_json ?? null),
    updatedAt: row?.updated_at ?? null
  };
}

function mapRankingSnapshotRow(row: RankingSnapshotRow): SeoRankingSnapshot {
  return {
    id: row.id,
    status: row.status === "error" ? "error" : "ok",
    syncAt: row.sync_at,
    siteUrl: row.site_url,
    permissionLevel: row.permission_level,
    availableDate: row.available_date,
    currentWindow: normalizeWindowMetrics(parseObject(row.current_window_json)),
    previousWindow: normalizeWindowMetrics(parseObject(row.previous_window_json)),
    topPages: normalizeDimensionRows(parseArray<unknown>(row.top_pages_json)),
    topQueries: normalizeDimensionRows(parseArray<unknown>(row.top_queries_json)),
    dailyTrend: normalizeTrend(parseArray<unknown>(row.daily_trend_json)),
    errorMessage: row.error_message
  };
}

function buildMissingPrerequisites(
  config: SeoRankingConfigRecord,
  credentials: { email: string | null; privateKey: string | null }
) {
  const missingPrerequisites: string[] = [];
  if (!config.enabled) {
    missingPrerequisites.push("Ranking sync is disabled for this site.");
  }
  if (!config.siteUrl) {
    missingPrerequisites.push("Search Console property URL is not configured.");
  }
  if (!credentials.email) {
    missingPrerequisites.push("GSC_SERVICE_ACCOUNT_EMAIL is not configured.");
  }
  if (!credentials.privateKey) {
    missingPrerequisites.push("GSC_SERVICE_ACCOUNT_PRIVATE_KEY is not configured.");
  }
  return missingPrerequisites;
}

export async function readSeoRankingState(
  env: Cloudflare.Env,
  siteId: string,
  options: { historyLimit?: number } = {}
): Promise<SeoRankingState> {
  const site = await ensureSiteExists(env, siteId);
  const fallbackSettings = await readSiteSettingsFallback(env, siteId);
  const fallbackSiteUrl = fallbackSettings.siteUrl ?? normalizeSeoRankingSiteUrl(site.canonicalUrl) ?? site.canonicalUrl;
  const credentials = getGoogleSearchConsoleCredentials(env);

  if (!env.DB) {
    return {
      enabled: false,
      siteUrl: fallbackSiteUrl,
      hasCredentials: Boolean(credentials.email && credentials.privateKey),
      ready: false,
      serviceAccountEmail: credentials.email,
      missingPrerequisites: [
        "D1 binding is not configured yet.",
        ...buildMissingPrerequisites(
          {
            enabled: false,
            siteUrl: fallbackSiteUrl,
            metadata: {},
            updatedAt: null
          },
          credentials
        )
      ],
      latestSnapshot: null,
      latestSuccessfulSnapshot: null,
      snapshotCount: 0
    };
  }

  const historyLimit = options.historyLimit ?? DEFAULT_HISTORY_LIMIT;
  const [configRow, snapshotRows] = await Promise.all([
    readRankingConfigRow(env.DB, siteId),
    env.DB
      .prepare(
        `
        SELECT id, status, sync_at, site_url, permission_level, available_date, current_window_json, previous_window_json,
               top_pages_json, top_queries_json, daily_trend_json, error_message
        FROM managed_site_seo_ranking_snapshots
        WHERE site_id = ?1
        ORDER BY sync_at DESC
        LIMIT ?2
        `
      )
      .bind(siteId, historyLimit)
      .all<RankingSnapshotRow>()
  ]);

  const config = mapRankingConfigRow(configRow, fallbackSiteUrl);
  const rankingSnapshots = (snapshotRows.results ?? []).map(mapRankingSnapshotRow);
  const latestSnapshot = rankingSnapshots[0] ?? null;
  const latestSuccessfulSnapshot = rankingSnapshots.find((item) => item.status === "ok") ?? null;
  const missingPrerequisites = buildMissingPrerequisites(config, credentials);

  return {
    enabled: config.enabled,
    siteUrl: config.siteUrl,
    hasCredentials: Boolean(credentials.email && credentials.privateKey),
    ready: config.enabled && Boolean(config.siteUrl && credentials.email && credentials.privateKey),
    serviceAccountEmail: credentials.email,
    missingPrerequisites,
    latestSnapshot,
    latestSuccessfulSnapshot,
    snapshotCount: rankingSnapshots.length
  };
}

function parseRankingConfigPayload(input: unknown, fallbackSiteUrl: string): SeoRankingConfigPayload {
  if (!isRecord(input)) {
    throw new SeoRankingError("Request body must be a JSON object.");
  }

  if (typeof input.enabled !== "boolean") {
    throw new SeoRankingError('Field "enabled" must be boolean.');
  }

  const rawSiteUrl = input.siteUrl == null ? fallbackSiteUrl : normalizeText(input.siteUrl);
  const siteUrl = normalizeSeoRankingSiteUrl(rawSiteUrl);
  if (!siteUrl) {
    throw new SeoRankingError('Field "siteUrl" must be a valid Search Console property URL.');
  }
  if (siteUrl.length > MAX_SITE_URL_LENGTH) {
    throw new SeoRankingError('Field "siteUrl" exceeds the maximum allowed length.');
  }

  return {
    enabled: input.enabled,
    siteUrl,
    metadata: isRecord(input.metadata) ? input.metadata : {}
  };
}

export async function upsertSeoRankingConfig(env: Cloudflare.Env, siteId: string, input: unknown) {
  const db = getRequiredDatabase(env);
  const site = await ensureSiteExists(env, siteId);
  const fallbackSettings = await readSiteSettingsFallback(env, siteId);
  const fallbackSiteUrl = fallbackSettings.siteUrl ?? normalizeSeoRankingSiteUrl(site.canonicalUrl) ?? site.canonicalUrl;
  const payload = parseRankingConfigPayload(input, fallbackSiteUrl);

  await db
    .prepare(
      `
      INSERT INTO managed_site_seo_ranking_configs (
        site_id,
        enabled,
        site_url,
        metadata_json,
        updated_at
      )
      VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)
      ON CONFLICT(site_id) DO UPDATE SET
        enabled = excluded.enabled,
        site_url = excluded.site_url,
        metadata_json = excluded.metadata_json,
        updated_at = CURRENT_TIMESTAMP
      `
    )
    .bind(siteId, payload.enabled ? 1 : 0, payload.siteUrl, serializeObject(payload.metadata))
    .run();

  return readSeoRankingState(env, siteId);
}

async function insertRankingSnapshot(
  db: D1Database,
  siteId: string,
  input: Omit<SeoRankingSnapshot, "id"> & { id?: string }
) {
  const snapshotId = input.id ?? crypto.randomUUID();
  await db
    .prepare(
      `
      INSERT INTO managed_site_seo_ranking_snapshots (
        id,
        site_id,
        status,
        sync_at,
        site_url,
        permission_level,
        available_date,
        current_window_json,
        previous_window_json,
        top_pages_json,
        top_queries_json,
        daily_trend_json,
        error_message,
        created_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, CURRENT_TIMESTAMP)
      `
    )
    .bind(
      snapshotId,
      siteId,
      input.status,
      input.syncAt,
      input.siteUrl,
      input.permissionLevel,
      input.availableDate,
      input.currentWindow ? JSON.stringify(input.currentWindow) : null,
      input.previousWindow ? JSON.stringify(input.previousWindow) : null,
      JSON.stringify(input.topPages),
      JSON.stringify(input.topQueries),
      JSON.stringify(input.dailyTrend),
      input.errorMessage
    )
    .run();

  return {
    ...input,
    id: snapshotId
  };
}

async function pruneRankingSnapshots(db: D1Database, siteId: string) {
  await db
    .prepare(
      `
      DELETE FROM managed_site_seo_ranking_snapshots
      WHERE site_id = ?1
        AND id NOT IN (
          SELECT id
          FROM managed_site_seo_ranking_snapshots
          WHERE site_id = ?1
          ORDER BY sync_at DESC
          LIMIT ?2
        )
      `
    )
    .bind(siteId, MAX_STORED_SNAPSHOTS)
    .run();
}

function normalizeGoogleMetrics(row: GoogleSearchAnalyticsRow | null | undefined): SeoRankingDimensionMetrics {
  return {
    clicks: normalizeInteger(row?.clicks),
    impressions: normalizeInteger(row?.impressions),
    ctr: normalizePercent(row?.ctr),
    position: normalizeDecimal(row?.position)
  };
}

function formatRankingPageLabel(rawValue: string) {
  try {
    const url = new URL(rawValue);
    return `${url.pathname}${url.search}`;
  } catch {
    return rawValue;
  }
}

function mergeDimensionRows(
  currentRows: GoogleSearchAnalyticsRow[],
  previousRows: GoogleSearchAnalyticsRow[],
  dimension: "page" | "query"
) {
  const combined = new Map<string, SeoRankingDimensionRow>();

  for (const row of currentRows) {
    const rawKey = normalizeText(row.keys?.[0]);
    if (!rawKey) {
      continue;
    }

    combined.set(rawKey, {
      key: rawKey,
      label: dimension === "page" ? formatRankingPageLabel(rawKey) : rawKey,
      current: normalizeGoogleMetrics(row),
      previous: {
        clicks: 0,
        impressions: 0,
        ctr: 0,
        position: 0
      }
    });
  }

  for (const row of previousRows) {
    const rawKey = normalizeText(row.keys?.[0]);
    if (!rawKey) {
      continue;
    }

    const existing = combined.get(rawKey) ?? {
      key: rawKey,
      label: dimension === "page" ? formatRankingPageLabel(rawKey) : rawKey,
      current: {
        clicks: 0,
        impressions: 0,
        ctr: 0,
        position: 0
      },
      previous: {
        clicks: 0,
        impressions: 0,
        ctr: 0,
        position: 0
      }
    };

    existing.previous = normalizeGoogleMetrics(row);
    combined.set(rawKey, existing);
  }

  return Array.from(combined.values())
    .sort((left, right) => {
      if (right.current.clicks !== left.current.clicks) {
        return right.current.clicks - left.current.clicks;
      }
      if (right.current.impressions !== left.current.impressions) {
        return right.current.impressions - left.current.impressions;
      }
      if (right.previous.clicks !== left.previous.clicks) {
        return right.previous.clicks - left.previous.clicks;
      }
      return left.label.localeCompare(right.label, "zh-Hant");
    })
    .slice(0, MAX_DIMENSION_ROWS);
}

function formatDateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const year = parts.find((item) => item.type === "year")?.value || "0000";
  const month = parts.find((item) => item.type === "month")?.value || "01";
  const day = parts.find((item) => item.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

function offsetDate(daysOffset: number, timezone: string, fromDate?: string) {
  const date = fromDate ? new Date(`${fromDate}T00:00:00+08:00`) : new Date();
  date.setUTCDate(date.getUTCDate() + daysOffset);
  return formatDateInTimeZone(date, timezone);
}

async function fetchGoogleSearchConsoleJson<T>(url: string, accessToken: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...(init.headers || {})
    }
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`.trim();
    try {
      const payload = (await response.json()) as { error?: { message?: string } };
      const detail = normalizeNonEmptyString(payload?.error?.message);
      if (detail) {
        message = detail;
      }
    } catch {
      // ignore parse failures
    }
    throw new SeoRankingError(`Google Search Console API failed: ${message}`, 502);
  }

  return (await response.json()) as T;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function base64UrlEncode(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signGoogleJwt(input: {
  header: Record<string, unknown>;
  claims: Record<string, unknown>;
  privateKeyPem: string;
}) {
  const header = base64UrlEncode(JSON.stringify(input.header));
  const claims = base64UrlEncode(JSON.stringify(input.claims));
  const signingInput = `${header}.${claims}`;
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(input.privateKeyPem),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function getGoogleServiceAccountAccessToken(credentials: {
  email: string;
  privateKey: string;
  keyId: string | null;
}) {
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signGoogleJwt({
    header: credentials.keyId
      ? { alg: "RS256", typ: "JWT", kid: credentials.keyId }
      : { alg: "RS256", typ: "JWT" },
    claims: {
      iss: credentials.email,
      scope: GOOGLE_OAUTH_SCOPE,
      aud: GOOGLE_TOKEN_ENDPOINT,
      iat: now,
      exp: now + 3600
    },
    privateKeyPem: credentials.privateKey
  });

  const body = new URLSearchParams();
  body.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  body.set("assertion", assertion);

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`.trim();
    try {
      const payload = (await response.json()) as {
        error?: string;
        error_description?: string;
      };
      message = normalizeNonEmptyString(payload.error_description) || normalizeNonEmptyString(payload.error) || message;
    } catch {
      // ignore parse failures
    }
    throw new SeoRankingError(`Google OAuth token exchange failed: ${message}`, 502);
  }

  const payload = (await response.json()) as { access_token?: string };
  const accessToken = normalizeNonEmptyString(payload.access_token);
  if (!accessToken) {
    throw new SeoRankingError("Google OAuth token response was missing access_token.", 502);
  }

  return accessToken;
}

async function querySearchAnalyticsWindow(accessToken: string, siteUrl: string, startDate: string, endDate: string) {
  const response = await fetchGoogleSearchConsoleJson<GoogleSearchAnalyticsResponse>(
    `${GOOGLE_SEARCH_CONSOLE_ENDPOINT}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        startDate,
        endDate,
        type: "web"
      })
    }
  );
  const row = Array.isArray(response?.rows) && response.rows.length > 0 ? response.rows[0] : null;
  return {
    startDate,
    endDate,
    ...normalizeGoogleMetrics(row)
  };
}

async function querySearchAnalyticsDimensions(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimension: "page" | "query"
) {
  const response = await fetchGoogleSearchConsoleJson<GoogleSearchAnalyticsResponse>(
    `${GOOGLE_SEARCH_CONSOLE_ENDPOINT}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        startDate,
        endDate,
        type: "web",
        dimensions: [dimension],
        rowLimit: MAX_DIMENSION_ROWS
      })
    }
  );
  return Array.isArray(response?.rows) ? response.rows : [];
}

async function querySearchAnalyticsTrend(accessToken: string, siteUrl: string, startDate: string, endDate: string) {
  const response = await fetchGoogleSearchConsoleJson<GoogleSearchAnalyticsResponse>(
    `${GOOGLE_SEARCH_CONSOLE_ENDPOINT}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        startDate,
        endDate,
        type: "web",
        dimensions: ["date"],
        rowLimit: 32
      })
    }
  );

  const rows = Array.isArray(response?.rows) ? response.rows : [];
  return rows
    .map((row) => {
      const date = normalizeText(row.keys?.[0]);
      if (!date) {
        return null;
      }

      return {
        date,
        ...normalizeGoogleMetrics(row)
      };
    })
    .filter((item): item is SeoRankingTrendPoint => Boolean(item))
    .sort((left, right) => left.date.localeCompare(right.date));
}

async function determineLatestAvailableDate(accessToken: string, siteUrl: string, timezone: string) {
  const endDate = offsetDate(-1, timezone);
  const startDate = offsetDate(-10, timezone, endDate);
  const rows = await querySearchAnalyticsTrend(accessToken, siteUrl, startDate, endDate);
  return rows.length > 0 ? rows[rows.length - 1].date : null;
}

export async function runManagedSiteSeoRankingSync(
  env: Cloudflare.Env,
  siteId: string,
  options: {
    event?: RankingEventCallback;
  } = {}
) {
  const db = getRequiredDatabase(env);
  const site = await ensureSiteExists(env, siteId);
  const fallbackSettings = await readSiteSettingsFallback(env, siteId);
  const fallbackSiteUrl = fallbackSettings.siteUrl ?? normalizeSeoRankingSiteUrl(site.canonicalUrl) ?? site.canonicalUrl;
  const config = mapRankingConfigRow(await readRankingConfigRow(db, siteId), fallbackSiteUrl);
  const credentials = getGoogleSearchConsoleCredentials(env);
  const timezone = env.SCHEDULE_TIMEZONE ?? DEFAULT_TIMEZONE;

  if (!config.enabled) {
    throw new SeoRankingError("Ranking sync is disabled for this site.", 409);
  }
  if (!config.siteUrl) {
    throw new SeoRankingError("Search Console property URL is not configured.", 400);
  }
  if (!credentials.email || !credentials.privateKey) {
    throw new SeoRankingError("GSC service account credentials are not configured.", 503);
  }

  await options.event?.("ranking_config_resolved", "Resolved ranking sync config.", {
    siteUrl: config.siteUrl,
    serviceAccountEmail: credentials.email
  });

  const syncAt = new Date().toISOString();

  try {
    const accessToken = await getGoogleServiceAccountAccessToken({
      email: credentials.email,
      privateKey: credentials.privateKey,
      keyId: credentials.keyId
    });

    await options.event?.("ranking_access_token_ready", "Obtained Google access token.");

    const siteResource = await fetchGoogleSearchConsoleJson<GoogleSiteResource>(
      `${GOOGLE_SEARCH_CONSOLE_ENDPOINT}/sites/${encodeURIComponent(config.siteUrl)}`,
      accessToken,
      { method: "GET" }
    );

    const permissionLevel = normalizeNonEmptyString(siteResource.permissionLevel) || null;
    const availableDate = await determineLatestAvailableDate(accessToken, config.siteUrl, timezone);
    const currentEndDate = availableDate || offsetDate(-3, timezone);
    const currentStartDate = offsetDate(-27, timezone, currentEndDate);
    const previousEndDate = offsetDate(-1, timezone, currentStartDate);
    const previousStartDate = offsetDate(-27, timezone, previousEndDate);

    const [currentWindow, previousWindow, currentPages, previousPages, currentQueries, previousQueries, dailyTrend] =
      await Promise.all([
        querySearchAnalyticsWindow(accessToken, config.siteUrl, currentStartDate, currentEndDate),
        querySearchAnalyticsWindow(accessToken, config.siteUrl, previousStartDate, previousEndDate),
        querySearchAnalyticsDimensions(accessToken, config.siteUrl, currentStartDate, currentEndDate, "page"),
        querySearchAnalyticsDimensions(accessToken, config.siteUrl, previousStartDate, previousEndDate, "page"),
        querySearchAnalyticsDimensions(accessToken, config.siteUrl, currentStartDate, currentEndDate, "query"),
        querySearchAnalyticsDimensions(accessToken, config.siteUrl, previousStartDate, previousEndDate, "query"),
        querySearchAnalyticsTrend(accessToken, config.siteUrl, currentStartDate, currentEndDate)
      ]);

    await options.event?.("ranking_queries_completed", "Fetched Search Console ranking windows and dimensions.", {
      currentStartDate,
      currentEndDate,
      previousStartDate,
      previousEndDate,
      trendPoints: dailyTrend.length
    });

    const snapshot = await insertRankingSnapshot(db, siteId, {
      status: "ok",
      syncAt,
      siteUrl: config.siteUrl,
      permissionLevel,
      availableDate,
      currentWindow,
      previousWindow,
      topPages: mergeDimensionRows(currentPages, previousPages, "page"),
      topQueries: mergeDimensionRows(currentQueries, previousQueries, "query"),
      dailyTrend,
      errorMessage: null
    });

    await pruneRankingSnapshots(db, siteId);
    await options.event?.("ranking_snapshot_stored", "Stored ranking snapshot.", {
      snapshotId: snapshot.id,
      status: snapshot.status,
      availableDate: snapshot.availableDate
    });

    return snapshot;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorSnapshot = await insertRankingSnapshot(db, siteId, {
      status: "error",
      syncAt,
      siteUrl: config.siteUrl,
      permissionLevel: null,
      availableDate: null,
      currentWindow: null,
      previousWindow: null,
      topPages: [],
      topQueries: [],
      dailyTrend: [],
      errorMessage: message
    });
    await pruneRankingSnapshots(db, siteId);
    await options.event?.("ranking_snapshot_failed", "Stored failed ranking snapshot.", {
      snapshotId: errorSnapshot.id,
      error: message
    });

    if (error instanceof SeoRankingError) {
      throw error;
    }

    throw new SeoRankingError(message, 502);
  }
}

export async function runManagedSiteSeoRankingSyncJob(
  env: Cloudflare.Env,
  siteId: string,
  options: {
    triggerSource: SeoJobTriggerSource;
    payload?: Record<string, unknown>;
  }
) {
  return runSeoJob(
    env,
    {
      siteId,
      jobType: "ranking_sync",
      triggerSource: options.triggerSource,
      payload: options.payload
    },
    async (reporter) => {
      const result = await runManagedSiteSeoRankingSync(env, siteId, {
        event: reporter.event
      });

      return result;
    }
  );
}

export async function listScheduledRankingTargets(
  env: Cloudflare.Env,
  options: { scheduledTime?: Date | number | string | null } = {}
): Promise<ScheduledRankingTarget[]> {
  if (!env.DB) {
    return [];
  }

  const result = await env.DB
    .prepare(
      `
      SELECT ms.id AS site_id, ms.label, settings.schedule_cron_utc
      FROM managed_sites AS ms
      INNER JOIN managed_site_seo_settings AS settings
        ON settings.site_id = ms.id
      INNER JOIN managed_site_seo_ranking_configs AS ranking
        ON ranking.site_id = ms.id
      WHERE settings.automation_enabled = 1
        AND ranking.enabled = 1
      ORDER BY ms.migration_priority ASC, ms.label ASC
      `
    )
    .all<{
      site_id: string;
      label: string;
      schedule_cron_utc: string | null;
    }>();

  const scheduledTime = options.scheduledTime ? new Date(options.scheduledTime) : null;
  return (result.results ?? [])
    .map((row) => ({
      siteId: row.site_id,
      label: row.label,
      scheduleCronUtc: row.schedule_cron_utc
    }))
    .filter((item) => !scheduledTime || matchesScheduledTick(item.scheduleCronUtc, scheduledTime));
}
