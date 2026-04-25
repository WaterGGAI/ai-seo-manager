import { readManagedSiteRecord } from "./managed-sites";
import { readManagedSiteSeoState } from "./seo-state";
import type { SeoAiProvider, SeoSiteSettings } from "./seo-types";

export class SeoSettingsError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "SeoSettingsError";
    this.status = status;
  }
}

function getRequiredDatabase(env: Cloudflare.Env) {
  if (!env.DB) {
    throw new SeoSettingsError("D1 binding is not configured yet.", 503);
  }

  return env.DB;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readBoolean(input: Record<string, unknown>, field: string, fallback: boolean) {
  const value = input[field];
  return typeof value === "boolean" ? value : fallback;
}

function readOptionalText(input: Record<string, unknown>, field: string, fallback: string, maxLength = 500) {
  const value = input[field];
  if (value == null) {
    return fallback;
  }

  if (typeof value !== "string") {
    throw new SeoSettingsError(`Field "${field}" must be a string when provided.`);
  }

  const normalized = value.trim();
  if (!normalized) {
    return fallback;
  }

  if (normalized.length > maxLength) {
    throw new SeoSettingsError(`Field "${field}" exceeds the maximum allowed length.`);
  }

  return normalized;
}

function readProvider(input: Record<string, unknown>, field: string, fallback: SeoAiProvider): SeoAiProvider {
  const value = input[field];
  if (value == null || value === "") {
    return fallback;
  }

  if (value === "workers-ai" || value === "openai" || value === "template") {
    return value;
  }

  throw new SeoSettingsError(`Field "${field}" must be workers-ai, openai, or template.`);
}

function assertCronShape(value: string) {
  const parts = value.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new SeoSettingsError('Field "scheduleCronUtc" must be a five-part cron expression.');
  }

  return value.trim();
}

function mergeSettings(current: SeoSiteSettings, input: unknown): SeoSiteSettings {
  if (!isRecord(input)) {
    throw new SeoSettingsError("Request body must be a JSON object.");
  }

  return {
    ...current,
    dailyAuditEnabled: readBoolean(input, "dailyAuditEnabled", current.dailyAuditEnabled),
    automationEnabled: readBoolean(input, "automationEnabled", current.automationEnabled),
    autoPublishEnabled: readBoolean(input, "autoPublishEnabled", current.autoPublishEnabled),
    autoQueueForSync: readBoolean(input, "autoQueueForSync", current.autoQueueForSync),
    autoDeployEnabled: readBoolean(input, "autoDeployEnabled", current.autoDeployEnabled),
    scheduleLocalTime: readOptionalText(input, "scheduleLocalTime", current.scheduleLocalTime, 200),
    scheduleTimezone: readOptionalText(input, "scheduleTimezone", current.scheduleTimezone, 120),
    scheduleCronUtc: assertCronShape(readOptionalText(input, "scheduleCronUtc", current.scheduleCronUtc, 120)),
    aiProvider: readProvider(input, "aiProvider", current.aiProvider),
    fallbackProvider: readProvider(input, "fallbackProvider", current.fallbackProvider),
    generationModel: readOptionalText(input, "generationModel", current.generationModel ?? "", 240) || current.generationModel
  };
}

export async function updateSeoSiteSettings(env: Cloudflare.Env, siteId: string, input: unknown) {
  const db = getRequiredDatabase(env);
  const site = await readManagedSiteRecord(env, siteId);
  if (!site) {
    throw new SeoSettingsError(`Unknown site: ${siteId}`, 404);
  }

  if (site.publishMode === "workflow_module_source") {
    throw new SeoSettingsError("工作流程模組來源不需要啟用自動化排程。", 400);
  }

  const state = await readManagedSiteSeoState(env, siteId);
  if (!state) {
    throw new SeoSettingsError(`SEO state is unavailable for ${siteId}.`, 404);
  }

  const next = mergeSettings(state.settings, input);

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
        last_scheduled_draft_date,
        last_audit_at,
        last_generated_at,
        last_published_at,
        last_deploy_requested_at,
        last_deploy_status,
        last_deploy_message,
        last_error,
        metadata_json,
        updated_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, CURRENT_TIMESTAMP)
      ON CONFLICT(site_id) DO UPDATE SET
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
        last_error = NULL,
        updated_at = CURRENT_TIMESTAMP
      `
    )
    .bind(
      siteId,
      next.siteUrl,
      next.dailyAuditEnabled ? 1 : 0,
      next.automationEnabled ? 1 : 0,
      next.autoPublishEnabled ? 1 : 0,
      next.autoQueueForSync ? 1 : 0,
      next.autoDeployEnabled ? 1 : 0,
      next.scheduleLocalTime,
      next.scheduleTimezone,
      next.scheduleCronUtc,
      next.aiProvider,
      next.fallbackProvider,
      next.generationModel,
      next.topicCursor,
      next.lastScheduledDraftDate,
      next.lastAuditAt,
      next.lastGeneratedAt,
      next.lastPublishedAt,
      next.lastDeployRequestedAt,
      next.lastDeployStatus,
      next.lastDeployMessage,
      next.lastError,
      JSON.stringify(next.metadata)
    )
    .run();

  const updatedState = await readManagedSiteSeoState(env, siteId);
  return updatedState?.settings ?? next;
}
