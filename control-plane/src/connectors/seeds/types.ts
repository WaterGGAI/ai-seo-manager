import type { SeoAiProvider } from "../../core/seo-types";

export type BootstrapKeywordSeed = {
  label: string;
  intent: string;
  clusterName: string;
  priority: number;
  metadata?: Record<string, unknown>;
};

export type BootstrapTopicSeed = {
  key: string;
  slug: string;
  title: string;
  focusKeyword: string;
  audience: string;
  category: string;
  searchIntent: string;
  summary: string;
  metadata?: Record<string, unknown>;
};

export type BootstrapSettingsSeed = {
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
  metadata?: Record<string, unknown>;
};

export type BootstrapStructuredOverrideSeed = {
  entityType: string;
  entityKey: string;
  routePath: string;
  title?: string | null;
  description?: string | null;
  heading?: string | null;
  intro?: string | null;
  content?: string | null;
  faq?: Array<{
    question: string;
    answer: string;
  }> | null;
  taskType?: string | null;
  modelKey?: string | null;
  updatedBy?: string | null;
  metadata?: Record<string, unknown>;
};

export type BootstrapBuildSyncSeed = {
  provider: "github-actions-repository-dispatch" | "cloudflare-pages-deploy-hook";
  label: string;
  syncMode: "build-time-api-sync";
  publicFeedUrl: string;
  publicFeedFormat?: "json";
  publicSingleUrlTemplate?: string | null;
  syncScriptPath?: string | null;
  outputDirectory?: string | null;
  deployTarget?: string | null;
  deployRepository?: string | null;
  deployBranch?: string | null;
  deployEventType?: string | null;
  deployHookSecretName?: string | null;
  metadata?: Record<string, unknown>;
};

export type ManagedSiteBootstrapSeed = {
  siteId: string;
  connectorName: string;
  summary: string;
  sourceProjectPath: string;
  settings: BootstrapSettingsSeed;
  siteMetadata: Record<string, unknown>;
  keywords: BootstrapKeywordSeed[];
  topics: BootstrapTopicSeed[];
  structuredOverrides?: BootstrapStructuredOverrideSeed[];
  buildSync?: BootstrapBuildSyncSeed | null;
};
