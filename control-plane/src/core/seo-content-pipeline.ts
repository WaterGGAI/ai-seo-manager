import { matchesScheduledTick } from "./cron-schedule";
import { readManagedSiteRecord } from "./managed-sites";
import { seoModelOptions } from "./seo-models";
import { runSeoJob } from "./seo-jobs";
import { readManagedSiteSeoState } from "./seo-state";
import { createOrUpdateStructuredOverride } from "./structured-overrides";
import type {
  ManagedSiteSeoState,
  SeoDraft,
  SeoFaqItem,
  SeoInternalLink,
  SeoJobTriggerSource,
  SeoPublishedArticle,
  SeoSection,
  SeoStructuredOverride,
  SeoTopic,
  SeoUsageEstimate,
  SeoUsageEvent
} from "./seo-types";

type ScheduledContentTarget = {
  siteId: string;
  label: string;
  publishMode: string;
  scheduleCronUtc: string | null;
};

type ManagedSiteMetadataRow = {
  metadata_json: string | null;
};

type SiteSettingsRow = {
  schedule_cron_utc: string | null;
};

type RuntimeContentArtifacts = {
  draft: SeoDraft;
  published: SeoPublishedArticle;
  usageEvent: SeoUsageEvent;
};

type StructuredOverrideArtifacts = {
  override: Omit<SeoStructuredOverride, "id" | "updatedAt">;
  usageEvent: SeoUsageEvent;
};

type WorkersAiUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type SelectedTopic = {
  topic: SeoTopic | null;
  nextCursor: number;
  usedIndex: number | null;
};

type ContentGenerationResult = {
  siteId: string;
  publishMode: string;
  topicKey: string | null;
  draftId: string | null;
  publishedId: string | null;
  structuredOverrideId: string | null;
  nextTopicCursor: number;
};

const DEFAULT_AUTHOR = "AI SEO Control";
const DEFAULT_WORKERS_AI_MAX_TOKENS = 1600;

function shouldQueuePublishedSnapshot(state: ManagedSiteSeoState) {
  if (state.site.publishMode === "api_feed_build_sync") {
    return true;
  }

  return state.settings.autoPublishEnabled;
}

export class SeoContentPipelineError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "SeoContentPipelineError";
    this.status = status;
  }
}

function parseObject(value: string | null): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function slugToTitle(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractRecord(value: unknown, key: string) {
  if (!isRecord(value)) {
    return {};
  }

  const nested = value[key];
  return isRecord(nested) ? nested : {};
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function readInternalLinks(value: unknown): SeoInternalLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => ({
      href: normalizeText(item.href),
      label: normalizeText(item.label),
      reason: normalizeText(item.reason) || undefined
    }))
    .filter((item) => item.href.startsWith("/") && item.label.length > 0);
}

function buildUsageEstimate(): SeoUsageEstimate {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    inputCostUsd: 0,
    outputCostUsd: 0,
    estimatedCostUsd: 0,
    estimatedNeurons: 0,
    estimateSource: "local_template_fallback"
  };
}

function buildWorkersAiUsageEstimate(options: {
  model: string | null;
  usage: WorkersAiUsage | null;
  promptText: string;
  outputText: string;
}): SeoUsageEstimate {
  const pricing = seoModelOptions.find((item) => item.id === options.model)?.pricingUsdPerMillion;
  const estimatedPromptTokens =
    typeof options.usage?.prompt_tokens === "number"
      ? options.usage.prompt_tokens
      : Math.max(1, Math.ceil(normalizeText(options.promptText).length / 4));
  const estimatedCompletionTokens =
    typeof options.usage?.completion_tokens === "number"
      ? options.usage.completion_tokens
      : Math.max(1, Math.ceil(normalizeText(options.outputText).length / 4));
  const totalTokens =
    typeof options.usage?.total_tokens === "number"
      ? options.usage.total_tokens
      : estimatedPromptTokens + estimatedCompletionTokens;
  const inputCostUsd =
    pricing && estimatedPromptTokens > 0 ? Number(((estimatedPromptTokens / 1_000_000) * pricing.input).toFixed(6)) : null;
  const outputCostUsd =
    pricing && estimatedCompletionTokens > 0
      ? Number(((estimatedCompletionTokens / 1_000_000) * pricing.output).toFixed(6))
      : null;
  const estimatedCostUsd =
    inputCostUsd !== null || outputCostUsd !== null
      ? Number((((inputCostUsd ?? 0) + (outputCostUsd ?? 0))).toFixed(6))
      : null;

  return {
    inputTokens: estimatedPromptTokens,
    outputTokens: estimatedCompletionTokens,
    totalTokens,
    inputCostUsd,
    outputCostUsd,
    estimatedCostUsd,
    estimatedNeurons: totalTokens,
    estimateSource:
      typeof options.usage?.prompt_tokens === "number" || typeof options.usage?.completion_tokens === "number"
        ? "workers_ai_usage"
        : "heuristic"
  };
}

function buildUsageEvent(
  state: ManagedSiteSeoState,
  topic: SeoTopic,
  slug: string,
  createdAt: string,
  metadata: Record<string, unknown>,
  options: {
    provider?: "workers-ai" | "openai" | "template";
    usage?: SeoUsageEstimate;
    usedFallbackChain?: boolean;
  } = {}
): SeoUsageEvent {
  const usage = options.usage ?? buildUsageEstimate();
  return {
    id: crypto.randomUUID(),
    createdAt,
    provider: options.provider ?? "template",
    source: "scheduled",
    topicKey: topic.key,
    slug,
    model: state.settings.generationModel,
    estimatedInputTokens: usage.inputTokens ?? 0,
    estimatedOutputTokens: usage.outputTokens ?? 0,
    estimatedNeurons: usage.estimatedNeurons ?? 0,
    estimatedUsd: usage.estimatedCostUsd ?? 0,
    usedFallbackChain: options.usedFallbackChain ?? state.settings.aiProvider !== "template",
    metadata
  };
}

