import { readBuildSyncConfig } from "./build-sync";
import { readManagedSiteRecord } from "./managed-sites";
import { readSeoRankingState } from "./seo-ranking";
import { defaultSeoModelId } from "./seo-models";
import { listSeoJobsForSite } from "./seo-jobs";
import type {
  ManagedSiteSeoState,
  SeoAiProvider,
  SeoAuditIssue,
  SeoAuditRun,
  SeoAuditSummary,
  SeoAuditTargetResult,
  SeoDeployStatus,
  SeoDraft,
  SeoDraftSource,
  SeoDraftStatus,
  SeoFaqItem,
  SeoInternalLink,
  SeoJob,
  SeoPublishedArticle,
  SeoRepairDraft,
  SeoRepairStatus,
  SeoRankingState,
  SeoStructuredOverride,
  SeoSection,
  SeoSiteSettings,
  SeoSyncStatus,
  SeoUsageEstimate,
  SeoUsageEvent,
  SeoUsageSummary,
  SeoTopic
} from "./seo-types";

const MAX_AUDIT_HISTORY = 10;
const MAX_RANKING_HISTORY = 10;
const MAX_USAGE_EVENTS = 120;
const MAX_DRAFTS = 18;
const MAX_PUBLISHED = 36;
const MAX_STRUCTURED_OVERRIDES = 24;
const MAX_REPAIRS = 24;
const MAX_JOBS = 10;

type SettingsRow = {
  site_id: string;
  site_url: string;
  daily_audit_enabled: number;
  automation_enabled: number;
  auto_publish_enabled: number;
  auto_queue_for_sync: number;
  auto_deploy_enabled: number;
  schedule_local_time: string;
  schedule_timezone: string;
  schedule_cron_utc: string;
  ai_provider: string;
  fallback_provider: string;
  generation_model: string | null;
  topic_cursor: number;
  last_scheduled_draft_date: string | null;
  last_audit_at: string | null;
  last_generated_at: string | null;
  last_published_at: string | null;
  last_deploy_requested_at: string | null;
  last_deploy_status: string;
  last_deploy_message: string | null;
  last_error: string | null;
  metadata_json: string | null;
};

type TopicRow = {
  id: string;
  site_id: string;
  topic_key: string;
  slug: string;
  title: string;
  focus_keyword: string;
  audience: string | null;
  category: string | null;
  search_intent: string | null;
  summary: string | null;
  metadata_json: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
};

type DraftRow = {
  id: string;
  topic_key: string | null;
  slug: string;
  title: string;
  description: string;
  hero_summary: string | null;
  heading: string | null;
  kicker: string | null;
  focus_keyword: string | null;
  keywords_json: string | null;
  category: string | null;
  audience: string | null;
  search_intent: string | null;
  intro: string | null;
  sections_json: string | null;
  faq_json: string | null;
  internal_links_json: string | null;
  cta_title: string | null;
  cta_body: string | null;
  mdx: string | null;
  source: string;
  status: string;
  sync_status: string;
  generation_mode: string;
  model: string | null;
  usage_json: string | null;
  generation_notes: string | null;
  created_at: string;
  updated_at: string;
};

type PublishedRow = {
  id: string;
  draft_id: string | null;
  topic_key: string | null;
  slug: string;
  title: string;
  description: string;
  hero_summary: string | null;
  heading: string | null;
  kicker: string | null;
  focus_keyword: string | null;
  keywords_json: string | null;
  category: string | null;
  audience: string | null;
  search_intent: string | null;
  intro: string | null;
  sections_json: string | null;
  faq_json: string | null;
  internal_links_json: string | null;
  cta_title: string | null;
  cta_body: string | null;
  mdx: string | null;
  author: string | null;
  tags_json: string | null;
  schema_type: string;
  source: string;
  published_source: string;
  sync_status: string;
  model: string | null;
  usage_json: string | null;
  generation_notes: string | null;
  generated_at: string | null;
  published_at: string;
  updated_at: string;
  live_url: string | null;
};

