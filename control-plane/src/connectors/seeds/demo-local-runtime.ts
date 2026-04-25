import type { ManagedSiteBootstrapSeed } from "./types";

const ALLOWED_INTERNAL_LINKS = [
  { href: "/", label: "首頁", reason: "回到主站首頁與主要轉換入口。" },
  { href: "/services", label: "服務項目", reason: "承接內容流量到服務頁。" },
  { href: "/locations", label: "據點資訊", reason: "強化在地搜尋意圖。" },
  { href: "/faq", label: "常見問題", reason: "降低轉換前常見疑問。" }
] as const;

const TOPICS = [
  {
    key: "local-service-guide",
    slug: "local-service-guide",
    focusKeyword: "在地服務推薦",
    audience: "正在尋找附近服務的本地消費者",
    searchIntent: "比較附近服務店家與選擇方式",
    angle: "在地需求、服務差異、預約流程",
    title: "在地服務推薦怎麼選？從需求到預約流程的整理",
    kicker: "Local SEO"
  },
  {
    key: "line-booking-guide",
    slug: "line-booking-guide",
    focusKeyword: "LINE 預約服務",
    audience: "重視回覆速度與預約效率的人",
    searchIntent: "想知道服務能不能先用 LINE 預約",
    angle: "事前預約、減少等待、確認時段",
    title: "LINE 預約服務有什麼好處？想少等一點可以這樣安排",
    kicker: "Booking"
  },
  {
    key: "local-dinner-search",
    slug: "local-dinner-search",
    focusKeyword: "晚餐外帶推薦",
    audience: "附近居民與下班族",
    searchIntent: "想找就近又容易決策的晚餐外帶選項",
    angle: "在地搜尋、快速取餐、份量感",
    title: "晚餐外帶推薦怎麼找？在地搜尋內容頁可以怎麼做",
    kicker: "Intent Match"
  }
] as const;

const KEYWORDS = [
  { label: "示範在地服務站", intent: "brand_discovery", clusterName: "brand", priority: 100 },
  { label: "在地服務推薦", intent: "local_search", clusterName: "local", priority: 92 },
  { label: "LINE 預約服務", intent: "conversion", clusterName: "conversion", priority: 86 },
  { label: "晚餐外帶推薦", intent: "local_search", clusterName: "local", priority: 80 }
] as const;

export const demoLocalRuntimeBootstrapSeed: ManagedSiteBootstrapSeed = {
  siteId: "demo-local-site",
  connectorName: "demo-local-runtime",
  summary: "Sanitized local-service bootstrap seed for a runtime local SEO connector example.",
  sourceProjectPath: "/workspace/examples/local-service-site",
  settings: {
    siteUrl: "https://local.example",
    dailyAuditEnabled: true,
    automationEnabled: true,
    autoPublishEnabled: true,
    autoQueueForSync: false,
    autoDeployEnabled: false,
    scheduleLocalTime: "19:15",
    scheduleTimezone: "Asia/Taipei",
    scheduleCronUtc: "15 11 * * *",
    aiProvider: "workers-ai",
    fallbackProvider: "template",
    generationModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    topicCursor: 0
  },
  siteMetadata: {
    brandName: "示範在地服務站",
    shortName: "Local Demo",
    description: "這是一個公開範例在地服務站 seed，示範如何處理本地搜尋、門店頁與預約導流。",
    serviceArea: "Example District",
    store: {
      slug: "example-store",
      name: "Local Demo Example Store",
      address: "123 Example Street",
      hours: "Mon-Sat 10:00-20:00"
    },
    automation: {
      workerName: "local-demo-seo-automation",
      cron: "15 11 * * *",
      scheduleLabel: "每日一次",
      timezone: "Asia/Taipei"
    },
    staticIndexablePaths: ["/", "/services", "/locations", "/blog", "/faq"],
    allowedInternalLinks: ALLOWED_INTERNAL_LINKS
  },
  keywords: KEYWORDS.map((keyword) => ({ ...keyword, metadata: { source: "example-seed" } })),
  topics: TOPICS.map((topic) => ({
    key: topic.key,
    slug: topic.slug,
    title: topic.title,
    focusKeyword: topic.focusKeyword,
    audience: topic.audience,
    category: "brand_local_seo",
    searchIntent: topic.searchIntent,
    summary: topic.angle,
    metadata: {
      kicker: topic.kicker,
      angle: topic.angle,
      connectorName: "demo-local-runtime"
    }
  }))
};