function buildSections(topic: SeoTopic, bootstrapMetadata: Record<string, unknown>): SeoSection[] {
  const brandName = normalizeText(bootstrapMetadata.brandName) || normalizeText(bootstrapMetadata.shortName) || "品牌";
  const serviceArea = normalizeText(bootstrapMetadata.serviceArea) || normalizeText(bootstrapMetadata.locationName) || "在地服務區域";

  return [
    {
      heading: `${topic.focusKeyword} 為什麼值得先看`,
      paragraphs: [
        `${brandName} 會用這個主題來回答 ${topic.audience} 最常遇到的情境，先把搜尋者真正想知道的重點講清楚。`,
        `這篇內容的主軸是 ${topic.summary}，讓讀者可以更快判斷自己是不是要繼續看下去。`
      ],
      bullets: [
        `搜尋意圖：${topic.searchIntent}`,
        `服務範圍：${serviceArea}`,
        `主題分類：${topic.category}`
      ]
    },
    {
      heading: `${brandName} 會怎麼整理這件事`,
      paragraphs: [
        `我們把 ${topic.focusKeyword} 拆成更好理解的步驟，先說明情境，再補充選擇重點與常見問題。`,
        `如果你是 ${topic.audience}，通常只要先看完這幾個段落，就能快速知道下一步該怎麼做。`
      ],
      bullets: [
        topic.summary,
        `閱讀對象：${topic.audience}`,
        `適合延伸到站內其他頁面與品牌 CTA`
      ]
    }
  ];
}

function buildFaq(topic: SeoTopic, bootstrapMetadata: Record<string, unknown>): SeoFaqItem[] {
  const brandName = normalizeText(bootstrapMetadata.brandName) || "這個品牌";
  const lineId = normalizeText(bootstrapMetadata.lineId);
  const storeMetadata = extractRecord(bootstrapMetadata, "store");
  const pickupNote = normalizeText(bootstrapMetadata.pickupNote) || normalizeText(storeMetadata.closedNote);

  const faq: SeoFaqItem[] = [
    {
      question: `${topic.focusKeyword} 先看哪些重點最有效？`,
      answer: `先確認自己的需求情境、預算與取用方式，再對照 ${brandName} 目前提供的資訊與站內頁面。`
    },
    {
      question: `看完這篇之後下一步要做什麼？`,
      answer: pickupNote || (lineId ? `如果需要進一步確認，建議直接透過 LINE（${lineId}）詢問最新資訊。` : `如果需要最新資訊，建議直接回到站內主要 CTA 頁面。`)
    }
  ];

  return faq;
}

function buildInternalLinks(bootstrapMetadata: Record<string, unknown>) {
  return readInternalLinks(bootstrapMetadata.allowedInternalLinks).slice(0, 4);
}

function buildMdxDocument(
  title: string,
  description: string,
  intro: string,
  sections: SeoSection[],
  faq: SeoFaqItem[],
  ctaTitle: string,
  ctaBody: string
) {
  const sectionBlocks = sections
    .map((section) => {
      const paragraphs = section.paragraphs.map((paragraph) => paragraph).join("\n\n");
      const bullets = section.bullets.map((bullet) => `- ${bullet}`).join("\n");
      return `## ${section.heading}\n\n${paragraphs}${bullets ? `\n\n${bullets}` : ""}`;
    })
    .join("\n\n");

  const faqBlock = faq
    .map((item) => `### ${item.question}\n\n${item.answer}`)
    .join("\n\n");

  return `# ${title}\n\n${description}\n\n${intro}\n\n${sectionBlocks}\n\n## FAQ\n\n${faqBlock}\n\n## ${ctaTitle}\n\n${ctaBody}\n`;
}

function resolveWorkersAiMode(model: string | null) {
  if (!model) {
    return "disabled" as const;
  }

  const configuredModel = seoModelOptions.find((item) => item.id === model);
  if (configuredModel?.supportsJsonMode) {
    return "json_schema" as const;
  }

  return "prompt_json" as const;
}

function readLanguageInstruction(primaryLanguage: string) {
  if (primaryLanguage.toLowerCase().startsWith("zh")) {
    return "請使用繁體中文（台灣用語），語氣自然、可信、可直接上站。";
  }

  return "Write in clear English that can be published directly on a production SEO page.";
}