type AuditRow = {
  id: string;
  source: string;
  base_url: string;
  schedule_label: string | null;
  summary_json: string;
  targets_json: string;
  issues_json: string;
  created_at: string;
};

type UsageRow = {
  id: string;
  created_at: string;
  provider: string;
  source: string;
  topic_key: string | null;
  slug: string | null;
  model: string | null;
  estimated_input_tokens: number | null;
  estimated_output_tokens: number | null;
  estimated_neurons: number | null;
  estimated_usd: number | null;
  used_fallback_chain: number;
  metadata_json: string | null;
};

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

type RepairRow = {
  id: string;
  audit_run_id: string | null;
  path: string;
  status: string;
  source: string;
  apply_mode: string;
  title: string;
  summary: string;
  issue_summary_json: string | null;
  topic_key: string | null;
  slug: string | null;
  route_path: string | null;
  entity_type: string | null;
  entity_key: string | null;
  model: string | null;
  generation_mode: string | null;
  usage_json: string | null;
  proposed_payload_json: string | null;
  created_at: string;
  applied_at: string | null;
  updated_at: string;
};

function asBoolean(value: number | null | undefined, fallback: boolean) {
  return typeof value === "number" ? value === 1 : fallback;
}

function parseObject(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
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

function parseStringArray(value: string | null) {
  return parseArray<unknown>(value, []).filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function normalizeSection(item: unknown): SeoSection | null {
  if (!item || typeof item !== "object") return null;
  const candidate = item as Record<string, unknown>;
  const heading =
    typeof candidate.heading === "string"
      ? candidate.heading
      : typeof candidate.title === "string"
        ? candidate.title
        : "";
  const body =
    typeof candidate.body === "string"
      ? [candidate.body]
      : Array.isArray(candidate.paragraphs)
        ? candidate.paragraphs.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [];
  const bullets = Array.isArray(candidate.bullets)
    ? candidate.bullets.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];

  if (!heading.trim()) return null;

  return {
    heading,
    paragraphs: body,
    bullets
  };
}

function parseSections(value: string | null) {
  return parseArray<unknown>(value, []).map(normalizeSection).filter((item): item is SeoSection => Boolean(item));
}

function normalizeFaq(item: unknown): SeoFaqItem | null {
  if (!item || typeof item !== "object") return null;
  const candidate = item as Record<string, unknown>;
  const question = typeof candidate.question === "string" ? candidate.question : "";
  const answer = typeof candidate.answer === "string" ? candidate.answer : "";
  if (!question.trim() || !answer.trim()) return null;
  return { question, answer };
}

function parseFaq(value: string | null) {
  return parseArray<unknown>(value, []).map(normalizeFaq).filter((item): item is SeoFaqItem => Boolean(item));
}

function normalizeLink(item: unknown): SeoInternalLink | null {
  if (!item || typeof item !== "object") return null;
  const candidate = item as Record<string, unknown>;
  const label =
    typeof candidate.label === "string"
      ? candidate.label
      : typeof candidate.title === "string"
        ? candidate.title
        : "";
  const href = typeof candidate.href === "string" ? candidate.href : "";
  const reason = typeof candidate.reason === "string" ? candidate.reason : undefined;
  if (!label.trim() || !href.trim()) return null;
  return { label, href, reason };
}

function parseLinks(value: string | null) {
  return parseArray<unknown>(value, []).map(normalizeLink).filter((item): item is SeoInternalLink => Boolean(item));
}

function parseUsageEstimate(value: string | null): SeoUsageEstimate | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SeoUsageEstimate>;
    return {
      inputTokens: typeof parsed.inputTokens === "number" ? parsed.inputTokens : null,
      outputTokens: typeof parsed.outputTokens === "number" ? parsed.outputTokens : null,
      totalTokens: typeof parsed.totalTokens === "number" ? parsed.totalTokens : null,
      inputCostUsd: typeof parsed.inputCostUsd === "number" ? parsed.inputCostUsd : null,
      outputCostUsd: typeof parsed.outputCostUsd === "number" ? parsed.outputCostUsd : null,
      estimatedCostUsd: typeof parsed.estimatedCostUsd === "number" ? parsed.estimatedCostUsd : null,
      estimatedNeurons: typeof parsed.estimatedNeurons === "number" ? parsed.estimatedNeurons : null,
      estimateSource:
        parsed.estimateSource === "workers_ai_usage" ||
        parsed.estimateSource === "heuristic" ||
        parsed.estimateSource === "local_template_fallback" ||
        parsed.estimateSource === "unknown"
          ? parsed.estimateSource
          : "unknown"
    };
  } catch {
    return null;
  }
}

