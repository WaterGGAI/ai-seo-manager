import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRuntimeContentArtifacts,
  buildStructuredOverrideArtifacts,
  generateRuntimeContentArtifacts,
  generateStructuredOverrideArtifacts,
  selectNextTopic
} from "../src/core/seo-content-pipeline";
import type { ManagedSiteSeoState, SeoStructuredOverride, SeoTopic } from "../src/core/seo-types";

function createTopic(overrides: Partial<SeoTopic> = {}): SeoTopic {
  return {
    id: "site::topic::sample",
    key: "sample-topic",
    slug: "sample-topic",
    title: "Sample Topic Title",
    focusKeyword: "sample keyword",
    audience: "Sample audience",
    category: "brand_local_seo",
    searchIntent: "Find sample answers quickly",
    summary: "Sample summary",
    metadata: {
      kicker: "Sample Kicker"
    },
    isActive: true,
    createdAt: "2026-04-21T00:00:00.000Z",
    updatedAt: "2026-04-21T00:00:00.000Z",
    ...overrides
  };
}

function createState(overrides: Partial<ManagedSiteSeoState> = {}): ManagedSiteSeoState {
  return {
    site: {
      id: "demo-brand-site",
      label: "示範品牌站",
      sourceProjectPath: "/tmp/gigi",
      siteType: "brand_local_seo",
      primaryLanguage: "zh-TW",
      publishMode: "kv_runtime",
      canonicalUrl: "https://brand.example",
      connectorName: "demo-brand-runtime",
      migrationPriority: 1,
      notes: []
    },
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
    },
    topics: [createTopic()],
    drafts: [],
    published: [],
    audits: [],
    lastAudit: null,
    usageEvents: [],
    usageSummary: {
      dateKey: "2026-04-21",
      timezone: "Asia/Taipei",
      generatedTodayCount: 0,
      workersAiCount: 0,
      openAiCount: 0,
      templateCount: 0,
      openAiFallbackCount: 0,
      templateFallbackCount: 0,
      workersAiEstimatedInputTokens: 0,
      workersAiEstimatedOutputTokens: 0,
      workersAiEstimatedNeurons: 0,
      workersAiEstimatedUsd: 0,
      notes: []
    },
    ranking: {
      enabled: false,
      siteUrl: "https://brand.example/",
      hasCredentials: false,
      ready: false,
      serviceAccountEmail: null,
      missingPrerequisites: [],
      latestSnapshot: null,
      latestSuccessfulSnapshot: null,
      snapshotCount: 0
    },
    structuredOverrides: [],
    buildSync: null,
    repairs: [],
    jobs: [],
    lastJob: null,
    ...overrides
  };
}

test("selectNextTopic wraps topic cursor across active topics", () => {
  const topics = [
    createTopic({ key: "topic-a", slug: "topic-a" }),
    createTopic({ key: "topic-b", slug: "topic-b" }),
    createTopic({ key: "topic-c", slug: "topic-c" })
  ];

  const result = selectNextTopic(topics, 4);

  assert.equal(result.topic?.key, "topic-b");
  assert.equal(result.nextCursor, 2);
});

test("buildRuntimeContentArtifacts creates a scheduled draft and published snapshot for kv runtime sites", () => {
  const state = createState();
  const result = buildRuntimeContentArtifacts({
    state,
    topic: state.topics[0],
    createdAt: "2026-04-21T08:00:00.000Z",
    bootstrapMetadata: {
      brandName: "示範品牌站",
      shortName: "Brand Demo",
      lineUrl: "https://example.com/join-line",
      serviceArea: "Example City",
      allowedInternalLinks: [
        { href: "/today", label: "今天在哪裡", reason: "看今日快閃資訊" },
        { href: "/menu", label: "Brand Demo 菜單", reason: "看口味與預訂資訊" }
      ]
    }
  });

  assert.equal(result.draft.source, "scheduled");
  assert.equal(result.draft.status, "published_pending_sync");
  assert.equal(result.draft.syncStatus, "pending_deploy");
  assert.equal(result.published.slug, "sample-topic");
  assert.equal(result.published.liveUrl, "https://brand.example/blog/sample-topic");
  assert.match(result.draft.ctaBody, /LINE/);
  assert.equal(result.draft.internalLinks.length, 2);
  assert.equal(result.usageEvent.provider, "template");
  assert.equal(result.usageEvent.usedFallbackChain, true);
});

