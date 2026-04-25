import { readManagedSiteRecord } from "./managed-sites";
import type { SeoFaqItem, SeoStructuredOverride } from "./seo-types";

const ENTITY_SEGMENT_PATTERN = /^[a-z0-9][a-z0-9:_-]{1,63}$/;
const MAX_TEXT_FIELD_LENGTH = 24_000;
const MAX_FAQ_ITEMS = 12;
const DEFAULT_OVERRIDE_LIMIT = 100;

type StructuredOverrideRow = {
  id: string;
  entity_type: string;
  entity_key: string;
  route_path: string;
  title: string | null;
  description: string | null;
  heading: string | null;
  intro: string | null;
  content: string | null;
  faq_json: string | null;
  last_task_type: string | null;
  last_model_key: string | null;
  updated_by: string | null;
  updated_at: string;
  metadata_json: string | null;
};

type StructuredOverridePayload = {
  entityType: string;
  entityKey: string;
  routePath: string;
  title: string;
  description: string;
  heading: string;
  intro: string;
  content: string;
  faq: SeoFaqItem[];
  taskType: string | null;
  modelKey: string | null;
  updatedBy: string | null;
  metadata: Record<string, unknown>;
};

type StructuredOverrideListOptions = {
  entityType?: string;
  entityKey?: string;
  routePath?: string;
  limit?: number;
};

export class StructuredOverrideError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "StructuredOverrideError";
    this.status = status;
  }
}

function getRequiredDatabase(env: Cloudflare.Env) {
  if (!env.DB) {
    throw new StructuredOverrideError("D1 binding is not configured yet.", 503);
  }

  return env.DB;
}

function buildStructuredOverrideId(siteId: string, entityType: string, entityKey: string) {
  return `${siteId}::override::${entityType}::${entityKey}`;
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

function parseArray<T>(value: string | null, fallback: T[]): T[] {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as T[];
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizeFaqItem(value: unknown): SeoFaqItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const question = typeof value.question === "string" ? value.question.trim() : "";
  const answer = typeof value.answer === "string" ? value.answer.trim() : "";
  if (!question || !answer) {
    return null;
  }

  return { question, answer };
}

function parseFaq(value: string | null) {
  return parseArray<unknown>(value, []).map(normalizeFaqItem).filter((item): item is SeoFaqItem => Boolean(item));
}

function readOptionalText(input: Record<string, unknown>, field: string, maxLength = MAX_TEXT_FIELD_LENGTH) {
  const value = input[field];
  if (value == null) {
    return "";
  }
  if (typeof value !== "string") {
    throw new StructuredOverrideError(`Field "${field}" must be a string when provided.`);
  }

  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new StructuredOverrideError(`Field "${field}" exceeds the maximum allowed length.`);
  }

  return normalized;
}

function readRequiredText(input: Record<string, unknown>, field: string, maxLength = MAX_TEXT_FIELD_LENGTH) {
  const normalized = readOptionalText(input, field, maxLength);
  if (!normalized) {
    throw new StructuredOverrideError(`Field "${field}" is required.`);
  }

  return normalized;
}

function readOptionalNullableText(input: Record<string, unknown>, field: string, maxLength = MAX_TEXT_FIELD_LENGTH) {
  const value = input[field];
  if (value == null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new StructuredOverrideError(`Field "${field}" must be a string when provided.`);
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length > maxLength) {
    throw new StructuredOverrideError(`Field "${field}" exceeds the maximum allowed length.`);
  }

  return normalized;
}

function normalizeEntitySegment(value: string, field: string) {
  const normalized = value.trim();
  if (!ENTITY_SEGMENT_PATTERN.test(normalized)) {
    throw new StructuredOverrideError(
      `Field "${field}" must be lowercase and may include letters, numbers, hyphen, underscore, or colon.`
    );
  }

  return normalized;
}