function normalizeDraftSource(value: string | null | undefined): SeoDraftSource {
  return value === "scheduled" ? "scheduled" : "manual";
}

function normalizeDraftStatus(value: string | null | undefined): SeoDraftStatus {
  return value === "published_pending_sync" ? "published_pending_sync" : "draft";
}

function normalizeSyncStatus(value: string | null | undefined): SeoSyncStatus {
  if (value === "deploy_triggered" || value === "deploy_failed") {
    return value;
  }
  return "pending_deploy";
}

function normalizeProvider(value: string | null | undefined): SeoAiProvider {
  if (value === "workers-ai" || value === "openai" || value === "template") {
    return value;
  }
  return "template";
}

function normalizeDeployStatus(value: string | null | undefined): SeoDeployStatus {
  if (value === "triggered" || value === "failed") {
    return value;
  }
  return "idle";
}

function normalizeRepairStatus(value: string | null | undefined): SeoRepairStatus {
  if (value === "applied") {
    return value;
  }

  return "draft";
}

function normalizeJobTriggerSource(value: string | null | undefined): "manual_api" | "scheduled_cron" | "bootstrap" {
  if (value === "scheduled_cron" || value === "bootstrap") {
    return value;
  }

  return "manual_api";
}

function normalizeRepairApplyMode(value: string | null | undefined): "published_article" | "structured_override" {
  if (value === "structured_override") {
    return value;
  }

  return "published_article";
}

