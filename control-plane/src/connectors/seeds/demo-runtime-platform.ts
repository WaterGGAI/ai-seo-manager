import type { ManagedSiteBootstrapSeed } from "./types";

const ALLOWED_INTERNAL_LINKS = [
  { href: "/", label: "首頁", reason: "回到產品首頁與主要價值主張。" },
  { href: "/pricing", label: "方案頁", reason: "承接高意圖流量到方案比較。" },
  { href: "/blog", label: "部落格", reason: "延伸閱讀更多問題解答內容。" },
  { href: "/join", label: "立即開始", reason: "導向主要轉換入口。" }
] as const;

const TOPICS = [
  {
    key: "team-translation-workflow",
    slug: "team-translation-workflow",
    focusKeyword: "multilingual team communication",
    audience: "operations teams managing multilingual conversations",
    searchIntent: "find a workflow for cross-language coordination",
    angle: "message translation, role handoff, reporting rhythm",
    title: "How to structure multilingual team communication inside one workflow",
    kicker: "Workflow"
  },
  {
    key: "alerting-and-reporting",
    slug: "alerting-and-reporting",
    focusKeyword: "operational reporting workflow",
    audience: "teams that need shared reporting and alerts",
    searchIntent: "compare tools for recurring reporting workflows",
    angle: "shared status updates, risk alerts, and team visibility",
    title: "Operational reporting workflow guide for shared status updates and alerts",
    kicker: "Operations"
  }
] as const;

const KEYWORDS = [
  { label: "runtime workflow platform", intent: "brand_discovery", clusterName: "brand", priority: 100 },
  { label: "multilingual team communication", intent: "solution_search", clusterName: "workflow", priority: 92 },
  { label: "operational reporting workflow", intent: "solution_search", clusterName: "workflow", priority: 84 }
] as const;

export const demoRuntimePlatformBootstrapSeed: ManagedSiteBootstrapSeed = {
  siteId: "demo-runtime-site",
  connectorName: "demo-runtime-platform",
  summary: "Sanitized bootstrap seed for a runtime platform connector that also donates reusable workflow modules.",
  sourceProjectPath: "/workspace/examples/runtime-app",
  settings: {
    siteUrl: "https://runtime.example",
    dailyAuditEnabled: true,
    automationEnabled: true,
    autoPublishEnabled: true,
    autoQueueForSync: false,
    autoDeployEnabled: false,
    scheduleLocalTime: "03:15",
    scheduleTimezone: "Asia/Taipei",
    scheduleCronUtc: "15 19 * * *",
    aiProvider: "workers-ai",
    fallbackProvider: "template",
    generationModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    topicCursor: 0,
    metadata: {
      connectorMode: "runtime_platform_seo",
      inheritedFrom: "example runtime application"
    }
  },
  siteMetadata: {
    brandName: "Runtime Demo",
    shortName: "Runtime Demo",
    description: "Sanitized example of a runtime platform where the main product and SEO pages are served from the same Worker.",
    serviceArea: "Global example workspace",
    tagline: "Runtime platform example for multi-site AI SEO control",
    category: "workflow platform",
    publishModel: "main Worker serves product pages and public SEO routes directly",
    automation: {
      workerName: "runtime-demo-worker",
      cron: "15 19 * * *",
      scheduleLabel: "每日一次",
      timezone: "Asia/Taipei",
      summary: "Daily audit, content generation, and optional runtime publish flow."
    },
    publicRoutes: ["/", "/pricing", "/blog", "/blog/[slug]", "/robots.txt", "/sitemap.xml"],
    staticIndexablePaths: ["/", "/pricing", "/blog"],
    allowedInternalLinks: ALLOWED_INTERNAL_LINKS
  },
  keywords: KEYWORDS.map((keyword) => ({ ...keyword, metadata: { connectorName: "demo-runtime-platform", source: "example-seed" } })),
  topics: TOPICS.map((topic) => ({
    key: topic.key,
    slug: topic.slug,
    title: topic.title,
    focusKeyword: topic.focusKeyword,
    audience: topic.audience,
    category: "platform_with_embedded_seo",
    searchIntent: topic.searchIntent,
    summary: topic.angle,
    metadata: {
      kicker: topic.kicker,
      angle: topic.angle,
      connectorName: "demo-runtime-platform"
    }
  }))
};
