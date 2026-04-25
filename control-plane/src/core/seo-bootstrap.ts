import { hasSiteBootstrapSeed, getSiteBootstrapSeed } from "../connectors/seeds";
import { getManagedSiteManifest, listManagedSiteManifests } from "../connectors/registry";
import type { ManagedSiteManifest } from "../connectors/types";
import type { ManagedSiteBootstrapSeed } from "../connectors/seeds/types";
import { upsertBuildSyncConfig } from "./build-sync";
import { defaultSeoModelId } from "./seo-models";

function getRequiredDatabase(env: Cloudflare.Env) {
  if (!env.DB) {
    throw new Error("D1 binding is not configured yet.");
  }

  return env.DB;
}

function serializeJson(value: unknown) {
  if (value == null) {
    return null;
  }

  if (typeof value === "object" && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length === 0) {
    return null;
  }

  return JSON.stringify(value);
}

function buildManagedSiteMetadata(site: ManagedSiteManifest, extraMetadata: Record<string, unknown> = {}) {
  return {
    notes: site.notes,
    cloudflareFirst: true,
    extensibleSiteOnboarding: true,
    bootstrapSeedAvailable: hasSiteBootstrapSeed(site.id),
    ...extraMetadata
  };
}

function buildKeywordId(siteId: string, index: number) {
  return `${siteId}::keyword::${index + 1}`;
}

function buildTopicId(siteId: string, topicKey: string) {
  return `${siteId}::topic::${topicKey}`;
}

function buildStructuredOverrideId(siteId: string, entityType: string, entityKey: string) {
  return `${siteId}::override::${entityType}::${entityKey}`;
}

export async function upsertManagedSiteRecord(
  db: D1Database,
  site: ManagedSiteManifest,
  extraMetadata: Record<string, unknown> = {}
) {
  await db
    .prepare(
      `
      INSERT INTO managed_sites (
        id,
        label,
        site_type,
        primary_language,
        publish_mode,
        canonical_url,
        connector_name,
        source_project_path,
        migration_priority,
        is_active,
        metadata_json
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1, ?10)
      ON CONFLICT(id) DO UPDATE SET
        label = excluded.label,
        site_type = excluded.site_type,
        primary_language = excluded.primary_language,
        publish_mode = excluded.publish_mode,
        canonical_url = excluded.canonical_url,
        connector_name = excluded.connector_name,
        source_project_path = excluded.source_project_path,
        migration_priority = excluded.migration_priority,
        is_active = excluded.is_active,
        metadata_json = excluded.metadata_json,
        updated_at = CURRENT_TIMESTAMP
      `
    )
    .bind(
      site.id,
      site.label,
      site.siteType,
      site.primaryLanguage,
      site.publishMode,
      site.canonicalUrl,
      site.connectorName,
      site.sourceProjectPath,
      site.migrationPriority,
      serializeJson(buildManagedSiteMetadata(site, extraMetadata))
    )
    .run();
}

export async function upsertDefaultSeoSettings(
  db: D1Database,
  site: ManagedSiteManifest,
  overrides: Partial<ManagedSiteBootstrapSeed["settings"]> = {}
) {
  const settings = {
    siteUrl: site.canonicalUrl,
    dailyAuditEnabled: true,
    automationEnabled: false,
    autoPublishEnabled: false,
    autoQueueForSync: false,
    autoDeployEnabled: false,
    scheduleLocalTime: "03:15",
    scheduleTimezone: "Asia/Taipei",
    scheduleCronUtc: "15 19 * * *",
    aiProvider: "workers-ai" as const,
    fallbackProvider: "template" as const,
    generationModel: defaultSeoModelId,
    topicCursor: 0,
    metadata: {},
    ...overrides
  };

  await db
    .prepare(
      `
      INSERT INTO managed_site_seo_settings (
        site_id,
        site_url,
        daily_audit_enabled,
        automation_enabled,
        auto_publish_enabled,
        auto_queue_for_sync,
        auto_deploy_enabled,
        schedule_local_time,
        schedule_timezone,
        schedule_cron_utc,
        ai_provider,
        fallback_provider,
        generation_model,
        topic_cursor,
        metadata_json
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
      ON CONFLICT(site_id) DO UPDATE SET
        site_url = excluded.site_url,
        daily_audit_enabled = excluded.daily_audit_enabled,
        automation_enabled = excluded.automation_enabled,
        auto_publish_enabled = excluded.auto_publish_enabled,
        auto_queue_for_sync = excluded.auto_queue_for_sync,
        auto_deploy_enabled = excluded.auto_deploy_enabled,
        schedule_local_time = excluded.schedule_local_time,
        schedule_timezone = excluded.schedule_timezone,
        schedule_cron_utc = excluded.schedule_cron_utc,
        ai_provider = excluded.ai_provider,
        fallback_provider = excluded.fallback_provider,
        generation_model = excluded.generation_model,
        topic_cursor = excluded.topic_cursor,
        metadata_json = excluded.metadata_json,
        updated_at = CURRENT_TIMESTAMP
      `
    )
    .bind(
      site.id,
      settings.siteUrl,
      settings.dailyAuditEnabled ? 1 : 0,
      settings.automationEnabled ? 1 : 0,
      settings.autoPublishEnabled ? 1 : 0,
      settings.autoQueueForSync ? 1 : 0,
      settings.autoDeployEnabled ? 1 : 0,
      settings.scheduleLocalTime,
      settings.scheduleTimezone,
      settings.scheduleCronUtc,
      settings.aiProvider,
      settings.fallbackProvider,
      settings.generationModel,
      settings.topicCursor,
      serializeJson(settings.metadata ?? {})
    )
    .run();
}