function getDateKey(value: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function defaultSeoSettings(siteUrl: string, scheduleTimezone: string): SeoSiteSettings {
  return {
    siteUrl,
    dailyAuditEnabled: true,
    automationEnabled: false,
    autoPublishEnabled: false,
    autoQueueForSync: false,
    autoDeployEnabled: false,
    scheduleLocalTime: "03:15",
    scheduleTimezone,
    scheduleCronUtc: "15 19 * * *",
    aiProvider: "workers-ai",
    fallbackProvider: "template",
    generationModel: defaultSeoModelId,
    topicCursor: 0,
    lastScheduledDraftDate: null,
    lastAuditAt: null,
    lastGeneratedAt: null,
    lastPublishedAt: null,
    lastDeployRequestedAt: null,
    lastDeployStatus: "idle",
    lastDeployMessage: null,
    lastError: null,
    metadata: {}
  };
}

function buildUsageSummary(events: SeoUsageEvent[], timezone: string): SeoUsageSummary {
  const todayKey = getDateKey(new Date(), timezone);
  const todayEvents = events.filter((event) => getDateKey(event.createdAt, timezone) === todayKey);
  const workersAiEvents = todayEvents.filter((event) => event.provider === "workers-ai");
  const openAiEvents = todayEvents.filter((event) => event.provider === "openai");
  const templateEvents = todayEvents.filter((event) => event.provider === "template");

  const notes = ["Usage totals are estimated from stored generation events and should be treated as operator-facing estimates."];
  if (openAiEvents.length > 0) {
    notes.push("OpenAI fallback events are counted separately from Workers AI usage.");
  }
  if (templateEvents.some((event) => event.usedFallbackChain)) {
    notes.push("Template fallback events do not contribute AI token spend.");
  }

  return {
    dateKey: todayKey,
    timezone,
    generatedTodayCount: todayEvents.length,
    workersAiCount: workersAiEvents.length,
    openAiCount: openAiEvents.length,
    templateCount: templateEvents.length,
    openAiFallbackCount: openAiEvents.filter((event) => event.usedFallbackChain).length,
    templateFallbackCount: templateEvents.filter((event) => event.usedFallbackChain).length,
    workersAiEstimatedInputTokens: workersAiEvents.reduce((sum, event) => sum + event.estimatedInputTokens, 0),
    workersAiEstimatedOutputTokens: workersAiEvents.reduce((sum, event) => sum + event.estimatedOutputTokens, 0),
    workersAiEstimatedNeurons: workersAiEvents.reduce((sum, event) => sum + (event.estimatedNeurons ?? 0), 0),
    workersAiEstimatedUsd: workersAiEvents.reduce((sum, event) => sum + (event.estimatedUsd ?? 0), 0),
    notes
  };
}

export async function readManagedSiteSeoState(env: Cloudflare.Env, siteId: string): Promise<ManagedSiteSeoState | null> {
  const site = await readManagedSiteRecord(env, siteId);
  if (!site) {
    return null;
  }

  const fallbackSettings = defaultSeoSettings(site.canonicalUrl, env.SCHEDULE_TIMEZONE ?? "Asia/Taipei");

  if (!env.DB) {
    const emptyRankingState: SeoRankingState = {
      enabled: false,
      siteUrl: fallbackSettings.siteUrl,
      hasCredentials: false,
      ready: false,
      serviceAccountEmail: null,
      missingPrerequisites: ["D1 binding is not configured yet."],
      latestSnapshot: null,
      latestSuccessfulSnapshot: null,
      snapshotCount: 0
    };

    return {
      site,
      settings: fallbackSettings,
      topics: [],
      drafts: [],
      published: [],
      audits: [],
      lastAudit: null,
      usageEvents: [],
      usageSummary: buildUsageSummary([], fallbackSettings.scheduleTimezone),
    ranking: emptyRankingState,
    structuredOverrides: [],
    buildSync: null,
    repairs: [],
    jobs: [],
    lastJob: null
  };
}

  const [
    settingsRow,
    topicRows,
    draftRows,
    publishedRows,
    auditRows,
    usageRows,
    structuredOverrideRows,
    buildSync,
    repairRows,
    jobs,
    ranking
  ] = await Promise.all([
    env.DB.prepare("SELECT * FROM managed_site_seo_settings WHERE site_id = ?1 LIMIT 1").bind(siteId).first<SettingsRow>(),
    env.DB.prepare("SELECT * FROM managed_site_seo_topics WHERE site_id = ?1 ORDER BY updated_at DESC").bind(siteId).all<TopicRow>(),
    env.DB.prepare("SELECT * FROM managed_site_seo_drafts WHERE site_id = ?1 ORDER BY created_at DESC LIMIT ?2").bind(siteId, MAX_DRAFTS).all<DraftRow>(),
    env.DB.prepare("SELECT * FROM managed_site_seo_published_articles WHERE site_id = ?1 ORDER BY published_at DESC LIMIT ?2").bind(siteId, MAX_PUBLISHED).all<PublishedRow>(),
    env.DB.prepare("SELECT * FROM managed_site_seo_audit_runs WHERE site_id = ?1 ORDER BY created_at DESC LIMIT ?2").bind(siteId, MAX_AUDIT_HISTORY).all<AuditRow>(),
    env.DB.prepare("SELECT * FROM managed_site_seo_usage_events WHERE site_id = ?1 ORDER BY created_at DESC LIMIT ?2").bind(siteId, MAX_USAGE_EVENTS).all<UsageRow>(),
    env.DB.prepare("SELECT * FROM managed_site_structured_overrides WHERE site_id = ?1 ORDER BY updated_at DESC LIMIT ?2").bind(siteId, MAX_STRUCTURED_OVERRIDES).all<StructuredOverrideRow>(),
    readBuildSyncConfig(env, siteId),
    env.DB.prepare("SELECT * FROM managed_site_seo_repairs WHERE site_id = ?1 ORDER BY created_at DESC LIMIT ?2").bind(siteId, MAX_REPAIRS).all<RepairRow>(),
    listSeoJobsForSite(env, siteId, { limit: MAX_JOBS }),
    readSeoRankingState(env, siteId, { historyLimit: MAX_RANKING_HISTORY })
  ]);

  const settings: SeoSiteSettings = settingsRow
    ? {
        siteUrl: settingsRow.site_url || fallbackSettings.siteUrl,
        dailyAuditEnabled: asBoolean(settingsRow.daily_audit_enabled, fallbackSettings.dailyAuditEnabled),
        automationEnabled: asBoolean(settingsRow.automation_enabled, fallbackSettings.automationEnabled),
        autoPublishEnabled: asBoolean(settingsRow.auto_publish_enabled, fallbackSettings.autoPublishEnabled),
        autoQueueForSync: asBoolean(settingsRow.auto_queue_for_sync, fallbackSettings.autoQueueForSync),
        autoDeployEnabled: asBoolean(settingsRow.auto_deploy_enabled, fallbackSettings.autoDeployEnabled),
        scheduleLocalTime: settingsRow.schedule_local_time || fallbackSettings.scheduleLocalTime,
        scheduleTimezone: settingsRow.schedule_timezone || fallbackSettings.scheduleTimezone,
        scheduleCronUtc: settingsRow.schedule_cron_utc || fallbackSettings.scheduleCronUtc,
        aiProvider: normalizeProvider(settingsRow.ai_provider),
        fallbackProvider: normalizeProvider(settingsRow.fallback_provider),
        generationModel: settingsRow.generation_model || fallbackSettings.generationModel,
        topicCursor: settingsRow.topic_cursor ?? fallbackSettings.topicCursor,
        lastScheduledDraftDate: settingsRow.last_scheduled_draft_date,
        lastAuditAt: settingsRow.last_audit_at,
        lastGeneratedAt: settingsRow.last_generated_at,
        lastPublishedAt: settingsRow.last_published_at,
        lastDeployRequestedAt: settingsRow.last_deploy_requested_at,
        lastDeployStatus: normalizeDeployStatus(settingsRow.last_deploy_status),
        lastDeployMessage: settingsRow.last_deploy_message,
        lastError: settingsRow.last_error,
        metadata: parseObject(settingsRow.metadata_json)
      }
    : fallbackSettings;

  const topics: SeoTopic[] = (topicRows.results ?? []).map((row) => ({
    id: row.id,
    key: row.topic_key,
    slug: row.slug,
    title: row.title,
    focusKeyword: row.focus_keyword,
    audience: row.audience ?? "",
    category: row.category ?? "",
    searchIntent: row.search_intent ?? "",
    summary: row.summary ?? "",
    metadata: parseObject(row.metadata_json),
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));

  const drafts: SeoDraft[] = (draftRows.results ?? []).map((row) => ({
    id: row.id,
    topicKey: row.topic_key,
    slug: row.slug,
    title: row.title,
    description: row.description,
    heroSummary: row.hero_summary ?? "",
    heading: row.heading ?? "",
    kicker: row.kicker ?? "",
    focusKeyword: row.focus_keyword ?? "",
    keywords: parseStringArray(row.keywords_json),
    category: row.category ?? "",
    audience: row.audience ?? "",
    searchIntent: row.search_intent ?? "",
    intro: row.intro ?? "",
    sections: parseSections(row.sections_json),
    faq: parseFaq(row.faq_json),
    internalLinks: parseLinks(row.internal_links_json),
    ctaTitle: row.cta_title ?? "",
    ctaBody: row.cta_body ?? "",
    mdx: row.mdx ?? "",
    source: normalizeDraftSource(row.source),
    status: normalizeDraftStatus(row.status),
    syncStatus: normalizeSyncStatus(row.sync_status),
    generationMode: normalizeProvider(row.generation_mode),
    model: row.model,
    usage: parseUsageEstimate(row.usage_json),
    generationNotes: row.generation_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));

  const published: SeoPublishedArticle[] = (publishedRows.results ?? []).map((row) => ({
    id: row.id,
    draftId: row.draft_id,
    topicKey: row.topic_key,
    slug: row.slug,
    title: row.title,
    description: row.description,
    heroSummary: row.hero_summary ?? "",
    heading: row.heading ?? "",
    kicker: row.kicker ?? "",
    focusKeyword: row.focus_keyword ?? "",
    keywords: parseStringArray(row.keywords_json),
    category: row.category ?? "",
    audience: row.audience ?? "",
    searchIntent: row.search_intent ?? "",
    intro: row.intro ?? "",
    sections: parseSections(row.sections_json),
    faq: parseFaq(row.faq_json),
    internalLinks: parseLinks(row.internal_links_json),
    ctaTitle: row.cta_title ?? "",
    ctaBody: row.cta_body ?? "",
    mdx: row.mdx ?? "",
    author: row.author ?? "AI SEO Control",
    tags: parseStringArray(row.tags_json),
    schemaType: row.schema_type,
    source: normalizeDraftSource(row.source),
    publishedSource: normalizeDraftSource(row.published_source),
    syncStatus: normalizeSyncStatus(row.sync_status),
    model: row.model,
    usage: parseUsageEstimate(row.usage_json),
    generationNotes: row.generation_notes,
    generatedAt: row.generated_at,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    liveUrl: row.live_url ?? `${settings.siteUrl.replace(/\/$/, "")}/blog/${row.slug}`
  }));

  const audits: SeoAuditRun[] = (auditRows.results ?? []).map((row) => ({
    id: row.id,
    source:
      row.source === "scheduled" || row.source === "bootstrap"
        ? row.source
        : "manual",
    baseUrl: row.base_url,
    scheduleLabel: row.schedule_label ?? env.SCHEDULE_LABEL ?? "依各站排程自動執行",
    summary: parseObject(row.summary_json) as unknown as SeoAuditSummary,
    targets: parseArray<SeoAuditTargetResult>(row.targets_json, []),
    issues: parseArray<SeoAuditIssue>(row.issues_json, []),
    createdAt: row.created_at
  }));

  const usageEvents: SeoUsageEvent[] = (usageRows.results ?? []).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    provider: normalizeProvider(row.provider),
    source: normalizeDraftSource(row.source),
    topicKey: row.topic_key,
    slug: row.slug,
    model: row.model,
    estimatedInputTokens: row.estimated_input_tokens ?? 0,
    estimatedOutputTokens: row.estimated_output_tokens ?? 0,
    estimatedNeurons: row.estimated_neurons,
    estimatedUsd: row.estimated_usd,
    usedFallbackChain: row.used_fallback_chain === 1,
    metadata: parseObject(row.metadata_json)
  }));

  const structuredOverrides: SeoStructuredOverride[] = (structuredOverrideRows.results ?? []).map((row) => ({
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
  }));

  const repairs: SeoRepairDraft[] = (repairRows.results ?? []).map((row) => ({
    id: row.id,
    auditRunId: row.audit_run_id,
    path: row.path,
    status: normalizeRepairStatus(row.status),
    source: normalizeJobTriggerSource(row.source),
    applyMode: normalizeRepairApplyMode(row.apply_mode),
    title: row.title,
    summary: row.summary,
    issueSummary: parseStringArray(row.issue_summary_json),
    topicKey: row.topic_key,
    slug: row.slug,
    routePath: row.route_path,
    entityType: row.entity_type,
    entityKey: row.entity_key,
    model: row.model,
    generationMode: normalizeProvider(row.generation_mode),
    usage: parseUsageEstimate(row.usage_json),
    proposedPayload: parseObject(row.proposed_payload_json),
    createdAt: row.created_at,
    appliedAt: row.applied_at,
    updatedAt: row.updated_at
  }));

  const recentJobs: SeoJob[] = jobs;

  return {
    site,
    settings,
    topics,
    drafts,
    published,
    audits,
    lastAudit: audits[0] ?? null,
    usageEvents,
    usageSummary: buildUsageSummary(usageEvents, settings.scheduleTimezone),
    ranking,
    structuredOverrides,
    buildSync,
    repairs,
    jobs: recentJobs,
    lastJob: recentJobs[0] ?? null
  };
}
