import type { PublishMode } from "./types";

export type SiteConnectorDefinition = {
  connectorName: string;
  publishMode: PublishMode;
  label: string;
  summary: string;
  intendedSiteTypes: string[];
  supportsDraftGeneration: boolean;
  supportsTechnicalAudit: boolean;
  supportsRankingSync: boolean;
  supportsBuildSync: boolean;
  supportsStructuredOverrides: boolean;
  onboardingFields: string[];
};

export const connectorDefinitions: SiteConnectorDefinition[] = [
  {
    connectorName: "demo-brand-runtime",
    publishMode: "kv_runtime",
    label: "Brand Runtime Connector",
    summary: "Publishes SEO articles directly at runtime from Worker-managed state.",
    intendedSiteTypes: ["brand_local_seo"],
    supportsDraftGeneration: true,
    supportsTechnicalAudit: true,
    supportsRankingSync: true,
    supportsBuildSync: false,
    supportsStructuredOverrides: false,
    onboardingFields: [
      "site label",
      "canonical URL",
      "primary language",
      "allowed internal links",
      "topic seeds",
      "brand voice",
      "publish auth or binding strategy"
    ]
  },
  {
    connectorName: "demo-local-runtime",
    publishMode: "kv_runtime",
    label: "Local Service Runtime Connector",
    summary: "Targets restaurants, clinics, and other local-intent sites with simple runtime publishing cadence.",
    intendedSiteTypes: ["brand_local_seo"],
    supportsDraftGeneration: true,
    supportsTechnicalAudit: true,
    supportsRankingSync: true,
    supportsBuildSync: false,
    supportsStructuredOverrides: false,
    onboardingFields: [
      "site label",
      "canonical URL",
      "primary language",
      "local SEO topic seeds",
      "allowed internal links",
      "brand voice"
    ]
  },
  {
    connectorName: "demo-calculator-d1",
    publishMode: "d1_override",
    label: "Structured Override Connector",
    summary: "Writes AI-generated SEO metadata and body overrides into D1-backed page records.",
    intendedSiteTypes: ["programmatic_seo_tools"],
    supportsDraftGeneration: true,
    supportsTechnicalAudit: true,
    supportsRankingSync: true,
    supportsBuildSync: false,
    supportsStructuredOverrides: true,
    onboardingFields: [
      "site label",
      "canonical URL",
      "page entity type",
      "override table mapping",
      "public route pattern",
      "default AI task type"
    ]
  },
  {
    connectorName: "demo-platform-build-sync",
    publishMode: "api_feed_build_sync",
    label: "API Feed Build Sync Connector",
    summary: "Publishes content through a public API feed and syncs that content during build or deploy.",
    intendedSiteTypes: ["platform_with_embedded_seo"],
    supportsDraftGeneration: true,
    supportsTechnicalAudit: true,
    supportsRankingSync: true,
    supportsBuildSync: true,
    supportsStructuredOverrides: false,
    onboardingFields: [
      "site label",
      "canonical URL",
      "public feed endpoint",
      "deploy trigger or hook",
      "build sync strategy",
      "topic pool"
    ]
  },
  {
    connectorName: "demo-runtime-platform",
    publishMode: "kv_runtime",
    label: "Platform Runtime SEO Connector",
    summary: "Serves the main product site and public SEO pages from the same Worker runtime.",
    intendedSiteTypes: ["platform_with_embedded_seo"],
    supportsDraftGeneration: true,
    supportsTechnicalAudit: true,
    supportsRankingSync: true,
    supportsBuildSync: false,
    supportsStructuredOverrides: false,
    onboardingFields: [
      "site label",
      "canonical URL",
      "public SEO route map",
      "runtime publish storage",
      "allowed internal links",
      "brand positioning",
      "primary CTA"
    ]
  },
  {
    connectorName: "module-donor-only",
    publishMode: "workflow_module_source",
    label: "Workflow Module Donor",
    summary: "Supplies reusable workflow modules instead of acting as a managed publishing site.",
    intendedSiteTypes: ["workflow_module_source"],
    supportsDraftGeneration: false,
    supportsTechnicalAudit: false,
    supportsRankingSync: false,
    supportsBuildSync: false,
    supportsStructuredOverrides: false,
    onboardingFields: [
      "module source path",
      "import target package",
      "reusable feature scope"
    ]
  }
];

export function getConnectorDefinition(connectorName: string) {
  return connectorDefinitions.find((item) => item.connectorName === connectorName) ?? null;
}