test("buildRuntimeContentArtifacts queues published snapshots for api_feed_build_sync sites", () => {
  const state = createState({
    site: {
      id: "demo-platform-site",
      label: "示範平台站",
      sourceProjectPath: "/tmp/demo-platform",
      siteType: "brand_local_seo",
      primaryLanguage: "zh-TW",
      publishMode: "api_feed_build_sync",
      canonicalUrl: "https://platform.example",
      connectorName: "demo-platform-build-sync",
      migrationPriority: 1,
      notes: []
    },
    settings: {
      ...createState().settings,
      siteUrl: "https://platform.example",
      autoPublishEnabled: false,
      autoQueueForSync: true
    }
  });

  const result = buildRuntimeContentArtifacts({
    state,
    topic: state.topics[0],
    createdAt: "2026-04-21T08:30:00.000Z",
    bootstrapMetadata: {
      brandName: "示範平台站",
      shortName: "Platform Demo",
      serviceArea: "全台灣市集主辦與攤商",
      allowedInternalLinks: [{ href: "/blog", label: "SEO 文章" }]
    }
  });

  assert.equal(result.draft.status, "published_pending_sync");
  assert.equal(result.draft.syncStatus, "pending_deploy");
  assert.equal(result.published.liveUrl, "https://platform.example/blog/sample-topic");
});

test("generateRuntimeContentArtifacts uses Workers AI output when the binding is available", async () => {
  const state = createState();
  const aiCalls: Array<{ model: string; inputs: Record<string, unknown>; options?: unknown }> = [];
  const env = {
    AI: {
      async run(model: string, inputs: Record<string, unknown>, options?: unknown) {
        aiCalls.push({ model, inputs, options });
        return {
          response: {
            title: "AI 寫的品牌文章標題",
            description: "AI 寫的文章描述",
            heroSummary: "AI 重點摘要",
            heading: "AI 主標題",
            kicker: "AI Kicker",
            intro: "AI 產生的開頭段落",
            sections: [
              {
                heading: "AI 第一段",
                paragraphs: ["AI 說明段落一", "AI 說明段落二"],
                bullets: ["AI 重點一", "AI 重點二"]
              }
            ],
            faq: [
              {
                question: "AI 常見問題？",
                answer: "AI 常見問題答案。"
              }
            ],
            ctaTitle: "AI 下一步",
            ctaBody: "請直接透過 LINE 聯絡我們。"
          },
          usage: {
            prompt_tokens: 120,
            completion_tokens: 80,
            total_tokens: 200
          }
        };
      }
    }
  } as Env;

  const result = await generateRuntimeContentArtifacts({
    env,
    state,
    topic: state.topics[0],
    createdAt: "2026-04-21T09:00:00.000Z",
    bootstrapMetadata: {
      brandName: "示範品牌站",
      shortName: "Brand Demo",
      lineUrl: "https://example.com/join-line",
      serviceArea: "Example City",
      allowedInternalLinks: [{ href: "/menu", label: "菜單" }]
    }
  });

  assert.equal(aiCalls.length, 1);
  assert.equal(aiCalls[0]?.model, "@cf/meta/llama-3.3-70b-instruct-fp8-fast");
  assert.equal(result.draft.generationMode, "workers-ai");
  assert.equal(result.usageEvent.provider, "workers-ai");
  assert.equal(result.usageEvent.usedFallbackChain, false);
  assert.equal(result.draft.title, "AI 寫的品牌文章標題");
  assert.equal(result.draft.sections[0]?.heading, "AI 第一段");
  assert.equal(result.draft.faq[0]?.question, "AI 常見問題？");
  assert.equal(result.draft.internalLinks.length, 1);
  assert.equal(result.draft.usage?.estimateSource, "workers_ai_usage");
  assert.ok((result.draft.usage?.estimatedCostUsd ?? 0) > 0);
});

