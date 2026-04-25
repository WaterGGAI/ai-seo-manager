import { readBuildSyncConfig } from "./build-sync";
import { matchesScheduledTick } from "./cron-schedule";
import { readManagedSiteRecord } from "./managed-sites";
import { runSeoJob } from "./seo-jobs";
import type { SeoDraftSource, SeoFaqItem, SeoInternalLink, SeoJobTriggerSource, SeoSection, SeoSyncStatus } from "./seo-types";

const MAX_IMPORTED_POSTS = 200;
const MAX_LINKS = 8;
const MAX_SECTION_BULLETS = 8;
const MAX_SECTION_PARAGRAPHS = 6;

type TopicMappingRow = {
  topic_key: string;
  slug: string;
  audience: string | null;
  search_intent: string | null;
};

type FeedPayload = {
  success?: boolean;
  count?: number;
  posts?: FeedPost[];
};

type FeedPost = {
  slug?: string;
  title?: string;
  focusKeyword?: string;
  description?: string;
  heroSummary?: string;
  date?: string;
  author?: string;
  tags?: string[];
  category?: string;
  keywords?: string[];
  schemaType?: string;
  mdx?: string;
  publishedAt?: string;
  updatedAt?: string;
  source?: string;
  syncStatus?: string;
  liveUrl?: string;
};

type ImportedPublishedPost = {
  id: string;
  siteId: string;
  draftId: null;
  topicKey: string | null;
  slug: string;
  title: string;
  description: string;
  heroSummary: string;
  heading: string;
  kicker: string | null;
  focusKeyword: string;
  keywordsJson: string;
  category: string;
  audience: string;
  searchIntent: string;
  intro: string;
  sectionsJson: string;
  faqJson: string;
  internalLinksJson: string;
  ctaTitle: string | null;
  ctaBody: string | null;
  mdx: string;
  author: string;
  tagsJson: string;
  schemaType: string;
  source: SeoDraftSource;
  publishedSource: SeoDraftSource;
  syncStatus: SeoSyncStatus;
  model: null;
  usageJson: null;
  generationNotes: string;
  generatedAt: string;
  publishedAt: string;
  updatedAt: string;
  liveUrl: string;
};

type SyncEventCallback = (eventType: string, message: string, metadata?: Record<string, unknown>) => Promise<void> | void;

type PublishedFeedSyncTarget = {
  siteId: string;
  label: string;
  publicFeedUrl: string;
};

export class PublishedFeedSyncError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PublishedFeedSyncError";
    this.status = status;
  }
}

function normalizeText(value: string | null | undefined) {
  return typeof value === "string" ? value.replace(/\r/g, "").trim() : "";
}

function isValidSlug(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function normalizeSource(value: string | null | undefined): SeoDraftSource {
  return value === "scheduled" ? "scheduled" : "manual";
}

function normalizeSyncStatus(value: string | null | undefined): SeoSyncStatus {
  if (value === "deploy_triggered" || value === "deploy_failed") {
    return value;
  }

  return "pending_deploy";
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function stripFrontmatter(mdx: string) {
  const normalized = mdx.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return normalized.trim();
  }

  const closingIndex = normalized.indexOf("\n---\n", 4);
  if (closingIndex === -1) {
    return normalized.trim();
  }

  return normalized.slice(closingIndex + 5).trim();
}

function extractIntro(body: string) {
  const lines = body.split("\n");
  let started = false;
  const buffer: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (started && buffer.length > 0) {
        break;
      }
      continue;
    }

    if (line.startsWith("# ")) {
      continue;
    }

    if (line.startsWith("## ")) {
      if (started) {
        break;
      }
      continue;
    }

    if (line.startsWith(">") || line.startsWith("- ")) {
      if (started && buffer.length > 0) {
        break;
      }
      continue;
    }

    started = true;
    buffer.push(line);
  }

  return buffer.join(" ").trim();
}

