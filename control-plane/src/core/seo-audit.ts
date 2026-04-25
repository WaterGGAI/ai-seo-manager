import { runSeoJob } from "./seo-jobs";
import { readManagedSiteSeoState } from "./seo-state";
import { matchesScheduledTick } from "./cron-schedule";
import type {
  ManagedSiteSeoState,
  SeoAuditIssue,
  SeoAuditRun,
  SeoAuditRunSource,
  SeoAuditSummary,
  SeoAuditTargetResult,
  SeoJobTriggerSource,
  SeoTargetVisibility
} from "./seo-types";

const AUDIT_USER_AGENT = "ai-seo-control-audit/1.0";
const MAX_AUDIT_TARGETS = 40;
const MAX_AUDIT_ISSUES = 80;
const MAX_AUDIT_BODY_BYTES = 1_500_000;

type AuditTargetKind = "page" | "robots" | "sitemap" | "json";

type AuditTarget = {
  path: string;
  kind: AuditTargetKind;
  visibility: SeoTargetVisibility;
  expectedNoindex: boolean;
};

type ManagedSiteMetadataRow = {
  canonical_url: string;
  metadata_json: string | null;
};

type ScheduledAuditTarget = {
  siteId: string;
  label: string;
  scheduleCronUtc: string | null;
};

type AuditEventCallback = (eventType: string, message: string, metadata?: Record<string, unknown>) => Promise<void> | void;

type RenderedPageMetrics = {
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  ogImage: string | null;
  jsonLdCount: number;
  h1Count: number;
  h2Count: number;
  faqItemCount: number;
  guideCardCount: number;
  faqSchemaCount: number;
  howToSchemaCount: number;
  textLength: number;
};

export class SeoAuditError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "SeoAuditError";
    this.status = status;
  }
}

function parseObject(value: string | null) {
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

function normalizePath(path: string | null | undefined) {
  if (!path || typeof path !== "string") {
    return null;
  }

  const trimmed = path.trim();
  if (!trimmed || !trimmed.startsWith("/")) {
    return null;
  }

  const normalized = trimmed.replace(/\/{2,}/g, "/");
  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.slice(0, -1);
  }

  return normalized;
}

function shouldKeepStaticPath(path: string) {
  return !path.includes("[") && !path.includes("{");
}

function isContentPath(path: string) {
  return path.startsWith("/blog/") || path.startsWith("/calculator/") || path.startsWith("/articles/");
}

function normalizeUrlForCompare(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const pathname = url.pathname.length > 1 && url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
    return `${url.origin}${pathname}${url.search}`;
  } catch {
    return null;
  }
}

function countMatches(body: string, pattern: RegExp) {
  return body.match(pattern)?.length ?? 0;
}

function extractTitle(body: string) {
  const match = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.replace(/\s+/g, " ").trim() || null;
}