test("generateRuntimeContentArtifacts falls back to template content when Workers AI is unavailable", async () => {
  const state = createState();

  const result = await generateRuntimeContentArtifacts({
    env: {} as Env,
    state,
    topic: state.topics[0],
    createdAt: "2026-04-21T10:00:00.000Z",
    bootstrapMetadata: {
      brandName: "示範品牌站",
      shortName: "Brand Demo",
      lineUrl: "https://example.com/join-line",
      serviceArea: "Example City",
      allowedInternalLinks: [{ href: "/menu", label: "菜單" }]
    }
  });

  assert.equal(result.draft.generationMode, "template");
  assert.equal(result.usageEvent.provider, "template");
  assert.equal(result.usageEvent.usedFallbackChain, true);
  assert.match(result.draft.generationNotes ?? "", /fallback/i);
});

test("buildStructuredOverrideArtifacts refreshes calculator overrides from topic landing routes", () => {
  const state = createState({
    site: {
      id: "demo-tools-site",
      label: "CalculatorMap",
      sourceProjectPath: "/tmp/demo-tools-site",
      siteType: "programmatic_seo_tools",
      primaryLanguage: "en",
      publishMode: "d1_override",
      canonicalUrl: "https://tools.example",
      connectorName: "demo-calculator-d1",
      migrationPriority: 3,
      notes: []
    },
    settings: {
      ...createState().settings,
      siteUrl: "https://tools.example",
      autoPublishEnabled: false,
      scheduleTimezone: "UTC",
      scheduleCronUtc: "0 * * * *"
    },
    topics: [
      createTopic({
        key: "pricing-and-discount-calculator-cluster",
        slug: "pricing-and-discount-calculator-cluster",
        title: "Pricing and discount calculators",
        focusKeyword: "discount calculator",
        audience: "Shoppers validating sale price",
        category: "programmatic_seo_tools",
        searchIntent: "Calculate a sale price fast",
        summary: "Sharpen SEO content on price tools.",
        metadata: {
          landingRoutes: ["/calculator/discount-calculator", "/calculator/sales-tax-calculator"]
        }
      })
    ],
    structuredOverrides: [
      {
        id: "demo-tools-site::override::calculator::discount-calculator",
        entityType: "calculator",
        entityKey: "discount-calculator",
        routePath: "/calculator/discount-calculator",
        title: "Old title",
        description: "Old description",
        heading: "Old heading",
        intro: "Old intro",
        content: "Old content",
        faq: [],
        taskType: "full_refresh",
        modelKey: "@cf/meta/llama-3.1-8b-instruct-fp8",
        updatedBy: "seed",
        updatedAt: "2026-04-20T00:00:00.000Z",
        metadata: {}
      } satisfies SeoStructuredOverride
    ]
  });

  const result = buildStructuredOverrideArtifacts({
    state,
    topic: state.topics[0],
    createdAt: "2026-04-21T08:00:00.000Z",
    bootstrapMetadata: {
      brandName: "CalculatorMap",
      automation: {
        defaultTaskType: "full_refresh"
      }
    }
  });

  assert.equal(result.override.entityType, "calculator");
  assert.equal(result.override.entityKey, "discount-calculator");
  assert.equal(result.override.routePath, "/calculator/discount-calculator");
  assert.match(result.override.title, /Discount Calculator/i);
  assert.equal(result.override.updatedBy, "scheduled:ai-seo-control");
  assert.equal(result.usageEvent.provider, "template");
  assert.equal(result.usageEvent.usedFallbackChain, true);
});