function readObjectFromAiResponse(value: unknown) {
  if (isRecord(value)) {
    if (isRecord(value.response)) {
      return value.response;
    }

    if (typeof value.response === "string") {
      try {
        const parsed = JSON.parse(value.response) as unknown;
        if (isRecord(parsed)) {
          return parsed;
        }
      } catch {
        return null;
      }
    }

    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return null;
}

function readWorkersAiUsage(value: unknown): WorkersAiUsage | null {
  if (!isRecord(value) || !isRecord(value.usage)) {
    return null;
  }

  return {
    prompt_tokens: typeof value.usage.prompt_tokens === "number" ? value.usage.prompt_tokens : undefined,
    completion_tokens: typeof value.usage.completion_tokens === "number" ? value.usage.completion_tokens : undefined,
    total_tokens: typeof value.usage.total_tokens === "number" ? value.usage.total_tokens : undefined
  };
}

function sanitizeSections(value: unknown, fallback: SeoSection[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const sections = value
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => ({
      heading: normalizeText(item.heading),
      paragraphs: readStringArray(item.paragraphs).slice(0, 4),
      bullets: readStringArray(item.bullets).slice(0, 6)
    }))
    .filter((item) => item.heading.length > 0 && item.paragraphs.length > 0)
    .slice(0, 4);

  return sections.length > 0 ? sections : fallback;
}

function sanitizeFaq(value: unknown, fallback: SeoFaqItem[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const faq = value
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => ({
      question: normalizeText(item.question),
      answer: normalizeText(item.answer)
    }))
    .filter((item) => item.question.length > 0 && item.answer.length > 0)
    .slice(0, 6);

  return faq.length > 0 ? faq : fallback;
}

function ensureNonEmpty(value: string, fallback: string) {
  return value.length > 0 ? value : fallback;
}

function buildRuntimePromptInput(options: {
  state: ManagedSiteSeoState;
  topic: SeoTopic;
  bootstrapMetadata: Record<string, unknown>;
  fallback: RuntimeContentArtifacts;
  workersAiMode: "json_schema" | "prompt_json";
}) {
  const { state, topic, bootstrapMetadata, fallback, workersAiMode } = options;
  const jsonSchema = {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      heroSummary: { type: "string" },
      heading: { type: "string" },
      kicker: { type: "string" },
      intro: { type: "string" },
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            heading: { type: "string" },
            paragraphs: {
              type: "array",
              items: { type: "string" }
            },
            bullets: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: ["heading", "paragraphs", "bullets"]
        }
      },
      faq: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question: { type: "string" },
            answer: { type: "string" }
          },
          required: ["question", "answer"]
        }
      },
      ctaTitle: { type: "string" },
      ctaBody: { type: "string" }
    },
    required: ["title", "description", "heroSummary", "heading", "kicker", "intro", "sections", "faq", "ctaTitle", "ctaBody"]
  };

  return {
    messages: [
      {
        role: "system",
        content:
          workersAiMode === "json_schema"
            ? "You generate structured SEO page content for a managed website. Return only valid JSON matching the requested schema. Keep claims grounded in the provided context, avoid markdown fences, and avoid invented offers, prices, or operating details."
            : "You generate structured SEO page content for a managed website. Return only a valid minified JSON object and nothing else. Keep claims grounded in the provided context, avoid markdown fences, and avoid invented offers, prices, or operating details."
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Generate brand SEO article fields",
          languageInstruction: readLanguageInstruction(state.site.primaryLanguage),
          site: {
            id: state.site.id,
            label: state.site.label,
            canonicalUrl: state.site.canonicalUrl,
            siteType: state.site.siteType
          },
          topic: {
            key: topic.key,
            slug: topic.slug,
            title: topic.title,
            focusKeyword: topic.focusKeyword,
            audience: topic.audience,
            searchIntent: topic.searchIntent,
            summary: topic.summary,
            metadata: topic.metadata
          },
          brand: bootstrapMetadata,
          constraints: {
            sections: "2 to 3 sections",
            faq: "2 to 3 FAQ items",
            noMarkdown: true
          },
          jsonSchema,
          fallbackShape: {
            title: fallback.draft.title,
            heading: fallback.draft.heading,
            kicker: fallback.draft.kicker
          }
        })
      }
    ],
    ...(workersAiMode === "json_schema"
      ? {
          response_format: {
            type: "json_schema",
            json_schema: jsonSchema
          }
        }
      : {}),
    max_tokens: DEFAULT_WORKERS_AI_MAX_TOKENS,
    temperature: 0.4
  } satisfies Record<string, unknown>;
}

function buildStructuredOverridePromptInput(options: {
  state: ManagedSiteSeoState;
  topic: SeoTopic;
  bootstrapMetadata: Record<string, unknown>;
  fallback: StructuredOverrideArtifacts;
  workersAiMode: "json_schema" | "prompt_json";
}) {
  const { state, topic, bootstrapMetadata, fallback, workersAiMode } = options;
  const jsonSchema = {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      heading: { type: "string" },
      intro: { type: "string" },
      content: { type: "string" },
      faq: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question: { type: "string" },
            answer: { type: "string" }
          },
          required: ["question", "answer"]
        }
      }
    },
    required: ["title", "description", "heading", "intro", "content", "faq"]
  };

  return {
    messages: [
      {
        role: "system",
        content:
          workersAiMode === "json_schema"
            ? "You generate structured SEO override content for programmatic calculator landing pages. Return only valid JSON matching the requested schema. Keep copy specific to the provided calculator intent and avoid markdown fences."
            : "You generate structured SEO override content for programmatic calculator landing pages. Return only a valid minified JSON object and nothing else. Keep copy specific to the provided calculator intent and avoid markdown fences."
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Generate calculator structured override fields",
          languageInstruction: readLanguageInstruction(state.site.primaryLanguage),
          site: {
            id: state.site.id,
            label: state.site.label,
            canonicalUrl: state.site.canonicalUrl,
            siteType: state.site.siteType
          },
          topic: {
            key: topic.key,
            slug: topic.slug,
            title: topic.title,
            focusKeyword: topic.focusKeyword,
            audience: topic.audience,
            searchIntent: topic.searchIntent,
            summary: topic.summary,
            metadata: topic.metadata
          },
          brand: bootstrapMetadata,
          calculatorRoute: fallback.override.routePath,
          jsonSchema,
          fallbackShape: {
            title: fallback.override.title,
            heading: fallback.override.heading
          }
        })
      }
    ],
    ...(workersAiMode === "json_schema"
      ? {
          response_format: {
            type: "json_schema",
            json_schema: jsonSchema
          }
        }
      : {}),
    max_tokens: 1000,
    temperature: 0.3
  } satisfies Record<string, unknown>;
}