function extractSections(body: string): SeoSection[] {
  const lines = body.split("\n");
  const sections: SeoSection[] = [];
  let current: SeoSection | null = null;
  let inFaq = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line === "## FAQ") {
      inFaq = true;
      current = null;
      continue;
    }

    if (inFaq) {
      continue;
    }

    if (line.startsWith("## ")) {
      if (current) {
        sections.push(current);
      }

      current = {
        heading: line.slice(3).trim(),
        paragraphs: [],
        bullets: []
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith("- ")) {
      if (current.bullets.length < MAX_SECTION_BULLETS) {
        current.bullets.push(line.slice(2).trim());
      }
      continue;
    }

    if (!line.startsWith("#") && !line.startsWith(">") && current.paragraphs.length < MAX_SECTION_PARAGRAPHS) {
      current.paragraphs.push(line);
    }
  }

  if (current) {
    sections.push(current);
  }

  return sections.filter((section) => section.heading && (section.paragraphs.length > 0 || section.bullets.length > 0));
}

function extractFaq(body: string): SeoFaqItem[] {
  const lines = body.split("\n");
  const items: SeoFaqItem[] = [];
  let inFaq = false;
  let currentQuestion = "";
  let currentAnswerParts: string[] = [];

  const flushCurrent = () => {
    if (currentQuestion && currentAnswerParts.length > 0) {
      items.push({
        question: currentQuestion,
        answer: currentAnswerParts.join(" ").trim()
      });
    }
    currentQuestion = "";
    currentAnswerParts = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line === "## FAQ") {
      inFaq = true;
      flushCurrent();
      continue;
    }

    if (!inFaq) {
      continue;
    }

    if (line.startsWith("## ")) {
      flushCurrent();
      break;
    }

    if (line.startsWith("### ")) {
      flushCurrent();
      currentQuestion = line.slice(4).trim();
      continue;
    }

    if (currentQuestion && !line.startsWith("#")) {
      currentAnswerParts.push(line.replace(/^- /, "").trim());
    }
  }

  flushCurrent();
  return items;
}

function extractInternalLinks(body: string): SeoInternalLink[] {
  const links = new Map<string, SeoInternalLink>();
  const matches = body.matchAll(/\[([^\]]+)\]\((\/[^)]+)\)/g);

  for (const match of matches) {
    const label = normalizeText(match[1]);
    const href = normalizeText(match[2]);
    if (!label || !href || links.has(href)) {
      continue;
    }

    links.set(href, { label, href });
    if (links.size >= MAX_LINKS) {
      break;
    }
  }

  return Array.from(links.values());
}

function buildPublishedArticleId(siteId: string, slug: string) {
  return `${siteId}::published::${slug}`;
}

async function fetchPublishedFeed(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "ai-seo-control/1.0"
    }
  });

  if (!response.ok) {
    const message = (await response.text()).trim().slice(0, 200);
    throw new PublishedFeedSyncError(
      message ? `Published feed request failed: ${response.status} ${message}` : `Published feed request failed: ${response.status}`,
      502
    );
  }

  let payload: FeedPayload;
  try {
    payload = (await response.json()) as FeedPayload;
  } catch {
    throw new PublishedFeedSyncError("Published feed did not return valid JSON.", 502);
  }

  if (payload.success !== true || !Array.isArray(payload.posts)) {
    throw new PublishedFeedSyncError("Published feed returned an invalid payload shape.", 502);
  }

  return payload.posts.slice(0, MAX_IMPORTED_POSTS);
}

async function emitSyncEvent(
  callback: SyncEventCallback | undefined,
  eventType: string,
  message: string,
  metadata: Record<string, unknown> = {}
) {
  if (!callback) {
    return;
  }

  await callback(eventType, message, metadata);
}

function isValidDateString(value: string) {
  return !Number.isNaN(Date.parse(value));
}

async function readTopicMappings(env: Cloudflare.Env, siteId: string) {
  if (!env.DB) {
    return new Map<string, TopicMappingRow>();
  }

  const result = await env.DB.prepare(
    `
    SELECT topic_key, slug, audience, search_intent
    FROM managed_site_seo_topics
    WHERE site_id = ?1
    `
  )
    .bind(siteId)
    .all<TopicMappingRow>();

  return new Map((result.results ?? []).map((row) => [row.slug, row]));
}