test("generateStructuredOverrideArtifacts uses Workers AI output for calculator overrides", async () => {
  const state = createState({
    site: {
      id: "demo-tools-site",
      label: "CalculatorMap",
      sourceProjectPath: "/tmp/demo-tools-site",
      siteType: "programmatic_seo_tools",
      primaryLanguage: "en",
      publishMode: "d1_override",
      canonicalUrl: "https://tools.example",
      connectorName: "demo-calculator-d1",
      migrationPriority: 3,
      notes: []
    },
    settings: {
      ...createState().settings,
      siteUrl: "https://tools.example",
      autoPublishEnabled: false,
      scheduleTimezone: "UTC",
      scheduleCronUtc: "0 * * * *"
    },
    topics: [
      createTopic({
        key: "finance-calculator-cluster",
        slug: "finance-calculator-cluster",
        title: "Finance calculators",
        focusKeyword: "loan calculator",
        audience: "People comparing financing options",
        category: "programmatic_seo_tools",
        searchIntent: "Estimate monthly payments fast",
        summary: "Improve conversion content on calculator landing pages.",
        metadata: {
          landingRoutes: ["/calculator/loan-payment-calculator"]
        }
      })
    ]
  });

  const env = {
    AI: {
      async run() {
        return {
          response: {
            title: "AI Loan Payment Calculator",
            description: "AI description for better SEO snippets.",
            heading: "AI Loan Payment Calculator Heading",
            intro: "AI intro for calculator users.",
            content: "AI-generated calculator content block.",
            faq: [
              {
                question: "How does this calculator help?",
                answer: "It helps estimate monthly payments."
              }
            ]
          },
          usage: {
            prompt_tokens: 90,
            completion_tokens: 60,
            total_tokens: 150
          }
        };
      }
    }
  } as Env;

  const result = await generateStructuredOverrideArtifacts({
    env,
    state,
    topic: state.topics[0],
    createdAt: "2026-04-21T11:00:00.000Z",
    bootstrapMetadata: {
      brandName: "CalculatorMap",
      automation: {
        defaultTaskType: "full_refresh"
      }
    }
  });

  assert.equal(result.override.entityKey, "loan-payment-calculator");
  assert.equal(result.override.title, "AI Loan Payment Calculator");
  assert.equal(result.override.content, "AI-generated calculator content block.");
  assert.equal(result.override.modelKey, "@cf/meta/llama-3.3-70b-instruct-fp8-fast");
  assert.equal(result.usageEvent.provider, "workers-ai");
  assert.equal(result.usageEvent.usedFallbackChain, false);
});

test("generateStructuredOverrideArtifacts supports Workers AI models that need prompt-only JSON output", async () => {
  const aiCalls: Array<{ model: string; inputs: Record<string, unknown> }> = [];
  const state = createState({
    site: {
      id: "demo-tools-site",
      label: "CalculatorMap",
      sourceProjectPath: "/tmp/demo-tools-site",
      siteType: "programmatic_seo_tools",
      primaryLanguage: "en",
      publishMode: "d1_override",
      canonicalUrl: "https://tools.example",
      connectorName: "demo-calculator-d1",
      migrationPriority: 3,
      notes: []
    },
    settings: {
      ...createState().settings,
      siteUrl: "https://tools.example",
      generationModel: "@cf/meta/llama-3.1-8b-instruct-fp8",
      autoPublishEnabled: false,
      scheduleTimezone: "UTC",
      scheduleCronUtc: "0 * * * *"
    },
    topics: [
      createTopic({
        key: "pricing-and-discount-calculator-cluster",
        slug: "pricing-and-discount-calculator-cluster",
        title: "Pricing and discount calculators",
        focusKeyword: "discount calculator",
        audience: "Shoppers validating sale price",
        category: "programmatic_seo_tools",
        searchIntent: "Calculate a sale price fast",
        summary: "Sharpen SEO content on price tools.",
        metadata: {
          landingRoutes: ["/calculator/discount-calculator"]
        }
      })
    ]
  });

  const env = {
    AI: {
      async run(model: string, inputs: Record<string, unknown>) {
        aiCalls.push({ model, inputs });
        return {
          response: JSON.stringify({
            title: "Prompt JSON Discount Calculator",
            description: "Prompt JSON description",
            heading: "Prompt JSON Heading",
            intro: "Prompt JSON intro",
            content: "Prompt JSON content",
            faq: [
              {
                question: "Can this calculator help with discounts?",
                answer: "Yes, it helps compare list price and sale price."
              }
            ]
          })
        };
      }
    }
  } as Env;

  const result = await generateStructuredOverrideArtifacts({
    env,
    state,
    topic: state.topics[0],
    createdAt: "2026-04-21T12:00:00.000Z",
    bootstrapMetadata: {
      brandName: "CalculatorMap",
      automation: {
        defaultTaskType: "full_refresh"
      }
    }
  });

  assert.equal(aiCalls.length, 1);
  assert.equal(aiCalls[0]?.model, "@cf/meta/llama-3.1-8b-instruct-fp8");
  assert.equal("response_format" in (aiCalls[0]?.inputs ?? {}), false);
  assert.equal(result.override.title, "Prompt JSON Discount Calculator");
  assert.equal(result.usageEvent.provider, "workers-ai");
  assert.equal(result.usageEvent.usedFallbackChain, false);
});