export function selectNextTopic(topics: SeoTopic[], topicCursor: number): SelectedTopic {
  const activeTopics = topics.filter((topic) => topic.isActive);
  if (activeTopics.length === 0) {
    return {
      topic: null,
      nextCursor: 0,
      usedIndex: null
    };
  }

  const normalizedCursor = Number.isFinite(topicCursor) ? Math.max(0, Math.floor(topicCursor)) : 0;
  const usedIndex = normalizedCursor % activeTopics.length;

  return {
    topic: activeTopics[usedIndex] ?? null,
    nextCursor: (usedIndex + 1) % activeTopics.length,
    usedIndex
  };
}

export function buildRuntimeContentArtifacts(options: {
  state: ManagedSiteSeoState;
  topic: SeoTopic;
  createdAt: string;
  bootstrapMetadata: Record<string, unknown>;
}): RuntimeContentArtifacts {
  const { state, topic, createdAt, bootstrapMetadata } = options;
  const draftId = `${state.site.id}::draft::${topic.slug}::${createdAt}`;
  const publishedId = `${state.site.id}::published::${topic.slug}`;
  const title = topic.title;
  const description =
    normalizeText(bootstrapMetadata.description) ||
    `${topic.focusKeyword} 的重點整理，幫你快速理解 ${topic.audience} 真正在意的內容。`;
  const heroSummary = topic.summary;
  const heading = topic.title;
  const kicker = normalizeText(topic.metadata.kicker) || normalizeText(bootstrapMetadata.shortName) || state.site.label;
  const intro = `${topic.title} 這篇會先回答「${topic.searchIntent}」，再整理 ${topic.audience} 最需要先知道的判斷重點。`;
  const sections = buildSections(topic, bootstrapMetadata);
  const faq = buildFaq(topic, bootstrapMetadata);
  const internalLinks = buildInternalLinks(bootstrapMetadata);
  const ctaTitle = "下一步怎麼做";
  const ctaBody = normalizeText(bootstrapMetadata.lineUrl)
    ? `想確認最新資訊、預訂方式或現場安排，可以直接透過 LINE 與我們聯繫：${normalizeText(bootstrapMetadata.lineUrl)}`
    : "看完這篇之後，可以直接回到站內主要 CTA 頁面或常見問題頁。";
  const mdx = buildMdxDocument(title, description, intro, sections, faq, ctaTitle, ctaBody);
  const usage = buildUsageEstimate();
  const generationNotes =
    "Generated by the scheduled template fallback pipeline. Workers AI generation has not been enabled or was unavailable for this flow.";
  const liveUrl = `${state.site.canonicalUrl.replace(/\/$/, "")}/blog/${topic.slug}`;
  const shouldPublishSnapshot = shouldQueuePublishedSnapshot(state);
  const keywords = Array.from(
    new Set([topic.focusKeyword, normalizeText(bootstrapMetadata.brandName), normalizeText(bootstrapMetadata.shortName)].filter(Boolean))
  );

  const draft: SeoDraft = {
    id: draftId,
    topicKey: topic.key,
    slug: topic.slug,
    title,
    description,
    heroSummary,
    heading,
    kicker,
    focusKeyword: topic.focusKeyword,
    keywords,
    category: topic.category,
    audience: topic.audience,
    searchIntent: topic.searchIntent,
    intro,
    sections,
    faq,
    internalLinks,
    ctaTitle,
    ctaBody,
    mdx,
    source: "scheduled",
    status: shouldPublishSnapshot ? "published_pending_sync" : "draft",
    syncStatus: "pending_deploy",
    generationMode: "template",
    model: state.settings.generationModel,
    usage,
    generationNotes,
    createdAt,
    updatedAt: createdAt
  };

  const published: SeoPublishedArticle = {
    id: publishedId,
    draftId,
    topicKey: topic.key,
    slug: topic.slug,
    title,
    description,
    heroSummary,
    heading,
    kicker,
    focusKeyword: topic.focusKeyword,
    keywords,
    category: topic.category,
    audience: topic.audience,
    searchIntent: topic.searchIntent,
    intro,
    sections,
    faq,
    internalLinks,
    ctaTitle,
    ctaBody,
    mdx,
    author: normalizeText(bootstrapMetadata.brandName) || DEFAULT_AUTHOR,
    tags: keywords,
    schemaType: "Article",
    source: "scheduled",
    publishedSource: "scheduled",
    syncStatus: "pending_deploy",
    model: state.settings.generationModel,
    usage,
    generationNotes,
    generatedAt: createdAt,
    publishedAt: createdAt,
    updatedAt: createdAt,
    liveUrl
  };

  return {
    draft,
    published,
    usageEvent: buildUsageEvent(state, topic, topic.slug, createdAt, {
      publishMode: state.site.publishMode,
      generationMode: "template",
      automationSource: "scheduled_runtime_publish"
    })
  };
}

