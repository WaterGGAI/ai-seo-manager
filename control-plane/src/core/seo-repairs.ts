import {
  generateRuntimeContentArtifacts,
  generateStructuredOverrideArtifacts,
  insertDraft,
  insertUsageEvent,
  upsertPublishedArticle
} from "./seo-content-pipeline";
import { readManagedSiteRecord } from "./managed-sites";
import { runSeoJob } from "./seo-jobs";
import { readManagedSiteSeoState } from "./seo-state";
import { createOrUpdateStructuredOverride } from "./structured-overrides";
import type {
  ManagedSiteSeoState,
  SeoAuditIssue,
  SeoDraft,
  SeoJobTriggerSource,
  SeoPublishedArticle,
  SeoRepairApplyMode,
  SeoRepairDraft,
  SeoStructuredOverride,
  SeoTopic,
  SeoUsageEvent
} from "./seo-types";

const ACTIONABLE_AUDIT_LABELS = new Set(["Meta description", "H1 coverage", "Content depth", "FAQ coverage"]);
const DEFAULT_REPAIR_LIMIT = 24;

type ManagedSiteMetadataRow = {
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

type ActionableRepairCandidate = {
  path: string;
  applyMode: SeoRepairApplyMode;
  topic: SeoTopic;
  title: string;
  issueSummary: string[];
  issues: SeoAuditIssue[];
  slug: string | null;
  routePath: string | null;
  entityType: string | null;
  entityKey: string | null;
  publishedArticle: SeoPublishedArticle | null;
  structuredOverride: SeoStructuredOverride | null;
};

type RuntimeRepairPayload = {
  draft: SeoDraft;
  published: SeoPublishedArticle;
  usageEvent: SeoUsageEvent;
};

type StructuredOverrideRepairPayload = {
  override: Omit<SeoStructuredOverride, "id" | "updatedAt">;
  usageEvent: SeoUsageEvent;
};

export class SeoRepairError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "SeoRepairError";
    this.status = status;
  }
}