function normalizeRoutePath(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new StructuredOverrideError('Field "routePath" is required.');
  }

  try {
    const absoluteUrl = new URL(normalized);
    return `${absoluteUrl.pathname}${absoluteUrl.search}` || "/";
  } catch {
    if (!normalized.startsWith("/")) {
      throw new StructuredOverrideError('Field "routePath" must start with "/" or be an absolute URL.');
    }

    return normalized;
  }
}

function readFaq(input: Record<string, unknown>) {
  const value = input.faq;
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new StructuredOverrideError('Field "faq" must be an array when provided.');
  }

  if (value.length > MAX_FAQ_ITEMS) {
    throw new StructuredOverrideError(`Field "faq" supports up to ${MAX_FAQ_ITEMS} items.`);
  }

  return value
    .map((item) => {
      const normalized = normalizeFaqItem(item);
      if (!normalized) {
        throw new StructuredOverrideError('Each "faq" item must include a non-empty question and answer.');
      }
      return normalized;
    })
    .filter(Boolean);
}

function parseStructuredOverridePayload(input: unknown): StructuredOverridePayload {
  if (!isRecord(input)) {
    throw new StructuredOverrideError("Request body must be a JSON object.");
  }

  const entityType = normalizeEntitySegment(readRequiredText(input, "entityType", 64), "entityType");
  const entityKey = normalizeEntitySegment(readRequiredText(input, "entityKey", 64), "entityKey");
  const routePath = normalizeRoutePath(readRequiredText(input, "routePath", 512));

  return {
    entityType,
    entityKey,
    routePath,
    title: readOptionalText(input, "title", 300),
    description: readOptionalText(input, "description", 400),
    heading: readOptionalText(input, "heading", 300),
    intro: readOptionalText(input, "intro", 4_000),
    content: readOptionalText(input, "content"),
    faq: readFaq(input),
    taskType: readOptionalNullableText(input, "taskType", 120),
    modelKey: readOptionalNullableText(input, "modelKey", 240),
    updatedBy: readOptionalNullableText(input, "updatedBy", 240),
    metadata: isRecord(input.metadata) ? input.metadata : {}
  };
}

function mapStructuredOverride(row: StructuredOverrideRow): SeoStructuredOverride {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityKey: row.entity_key,
    routePath: row.route_path,
    title: row.title ?? "",
    description: row.description ?? "",
    heading: row.heading ?? "",
    intro: row.intro ?? "",
    content: row.content ?? "",
    faq: parseFaq(row.faq_json),
    taskType: row.last_task_type,
    modelKey: row.last_model_key,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
    metadata: parseObject(row.metadata_json)
  };
}

async function ensureSiteExists(env: Cloudflare.Env, siteId: string) {
  const site = await readManagedSiteRecord(env, siteId);
  if (!site) {
    throw new StructuredOverrideError(`Unknown site: ${siteId}`, 404);
  }

  return site;
}

export async function listStructuredOverrides(
  env: Cloudflare.Env,
  siteId: string,
  options: StructuredOverrideListOptions = {}
) {
  await ensureSiteExists(env, siteId);

  if (!env.DB) {
    return [];
  }

  const limit = Math.min(Math.max(options.limit ?? DEFAULT_OVERRIDE_LIMIT, 1), DEFAULT_OVERRIDE_LIMIT);
  let statement: D1PreparedStatement;

  if (options.entityType && options.entityKey) {
    statement = env.DB.prepare(
      `
      SELECT *
      FROM managed_site_structured_overrides
      WHERE site_id = ?1 AND entity_type = ?2 AND entity_key = ?3
      ORDER BY updated_at DESC
      LIMIT ?4
      `
    ).bind(siteId, options.entityType, options.entityKey, limit);
  } else if (options.entityType) {
    statement = env.DB.prepare(
      `
      SELECT *
      FROM managed_site_structured_overrides
      WHERE site_id = ?1 AND entity_type = ?2
      ORDER BY updated_at DESC
      LIMIT ?3
      `
    ).bind(siteId, options.entityType, limit);
  } else if (options.routePath) {
    statement = env.DB.prepare(
      `
      SELECT *
      FROM managed_site_structured_overrides
      WHERE site_id = ?1 AND route_path = ?2
      ORDER BY updated_at DESC
      LIMIT ?3
      `
    ).bind(siteId, options.routePath, limit);
  } else {
    statement = env.DB.prepare(
      `
      SELECT *
      FROM managed_site_structured_overrides
      WHERE site_id = ?1
      ORDER BY updated_at DESC
      LIMIT ?2
      `
    ).bind(siteId, limit);
  }

  const result = await statement.all<StructuredOverrideRow>();
  return (result.results ?? []).map(mapStructuredOverride);
}