export async function generateRuntimeContentArtifacts(options: {
  env: Cloudflare.Env;
  state: ManagedSiteSeoState;
  topic: SeoTopic;
  createdAt: string;
  bootstrapMetadata: Record<string, unknown>;
}) {
  const fallback = buildRuntimeContentArtifacts({
    state: options.state,
    topic: options.topic,
    createdAt: options.createdAt,
    bootstrapMetadata: options.bootstrapMetadata
  });

  const workersAiMode = resolveWorkersAiMode(options.state.settings.generationModel);
  if (
    options.state.settings.aiProvider !== "workers-ai" ||
    !options.env.AI ||
    workersAiMode === "disabled"
  ) {
    return fallback;
  }

  try {
    const input = buildRuntimePromptInput({
      state: options.state,
      topic: options.topic,
      bootstrapMetadata: options.bootstrapMetadata,
      fallback,
      workersAiMode
    });
    const aiResponse = await options.env.AI.run(options.state.settings.generationModel!, input, {
      extraHeaders: {
        "x-session-affinity": `seo-content-${options.state.site.id}`
      },
      tags: ["seo", "content-generation", options.state.site.id]
    });
    const payload = readObjectFromAiResponse(aiResponse);
    if (!payload) {
      throw new Error("Workers AI returned a non-JSON content payload.");
    }

    const title = ensureNonEmpty(normalizeText(payload.title), fallback.draft.title);
    const description = ensureNonEmpty(normalizeText(payload.description), fallback.draft.description);
    const heroSummary = ensureNonEmpty(normalizeText(payload.heroSummary), fallback.draft.heroSummary);
    const heading = ensureNonEmpty(normalizeText(payload.heading), fallback.draft.heading);
    const kicker = ensureNonEmpty(normalizeText(payload.kicker), fallback.draft.kicker);
    const intro = ensureNonEmpty(normalizeText(payload.intro), fallback.draft.intro);
    const sections = sanitizeSections(payload.sections, fallback.draft.sections);
    const faq = sanitizeFaq(payload.faq, fallback.draft.faq);
    const ctaTitle = ensureNonEmpty(normalizeText(payload.ctaTitle), fallback.draft.ctaTitle);
    const ctaBody = ensureNonEmpty(normalizeText(payload.ctaBody), fallback.draft.ctaBody);

    if (title.length === 0 || intro.length === 0 || sections.length === 0) {
      throw new Error("Workers AI content payload is missing required article fields.");
    }

    const mdx = buildMdxDocument(title, description, intro, sections, faq, ctaTitle, ctaBody);
    const promptText = JSON.stringify(input.messages);
    const outputText = JSON.stringify(payload);
    const usage = buildWorkersAiUsageEstimate({
      model: options.state.settings.generationModel,
      usage: readWorkersAiUsage(aiResponse),
      promptText,
      outputText
    });
    const generationNotes =
      usage.estimateSource === "workers_ai_usage"
        ? "Generated by Workers AI structured JSON mode."
        : "Generated by Workers AI structured JSON mode with heuristic usage estimation.";

    return {
      draft: {
        ...fallback.draft,
        title,
        description,
        heroSummary,
        heading,
        kicker,
        intro,
        sections,
        faq,
        ctaTitle,
        ctaBody,
        mdx,
        generationMode: "workers-ai",
        usage,
        generationNotes
      },
      published: {
        ...fallback.published,
        title,
        description,
        heroSummary,
        heading,
        kicker,
        intro,
        sections,
        faq,
        ctaTitle,
        ctaBody,
        mdx,
        model: options.state.settings.generationModel,
        usage,
        generationNotes
      },
      usageEvent: buildUsageEvent(
        options.state,
        options.topic,
        options.topic.slug,
        options.createdAt,
        {
          publishMode: options.state.site.publishMode,
          generationMode: "workers-ai",
          automationSource: "scheduled_runtime_publish"
        },
        {
          provider: "workers-ai",
          usage,
          usedFallbackChain: false
        }
      )
    } satisfies RuntimeContentArtifacts;
  } catch {
    return fallback;
  }
}

export function buildStructuredOverrideArtifacts(options: {
  state: ManagedSiteSeoState;
  topic: SeoTopic;
  createdAt: string;
  bootstrapMetadata: Record<string, unknown>;
}): StructuredOverrideArtifacts {
  const { state, topic, createdAt, bootstrapMetadata } = options;
  const landingRoutes = readStringArray(topic.metadata.landingRoutes);
  const routePath = landingRoutes[0] ?? `/calculator/${topic.slug}`;
  const entityKey = routePath.split("/").filter(Boolean).pop() ?? topic.slug;
  const entityTitle = slugToTitle(entityKey);
  const title = `${entityTitle} - ${topic.focusKeyword}`;
  const description =
    `${entityTitle} helps ${topic.audience.toLowerCase()} ${topic.searchIntent.charAt(0).toLowerCase()}${topic.searchIntent.slice(1)}.`;
  const heading = entityTitle;
  const intro = `Use this ${topic.focusKeyword} page to ${topic.searchIntent.charAt(0).toLowerCase()}${topic.searchIntent.slice(1)}.`;
  const content = `${entityTitle} content refresh: ${topic.summary}`;
  const taskType =
    normalizeText(extractRecord(state.settings.metadata, "automation").defaultTaskType) ||
    normalizeText(extractRecord(bootstrapMetadata, "automation").defaultTaskType) ||
    "full_refresh";
  const faq: SeoFaqItem[] = [
    {
      question: `What does ${entityTitle} help with?`,
      answer: `It helps ${topic.audience.toLowerCase()} ${topic.searchIntent.charAt(0).toLowerCase()}${topic.searchIntent.slice(1)}.`
    },
    {
      question: `Why refresh this override now?`,
      answer: `Because ${topic.summary.charAt(0).toLowerCase()}${topic.summary.slice(1)}`
    }
  ];

  return {
    override: {
      entityType: "calculator",
      entityKey,
      routePath,
      title,
      description,
      heading,
      intro,
      content,
      faq,
      taskType,
      modelKey: state.settings.generationModel,
      updatedBy: "scheduled:ai-seo-control",
      metadata: {
        topicKey: topic.key,
        refreshedAt: createdAt
      }
    },
    usageEvent: buildUsageEvent(state, topic, entityKey, createdAt, {
      publishMode: state.site.publishMode,
      generationMode: "template",
      automationSource: "scheduled_structured_override_refresh",
      routePath
    })
  };
}

