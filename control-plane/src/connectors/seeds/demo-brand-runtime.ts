import type { ManagedSiteBootstrapSeed } from "./types";

const ALLOWED_INTERNAL_LINKS = [
  { href: "/", label: "首頁", reason: "回到主站首頁與主要 CTA。" },
  { href: "/about", label: "關於我們", reason: "補充品牌故事與信任感。" },
  { href: "/menu", label: "服務介紹", reason: "承接內容流量到主要服務頁。" },
  { href: "/blog", label: "部落格", reason: "延伸閱讀更多 SEO 主題內容。" },
  { href: "/faq", label: "常見問題", reason: "降低轉換前常見疑問。" }
] as const;

const TOPICS = [
  {
    key: "family-dessert-guide",
    slug: "family-dessert-guide",
    focusKeyword: "親子甜點推薦",
    audience: "重視家庭出遊與可愛品牌風格的消費者",
    searchIntent: "想找適合親子拍照與分享的品牌甜點",
    angle: "品牌特色、預訂流程、拍照情境",
    title: "親子甜點推薦怎麼選？從品牌風格到預訂流程一次整理",
    kicker: "Brand Story"
  },
  {
    key: "line-preorder-guide",
    slug: "line-preorder-guide",
    focusKeyword: "LINE 預訂甜點",
    audience: "重視取貨效率與事前保留商品的人",
    searchIntent: "想知道可不可以先用 LINE 預訂",
    angle: "減少等待、確認口味與取貨節奏",
    title: "LINE 預訂甜點有什麼差別？想少等一點可以先看這篇",
    kicker: "Conversion"
  },
  {
    key: "checkin-dessert-ideas",
    slug: "checkin-dessert-ideas",
    focusKeyword: "打卡甜點推薦",
    audience: "喜歡社群分享與品牌視覺的人",
    searchIntent: "想找外型有記憶點、值得分享的甜點品牌",
    angle: "可愛視覺、品牌辨識度、分享價值",
    title: "打卡甜點推薦看什麼？可愛品牌頁怎麼做出搜尋記憶點",
    kicker: "Top Funnel"
  }
] as const;

const KEYWORDS = [
  { label: "示範品牌站", intent: "brand_discovery", clusterName: "brand", priority: 100 },
  { label: "親子甜點推薦", intent: "local_search", clusterName: "content", priority: 92 },
  { label: "打卡甜點", intent: "brand_discovery", clusterName: "content", priority: 86 },
  { label: "LINE 預訂甜點", intent: "conversion", clusterName: "conversion", priority: 78 }
] as const;

export const demoBrandRuntimeBootstrapSeed: ManagedSiteBootstrapSeed = {
  siteId: "demo-brand-site",
  connectorName: "demo-brand-runtime",
  summary: "Sanitized brand-site bootstrap seed for a runtime publishing connector example.",
  sourceProjectPath: "/workspace/examples/brand-site",
  settings: {
    siteUrl: "https://brand.example",
    dailyAuditEnabled: true,
    automationEnabled: true,
    autoPublishEnabled: true,
    autoQueueForSync: false,
    autoDeployEnabled: false,
    scheduleLocalTime: "02:00 / 08:00 / 14:00 / 20:00",
    scheduleTimezone: "Asia/Taipei",
    scheduleCronUtc: "0 */6 * * *",
    aiProvider: "workers-ai",
    fallbackProvider: "template",
    generationModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    topicCursor: 0
  },
  siteMetadata: {
    brandName: "示範品牌站",
    shortName: "Brand Demo",
    tagline: "示範用品牌站，展示 Cloudflare 原生 AI SEO runtime 發布模式",
    description: "這是一個公開範例品牌站 seed，示範如何管理品牌內容、內部連結與 AI SEO 自動化。",
    serviceArea: "Example City",
    footerDescription: "Sanitized example for open-source AI SEO demos",
    automation: {
      workerName: "brand-demo-seo-automation",
      cron: "0 */6 * * *",
      scheduleLabel: "每 6 小時巡檢一次",
      timezone: "Asia/Taipei"
    },
    staticIndexablePaths: ["/", "/about", "/menu", "/blog", "/faq"],
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
      connectorName: "demo-brand-runtime"
    }
  }))
};
