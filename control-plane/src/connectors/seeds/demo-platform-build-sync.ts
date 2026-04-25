import type { ManagedSiteBootstrapSeed } from "./types";

const TOPICS = [
  {
    key: "vendor-mobile-pos",
    slug: "vendor-mobile-pos",
    focusKeyword: "mobile POS for vendors",
    audience: "market vendors and small operators",
    category: "platform_growth",
    searchIntent: "compare workflow tools",
    summary: "Outline how mobile POS changes operations before, during, and after peak hours.",
    title: "How mobile POS can streamline a vendor's daily workflow"
  },
  {
    key: "organizer-registration-flow",
    slug: "organizer-registration-flow",
    focusKeyword: "event registration workflow",
    audience: "event organizers and operations teams",
    category: "platform_growth",
    searchIntent: "find a practical process guide",
    summary: "Cover intake, review, publishing, and status tracking for organizer workflows.",
    title: "Event registration workflow guide for organizers and operations teams"
  }
] as const;

const KEYWORDS = [
  { label: "platform workflow tools", intent: "solution_search", clusterName: "platform", priority: 100 },
  { label: "mobile POS", intent: "solution_search", clusterName: "vendors", priority: 92 },
  { label: "event registration workflow", intent: "workflow_search", clusterName: "organizers", priority: 86 }
] as const;

export const demoPlatformBuildSyncBootstrapSeed: ManagedSiteBootstrapSeed = {
  siteId: "demo-platform-site",
  connectorName: "demo-platform-build-sync",
  summary: "Sanitized bootstrap seed for an API-feed build-sync platform connector example.",
  sourceProjectPath: "/workspace/examples/platform-site",
  settings: {
    siteUrl: "https://platform.example",
    dailyAuditEnabled: true,
    automationEnabled: false,
    autoPublishEnabled: false,
    autoQueueForSync: false,
    autoDeployEnabled: false,
    scheduleLocalTime: "03:15",
    scheduleTimezone: "Asia/Taipei",
    scheduleCronUtc: "15 19 * * *",
    aiProvider: "workers-ai",
    fallbackProvider: "openai",
    generationModel: "@cf/google/gemma-4-26b-a4b-it",
    topicCursor: 0,
    metadata: {
      connectorMode: "api_feed_build_sync",
      adminRoute: "/admin/seo",
      publicFeedPath: "/api/public/seo/published-content",
      publicSinglePathTemplate: "/api/public/seo/published-content/{slug}"
    }
  },
  siteMetadata: {
    brandName: "示範平台站",
    siteLanguage: "zh-TW",
    adminLanguage: "zh-TW",
    description: "Sanitized example of a platform that syncs SEO content through a public feed during build and deploy.",
    publishModel: "public API feed -> prebuild sync -> static deploy",
    adminRoute: "/admin/seo",
    publicRoutes: ["/", "/blog", "/blog/[slug]", "/robots.txt", "/sitemap.xml"],
    automation: {
      workerName: "platform-example-api",
      cron: "15 19 * * *",
      timezone: "Asia/Taipei",
      summary: "Daily audit plus optional draft generation and deploy trigger workflow."
    },
    feedSync: {
      apiBaseUrl: "https://api.platform.example",
      publicFeedPath: "/api/public/seo/published-content",
      contentDirectory: "content/blog/seo-admin-generated",
      syncScriptPath: "scripts/sync-seo-published-content.mjs"
    }
  },
  keywords: KEYWORDS.map((keyword) => ({ ...keyword, metadata: { source: "example-seed", connectorName: "demo-platform-build-sync" } })),
  topics: TOPICS.map((topic) => ({
    key: topic.key,
    slug: topic.slug,
    title: topic.title,
    focusKeyword: topic.focusKeyword,
    audience: topic.audience,
    category: topic.category,
    searchIntent: topic.searchIntent,
    summary: topic.summary,
    metadata: {
      connectorName: "demo-platform-build-sync",
      publishMode: "api_feed_build_sync"
    }
  })),
  buildSync: {
    provider: "cloudflare-pages-deploy-hook",
    label: "Cloudflare Pages Deploy Hook",
    syncMode: "build-time-api-sync",
    publicFeedUrl: "https://api.platform.example/api/public/seo/published-content",
    publicFeedFormat: "json",
    publicSingleUrlTemplate: "https://api.platform.example/api/public/seo/published-content/{slug}",
    syncScriptPath: "scripts/sync-seo-published-content.mjs",
    outputDirectory: "content/blog/seo-admin-generated",
    deployTarget: "example-pages-project",
    deployHookSecretName: "EXAMPLE_DEPLOY_HOOK_URL",
    metadata: {
      frontendProjectType: "next-on-pages",
      pagesBuildCommand: "npm run pages:build",
      pagesDeployCommand: "npm run pages:deploy"
    }
  }
};