export async function generateStructuredOverrideArtifacts(options: {
  env: Cloudflare.Env;
  state: ManagedSiteSeoState;
  topic: SeoTopic;
  createdAt: string;
  bootstrapMetadata: Record<string, unknown>;
}) {
  const fallback = buildStructuredOverrideArtifacts({
    state: options.state,
    topic: options.topic,
    createdAt: options.createdAt,
    bootstrapMetadata: options.bootstrapMetadata
  });

  const workersAiMode = resolveWorkersAiMode(options.state.settings.generationModel);
  if (
    options.state.settings.aiProvider !== "workers-ai" ||
    !options.env.AI ||
    workersAiMode === "disabled"
  ) {
    return fallback;
  }

  try {
    const input = buildStructuredOverridePromptInput({
      state: options.state,
      topic: options.topic,
      bootstrapMetadata: options.bootstrapMetadata,
      fallback,
      workersAiMode
    });
    const aiResponse = await options.env.AI.run(options.state.settings.generationModel!, input, {
      extraHeaders: {
        "x-session-affinity": `seo-content-${options.state.site.id}`
      },
      tags: ["seo", "content-generation", options.state.site.id]
    });
    const payload = readObjectFromAiResponse(aiResponse);
    if (!payload) {
      throw new Error("Workers AI returned a non-JSON override payload.");
    }

    const title = ensureNonEmpty(normalizeText(payload.title), fallback.override.title);
    const description = ensureNonEmpty(normalizeText(payload.description), fallback.override.description);
    const heading = ensureNonEmpty(normalizeText(payload.heading), fallback.override.heading);
    const intro = ensureNonEmpty(normalizeText(payload.intro), fallback.override.intro);
    const content = ensureNonEmpty(normalizeText(payload.content), fallback.override.content);
    const faq = sanitizeFaq(payload.faq, fallback.override.faq);

    if (title.length === 0 || content.length === 0) {
      throw new Error("Workers AI override payload is missing required fields.");
    }

    const promptText = JSON.stringify(input.messages);
    const outputText = JSON.stringify(payload);
    const usage = buildWorkersAiUsageEstimate({
      model: options.state.settings.generationModel,
      usage: readWorkersAiUsage(aiResponse),
      promptText,
      outputText
    });
    const generationNotes =
      usage.estimateSource === "workers_ai_usage"
        ? "Generated by Workers AI structured JSON mode."
        : "Generated by Workers AI structured JSON mode with heuristic usage estimation.";

    return {
      override: {
        ...fallback.override,
        title,
        description,
        heading,
        intro,
        content,
        faq,
        modelKey: options.state.settings.generationModel,
        updatedBy: "workers-ai:ai-seo-control",
        metadata: {
          ...fallback.override.metadata,
          generationNotes
        }
      },
      usageEvent: buildUsageEvent(
        options.state,
        options.topic,
        fallback.override.entityKey,
        options.createdAt,
        {
          publishMode: options.state.site.publishMode,
          generationMode: "workers-ai",
          automationSource: "scheduled_structured_override_refresh",
          routePath: fallback.override.routePath
        },
        {
          provider: "workers-ai",
          usage,
          usedFallbackChain: false
        }
      )
    } satisfies StructuredOverrideArtifacts;
  } catch {
    return fallback;
  }
}

async function readBootstrapMetadata(env: Cloudflare.Env, siteId: string) {
  if (!env.DB) {
    return {};
  }

  const row = await env.DB
    .prepare("SELECT metadata_json FROM managed_sites WHERE id = ?1 LIMIT 1")
    .bind(siteId)
    .first<ManagedSiteMetadataRow>();

  const metadata = parseObject(row?.metadata_json ?? null);
  return extractRecord(metadata, "connectorBootstrap");
}

export async function insertDraft(db: D1Database, siteId: string, draft: SeoDraft) {
  await db
    .prepare(
      `
      INSERT INTO managed_site_seo_drafts (
        id,
        site_id,
        topic_key,
        slug,
        title,
        description,
        hero_summary,
        heading,
        kicker,
        focus_keyword,
        keywords_json,
        category,
        audience,
        search_intent,
        intro,
        sections_json,
        faq_json,
        internal_links_json,
        cta_title,
        cta_body,
        mdx,
        source,
        status,
        sync_status,
        generation_mode,
        model,
        usage_json,
        generation_notes,
        created_at,
        updated_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30)
      `
    )
    .bind(
      draft.id,
      siteId,
      draft.topicKey,
      draft.slug,
      draft.title,
      draft.description,
      draft.heroSummary || null,
      draft.heading || null,
      draft.kicker || null,
      draft.focusKeyword || null,
      JSON.stringify(draft.keywords),
      draft.category || null,
      draft.audience || null,
      draft.searchIntent || null,
      draft.intro || null,
      JSON.stringify(draft.sections),
      JSON.stringify(draft.faq),
      JSON.stringify(draft.internalLinks),
      draft.ctaTitle || null,
      draft.ctaBody || null,
      draft.mdx || null,
      draft.source,
      draft.status,
      draft.syncStatus,
      draft.generationMode,
      draft.model,
      JSON.stringify(draft.usage),
      draft.generationNotes,
      draft.createdAt,
      draft.updatedAt
    )
    .run();
}