function extractMetaContent(body: string, name: string) {
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${escapeRegex(name)}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escapeRegex(name)}["']`, "i"),
    new RegExp(`<meta[^>]+property=["']${escapeRegex(name)}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escapeRegex(name)}["']`, "i")
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    const value = match?.[1]?.replace(/\s+/g, " ").trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function extractCanonical(body: string) {
  const match = body.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  return match?.[1]?.trim() || null;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(body: string) {
  return decodeHtmlEntities(body.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function collectRenderedPageMetrics(body: string): RenderedPageMetrics {
  const text = stripHtml(body);

  return {
    title: extractTitle(body),
    metaDescription: extractMetaContent(body, "description"),
    canonical: extractCanonical(body),
    ogImage: extractMetaContent(body, "og:image"),
    jsonLdCount: countMatches(body, /<script[^>]+application\/ld\+json/gi),
    h1Count: countMatches(body, /<h1\b/gi),
    h2Count: countMatches(body, /<h2\b/gi),
    faqItemCount: countMatches(body, /<details\b/gi) + countMatches(body, /data-faq-item/gi),
    guideCardCount: countMatches(body, /guide-card/gi),
    faqSchemaCount: countMatches(body, /"@type"\s*:\s*"FAQPage"/gi) + countMatches(body, /"@type"\s*:\s*"Question"/gi),
    howToSchemaCount: countMatches(body, /"@type"\s*:\s*"HowTo"/gi),
    textLength: text.length
  };
}

function emptyRenderedPageMetrics(): RenderedPageMetrics {
  return {
    title: null,
    metaDescription: null,
    canonical: null,
    ogImage: null,
    jsonLdCount: 0,
    h1Count: 0,
    h2Count: 0,
    faqItemCount: 0,
    guideCardCount: 0,
    faqSchemaCount: 0,
    howToSchemaCount: 0,
    textLength: 0
  };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readManagedSiteMetadata(env: Cloudflare.Env, siteId: string) {
  if (!env.DB) {
    return {
      canonicalUrl: null,
      metadata: {}
    };
  }

  const row = await env.DB
    .prepare("SELECT canonical_url, metadata_json FROM managed_sites WHERE id = ?1 LIMIT 1")
    .bind(siteId)
    .first<ManagedSiteMetadataRow>();

  return {
    canonicalUrl: row?.canonical_url ?? null,
    metadata: parseObject(row?.metadata_json ?? null)
  };
}

function extractPathsFromConnectorMetadata(metadata: Record<string, unknown>) {
  const connectorBootstrap = metadata.connectorBootstrap;
  if (!connectorBootstrap || typeof connectorBootstrap !== "object" || Array.isArray(connectorBootstrap)) {
    return [];
  }

  const candidateArrays = [
    (connectorBootstrap as Record<string, unknown>).staticIndexablePaths,
    (connectorBootstrap as Record<string, unknown>).publicRoutes
  ];

  return candidateArrays
    .flatMap((value) => (Array.isArray(value) ? value : []))
    .filter((item): item is string => typeof item === "string")
    .map((item) => normalizePath(item))
    .filter((item): item is string => typeof item === "string" && shouldKeepStaticPath(item));
}

function extractAdminRoute(
  state: ManagedSiteSeoState,
  managedSiteMetadata: Record<string, unknown>
) {
  const settingsRoute = normalizePath(typeof state.settings.metadata.adminRoute === "string" ? state.settings.metadata.adminRoute : null);
  if (settingsRoute) {
    return settingsRoute;
  }

  const connectorBootstrap = managedSiteMetadata.connectorBootstrap;
  if (!connectorBootstrap || typeof connectorBootstrap !== "object" || Array.isArray(connectorBootstrap)) {
    return null;
  }

  const adminRoute = (connectorBootstrap as Record<string, unknown>).adminRoute;
  return normalizePath(typeof adminRoute === "string" ? adminRoute : null);
}

function buildAuditTargets(
  state: ManagedSiteSeoState,
  managedSiteMetadata: Record<string, unknown>
) {
  const targets = new Map<string, AuditTarget>();

  const addTarget = (target: AuditTarget) => {
    const normalizedPath = normalizePath(target.path);
    if (!normalizedPath) {
      return;
    }

    if (!targets.has(normalizedPath)) {
      targets.set(normalizedPath, {
        ...target,
        path: normalizedPath
      });
    }
  };

  addTarget({ path: "/", kind: "page", visibility: "public", expectedNoindex: false });
  addTarget({ path: "/robots.txt", kind: "robots", visibility: "technical", expectedNoindex: false });
  addTarget({ path: "/sitemap.xml", kind: "sitemap", visibility: "technical", expectedNoindex: false });

  for (const path of extractPathsFromConnectorMetadata(managedSiteMetadata)) {
    if (path === "/robots.txt" || path === "/sitemap.xml") {
      continue;
    }

    addTarget({ path, kind: "page", visibility: "public", expectedNoindex: false });
  }

  for (const article of state.published) {
    let path = normalizePath(article.liveUrl);
    if (!path && article.liveUrl) {
      try {
        const articleUrl = new URL(article.liveUrl);
        path = normalizePath(articleUrl.pathname);
      } catch {
        path = null;
      }
    }

    if (!path && article.slug) {
      path = normalizePath(`/blog/${article.slug}`);
    }

    if (path) {
      addTarget({ path, kind: "page", visibility: "public", expectedNoindex: false });
    }
  }

  for (const override of state.structuredOverrides) {
    if (override.routePath) {
      addTarget({ path: override.routePath, kind: "page", visibility: "public", expectedNoindex: false });
    }
  }

  const adminRoute = extractAdminRoute(state, managedSiteMetadata);
  if (adminRoute) {
    addTarget({ path: adminRoute, kind: "page", visibility: "protected", expectedNoindex: true });
  }

  return Array.from(targets.values()).slice(0, MAX_AUDIT_TARGETS);
}

function hasNoindex(xRobotsTag: string | null) {
  return /noindex/i.test(xRobotsTag ?? "");
}

function buildRobotsChecks(body: string, statusCode: number) {
  return [
    {
      key: "status",
      label: "HTTP status",
      status: statusCode >= 200 && statusCode < 300 ? "pass" : "fail",
      detail: `HTTP ${statusCode}`
    },
    {
      key: "robots-body",
      label: "robots.txt content",
      status: body.trim().length > 0 ? "pass" : "fail",
      detail: body.trim().length > 0 ? "robots.txt returned content." : "robots.txt body was empty."
    },
    {
      key: "robots-sitemap",
      label: "Sitemap hint",
      status: /sitemap:/i.test(body) ? "pass" : "warn",
      detail: /sitemap:/i.test(body) ? "robots.txt declares a sitemap." : "robots.txt does not mention a sitemap."
    }
  ] as const;
}

function buildSitemapChecks(body: string, statusCode: number) {
  return [
    {
      key: "status",
      label: "HTTP status",
      status: statusCode >= 200 && statusCode < 300 ? "pass" : "fail",
      detail: `HTTP ${statusCode}`
    },
    {
      key: "sitemap-shape",
      label: "Sitemap XML",
      status: /<(urlset|sitemapindex)\b/i.test(body) ? "pass" : "fail",
      detail: /<(urlset|sitemapindex)\b/i.test(body) ? "Sitemap XML structure detected." : "Could not find a sitemap XML root node."
    }
  ] as const;
}

function buildJsonChecks(statusCode: number, xRobotsTag: string | null, expectedNoindex: boolean) {
  return [
    {
      key: "status",
      label: "HTTP status",
      status: statusCode >= 200 && statusCode < 300 ? "pass" : "fail",
      detail: `HTTP ${statusCode}`
    },
    {
      key: "noindex",
      label: "Noindex header",
      status: !expectedNoindex || hasNoindex(xRobotsTag) ? "pass" : "warn",
      detail: !expectedNoindex || hasNoindex(xRobotsTag) ? "Noindex expectation satisfied." : "Expected a noindex header on this JSON target."
    }
  ] as const;
}

function buildPageChecks(
  url: string,
  target: AuditTarget,
  statusCode: number,
  xRobotsTag: string | null,
  metrics: RenderedPageMetrics
) {
  const checks: Array<{
    key: string;
    label: string;
    status: "pass" | "warn" | "fail";
    detail: string;
  }> = [
    {
      key: "status",
      label: "HTTP status",
      status: statusCode >= 200 && statusCode < 300 ? "pass" : "fail",
      detail: `HTTP ${statusCode}`
    },
    {
      key: "title",
      label: "Title tag",
      status: metrics.title ? "pass" : "fail",
      detail: metrics.title ? "Title tag found." : "Missing <title> tag."
    },
    {
      key: "description",
      label: "Meta description",
      status: metrics.metaDescription ? "pass" : "warn",
      detail: metrics.metaDescription ? "Meta description found." : "Missing meta description."
    },
    {
      key: "h1",
      label: "H1 coverage",
      status: metrics.h1Count === 1 ? "pass" : metrics.h1Count === 0 ? "fail" : "warn",
      detail: metrics.h1Count === 1 ? "Exactly one H1 tag found." : `Expected 1 H1 tag, found ${metrics.h1Count}.`
    }
  ];

  if (target.expectedNoindex) {
    checks.push({
      key: "noindex",
      label: "Protected page noindex",
      status: hasNoindex(xRobotsTag) ? "pass" : "fail",
      detail: hasNoindex(xRobotsTag) ? "Protected page returns noindex." : "Protected page is missing an X-Robots-Tag noindex header."
    });
    return checks;
  }

  checks.push(
    {
      key: "canonical",
      label: "Canonical tag",
      status: metrics.canonical ? "pass" : "warn",
      detail: metrics.canonical ? "Canonical tag found." : "Missing canonical tag."
    },
    {
      key: "canonical-match",
      label: "Self canonical",
      status:
        !metrics.canonical
          ? "warn"
          : normalizeUrlForCompare(metrics.canonical) === normalizeUrlForCompare(url)
            ? "pass"
            : "warn",
      detail:
        !metrics.canonical
          ? "Cannot verify canonical URL because the canonical tag is missing."
          : normalizeUrlForCompare(metrics.canonical) === normalizeUrlForCompare(url)
            ? "Canonical URL matches the audited URL."
            : `Canonical URL points to ${metrics.canonical}.`
    },
    {
      key: "jsonld",
      label: "Structured data",
      status: metrics.jsonLdCount > 0 ? "pass" : "warn",
      detail: metrics.jsonLdCount > 0 ? `Found ${metrics.jsonLdCount} JSON-LD block(s).` : "No JSON-LD blocks detected."
    }
  );

  if (isContentPath(target.path)) {
    checks.push(
      {
        key: "thin-content",
        label: "Content depth",
        status: metrics.textLength >= 600 && metrics.h2Count >= 1 ? "pass" : "warn",
        detail:
          metrics.textLength >= 600 && metrics.h2Count >= 1
            ? "Content length and heading depth look healthy."
            : `Content may be thin: textLength=${metrics.textLength}, h2Count=${metrics.h2Count}.`
      },
      {
        key: "faq-schema",
        label: "FAQ coverage",
        status: metrics.faqSchemaCount > 0 || metrics.faqItemCount > 0 ? "pass" : "warn",
        detail:
          metrics.faqSchemaCount > 0 || metrics.faqItemCount > 0
            ? `FAQ signals detected (items=${metrics.faqItemCount}, schema=${metrics.faqSchemaCount}).`
            : "No FAQ items or FAQ schema detected on this content page."
      }
    );
  }

  return checks;
}

function summarizeAuditTargets(targets: SeoAuditTargetResult[]): SeoAuditSummary {
  const totalTargets = targets.length;
  const okTargets = targets.filter((item) => item.failCount === 0 && item.warnCount === 0).length;
  const warningTargets = targets.filter((item) => item.failCount === 0 && item.warnCount > 0).length;
  const failingTargets = targets.filter((item) => item.failCount > 0).length;
  const publicTargets = targets.filter((item) => item.visibility === "public").length;
  const protectedTargets = targets.filter((item) => item.visibility === "protected").length;
  const avgResponseTimeMs =
    totalTargets === 0
      ? 0
      : Math.round(targets.reduce((sum, item) => sum + item.responseTimeMs, 0) / totalTargets);

  return {
    totalTargets,
    okTargets,
    warningTargets,
    failingTargets,
    publicTargets,
    protectedTargets,
    avgResponseTimeMs,
    missingCanonicalCount: targets.filter((item) => item.visibility === "public" && item.kind === "page" && !item.canonical).length,
    missingDescriptionCount: targets.filter((item) => item.visibility === "public" && item.kind === "page" && !item.metaDescription).length,
    missingJsonLdCount: targets.filter((item) => item.visibility === "public" && item.kind === "page" && item.jsonLdCount === 0).length,
    missingNoindexCount: targets.filter((item) => item.expectedNoindex && !hasNoindex(item.xRobotsTag)).length,
    h1IssueCount: targets.filter((item) => item.checks.some((check) => check.key === "h1" && check.status !== "pass")).length,
    missingFaqCount: targets.filter((item) => item.checks.some((check) => check.key === "faq-schema" && check.status !== "pass")).length,
    missingHowToCount: targets.filter((item) => item.howToSchemaCount === 0 && item.path.startsWith("/guides/")).length,
    thinContentCount: targets.filter((item) => item.checks.some((check) => check.key === "thin-content" && check.status !== "pass")).length,
    contentDriftCount: targets.filter((item) => item.checks.some((check) => check.key === "canonical-match" && check.status !== "pass")).length
  };
}

function buildAuditIssues(targets: SeoAuditTargetResult[]) {
  const issues: SeoAuditIssue[] = [];

  for (const target of targets) {
    for (const check of target.checks) {
      if (check.status === "pass") {
        continue;
      }

      issues.push({
        severity: check.status === "fail" ? "fail" : "warn",
        label: check.label,
        path: target.path,
        message: check.detail
      });

      if (issues.length >= MAX_AUDIT_ISSUES) {
        return issues;
      }
    }
  }

  return issues;
}

async function readResponseBody(response: Response) {
  const contentLengthHeader = response.headers.get("content-length");
  const declaredLength = Number.parseInt(contentLengthHeader ?? "", 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_AUDIT_BODY_BYTES) {
    throw new SeoAuditError(`Audit target exceeded ${MAX_AUDIT_BODY_BYTES} bytes and was skipped.`, 502);
  }

  return response.text();
}

async function runAuditTarget(baseUrl: string, target: AuditTarget): Promise<SeoAuditTargetResult> {
  const url = `${baseUrl}${target.path}`;
  const startedAt = Date.now();
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "user-agent": AUDIT_USER_AGENT
    }
  });

  const responseTimeMs = Date.now() - startedAt;
  const contentType = response.headers.get("content-type");
  const xRobotsTag = response.headers.get("x-robots-tag");
  const body = await readResponseBody(response);
  const metrics = target.kind === "page" ? collectRenderedPageMetrics(body) : emptyRenderedPageMetrics();

  const baseChecks =
    target.kind === "robots"
      ? buildRobotsChecks(body, response.status)
      : target.kind === "sitemap"
        ? buildSitemapChecks(body, response.status)
        : target.kind === "json"
          ? buildJsonChecks(response.status, xRobotsTag, target.expectedNoindex)
          : buildPageChecks(url, target, response.status, xRobotsTag, metrics);
  const checks = [...baseChecks];

  const passCount = checks.filter((check) => check.status === "pass").length;
  const warnCount = checks.filter((check) => check.status === "warn").length;
  const failCount = checks.filter((check) => check.status === "fail").length;

  return {
    path: target.path,
    url,
    kind: target.kind,
    visibility: target.visibility,
    statusCode: response.status,
    ok: response.ok,
    expectedNoindex: target.expectedNoindex,
    responseTimeMs,
    contentType,
    title: metrics.title,
    metaDescription: metrics.metaDescription,
    canonical: metrics.canonical,
    ogImage: metrics.ogImage,
    jsonLdCount: metrics.jsonLdCount,
    h1Count: metrics.h1Count,
    h2Count: metrics.h2Count,
    faqItemCount: metrics.faqItemCount,
    guideCardCount: metrics.guideCardCount,
    faqSchemaCount: metrics.faqSchemaCount,
    howToSchemaCount: metrics.howToSchemaCount,
    xRobotsTag,
    passCount,
    warnCount,
    failCount,
    checks
  };
}

async function emitAuditEvent(
  callback: AuditEventCallback | undefined,
  eventType: string,
  message: string,
  metadata: Record<string, unknown> = {}
) {
  if (!callback) {
    return;
  }

  await callback(eventType, message, metadata);
}

async function storeAuditRun(
  env: Cloudflare.Env,
  siteId: string,
  report: {
    source: SeoAuditRunSource;
    baseUrl: string;
    scheduleLabel: string;
    summary: SeoAuditSummary;
    targets: SeoAuditTargetResult[];
    issues: SeoAuditIssue[];
  }
) {
  if (!env.DB) {
    throw new SeoAuditError("D1 binding is not configured yet.", 503);
  }

  const runId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await env.DB.batch([
    env.DB
      .prepare(
        `
        INSERT INTO managed_site_seo_audit_runs (
          id,
          site_id,
          source,
          base_url,
          schedule_label,
          summary_json,
          targets_json,
          issues_json,
          created_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        `
      )
      .bind(
        runId,
        siteId,
        report.source,
        report.baseUrl,
        report.scheduleLabel,
        JSON.stringify(report.summary),
        JSON.stringify(report.targets),
        JSON.stringify(report.issues),
        createdAt
      ),
    env.DB
      .prepare(
        `
        UPDATE managed_site_seo_settings
        SET last_audit_at = ?2,
            last_error = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE site_id = ?1
        `
      )
      .bind(siteId, createdAt)
  ]);

  const storedRun: SeoAuditRun = {
    id: runId,
    source: report.source,
    baseUrl: report.baseUrl,
    scheduleLabel: report.scheduleLabel,
    summary: report.summary,
    targets: report.targets,
    issues: report.issues,
    createdAt
  };

  return storedRun;
}

async function updateAuditFailure(env: Cloudflare.Env, siteId: string, message: string) {
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

export async function listScheduledAuditTargets(
  env: Cloudflare.Env,
  options: { scheduledTime?: Date | number | string | null } = {}
) {
  if (!env.DB) {
    return [] satisfies ScheduledAuditTarget[];
  }

  const result = await env.DB
    .prepare(
      `
      SELECT ms.id AS site_id, ms.label, s.schedule_cron_utc
      FROM managed_sites ms
      INNER JOIN managed_site_seo_settings s
        ON s.site_id = ms.id
      WHERE ms.is_active = 1
        AND s.automation_enabled = 1
        AND s.daily_audit_enabled = 1
      ORDER BY ms.migration_priority ASC, ms.updated_at DESC
      `
    )
    .all<{ site_id: string; label: string; schedule_cron_utc: string | null }>();

  const scheduledTime = options.scheduledTime ? new Date(options.scheduledTime) : null;
  return (result.results ?? [])
    .filter((row) => !scheduledTime || matchesScheduledTick(row.schedule_cron_utc, scheduledTime))
    .map((row) => ({
      siteId: row.site_id,
      label: row.label,
      scheduleCronUtc: row.schedule_cron_utc
    }));
}

export async function runManagedSiteSeoAudit(
  env: Cloudflare.Env,
  siteId: string,
  options: {
    source?: SeoAuditRunSource;
    onEvent?: AuditEventCallback;
  } = {}
) {
  const state = await readManagedSiteSeoState(env, siteId);
  if (!state) {
    throw new SeoAuditError(`Unknown site: ${siteId}`, 404);
  }

  const managedSiteMetadata = await readManagedSiteMetadata(env, siteId);
  const baseUrl = (state.settings.siteUrl || managedSiteMetadata.canonicalUrl || state.site.canonicalUrl).replace(/\/$/, "");
  const scheduleLabel =
    (state.settings.metadata.automation &&
    typeof state.settings.metadata.automation === "object" &&
    !Array.isArray(state.settings.metadata.automation) &&
    typeof (state.settings.metadata.automation as Record<string, unknown>).scheduleLabel === "string"
      ? ((state.settings.metadata.automation as Record<string, unknown>).scheduleLabel as string)
      : null) ??
    (env.SCHEDULE_LABEL ?? "依各站排程自動執行");

  const targets = buildAuditTargets(state, managedSiteMetadata.metadata);
  await emitAuditEvent(options.onEvent, "audit_targets_prepared", `Prepared ${targets.length} audit targets for ${siteId}.`, {
    targetCount: targets.length,
    baseUrl
  });

  const results = await Promise.all(targets.map((target) => runAuditTarget(baseUrl, target)));
  const sortedTargets = results.sort((left, right) => {
    if (right.failCount !== left.failCount) {
      return right.failCount - left.failCount;
    }
    if (right.warnCount !== left.warnCount) {
      return right.warnCount - left.warnCount;
    }
    return left.path.localeCompare(right.path);
  });
  const issues = buildAuditIssues(sortedTargets);
  const summary = summarizeAuditTargets(sortedTargets);

  await emitAuditEvent(options.onEvent, "audit_results_ready", `Computed audit results for ${siteId}.`, {
    totalTargets: summary.totalTargets,
    failingTargets: summary.failingTargets,
    warningTargets: summary.warningTargets
  });

  const storedRun = await storeAuditRun(env, siteId, {
    source: options.source ?? "manual",
    baseUrl,
    scheduleLabel,
    summary,
    targets: sortedTargets,
    issues
  });

  await emitAuditEvent(options.onEvent, "audit_run_stored", `Stored audit run for ${siteId}.`, {
    auditRunId: storedRun.id,
    totalTargets: summary.totalTargets,
    failingTargets: summary.failingTargets
  });

  return storedRun;
}

export async function runManagedSiteSeoAuditJob(
  env: Cloudflare.Env,
  siteId: string,
  options: {
    triggerSource?: SeoJobTriggerSource;
    source?: SeoAuditRunSource;
    payload?: Record<string, unknown>;
  } = {}
) {
  const triggerSource = options.triggerSource ?? "manual_api";

  try {
    return await runSeoJob(
      env,
      {
        siteId,
        jobType: "technical_audit",
        triggerSource,
        payload: {
          siteId,
          ...(options.payload ?? {})
        }
      },
      async (reporter) =>
        runManagedSiteSeoAudit(env, siteId, {
          source: options.source ?? (triggerSource === "scheduled_cron" ? "scheduled" : "manual"),
          onEvent: reporter.event
        })
    );
  } catch (error) {
    await updateAuditFailure(env, siteId, error instanceof Error ? error.message : String(error));
    throw error;
  }
}