function mapFeedPostToImportedArticle(
  siteId: string,
  siteUrl: string,
  feedUrl: string,
  post: FeedPost,
  topicMappings: Map<string, TopicMappingRow>,
  syncedAt: string
): ImportedPublishedPost | null {
  const slug = normalizeText(post.slug);
  const title = normalizeText(post.title);
  const description = normalizeText(post.description);
  const mdx = normalizeText(post.mdx);

  if (!slug || !title || !description || !mdx || !isValidSlug(slug)) {
    return null;
  }

  const topic = topicMappings.get(slug) ?? null;
  const body = stripFrontmatter(mdx);
  const intro = extractIntro(body);
  const sections = extractSections(body);
  const faq = extractFaq(body);
  const internalLinks = extractInternalLinks(body);
  const publishedAt = isValidDateString(normalizeText(post.publishedAt)) ? normalizeText(post.publishedAt) : syncedAt;
  const updatedAt = isValidDateString(normalizeText(post.updatedAt)) ? normalizeText(post.updatedAt) : publishedAt;
  const source = normalizeSource(post.source);

  return {
    id: buildPublishedArticleId(siteId, slug),
    siteId,
    draftId: null,
    topicKey: topic?.topic_key ?? null,
    slug,
    title,
    description,
    heroSummary: normalizeText(post.heroSummary),
    heading: title,
    kicker: null,
    focusKeyword: normalizeText(post.focusKeyword),
    keywordsJson: JSON.stringify(normalizeStringArray(post.keywords)),
    category: normalizeText(post.category),
    audience: normalizeText(topic?.audience),
    searchIntent: normalizeText(topic?.search_intent),
    intro,
    sectionsJson: JSON.stringify(sections),
    faqJson: JSON.stringify(faq),
    internalLinksJson: JSON.stringify(internalLinks),
    ctaTitle: null,
    ctaBody: null,
    mdx,
    author: normalizeText(post.author) || "AI SEO Control",
    tagsJson: JSON.stringify(normalizeStringArray(post.tags)),
    schemaType: normalizeText(post.schemaType) || "Article",
    source,
    publishedSource: source,
    syncStatus: normalizeSyncStatus(post.syncStatus),
    model: null,
    usageJson: null,
    generationNotes: `Synced from published feed ${feedUrl} at ${syncedAt}.`,
    generatedAt: updatedAt,
    publishedAt,
    updatedAt,
    liveUrl: normalizeText(post.liveUrl) || `${siteUrl.replace(/\/$/, "")}/blog/${slug}`
  };
}

async function deleteMissingPublishedArticles(db: D1Database, siteId: string, keepSlugs: string[]) {
  const existing = await db
    .prepare(
      `
      SELECT slug
      FROM managed_site_seo_published_articles
      WHERE site_id = ?1
      `
    )
    .bind(siteId)
    .all<{ slug: string }>();

  const keep = new Set(keepSlugs);
  const staleSlugs = (existing.results ?? []).map((row) => row.slug).filter((slug) => !keep.has(slug));
  if (staleSlugs.length === 0) {
    return 0;
  }

  await db.batch(
    staleSlugs.map((slug) =>
      db
        .prepare(
          `
          DELETE FROM managed_site_seo_published_articles
          WHERE site_id = ?1 AND slug = ?2
          `
        )
        .bind(siteId, slug)
    )
  );

  return staleSlugs.length;
}

async function upsertPublishedArticles(db: D1Database, items: ImportedPublishedPost[]) {
  if (items.length === 0) {
    return 0;
  }

  await db.batch(
    items.map((item) =>
      db
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
          item.id,
          item.siteId,
          item.draftId,
          item.topicKey,
          item.slug,
          item.title,
          item.description,
          item.heroSummary,
          item.heading,
          item.kicker,
          item.focusKeyword,
          item.keywordsJson,
          item.category,
          item.audience,
          item.searchIntent,
          item.intro,
          item.sectionsJson,
          item.faqJson,
          item.internalLinksJson,
          item.ctaTitle,
          item.ctaBody,
          item.mdx,
          item.author,
          item.tagsJson,
          item.schemaType,
          item.source,
          item.publishedSource,
          item.syncStatus,
          item.model,
          item.usageJson,
          item.generationNotes,
          item.generatedAt,
          item.publishedAt,
          item.updatedAt,
          item.liveUrl
        )
    )
  );

  return items.length;
}