export async function upsertPublishedArticle(db: D1Database, siteId: string, article: SeoPublishedArticle) {
  await db
    .prepare(
      `
      INSERT INTO managed_site_seo_published_articles (
        id,
        site_id,
        draft_id,
        topic_key,
        slug,
        title,
        description,
        hero_summary,
        heading,
        kicker,
        focus_keyword,
        keywords_json,
        category,
        audience,
        search_intent,
        intro,
        sections_json,
        faq_json,
        internal_links_json,
        cta_title,
        cta_body,
        mdx,
        author,
        tags_json,
        schema_type,
        source,
        published_source,
        sync_status,
        model,
        usage_json,
        generation_notes,
        generated_at,
        published_at,
        updated_at,
        live_url
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33, ?34, ?35)
      ON CONFLICT(site_id, slug) DO UPDATE SET
        draft_id = excluded.draft_id,
        topic_key = excluded.topic_key,
        title = excluded.title,
        description = excluded.description,
        hero_summary = excluded.hero_summary,
        heading = excluded.heading,
        kicker = excluded.kicker,
        focus_keyword = excluded.focus_keyword,
        keywords_json = excluded.keywords_json,
        category = excluded.category,
        audience = excluded.audience,
        search_intent = excluded.search_intent,
        intro = excluded.intro,
        sections_json = excluded.sections_json,
        faq_json = excluded.faq_json,
        internal_links_json = excluded.internal_links_json,
        cta_title = excluded.cta_title,
        cta_body = excluded.cta_body,
        mdx = excluded.mdx,
        author = excluded.author,
        tags_json = excluded.tags_json,
        schema_type = excluded.schema_type,
        source = excluded.source,
        published_source = excluded.published_source,
        sync_status = excluded.sync_status,
        model = excluded.model,
        usage_json = excluded.usage_json,
        generation_notes = excluded.generation_notes,
        generated_at = excluded.generated_at,
        published_at = excluded.published_at,
        updated_at = excluded.updated_at,
        live_url = excluded.live_url
      `
    )
    .bind(
      article.id,
      siteId,
      article.draftId,
      article.topicKey,
      article.slug,
      article.title,
      article.description,
      article.heroSummary || null,
      article.heading || null,
      article.kicker || null,
      article.focusKeyword || null,
      JSON.stringify(article.keywords),
      article.category || null,
      article.audience || null,
      article.searchIntent || null,
      article.intro || null,
      JSON.stringify(article.sections),
      JSON.stringify(article.faq),
      JSON.stringify(article.internalLinks),
      article.ctaTitle || null,
      article.ctaBody || null,
      article.mdx || null,
      article.author || null,
      JSON.stringify(article.tags),
      article.schemaType,
      article.source,
      article.publishedSource,
      article.syncStatus,
      article.model,
      JSON.stringify(article.usage),
      article.generationNotes,
      article.generatedAt,
      article.publishedAt,
      article.updatedAt,
      article.liveUrl || null
    )
    .run();
}

export async function insertUsageEvent(db: D1Database, siteId: string, usageEvent: SeoUsageEvent) {
  await db
    .prepare(
      `
      INSERT INTO managed_site_seo_usage_events (
        id,
        site_id,
        created_at,
        provider,
        source,
        topic_key,
        slug,
        model,
        estimated_input_tokens,
        estimated_output_tokens,
        estimated_neurons,
        estimated_usd,
        used_fallback_chain,
        metadata_json
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
      `
    )
    .bind(
      usageEvent.id,
      siteId,
      usageEvent.createdAt,
      usageEvent.provider,
      usageEvent.source,
      usageEvent.topicKey,
      usageEvent.slug,
      usageEvent.model,
      usageEvent.estimatedInputTokens,
      usageEvent.estimatedOutputTokens,
      usageEvent.estimatedNeurons,
      usageEvent.estimatedUsd,
      usageEvent.usedFallbackChain ? 1 : 0,
      JSON.stringify(usageEvent.metadata)
    )
    .run();
}

async function updateSettingsAfterRun(
  db: D1Database,
  siteId: string,
  options: {
    nextTopicCursor: number;
    createdAt: string;
    markPublished: boolean;
  }
) {
  await db
    .prepare(
      `
      UPDATE managed_site_seo_settings
      SET topic_cursor = ?2,
          last_scheduled_draft_date = ?3,
          last_generated_at = ?3,
          last_published_at = CASE WHEN ?4 = 1 THEN ?3 ELSE last_published_at END,
          last_error = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE site_id = ?1
      `
    )
    .bind(siteId, options.nextTopicCursor, options.createdAt, options.markPublished ? 1 : 0)
    .run();
}

async function updateGenerationFailure(env: Cloudflare.Env, siteId: string, message: string) {
  if (!env.DB) {
    return;
  }

  await env.DB
    .prepare(
      `
      UPDATE managed_site_seo_settings
      SET last_error = ?2,
          updated_at = CURRENT_TIMESTAMP
      WHERE site_id = ?1
      `
    )
    .bind(siteId, message)
    .run();
}

