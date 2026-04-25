import type { ManagedSiteManifest } from "../connectors/types";

export type SeoCheckStatus = "ok" | "warn" | "fail";
export type SeoTargetVisibility = "public" | "protected" | "technical";
export type SeoDraftStatus = "draft" | "published_pending_sync";
export type SeoDraftSource = "manual" | "scheduled";
export type SeoAiProvider = "workers-ai" | "openai" | "template";
export type SeoSyncStatus = "pending_deploy" | "deploy_triggered" | "deploy_failed";
export type SeoDeployStatus = "idle" | "triggered" | "failed";
export type SeoAuditRunSource = "manual" | "scheduled" | "bootstrap";

export type SeoInternalLink = {
  label: string;
  href: string;
  reason?: string;
};

export type SeoSection = {
  heading: string;
  paragraphs: string[];
  bullets: string[];
};

export type SeoFaqItem = {
  question: string;
  answer: string;
};

export type SeoUsageEstimate = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  inputCostUsd: number | null;
  outputCostUsd: number | null;
  estimatedCostUsd: number | null;
  estimatedNeurons: number | null;
  estimateSource: "workers_ai_usage" | "heuristic" | "local_template_fallback" | "unknown";
};

export type SeoTopic = {
  id: string;
  key: string;
  slug: string;
  title: string;
  focusKeyword: string;
  audience: string;
  category: string;
  searchIntent: string;
  summary: string;
  metadata: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SeoDraft = {
  id: string;
  topicKey: string | null;
  slug: string;
  title: string;
  description: string;
  heroSummary: string;
  heading: string;
  kicker: string;
  focusKeyword: string;
  keywords: string[];
  category: string;
  audience: string;
  searchIntent: string;
  intro: string;
  sections: SeoSection[];
  faq: SeoFaqItem[];
  internalLinks: SeoInternalLink[];
  ctaTitle: string;
  ctaBody: string;
  mdx: string;
  source: SeoDraftSource;
  status: SeoDraftStatus;
  syncStatus: SeoSyncStatus;
  generationMode: SeoAiProvider;
  model: string | null;
  usage: SeoUsageEstimate | null;
  generationNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SeoPublishedArticle = {
  id: string;
  draftId: string | null;
  topicKey: string | null;
  slug: string;
  title: string;
  description: string;
  heroSummary: string;
  heading: string;
  kicker: string;
  focusKeyword: string;
  keywords: string[];
  category: string;
  audience: string;
  searchIntent: string;
  intro: string;
  sections: SeoSection[];
  faq: SeoFaqItem[];
  internalLinks: SeoInternalLink[];
  ctaTitle: string;
  ctaBody: string;
  mdx: string;
  author: string;
  tags: string[];
  schemaType: string;
  source: SeoDraftSource;
  publishedSource: SeoDraftSource;
  syncStatus: SeoSyncStatus;
  model: string | null;
  usage: SeoUsageEstimate | null;
  generationNotes: string | null;
  generatedAt: string | null;
  publishedAt: string;
  updatedAt: string;
  liveUrl: string;
};

export type SeoAuditSummary = {
  totalTargets: number;
  okTargets: number;
  warningTargets: number;
  failingTargets: number;
  publicTargets: number;
  protectedTargets: number;
  avgResponseTimeMs: number;
  missingCanonicalCount: number;
  missingDescriptionCount: number;
  missingJsonLdCount: number;
  missingNoindexCount: number;
  h1IssueCount: number;
  missingFaqCount: number;
  missingHowToCount: number;
  thinContentCount: number;
  contentDriftCount: number;
};

export type SeoAuditTargetResult = {
  path: string;
  url: string;
  kind: "page" | "robots" | "sitemap" | "json";
  visibility: SeoTargetVisibility;
  statusCode: number;
  ok: boolean;
  expectedNoindex: boolean;
  responseTimeMs: number;
  contentType: string | null;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  ogImage: string | null;
  jsonLdCount: number;
  h1Count: number;
  h2Count: number;
  faqItemCount: number;
  guideCardCount: number;
  faqSchemaCount: number;
  howToSchemaCount: number;
  xRobotsTag: string | null;
  passCount: number;
  warnCount: number;
  failCount: number;
  checks: Array<{
    key: string;
    label: string;
    status: "pass" | "warn" | "fail";
    detail: string;
  }>;
};

export type SeoAuditIssue = {
  severity: "warn" | "fail";
  label: string;
  path: string;
  message: string;
};

export type SeoAuditRun = {
  id: string;
  source: SeoAuditRunSource;
  baseUrl: string;
  scheduleLabel: string;
  summary: SeoAuditSummary;
  targets: SeoAuditTargetResult[];
  issues: SeoAuditIssue[];
  createdAt: string;
};

export type SeoRankingWindowMetrics = {
  startDate: string;
  endDate: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type SeoRankingDimensionMetrics = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type SeoRankingDimensionRow = {
  key: string;
  label: string;
  current: SeoRankingDimensionMetrics;
  previous: SeoRankingDimensionMetrics;
};

export type SeoRankingTrendPoint = {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type SeoRankingSnapshot = {
  id: string;
  status: "ok" | "error";
  syncAt: string;
  siteUrl: string;
  permissionLevel: string | null;
  availableDate: string | null;
  currentWindow: SeoRankingWindowMetrics | null;
  previousWindow: SeoRankingWindowMetrics | null;
  topPages: SeoRankingDimensionRow[];
  topQueries: SeoRankingDimensionRow[];
  dailyTrend: SeoRankingTrendPoint[];
  errorMessage: string | null;
};

export type SeoRankingState = {
  enabled: boolean;
  siteUrl: string;
  hasCredentials: boolean;
  ready: boolean;
  serviceAccountEmail: string | null;
  missingPrerequisites: string[];
  latestSnapshot: SeoRankingSnapshot | null;
  latestSuccessfulSnapshot: SeoRankingSnapshot | null;
  snapshotCount: number;
};

export type SeoUsageEvent = {
  id: string;
  createdAt: string;
  provider: SeoAiProvider;
  source: SeoDraftSource;
  topicKey: string | null;
  slug: string | null;
  model: string | null;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedNeurons: number | null;
  estimatedUsd: number | null;
  usedFallbackChain: boolean;
  metadata: Record<string, unknown>;
};

export type SeoUsageSummary = {
  dateKey: string;
  timezone: string;
  generatedTodayCount: number;
  workersAiCount: number;
  openAiCount: number;
  templateCount: number;
  openAiFallbackCount: number;
  templateFallbackCount: number;
  workersAiEstimatedInputTokens: number;
  workersAiEstimatedOutputTokens: number;
  workersAiEstimatedNeurons: number;
  workersAiEstimatedUsd: number;
  notes: string[];
};

export type SeoStructuredOverride = {
  id: string;
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
  updatedAt: string;
  metadata: Record<string, unknown>;
};

export type SeoBuildSyncConfig = {
  siteId: string;
  provider: "github-actions-repository-dispatch" | "cloudflare-pages-deploy-hook";
  label: string;
  syncMode: "build-time-api-sync";
  publicFeedUrl: string;
  publicFeedFormat: "json";
  publicSingleUrlTemplate: string | null;
  syncScriptPath: string | null;
  outputDirectory: string | null;
  deployTarget: string | null;
  deployRepository: string | null;
  deployBranch: string | null;
  deployEventType: string | null;
  deployHookSecretName: string | null;
  metadata: Record<string, unknown>;
  updatedAt: string | null;
};

export type SeoRepairStatus = "draft" | "applied";
export type SeoRepairApplyMode = "published_article" | "structured_override";

export type SeoRepairDraft = {
  id: string;
  auditRunId: string | null;
  path: string;
  status: SeoRepairStatus;
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
  generationMode: SeoAiProvider;
  usage: SeoUsageEstimate | null;
  proposedPayload: Record<string, unknown>;
  createdAt: string;
  appliedAt: string | null;
  updatedAt: string;
};

export type SeoJobStatus = "running" | "completed" | "failed";
export type SeoJobTriggerSource = "manual_api" | "scheduled_cron" | "bootstrap";

export type SeoJobEvent = {
  id: string;
  eventType: string;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type SeoJob = {
  id: string;
  jobType: string;
  status: SeoJobStatus;
  triggerSource: SeoJobTriggerSource;
  payload: Record<string, unknown>;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  events: SeoJobEvent[];
};

export type SeoSiteSettings = {
  siteUrl: string;
  dailyAuditEnabled: boolean;
  automationEnabled: boolean;
  autoPublishEnabled: boolean;
  autoQueueForSync: boolean;
  autoDeployEnabled: boolean;
  scheduleLocalTime: string;
  scheduleTimezone: string;
  scheduleCronUtc: string;
  aiProvider: SeoAiProvider;
  fallbackProvider: SeoAiProvider;
  generationModel: string | null;
  topicCursor: number;
  lastScheduledDraftDate: string | null;
  lastAuditAt: string | null;
  lastGeneratedAt: string | null;
  lastPublishedAt: string | null;
  lastDeployRequestedAt: string | null;
  lastDeployStatus: SeoDeployStatus;
  lastDeployMessage: string | null;
  lastError: string | null;
  metadata: Record<string, unknown>;
};

export type ManagedSiteSeoState = {
  site: ManagedSiteManifest;
  settings: SeoSiteSettings;
  topics: SeoTopic[];
  drafts: SeoDraft[];
  published: SeoPublishedArticle[];
  audits: SeoAuditRun[];
  lastAudit: SeoAuditRun | null;
  usageEvents: SeoUsageEvent[];
  usageSummary: SeoUsageSummary;
  ranking: SeoRankingState;
  structuredOverrides: SeoStructuredOverride[];
  buildSync: SeoBuildSyncConfig | null;
  repairs: SeoRepairDraft[];
  jobs: SeoJob[];
  lastJob: SeoJob | null;
};