export async function listPublishedFeedSyncTargets(
  env: Cloudflare.Env,
  options: { scheduledTime?: Date | number | string | null } = {}
) {
  if (!env.DB) {
    return [] satisfies PublishedFeedSyncTarget[];
  }

  const result = await env.DB
    .prepare(
      `
      SELECT ms.id AS site_id, ms.label, b.public_feed_url, s.schedule_cron_utc
      FROM managed_sites ms
      INNER JOIN managed_site_build_sync_configs b
        ON b.site_id = ms.id
      LEFT JOIN managed_site_seo_settings s
        ON s.site_id = ms.id
      WHERE ms.is_active = 1
        AND ms.publish_mode = 'api_feed_build_sync'
        AND COALESCE(s.automation_enabled, 1) = 1
      ORDER BY ms.migration_priority ASC, ms.updated_at DESC
      `
    )
    .all<{ site_id: string; label: string; public_feed_url: string; schedule_cron_utc: string | null }>();

  const scheduledTime = options.scheduledTime ? new Date(options.scheduledTime) : null;

  return (result.results ?? [])
    .filter((row) => !scheduledTime || matchesScheduledTick(row.schedule_cron_utc, scheduledTime))
    .map((row) => ({
      siteId: row.site_id,
      label: row.label,
      publicFeedUrl: row.public_feed_url
    }));
}

export async function syncPublishedFeedSnapshot(
  env: Cloudflare.Env,
  siteId: string,
  options: {
    onEvent?: SyncEventCallback;
  } = {}
) {
  if (!env.DB) {
    throw new PublishedFeedSyncError("D1 binding is not configured yet.", 503);
  }

  const site = await readManagedSiteRecord(env, siteId);
  if (!site) {
    throw new PublishedFeedSyncError(`Unknown site: ${siteId}`, 404);
  }

  if (site.publishMode !== "api_feed_build_sync") {
    throw new PublishedFeedSyncError(`Site ${siteId} does not use api_feed_build_sync publishing.`, 400);
  }

  const buildSync = await readBuildSyncConfig(env, siteId);
  if (!buildSync) {
    throw new PublishedFeedSyncError(`Site ${siteId} does not have a build sync config yet.`, 400);
  }

  await emitSyncEvent(options.onEvent, "feed_fetch_started", `Fetching published feed for ${siteId}.`, {
    feedUrl: buildSync.publicFeedUrl
  });
  const rawPosts = await fetchPublishedFeed(buildSync.publicFeedUrl);
  await emitSyncEvent(options.onEvent, "feed_fetch_completed", `Fetched ${rawPosts.length} posts from the public feed.`, {
    feedUrl: buildSync.publicFeedUrl,
    fetchedCount: rawPosts.length
  });
  const topicMappings = await readTopicMappings(env, siteId);
  const syncedAt = new Date().toISOString();
  const importedPosts = rawPosts
    .map((post) => mapFeedPostToImportedArticle(siteId, site.canonicalUrl, buildSync.publicFeedUrl, post, topicMappings, syncedAt))
    .filter((item): item is ImportedPublishedPost => Boolean(item));
  await emitSyncEvent(options.onEvent, "feed_import_prepared", `Prepared ${importedPosts.length} published posts for snapshot sync.`, {
    fetchedCount: rawPosts.length,
    importedCount: importedPosts.length
  });

  const upsertedCount = await upsertPublishedArticles(env.DB, importedPosts);
  const deletedCount = await deleteMissingPublishedArticles(
    env.DB,
    siteId,
    importedPosts.map((item) => item.slug)
  );

  await emitSyncEvent(options.onEvent, "feed_sync_completed", `Synced published snapshot for ${siteId}.`, {
    feedUrl: buildSync.publicFeedUrl,
    importedCount: importedPosts.length,
    upsertedCount,
    deletedCount
  });

  return {
    siteId,
    feedUrl: buildSync.publicFeedUrl,
    fetchedCount: rawPosts.length,
    importedCount: importedPosts.length,
    upsertedCount,
    deletedCount,
    syncedAt
  };
}

export async function runPublishedFeedSyncJob(
  env: Cloudflare.Env,
  siteId: string,
  options: {
    triggerSource?: SeoJobTriggerSource;
    payload?: Record<string, unknown>;
  } = {}
) {
  const triggerSource = options.triggerSource ?? "manual_api";

  return runSeoJob(
    env,
    {
      siteId,
      jobType: "published_feed_sync",
      triggerSource,
      payload: {
        siteId,
        ...(options.payload ?? {})
      }
    },
    async (reporter) => syncPublishedFeedSnapshot(env, siteId, { onEvent: reporter.event })
  );
}
