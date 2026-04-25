import type { ManagedSiteBootstrapSeed } from "./types";

const STRUCTURED_OVERRIDE_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";

export const demoCalculatorD1BootstrapSeed: ManagedSiteBootstrapSeed = {
  siteId: "demo-tools-site",
  connectorName: "demo-calculator-d1",
  summary: "Sanitized bootstrap seed for a D1-backed programmatic SEO tools connector example.",
  sourceProjectPath: "/workspace/examples/calculator-site",
  settings: {
    siteUrl: "https://tools.example",
    dailyAuditEnabled: true,
    automationEnabled: true,
    autoPublishEnabled: false,
    autoQueueForSync: false,
    autoDeployEnabled: false,
    scheduleLocalTime: "Every hour",
    scheduleTimezone: "UTC",
    scheduleCronUtc: "0 * * * *",
    aiProvider: "workers-ai",
    fallbackProvider: "template",
    generationModel: STRUCTURED_OVERRIDE_MODEL,
    topicCursor: 0,
    metadata: {
      connectorMode: "d1_override",
      supportedTasks: ["full_refresh", "seo_title", "meta_description", "faq_generation", "intro_generation"]
    }
  },
  siteMetadata: {
    brandName: "Example Tools",
    siteLanguage: "en",
    adminLanguage: "zh-TW",
    description: "Sanitized example tool site that stores SEO overrides in D1.",
    publishModel: "D1-backed structured overrides",
    publicRoutes: ["/", "/calculators", "/calculator/[slug]", "/category/[slug]", "/about", "/contact"],
    automation: {
      workerName: "calculator-example-api",
      cron: "0 * * * *",
      timezone: "UTC",
      summary: "Hourly Worker task refreshes SEO overrides for programmatic pages."
    }
  },
  keywords: [
    { label: "bmi calculator", intent: "tool_search", clusterName: "health", priority: 100, metadata: { routePath: "/calculator/bmi-calculator" } },
    { label: "mortgage calculator", intent: "tool_search", clusterName: "finance", priority: 96, metadata: { routePath: "/calculator/mortgage-calculator" } },
    { label: "discount calculator", intent: "tool_search", clusterName: "pricing", priority: 92, metadata: { routePath: "/calculator/discount-calculator" } }
  ],
  topics: [
    {
      key: "finance-calculators",
      slug: "finance-calculators",
      title: "Finance calculator pages that need structured SEO refreshes",
      focusKeyword: "finance calculators",
      audience: "Users comparing payment, mortgage, and savings tools",
      category: "programmatic_seo_tools",
      searchIntent: "Find a calculator that answers a concrete finance question fast",
      summary: "Map high-intent finance queries to calculator pages plus concise FAQ and intro blocks.",
      metadata: { connectorName: "demo-calculator-d1" }
    },
    {
      key: "pricing-calculators",
      slug: "pricing-calculators",
      title: "Pricing and discount calculators for transaction-intent traffic",
      focusKeyword: "discount calculator",
      audience: "Shoppers and operators comparing price outcomes",
      category: "programmatic_seo_tools",
      searchIntent: "Calculate sale price or tax impact quickly",
      summary: "Use structured overrides to sharpen title, intro, and FAQ for pricing tools.",
      metadata: { connectorName: "demo-calculator-d1" }
    }
  ],
  structuredOverrides: [
    {
      entityType: "calculator",
      entityKey: "bmi-calculator",
      routePath: "/calculator/bmi-calculator",
      title: "BMI Calculator - Check Body Mass Index",
      description: "Use this free BMI calculator to estimate body mass index from height and weight.",
      heading: "BMI Calculator",
      intro: "Enter height and weight to estimate BMI and a general healthy-weight range.",
      content: "BMI = weight in kilograms / height in meters squared.",
      faq: [
        { question: "Is BMI accurate for everyone?", answer: "BMI is a screening metric and should be interpreted with context." },
        { question: "What formula does this calculator use?", answer: "It uses weight in kilograms divided by height in meters squared." }
      ],
      taskType: "full_refresh",
      modelKey: STRUCTURED_OVERRIDE_MODEL,
      updatedBy: "seed:example"
    }
  ]
};