async function upsertSeoSettings(db: D1Database, site: ManagedSiteManifest, seed: ManagedSiteBootstrapSeed) {
  return upsertDefaultSeoSettings(
    db,
    {
      ...site,
      canonicalUrl: seed.settings.siteUrl
    },
    seed.settings
  );
}

async function upsertSeoTopics(db: D1Database, siteId: string, seed: ManagedSiteBootstrapSeed) {
  if (seed.topics.length === 0) {
    return;
  }

  await db.batch(
    seed.topics.map((topic) =>
      db
        .prepare(
          `
          INSERT INTO managed_site_seo_topics (
            id,
            site_id,
            topic_key,
            slug,
            title,
            focus_keyword,
            audience,
            category,
            search_intent,
            summary,
            metadata_json,
            is_active
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 1)
          ON CONFLICT(site_id, topic_key) DO UPDATE SET
            slug = excluded.slug,
            title = excluded.title,
            focus_keyword = excluded.focus_keyword,
            audience = excluded.audience,
            category = excluded.category,
            search_intent = excluded.search_intent,
            summary = excluded.summary,
            metadata_json = excluded.metadata_json,
            is_active = excluded.is_active,
            updated_at = CURRENT_TIMESTAMP
          `
        )
        .bind(
          buildTopicId(siteId, topic.key),
          siteId,
          topic.key,
          topic.slug,
          topic.title,
          topic.focusKeyword,
          topic.audience,
          topic.category,
          topic.searchIntent,
          topic.summary,
          serializeJson(topic.metadata ?? {})
        )
    )
  );
}

async function upsertKeywords(db: D1Database, siteId: string, seed: ManagedSiteBootstrapSeed) {
  if (seed.keywords.length === 0) {
    return;
  }

  await db.batch(
    seed.keywords.map((keyword, index) =>
      db
        .prepare(
          `
          INSERT INTO site_keywords (
            id,
            site_id,
            keyword,
            intent,
            cluster_name,
            priority,
            status,
            metadata_json
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active', ?7)
          ON CONFLICT(id) DO UPDATE SET
            keyword = excluded.keyword,
            intent = excluded.intent,
            cluster_name = excluded.cluster_name,
            priority = excluded.priority,
            status = excluded.status,
            metadata_json = excluded.metadata_json,
            updated_at = CURRENT_TIMESTAMP
          `
        )
        .bind(
          buildKeywordId(siteId, index),
          siteId,
          keyword.label,
          keyword.intent,
          keyword.clusterName,
          keyword.priority,
          serializeJson(keyword.metadata ?? {})
        )
    )
  );
}

async function upsertStructuredOverrides(db: D1Database, siteId: string, seed: ManagedSiteBootstrapSeed) {
  const overrides = seed.structuredOverrides ?? [];
  if (overrides.length === 0) {
    return;
  }

  await db.batch(
    overrides.map((override) =>
      db
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
          buildStructuredOverrideId(siteId, override.entityType, override.entityKey),
          siteId,
          override.entityType,
          override.entityKey,
          override.routePath,
          override.title ?? null,
          override.description ?? null,
          override.heading ?? null,
          override.intro ?? null,
          override.content ?? null,
          serializeJson(override.faq ?? []),
          override.taskType ?? null,
          override.modelKey ?? null,
          override.updatedBy ?? null,
          serializeJson(override.metadata ?? {})
        )
    )
  );
}

export async function syncManagedSitesFromManifest(env: Cloudflare.Env) {
  const db = getRequiredDatabase(env);
  const sites = listManagedSiteManifests();

  for (const site of sites) {
    await upsertManagedSiteRecord(db, site);
  }

  return {
    syncedCount: sites.length,
    items: sites.map((site) => ({
      siteId: site.id,
      label: site.label,
      connectorName: site.connectorName,
      seedAvailable: hasSiteBootstrapSeed(site.id)
    }))
  };
}

export async function bootstrapManagedSite(env: Cloudflare.Env, siteId: string) {
  const db = getRequiredDatabase(env);
  const site = getManagedSiteManifest(siteId);
  if (!site) {
    return null;
  }

  const seed = getSiteBootstrapSeed(siteId);
  if (!seed) {
    return {
      siteId,
      label: site.label,
      connectorName: site.connectorName,
      seedAvailable: false,
      settingsSeeded: false,
      topicsSeeded: 0,
      keywordsSeeded: 0,
      structuredOverridesSeeded: 0,
      buildSyncSeeded: false
    };
  }

  await upsertManagedSiteRecord(db, site, {
    sourceProjectPath: seed.sourceProjectPath,
    bootstrapSeedSummary: seed.summary,
    connectorBootstrap: seed.siteMetadata
  });
  await upsertSeoSettings(db, site, seed);
  await Promise.all([
    upsertSeoTopics(db, siteId, seed),
    upsertKeywords(db, siteId, seed),
    upsertStructuredOverrides(db, siteId, seed),
    seed.buildSync ? upsertBuildSyncConfig(db, siteId, seed.buildSync) : Promise.resolve(null)
  ]);

  return {
    siteId,
    label: site.label,
    connectorName: site.connectorName,
    seedAvailable: true,
    settingsSeeded: true,
    topicsSeeded: seed.topics.length,
    keywordsSeeded: seed.keywords.length,
    structuredOverridesSeeded: seed.structuredOverrides?.length ?? 0,
    buildSyncSeeded: Boolean(seed.buildSync)
  };
}