function getRequiredDatabase(env: Cloudflare.Env) {
  if (!env.DB) {
    throw new SeoRepairError("D1 binding is not configured yet.", 503);
  }

  return env.DB;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseObject(value: string | null): Record<string, unknown> {
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

function parseArray<T>(value: string | null, fallback: T[]): T[] {
  if (!value) {
    return fallback;
  }

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

function normalizeProvider(value: string | null | undefined): "workers-ai" | "openai" | "template" {
  if (value === "workers-ai" || value === "openai" || value === "template") {
    return value;
  }

  return "template";
}

function normalizeTriggerSource(value: string | null | undefined): SeoJobTriggerSource {
  if (value === "scheduled_cron" || value === "bootstrap") {
    return value;
  }

  return "manual_api";
}

function normalizeRepairStatus(value: string | null | undefined): "draft" | "applied" {
  if (value === "applied") {
    return value;
  }

  return "draft";
}

function normalizeRepairApplyMode(value: string | null | undefined): SeoRepairApplyMode {
  if (value === "structured_override") {
    return value;
  }

  return "published_article";
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function normalizePath(value: string) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "/";
  }

  try {
    const absoluteUrl = new URL(raw);
    return `${absoluteUrl.pathname}${absoluteUrl.search}` || "/";
  } catch {
    return raw.startsWith("/") ? raw : `/${raw}`;
  }
}

function canonicalPath(siteUrl: string, path: string) {
  return `${siteUrl.replace(/\/$/, "")}${normalizePath(path)}`;
}

function pathToSlug(path: string) {
  const match = normalizePath(path).match(/^\/blog\/([^/?#]+)$/);
  return match?.[1] ?? null;
}

function buildPublishedArticlePathCandidates(item: SeoPublishedArticle) {
  const paths = new Set<string>();
  if (item.slug) {
    paths.add(`/blog/${item.slug}`);
  }

  if (item.liveUrl) {
    paths.add(normalizePath(item.liveUrl));
  }

  return Array.from(paths);
}

function buildTopicRouteCandidates(topic: SeoTopic) {
  const metadataRoutes = readStringArray((topic.metadata as Record<string, unknown>).landingRoutes);
  return Array.from(new Set([`/blog/${topic.slug}`, ...metadataRoutes.map(normalizePath)]));
}

function buildIssueSummary(issues: SeoAuditIssue[]) {
  return issues.map((issue) => `${issue.label}: ${issue.message}`);
}

function findTopicForPublishedPath(state: ManagedSiteSeoState, path: string) {
  const normalizedPath = normalizePath(path);
  const matchingPublished = state.published.find((item) => buildPublishedArticlePathCandidates(item).includes(normalizedPath)) ?? null;
  const directSlug = pathToSlug(normalizedPath);

  const topic =
    state.topics.find((item) => item.key === matchingPublished?.topicKey) ??
    state.topics.find((item) => item.slug === matchingPublished?.slug) ??
    state.topics.find((item) => item.slug === directSlug) ??
    state.topics.find((item) => buildTopicRouteCandidates(item).includes(normalizedPath)) ??
    null;

  if (!topic) {
    return null;
  }

  return {
    topic,
    publishedArticle: matchingPublished,
    slug: matchingPublished?.slug ?? topic.slug
  };
}

function deriveEntityKeyFromPath(path: string) {
  return normalizePath(path)
    .split("/")
    .filter(Boolean)
    .pop() ?? "page";
}

function findTopicForOverridePath(state: ManagedSiteSeoState, path: string) {
  const normalizedPath = normalizePath(path);
  const matchingOverride = state.structuredOverrides.find((item) => normalizePath(item.routePath) === normalizedPath) ?? null;
  const topicFromOverride =
    typeof matchingOverride?.metadata?.topicKey === "string"
      ? state.topics.find((item) => item.key === matchingOverride.metadata.topicKey) ?? null
      : null;
  const matchingTopic =
    topicFromOverride ??
    state.topics.find((item) => buildTopicRouteCandidates(item).includes(normalizedPath)) ??
    null;

  if (!matchingTopic && !matchingOverride) {
    return null;
  }

  const topic = matchingTopic ?? state.topics[0] ?? null;
  if (!topic) {
    return null;
  }

  return {
    topic,
    structuredOverride: matchingOverride,
    routePath: matchingOverride?.routePath ?? normalizedPath,
    entityType: matchingOverride?.entityType ?? "calculator",
    entityKey: matchingOverride?.entityKey ?? deriveEntityKeyFromPath(normalizedPath)
  };
}

export function listActionableRepairCandidates(state: ManagedSiteSeoState): ActionableRepairCandidate[] {
  const audit = state.lastAudit ?? state.audits[0] ?? null;
  if (!audit) {
    return [];
  }

  const issueGroups = new Map<string, SeoAuditIssue[]>();
  for (const issue of audit.issues) {
    if (!ACTIONABLE_AUDIT_LABELS.has(issue.label)) {
      continue;
    }

    const normalizedPath = normalizePath(issue.path);
    if (!issueGroups.has(normalizedPath)) {
      issueGroups.set(normalizedPath, []);
    }
    issueGroups.get(normalizedPath)!.push(issue);
  }

  const candidates: ActionableRepairCandidate[] = [];
  for (const [path, issues] of issueGroups.entries()) {
    if (state.site.publishMode === "d1_override") {
      const matched = findTopicForOverridePath(state, path);
      if (!matched) {
        continue;
      }

      candidates.push({
        path,
        applyMode: "structured_override",
        topic: matched.topic,
        title: matched.structuredOverride?.title || matched.structuredOverride?.heading || matched.topic.title,
        issueSummary: buildIssueSummary(issues),
        issues,
        slug: null,
        routePath: matched.routePath,
        entityType: matched.entityType,
        entityKey: matched.entityKey,
        publishedArticle: null,
        structuredOverride: matched.structuredOverride
      });
      continue;
    }

    if (state.site.publishMode === "kv_runtime" || state.site.publishMode === "api_feed_build_sync") {
      const matched = findTopicForPublishedPath(state, path);
      if (!matched) {
        continue;
      }

      candidates.push({
        path,
        applyMode: "published_article",
        topic: matched.topic,
        title: matched.publishedArticle?.title || matched.topic.title,
        issueSummary: buildIssueSummary(issues),
        issues,
        slug: matched.slug,
        routePath: path,
        entityType: null,
        entityKey: null,
        publishedArticle: matched.publishedArticle,
        structuredOverride: null
      });
    }
  }

  return candidates;
}

function mapRepairRow(row: RepairRow): SeoRepairDraft {
  let usage: SeoRepairDraft["usage"] = null;
  if (row.usage_json) {
    try {
      usage = JSON.parse(row.usage_json) as SeoRepairDraft["usage"];
    } catch {
      usage = null;
    }
  }

  return {
    id: row.id,
    auditRunId: row.audit_run_id,
    path: row.path,
    status: normalizeRepairStatus(row.status),
    source: normalizeTriggerSource(row.source),
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
    usage,
    proposedPayload: parseObject(row.proposed_payload_json),
    createdAt: row.created_at,
    appliedAt: row.applied_at,
    updatedAt: row.updated_at
  };
}

async function readRepair(env: Cloudflare.Env, siteId: string, repairId: string) {
  const db = getRequiredDatabase(env);
  const row = await db
    .prepare("SELECT * FROM managed_site_seo_repairs WHERE site_id = ?1 AND id = ?2 LIMIT 1")
    .bind(siteId, repairId)
    .first<RepairRow>();

  return row ? mapRepairRow(row) : null;
}

function buildRepairSummary(candidate: ActionableRepairCandidate) {
  const uniqueLabels = Array.from(new Set(candidate.issues.map((item) => item.label)));
  return `針對 ${candidate.title} 的 ${candidate.path} 修復 SEO 問題：${uniqueLabels.join("、")}。`;
}

async function readBootstrapMetadata(env: Cloudflare.Env, siteId: string) {
  const db = getRequiredDatabase(env);
  const row = await db
    .prepare("SELECT metadata_json FROM managed_sites WHERE id = ?1 LIMIT 1")
    .bind(siteId)
    .first<ManagedSiteMetadataRow>();
  const metadata = parseObject(row?.metadata_json ?? null);
  const connectorBootstrap = metadata.connectorBootstrap;
  return isRecord(connectorBootstrap) ? connectorBootstrap : {};
}

async function insertRepair(
  db: D1Database,
  siteId: string,
  repair: {
    id: string;
    auditRunId: string | null;
    path: string;
    source: SeoJobTriggerSource;
    applyMode: SeoRepairApplyMode;
    title: string;
    summary: string;
    issueSummary: string[];
    topicKey: string | null;
    slug: string | null;
    routePath: string | null;
    entityType: string | null;
    entityKey: string | null;
    model: string | null;
    generationMode: "workers-ai" | "openai" | "template";
    usage: SeoRepairDraft["usage"];
    proposedPayload: Record<string, unknown>;
    createdAt: string;
  }
) {
  await db
    .prepare(
      `
      INSERT INTO managed_site_seo_repairs (
        id,
        site_id,
        audit_run_id,
        path,
        status,
        source,
        apply_mode,
        title,
        summary,
        issue_summary_json,
        topic_key,
        slug,
        route_path,
        entity_type,
        entity_key,
        model,
        generation_mode,
        usage_json,
        proposed_payload_json,
        created_at,
        applied_at,
        updated_at
      )
      VALUES (?1, ?2, ?3, ?4, 'draft', ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, NULL, ?19)
      `
    )
    .bind(
      repair.id,
      siteId,
      repair.auditRunId,
      repair.path,
      repair.source,
      repair.applyMode,
      repair.title,
      repair.summary,
      JSON.stringify(repair.issueSummary),
      repair.topicKey,
      repair.slug,
      repair.routePath,
      repair.entityType,
      repair.entityKey,
      repair.model,
      repair.generationMode,
      JSON.stringify(repair.usage),
      JSON.stringify(repair.proposedPayload),
      repair.createdAt
    )
    .run();
}

async function markRepairApplied(db: D1Database, repairId: string, appliedAt: string) {
  await db
    .prepare(
      `
      UPDATE managed_site_seo_repairs
      SET status = 'applied',
          applied_at = ?2,
          updated_at = ?2
      WHERE id = ?1
      `
    )
    .bind(repairId, appliedAt)
    .run();
}

async function touchSiteRepairApplied(db: D1Database, siteId: string, appliedAt: string) {
  await db
    .prepare(
      `
      UPDATE managed_site_seo_settings
      SET last_generated_at = ?2,
          last_published_at = ?2,
          last_error = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE site_id = ?1
      `
    )
    .bind(siteId, appliedAt)
    .run();
}

function readRuntimeRepairPayload(value: Record<string, unknown>) {
  if (!isRecord(value.draft) || !isRecord(value.published)) {
    return null;
  }

  return {
    draft: value.draft as unknown as SeoDraft,
    published: value.published as unknown as SeoPublishedArticle,
    usageEvent: isRecord(value.usageEvent) ? (value.usageEvent as unknown as SeoUsageEvent) : null
  };
}

function readStructuredRepairPayload(value: Record<string, unknown>) {
  if (!isRecord(value.override)) {
    return null;
  }

  return {
    override: value.override as unknown as Omit<SeoStructuredOverride, "id" | "updatedAt">,
    usageEvent: isRecord(value.usageEvent) ? (value.usageEvent as unknown as SeoUsageEvent) : null
  };
}

export async function listSeoRepairs(env: Cloudflare.Env, siteId: string, options: { limit?: number } = {}) {
  const db = getRequiredDatabase(env);
  const site = await readManagedSiteRecord(env, siteId);
  if (!site) {
    throw new SeoRepairError(`Unknown site: ${siteId}`, 404);
  }

  const result = await db
    .prepare("SELECT * FROM managed_site_seo_repairs WHERE site_id = ?1 ORDER BY created_at DESC LIMIT ?2")
    .bind(siteId, Math.max(1, Math.min(options.limit ?? DEFAULT_REPAIR_LIMIT, DEFAULT_REPAIR_LIMIT)))
    .all<RepairRow>();

  return (result.results ?? []).map(mapRepairRow);
}

export async function generateSeoRepairs(
  env: Cloudflare.Env,
  siteId: string,
  options: { triggerSource: SeoJobTriggerSource; payload?: Record<string, unknown> }
) {
  const db = getRequiredDatabase(env);
  const site = await readManagedSiteRecord(env, siteId);
  if (!site) {
    throw new SeoRepairError(`Unknown site: ${siteId}`, 404);
  }

  const state = await readManagedSiteSeoState(env, siteId);
  if (!state) {
    throw new SeoRepairError(`SEO state is unavailable for ${siteId}.`, 404);
  }

  const audit = state.lastAudit ?? state.audits[0] ?? null;
  if (!audit) {
    throw new SeoRepairError(`No audit history is available for ${siteId}.`, 409);
  }

  const candidates = listActionableRepairCandidates(state);
  const bootstrapMetadata = await readBootstrapMetadata(env, siteId);
  const createdAt = new Date().toISOString();

  return runSeoJob(
    env,
    {
      siteId,
      jobType: "repair_generation",
      triggerSource: options.triggerSource,
      payload: {
        candidateCount: candidates.length,
        auditRunId: audit.id,
        ...(options.payload ?? {})
      }
    },
    async (reporter) => {
      if (candidates.length === 0) {
        await reporter.event("repair_skipped", "No actionable repair candidates were found in the latest audit.", {
          auditRunId: audit.id
        });

        return {
          siteId,
          auditRunId: audit.id,
          generatedCount: 0,
          items: [] as SeoRepairDraft[]
        };
      }

      const generated: SeoRepairDraft[] = [];
      for (const candidate of candidates) {
        await reporter.event("repair_candidate_selected", `Selected ${candidate.path} for repair generation.`, {
          path: candidate.path,
          applyMode: candidate.applyMode,
          topicKey: candidate.topic.key
        });

        const repairId = crypto.randomUUID();
        if (candidate.applyMode === "published_article") {
          const artifacts = await generateRuntimeContentArtifacts({
            env,
            state,
            topic: candidate.topic,
            createdAt,
            bootstrapMetadata
          });
          const liveUrl = canonicalPath(state.site.canonicalUrl, candidate.path);
          const runtimePayload: RuntimeRepairPayload = {
            draft: {
              ...artifacts.draft,
              id: `${artifacts.draft.id}::repair::${repairId}`,
              slug: candidate.slug ?? artifacts.draft.slug,
              generationNotes: `SEO 修復稿，優先處理：${candidate.issueSummary.join("；")}`
            },
            published: {
              ...artifacts.published,
              id: artifacts.published.id,
              draftId: `${artifacts.draft.id}::repair::${repairId}`,
              slug: candidate.slug ?? artifacts.published.slug,
              liveUrl,
              generationNotes: `SEO 修復稿，優先處理：${candidate.issueSummary.join("；")}`
            },
            usageEvent: {
              ...artifacts.usageEvent,
              id: crypto.randomUUID(),
              metadata: {
                ...artifacts.usageEvent.metadata,
                automationSource: "repair_generation",
                repairId,
                repairPath: candidate.path
              }
            }
          };

          await insertRepair(db, siteId, {
            id: repairId,
            auditRunId: audit.id,
            path: candidate.path,
            source: options.triggerSource,
            applyMode: candidate.applyMode,
            title: candidate.title,
            summary: buildRepairSummary(candidate),
            issueSummary: candidate.issueSummary,
            topicKey: candidate.topic.key,
            slug: runtimePayload.published.slug,
            routePath: candidate.path,
            entityType: null,
            entityKey: null,
            model: runtimePayload.draft.model,
            generationMode: runtimePayload.draft.generationMode,
            usage: runtimePayload.draft.usage,
            proposedPayload: runtimePayload as unknown as Record<string, unknown>,
            createdAt
          });
        } else {
          const artifacts = await generateStructuredOverrideArtifacts({
            env,
            state,
            topic: candidate.topic,
            createdAt,
            bootstrapMetadata
          });
          const structuredPayload: StructuredOverrideRepairPayload = {
            override: {
              ...artifacts.override,
              routePath: candidate.routePath ?? artifacts.override.routePath,
              entityType: candidate.entityType ?? artifacts.override.entityType,
              entityKey: candidate.entityKey ?? artifacts.override.entityKey,
              updatedBy: "repair:ai-seo-control",
              metadata: {
                ...artifacts.override.metadata,
                repairPath: candidate.path,
                repairIssueSummary: candidate.issueSummary
              }
            },
            usageEvent: {
              ...artifacts.usageEvent,
              id: crypto.randomUUID(),
              metadata: {
                ...artifacts.usageEvent.metadata,
                automationSource: "repair_generation",
                repairId,
                repairPath: candidate.path
              }
            }
          };

          await insertRepair(db, siteId, {
            id: repairId,
            auditRunId: audit.id,
            path: candidate.path,
            source: options.triggerSource,
            applyMode: candidate.applyMode,
            title: candidate.title,
            summary: buildRepairSummary(candidate),
            issueSummary: candidate.issueSummary,
            topicKey: candidate.topic.key,
            slug: null,
            routePath: structuredPayload.override.routePath,
            entityType: structuredPayload.override.entityType,
            entityKey: structuredPayload.override.entityKey,
            model: structuredPayload.override.modelKey,
            generationMode: structuredPayload.usageEvent.provider,
            usage: null,
            proposedPayload: structuredPayload as unknown as Record<string, unknown>,
            createdAt
          });
        }

        const generatedRepair = await readRepair(env, siteId, repairId);
        if (generatedRepair) {
          generated.push(generatedRepair);
        }

        await reporter.event("repair_draft_generated", `Generated repair draft for ${candidate.path}.`, {
          repairId,
          path: candidate.path
        });
      }

      return {
        siteId,
        auditRunId: audit.id,
        generatedCount: generated.length,
        items: generated
      };
    }
  );
}

export async function applySeoRepair(
  env: Cloudflare.Env,
  siteId: string,
  repairId: string,
  options: { triggerSource: SeoJobTriggerSource; payload?: Record<string, unknown> }
) {
  const db = getRequiredDatabase(env);
  const site = await readManagedSiteRecord(env, siteId);
  if (!site) {
    throw new SeoRepairError(`Unknown site: ${siteId}`, 404);
  }

  const repair = await readRepair(env, siteId, repairId);
  if (!repair) {
    throw new SeoRepairError(`Unknown repair draft: ${repairId}`, 404);
  }

  return runSeoJob(
    env,
    {
      siteId,
      jobType: "repair_apply",
      triggerSource: options.triggerSource,
      payload: {
        repairId,
        applyMode: repair.applyMode,
        ...(options.payload ?? {})
      }
    },
    async (reporter) => {
      if (repair.status === "applied") {
        await reporter.event("repair_skipped", `Repair ${repairId} was already applied.`, { repairId });
        return {
          siteId,
          repair
        };
      }

      const appliedAt = new Date().toISOString();
      if (repair.applyMode === "published_article") {
        const payload = readRuntimeRepairPayload(repair.proposedPayload);
        if (!payload) {
          throw new SeoRepairError(`Repair ${repairId} does not include a valid published-article payload.`, 409);
        }

        await insertDraft(db, siteId, {
          ...payload.draft,
          updatedAt: appliedAt
        });
        await upsertPublishedArticle(db, siteId, {
          ...payload.published,
          updatedAt: appliedAt,
          publishedAt: appliedAt,
          generatedAt: appliedAt
        });
        if (payload.usageEvent) {
          await insertUsageEvent(db, siteId, {
            ...payload.usageEvent,
            createdAt: appliedAt
          });
        }

        await reporter.event("repair_applied", `Applied published-content repair for ${repair.path}.`, {
          repairId,
          slug: repair.slug
        });
      } else {
        const payload = readStructuredRepairPayload(repair.proposedPayload);
        if (!payload) {
          throw new SeoRepairError(`Repair ${repairId} does not include a valid structured-override payload.`, 409);
        }

        await createOrUpdateStructuredOverride(env, siteId, {
          ...payload.override,
          updatedBy: "repair:ai-seo-control"
        });
        if (payload.usageEvent) {
          await insertUsageEvent(db, siteId, {
            ...payload.usageEvent,
            createdAt: appliedAt
          });
        }

        await reporter.event("repair_applied", `Applied structured override repair for ${repair.path}.`, {
          repairId,
          entityType: repair.entityType,
          entityKey: repair.entityKey
        });
      }

      await markRepairApplied(db, repair.id, appliedAt);
      await touchSiteRepairApplied(db, siteId, appliedAt);

      const updatedRepair = await readRepair(env, siteId, repair.id);
      if (!updatedRepair) {
        throw new SeoRepairError(`Repair ${repairId} was applied but could not be reloaded.`, 500);
      }

      return {
        siteId,
        repair: updatedRepair
      };
    }
  );
}
