import { getConnectorDefinition } from "../connectors/registry";
import type { ManagedSiteManifest, PublishMode, SiteType } from "../connectors/types";
import { hasSiteBootstrapSeed } from "../connectors/seeds";
import { listManagedSiteRecords, readManagedSiteRecord } from "./managed-sites";
import { upsertDefaultSeoSettings, upsertManagedSiteRecord } from "./seo-bootstrap";

const SITE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;
const PUBLISH_MODES: PublishMode[] = [
  "kv_runtime",
  "d1_override",
  "api_feed_build_sync",
  "workflow_module_source"
];
const SITE_TYPES: SiteType[] = [
  "brand_local_seo",
  "programmatic_seo_tools",
  "platform_with_embedded_seo",
  "workflow_module_source"
];

export class SiteOnboardingError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "SiteOnboardingError";
    this.status = status;
  }
}

type SiteOnboardingPayload = {
  id: string;
  label: string;
  canonicalUrl: string;
  connectorName: string;
  publishMode: PublishMode;
  siteType: SiteType;
  primaryLanguage: string;
  sourceProjectPath: string;
  migrationPriority?: number;
  notes: string[];
  metadata: Record<string, unknown>;
  initializeSeoSettings: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readRequiredString(input: Record<string, unknown>, field: string) {
  const value = input[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SiteOnboardingError(`Field "${field}" is required.`);
  }
  return value.trim();
}

function readOptionalString(input: Record<string, unknown>, field: string, fallback = "") {
  const value = input[field];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function readStringArray(input: Record<string, unknown>, field: string) {
  const value = input[field];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function readBoolean(input: Record<string, unknown>, field: string, fallback: boolean) {
  const value = input[field];
  return typeof value === "boolean" ? value : fallback;
}

function readOptionalInteger(input: Record<string, unknown>, field: string) {
  const value = input[field];
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new SiteOnboardingError(`Field "${field}" must be a positive integer when provided.`);
  }
  return value;
}

function normalizeCanonicalUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SiteOnboardingError('Field "canonicalUrl" must be a valid URL.');
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new SiteOnboardingError('Field "canonicalUrl" must use http or https.');
  }

  return url.toString().replace(/\/$/, "");
}

function readPublishMode(value: string): PublishMode {
  if (!PUBLISH_MODES.includes(value as PublishMode)) {
    throw new SiteOnboardingError('Field "publishMode" is invalid.');
  }
  return value as PublishMode;
}

function readSiteType(value: string): SiteType {
  if (!SITE_TYPES.includes(value as SiteType)) {
    throw new SiteOnboardingError('Field "siteType" is invalid.');
  }
  return value as SiteType;
}

function parsePayload(input: unknown): SiteOnboardingPayload {
  if (!isRecord(input)) {
    throw new SiteOnboardingError("Request body must be a JSON object.");
  }

  const id = readRequiredString(input, "id");
  if (!SITE_ID_PATTERN.test(id)) {
    throw new SiteOnboardingError('Field "id" must be lowercase kebab-case and 2-63 characters long.');
  }

  const label = readRequiredString(input, "label");
  const canonicalUrl = normalizeCanonicalUrl(readRequiredString(input, "canonicalUrl"));
  const connectorName = readRequiredString(input, "connectorName");
  const publishMode = readPublishMode(readRequiredString(input, "publishMode"));
  const siteType = readSiteType(readRequiredString(input, "siteType"));
  const primaryLanguage = readOptionalString(input, "primaryLanguage", "zh-TW");
  const sourceProjectPath = readOptionalString(input, "sourceProjectPath", `manual://${id}`);
  const migrationPriority = readOptionalInteger(input, "migrationPriority");
  const notes = readStringArray(input, "notes");
  const metadata = isRecord(input.metadata) ? input.metadata : {};
  const initializeSeoSettings = readBoolean(input, "initializeSeoSettings", true);

  const connector = getConnectorDefinition(connectorName);
  if (!connector) {
    throw new SiteOnboardingError(`Unknown connector: ${connectorName}`);
  }
  if (connector.publishMode !== publishMode) {
    throw new SiteOnboardingError(`Connector "${connectorName}" expects publish mode "${connector.publishMode}".`);
  }
  if (!connector.intendedSiteTypes.includes(siteType)) {
    throw new SiteOnboardingError(`Connector "${connectorName}" does not support site type "${siteType}".`);
  }

  return {
    id,
    label,
    canonicalUrl,
    connectorName,
    publishMode,
    siteType,
    primaryLanguage,
    sourceProjectPath,
    migrationPriority,
    notes,
    metadata,
    initializeSeoSettings
  };
}

async function getNextMigrationPriority(env: Cloudflare.Env) {
  const items = await listManagedSiteRecords(env);
  return items.reduce((max, item) => Math.max(max, item.migrationPriority), 0) + 1;
}

export async function createOrUpdateManagedSite(env: Cloudflare.Env, input: unknown) {
  if (!env.DB) {
    throw new SiteOnboardingError("D1 binding is not configured yet.", 503);
  }

  const payload = parsePayload(input);
  const existing = await readManagedSiteRecord(env, payload.id);
  const site: ManagedSiteManifest = {
    id: payload.id,
    label: payload.label,
    sourceProjectPath: payload.sourceProjectPath,
    siteType: payload.siteType,
    primaryLanguage: payload.primaryLanguage,
    publishMode: payload.publishMode,
    canonicalUrl: payload.canonicalUrl,
    connectorName: payload.connectorName,
    migrationPriority:
      payload.migrationPriority ?? existing?.migrationPriority ?? (await getNextMigrationPriority(env)),
    notes: payload.notes
  };

  await upsertManagedSiteRecord(env.DB, site, {
    manualOnboarding: true,
    onboardingMetadata: payload.metadata
  });

  if (payload.initializeSeoSettings) {
    await upsertDefaultSeoSettings(env.DB, site, {
      scheduleTimezone: env.SCHEDULE_TIMEZONE ?? "Asia/Taipei",
      metadata: {
        onboardingSource: "manual"
      }
    });
  }

  return {
    created: existing == null,
    siteId: site.id,
    label: site.label,
    connectorName: site.connectorName,
    publishMode: site.publishMode,
    siteType: site.siteType,
    seedAvailable: hasSiteBootstrapSeed(site.id),
    initializeSeoSettings: payload.initializeSeoSettings,
    migrationPriority: site.migrationPriority
  };
}
