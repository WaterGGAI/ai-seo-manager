import {
  attachConnectorCapabilities,
  getManagedSiteManifest,
  listManagedSiteManifests
} from "../connectors/registry";
import type { ManagedSiteManifest } from "../connectors/types";

type ManagedSiteRow = {
  id: string;
  label: string;
  site_type: ManagedSiteManifest["siteType"];
  primary_language: string;
  publish_mode: ManagedSiteManifest["publishMode"];
  canonical_url: string;
  connector_name: string;
  source_project_path: string;
  migration_priority: number;
  metadata_json: string | null;
};

function parseMetadata(value: string | null) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function parseNotes(metadata: Record<string, unknown>, fallback: string[]) {
  const candidate = metadata.notes;
  if (!Array.isArray(candidate)) {
    return fallback;
  }

  const notes = candidate.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  return notes.length > 0 ? notes : fallback;
}

function mergeManagedSiteRow(row: ManagedSiteRow, fallback: ManagedSiteManifest | null): ManagedSiteManifest {
  const metadata = parseMetadata(row.metadata_json);

  return {
    id: row.id,
    label: row.label || fallback?.label || row.id,
    sourceProjectPath: row.source_project_path || fallback?.sourceProjectPath || "",
    siteType: row.site_type || fallback?.siteType || "brand_local_seo",
    primaryLanguage: row.primary_language || fallback?.primaryLanguage || "zh-TW",
    publishMode: row.publish_mode || fallback?.publishMode || "kv_runtime",
    canonicalUrl: row.canonical_url || fallback?.canonicalUrl || "",
    connectorName: row.connector_name || fallback?.connectorName || "demo-brand-runtime",
    migrationPriority: row.migration_priority ?? fallback?.migrationPriority ?? 999,
    notes: parseNotes(metadata, fallback?.notes ?? [])
  };
}

function sortManagedSites(items: ManagedSiteManifest[]) {
  return items.slice().sort((left, right) => {
    if (left.migrationPriority !== right.migrationPriority) {
      return left.migrationPriority - right.migrationPriority;
    }

    return left.label.localeCompare(right.label, "zh-Hant");
  });
}

export async function listManagedSiteRecords(env: Cloudflare.Env) {
  const manifestSites = listManagedSiteManifests();

  if (!env.DB) {
    return manifestSites;
  }

  try {
    const result = await env.DB.prepare(
      "SELECT id, label, site_type, primary_language, publish_mode, canonical_url, connector_name, source_project_path, migration_priority, metadata_json FROM managed_sites ORDER BY migration_priority ASC, updated_at DESC"
    ).all<ManagedSiteRow>();

    const items = new Map(manifestSites.map((site) => [site.id, site]));
    for (const row of result.results ?? []) {
      items.set(row.id, mergeManagedSiteRow(row, items.get(row.id) ?? null));
    }

    return sortManagedSites(Array.from(items.values()));
  } catch {
    return manifestSites;
  }
}

export async function listManagedSitesForRequest(env: Cloudflare.Env) {
  const items = await listManagedSiteRecords(env);
  return items.map(attachConnectorCapabilities);
}

export async function countManagedSites(env: Cloudflare.Env) {
  const items = await listManagedSiteRecords(env);
  return items.length;
}

export async function readManagedSiteRecord(env: Cloudflare.Env, siteId: string): Promise<ManagedSiteManifest | null> {
  const fallback = getManagedSiteManifest(siteId);

  if (!env.DB) {
    return fallback;
  }

  try {
    const row = await env.DB.prepare(
      "SELECT id, label, site_type, primary_language, publish_mode, canonical_url, connector_name, source_project_path, migration_priority, metadata_json FROM managed_sites WHERE id = ?1 LIMIT 1"
    )
      .bind(siteId)
      .first<ManagedSiteRow>();

    if (row) {
      return mergeManagedSiteRow(row, fallback);
    }
  } catch {
    return fallback;
  }

  return fallback;
}

export async function readManagedSiteForRequest(env: Cloudflare.Env, siteId: string) {
  const site = await readManagedSiteRecord(env, siteId);
  return site ? attachConnectorCapabilities(site) : null;
}