export async function readStructuredOverride(env: Cloudflare.Env, siteId: string, entityType: string, entityKey: string) {
  await ensureSiteExists(env, siteId);

  if (!env.DB) {
    return null;
  }

  const row = await env.DB.prepare(
    `
    SELECT *
    FROM managed_site_structured_overrides
    WHERE site_id = ?1 AND entity_type = ?2 AND entity_key = ?3
    LIMIT 1
    `
  )
    .bind(siteId, entityType, entityKey)
    .first<StructuredOverrideRow>();

  return row ? mapStructuredOverride(row) : null;
}

export async function createOrUpdateStructuredOverride(env: Cloudflare.Env, siteId: string, input: unknown) {
  const db = getRequiredDatabase(env);
  await ensureSiteExists(env, siteId);

  const payload = parseStructuredOverridePayload(input);
  const existing = await readStructuredOverride(env, siteId, payload.entityType, payload.entityKey);

  await db
    .prepare(
      `
      INSERT INTO managed_site_structured_overrides (
        id,
        site_id,
        entity_type,
        entity_key,
        route_path,
        title,
        description,
        heading,
        intro,
        content,
        faq_json,
        last_task_type,
        last_model_key,
        updated_by,
        updated_at,
        metadata_json
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, CURRENT_TIMESTAMP, ?15)
      ON CONFLICT(site_id, entity_type, entity_key) DO UPDATE SET
        route_path = excluded.route_path,
        title = excluded.title,
        description = excluded.description,
        heading = excluded.heading,
        intro = excluded.intro,
        content = excluded.content,
        faq_json = excluded.faq_json,
        last_task_type = excluded.last_task_type,
        last_model_key = excluded.last_model_key,
        updated_by = excluded.updated_by,
        updated_at = CURRENT_TIMESTAMP,
        metadata_json = excluded.metadata_json
      `
    )
    .bind(
      buildStructuredOverrideId(siteId, payload.entityType, payload.entityKey),
      siteId,
      payload.entityType,
      payload.entityKey,
      payload.routePath,
      payload.title || null,
      payload.description || null,
      payload.heading || null,
      payload.intro || null,
      payload.content || null,
      JSON.stringify(payload.faq),
      payload.taskType,
      payload.modelKey,
      payload.updatedBy,
      JSON.stringify(payload.metadata)
    )
    .run();

  const item = await readStructuredOverride(env, siteId, payload.entityType, payload.entityKey);
  if (!item) {
    throw new StructuredOverrideError("Structured override could not be read after write.", 500);
  }

  return {
    created: existing == null,
    item
  };
}

export async function deleteStructuredOverride(env: Cloudflare.Env, siteId: string, entityType: string, entityKey: string) {
  const db = getRequiredDatabase(env);
  await ensureSiteExists(env, siteId);

  const existing = await readStructuredOverride(env, siteId, entityType, entityKey);
  if (!existing) {
    throw new StructuredOverrideError(
      `Structured override not found for ${siteId}/${entityType}/${entityKey}.`,
      404
    );
  }

  await db
    .prepare(
      `
      DELETE FROM managed_site_structured_overrides
      WHERE site_id = ?1 AND entity_type = ?2 AND entity_key = ?3
      `
    )
    .bind(siteId, entityType, entityKey)
    .run();

  return {
    deleted: true,
    item: existing
  };
}
