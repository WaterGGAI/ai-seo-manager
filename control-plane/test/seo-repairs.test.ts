import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index";
import { listActionableRepairCandidates } from "../src/core/seo-repairs";
import type { ManagedSiteSeoState, SeoAuditRun, SeoPublishedArticle, SeoStructuredOverride, SeoTopic } from "../src/core/seo-types";

function createExecutionContext(): ExecutionContext {
  return {
    waitUntil() {},
    passThroughOnException() {}
  } as ExecutionContext;
}

function createBasicAuthorization(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

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

function createAuditRun(overrides: Partial<SeoAuditRun> = {}): SeoAuditRun {
  return {
    id: "audit-1",
    source: "manual",
    baseUrl: "https://example.com",
    scheduleLabel: "manual",
    summary: {
      totalTargets: 1,
      okTargets: 0,
      warningTargets: 1,
      failingTargets: 0,
      publicTargets: 1,
      protectedTargets: 0,
      avgResponseTimeMs: 120,
      missingCanonicalCount: 0,
      missingDescriptionCount: 1,
      missingJsonLdCount: 0,
      missingNoindexCount: 0,
      h1IssueCount: 0,
      missingFaqCount: 0,
      missingHowToCount: 0,
      thinContentCount: 0,
      contentDriftCount: 0
    },
    targets: [],
    issues: [],
    createdAt: "2026-04-21T00:00:00.000Z",
    ...overrides
  };
}

function createPublishedArticle(overrides: Partial<SeoPublishedArticle> = {}): SeoPublishedArticle {
  return {
    id: "published-1",
    draftId: "draft-1",
    topicKey: "sample-topic",
    slug: "sample-topic",
    title: "Published sample title",
    description: "Published sample description",
    heroSummary: "Published hero summary",
    heading: "Published heading",
    kicker: "Published kicker",
    focusKeyword: "sample keyword",
    keywords: ["sample keyword"],
    category: "brand_local_seo",
    audience: "Sample audience",
    searchIntent: "Find sample answers quickly",
    intro: "Published intro",
    sections: [
      {
        heading: "Section one",
        paragraphs: ["Paragraph one"],
        bullets: ["Bullet one"]
      }
    ],
    faq: [],
    internalLinks: [],
    ctaTitle: "CTA",
    ctaBody: "CTA body",
    mdx: "# Published sample title",
    author: "AI SEO Control",
    tags: ["sample keyword"],
    schemaType: "Article",
    source: "scheduled",
    publishedSource: "scheduled",
    syncStatus: "pending_deploy",
    model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    usage: null,
    generationNotes: null,
    generatedAt: "2026-04-21T00:00:00.000Z",
    publishedAt: "2026-04-21T00:00:00.000Z",
    updatedAt: "2026-04-21T00:00:00.000Z",
    liveUrl: "https://example.com/blog/sample-topic",
    ...overrides
  };
}

function createStructuredOverride(overrides: Partial<SeoStructuredOverride> = {}): SeoStructuredOverride {
  return {
    id: "override-1",
    entityType: "calculator",
    entityKey: "discount-calculator",
    routePath: "/calculator/discount-calculator",
    title: "Discount Calculator",
    description: "Discount Calculator Description",
    heading: "Discount Calculator Heading",
    intro: "Discount calculator intro",
    content: "Discount calculator content",
    faq: [],
    taskType: "full_refresh",
    modelKey: "@cf/meta/llama-3.1-8b-instruct-fp8",
    updatedBy: "seed",
    updatedAt: "2026-04-21T00:00:00.000Z",
    metadata: {},
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
    published: [createPublishedArticle()],
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

test("lists actionable repair candidates for published content paths only", () => {
  const state = createState({
    lastAudit: createAuditRun({
      issues: [
        { severity: "warn", label: "Meta description", path: "/blog/sample-topic", message: "Missing meta description." },
        { severity: "warn", label: "FAQ coverage", path: "/blog/sample-topic", message: "No FAQ items or FAQ schema detected." },
        { severity: "warn", label: "Canonical tag", path: "/", message: "Missing canonical tag." },
        { severity: "fail", label: "Protected page noindex", path: "/health", message: "Protected page is missing noindex." }
      ]
    })
  });

  const candidates = listActionableRepairCandidates(state);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.path, "/blog/sample-topic");
  assert.equal(candidates[0]?.applyMode, "published_article");
  assert.equal(candidates[0]?.topic.key, "sample-topic");
  assert.equal(candidates[0]?.issueSummary.length, 2);
});

test("lists actionable repair candidates for structured override routes", () => {
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
          landingRoutes: ["/calculator/discount-calculator"]
        }
      })
    ],
    published: [],
    structuredOverrides: [createStructuredOverride()],
    lastAudit: createAuditRun({
      issues: [
        { severity: "warn", label: "Meta description", path: "/calculator/discount-calculator", message: "Missing meta description." }
      ]
    })
  });

  const candidates = listActionableRepairCandidates(state);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.path, "/calculator/discount-calculator");
  assert.equal(candidates[0]?.applyMode, "structured_override");
  assert.equal(candidates[0]?.topic.key, "pricing-and-discount-calculator-cluster");
});

test("rejects repair generation when D1 is unavailable", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/api/sites/demo-brand-site/seo/repairs/generate", {
      method: "POST",
      headers: {
        authorization: createBasicAuthorization("admin", "secret")
      }
    }),
    {
      APP_ENV: "production",
      BASIC_AUTH_USERNAME: "admin",
      BASIC_AUTH_PASSWORD: "secret"
    } as Env,
    createExecutionContext()
  );

  assert.equal(response.status, 503);
  const payload = (await response.json()) as { ok: boolean; error: string };
  assert.equal(payload.ok, false);
  assert.match(payload.error, /D1 binding/i);
});