export async function listScheduledContentTargets(
  env: Cloudflare.Env,
  options: { scheduledTime?: Date | number | string | null } = {}
) {
  if (!env.DB) {
    return [] satisfies ScheduledContentTarget[];
  }

  const result = await env.DB
    .prepare(
      `
      SELECT ms.id AS site_id, ms.label, ms.publish_mode, settings.schedule_cron_utc
      FROM managed_sites AS ms
      INNER JOIN managed_site_seo_settings AS settings
        ON settings.site_id = ms.id
      WHERE ms.is_active = 1
        AND settings.automation_enabled = 1
        AND (
          (ms.publish_mode = 'kv_runtime' AND settings.auto_publish_enabled = 1)
          OR (ms.publish_mode = 'api_feed_build_sync' AND settings.auto_queue_for_sync = 1)
          OR ms.publish_mode = 'd1_override'
        )
      ORDER BY ms.migration_priority ASC, ms.label ASC
      `
    )
    .all<{
      site_id: string;
      label: string;
      publish_mode: string;
      schedule_cron_utc: string | null;
    }>();

  const scheduledTime = options.scheduledTime ? new Date(options.scheduledTime) : null;
  return (result.results ?? [])
    .map((row) => ({
      siteId: row.site_id,
      label: row.label,
      publishMode: row.publish_mode,
      scheduleCronUtc: row.schedule_cron_utc
    }))
    .filter((item) => !scheduledTime || matchesScheduledTick(item.scheduleCronUtc, scheduledTime));
}

async function readSiteSettingsRow(env: Cloudflare.Env, siteId: string) {
  if (!env.DB) {
    return null;
  }

  return env.DB
    .prepare("SELECT schedule_cron_utc FROM managed_site_seo_settings WHERE site_id = ?1 LIMIT 1")
    .bind(siteId)
    .first<SiteSettingsRow>();
}

export async function runManagedSiteSeoContentJob(
  env: Cloudflare.Env,
  siteId: string,
  options: {
    triggerSource: SeoJobTriggerSource;
    payload?: Record<string, unknown>;
  }
) {
  if (!env.DB) {
    throw new SeoContentPipelineError("D1 binding is not configured yet.", 503);
  }

  const site = await readManagedSiteRecord(env, siteId);
  if (!site) {
    throw new SeoContentPipelineError(`Unknown site: ${siteId}`, 404);
  }

  const state = await readManagedSiteSeoState(env, siteId);
  if (!state) {
    throw new SeoContentPipelineError(`SEO state is unavailable for ${siteId}.`, 404);
  }

  const bootstrapMetadata = await readBootstrapMetadata(env, siteId);
  const createdAt = new Date().toISOString();
  const selection = selectNextTopic(state.topics, state.settings.topicCursor);
  if (!selection.topic) {
    throw new SeoContentPipelineError(`No active topics are configured for ${siteId}.`, 409);
  }

  try {
    return runSeoJob(
      env,
      {
        siteId,
        jobType: "content_generation",
        triggerSource: options.triggerSource,
        payload: {
          publishMode: state.site.publishMode,
          topicKey: selection.topic.key,
          ...(options.payload ?? {})
        }
      },
      async (reporter) => {
        await reporter.event("content_topic_selected", `Selected topic ${selection.topic!.key} for generation.`, {
          topicKey: selection.topic!.key,
          publishMode: state.site.publishMode
        });

        if (site.publishMode === "kv_runtime" || site.publishMode === "api_feed_build_sync") {
          const artifacts = await generateRuntimeContentArtifacts({
            env,
            state,
            topic: selection.topic!,
            createdAt,
            bootstrapMetadata
          });

          await insertDraft(env.DB!, siteId, artifacts.draft);
          await reporter.event("draft_generated", `Generated draft ${artifacts.draft.slug}.`, {
            draftId: artifacts.draft.id
          });

          await upsertPublishedArticle(env.DB!, siteId, artifacts.published);
          await reporter.event("draft_published", `Published snapshot ${artifacts.published.slug}.`, {
            publishedId: artifacts.published.id
          });

          await insertUsageEvent(env.DB!, siteId, artifacts.usageEvent);
          await updateSettingsAfterRun(env.DB!, siteId, {
            nextTopicCursor: selection.nextCursor,
            createdAt,
            markPublished: true
          });

          return {
            siteId,
            publishMode: site.publishMode,
            topicKey: selection.topic!.key,
            draftId: artifacts.draft.id,
            publishedId: artifacts.published.id,
            structuredOverrideId: null,
            nextTopicCursor: selection.nextCursor
          } satisfies ContentGenerationResult;
        }

        if (site.publishMode === "d1_override") {
          const artifacts = await generateStructuredOverrideArtifacts({
            env,
            state,
            topic: selection.topic!,
            createdAt,
            bootstrapMetadata
          });

          const writeResult = await createOrUpdateStructuredOverride(env, siteId, artifacts.override);
          await reporter.event("override_refreshed", `Refreshed structured override ${artifacts.override.entityKey}.`, {
            entityKey: artifacts.override.entityKey,
            routePath: artifacts.override.routePath
          });

          await insertUsageEvent(env.DB!, siteId, artifacts.usageEvent);
          await updateSettingsAfterRun(env.DB!, siteId, {
            nextTopicCursor: selection.nextCursor,
            createdAt,
            markPublished: true
          });

          return {
            siteId,
            publishMode: site.publishMode,
            topicKey: selection.topic!.key,
            draftId: null,
            publishedId: null,
            structuredOverrideId: writeResult.item.id,
            nextTopicCursor: selection.nextCursor
          } satisfies ContentGenerationResult;
        }

        throw new SeoContentPipelineError(`Publish mode ${site.publishMode} is not supported by the content pipeline yet.`, 400);
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateGenerationFailure(env, siteId, message);
    throw error;
  }
}

export async function shouldRunSiteContentAutomation(
  env: Cloudflare.Env,
  siteId: string,
  scheduledTime: Date | number | string
) {
  const row = await readSiteSettingsRow(env, siteId);
  return matchesScheduledTick(row?.schedule_cron_utc, new Date(scheduledTime));
}
