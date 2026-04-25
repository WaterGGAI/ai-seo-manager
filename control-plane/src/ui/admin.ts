import {
  getMainlineSource,
  listConnectorDefinitions,
  listSupportedPublishModes
} from "../connectors/registry";
import { listManagedSitesForRequest } from "../core/managed-sites";
import { seoModelOptions } from "../core/seo-models";
import { readManagedSiteSeoState } from "../core/seo-state";
import { listWorkflowModules, listWorkflowModulesBySourceSite } from "../core/workflow-modules";
import type { ManagedSiteSeoState, SeoJob, SeoPublishedArticle, SeoTopic } from "../core/seo-types";
import { getDatabaseHealth } from "../lib/db";
import { html, notFound } from "../lib/http";

type ManagedSiteItem = Awaited<ReturnType<typeof listManagedSitesForRequest>>[number];

type LoadedSite = {
  site: ManagedSiteItem;
  state: ManagedSiteSeoState | null;
};

type AdminContext = {
  appName: string;
  environment: string;
  database: Awaited<ReturnType<typeof getDatabaseHealth>>;
  mainlineSource: ReturnType<typeof getMainlineSource>;
  publishModes: ReturnType<typeof listSupportedPublishModes>;
  connectors: ReturnType<typeof listConnectorDefinitions>;
  workflowModules: ReturnType<typeof listWorkflowModules>;
  models: typeof seoModelOptions;
  sites: LoadedSite[];
  readiness: {
    hasBasicAuthConfigured: boolean;
    hasGscCredentials: boolean;
    managedSiteCount: number;
    automationEnabledCount: number;
    rankingEnabledCount: number;
    rankingReadyCount: number;
    buildSyncSiteCount: number;
    buildSyncConfiguredCount: number;
    workflowModuleSourceCount: number;
    runtimeManagedSiteCount: number;
    promptTemplatesEditable: boolean;
  };
};

type AdminNavItem = {
  key: string;
  label: string;
  href: string;
};

type SiteJobRow = {
  site: ManagedSiteItem;
  job: SeoJob;
};

type SiteContentRow = {
  site: ManagedSiteItem;
  item: SeoPublishedArticle;
};

type SiteKeywordRow = {
  site: ManagedSiteItem;
  item: SeoTopic;
};

const NAV_ITEMS: AdminNavItem[] = [
  { key: "dashboard", label: "總覽", href: "/" },
  { key: "sites", label: "網站", href: "/sites" },
  { key: "readiness", label: "完成度", href: "/readiness" },
  { key: "keywords", label: "關鍵字", href: "/keywords" },
  { key: "templates", label: "模板", href: "/templates" },
  { key: "jobs", label: "任務", href: "/jobs" },
  { key: "contents", label: "內容", href: "/contents" },
  { key: "logs", label: "紀錄", href: "/logs" },
  { key: "schedules", label: "排程", href: "/schedules" },
  { key: "settings", label: "設定", href: "/settings" }
];

const UI_APP_NAME = "AI SEO 中控台";

export const controlPlaneCapabilities = {
  deployTarget: "cloudflare-workers",
  supportsManagedSites: true,
  supportsConnectorModel: true,
  supportsCronAutomation: true,
  supportsWorkersAI: true,
  supportsD1: true,
  supportsPerSiteSeoState: true,
  supportsSeoSettingsWrites: true,
  supportsStructuredOverrides: true,
  supportsStructuredOverrideWrites: true,
  supportsStructuredOverrideDelete: true,
  supportsBuildSyncConfig: true,
  supportsBuildSyncConfigWrites: true,
  supportsBuildSyncDeployTrigger: true,
  supportsScheduledBuildSyncDeploy: true,
  supportsPublishedFeedSnapshotSync: true,
  supportsContentGeneration: true,
  supportsScheduledContentGeneration: true,
  supportsSeoJobs: true,
  supportsScheduledPublishedFeedSync: true,
  supportsTechnicalAuditRuns: true,
  supportsScheduledTechnicalAudit: true,
  supportsRankingSync: true,
  supportsRankingConfigWrites: true,
  supportsScheduledRankingSync: true,
  supportsWorkflowModules: true,
  supportsSeoRepairs: true,
  supportsSeoRepairApply: true
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "尚未執行";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }

  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Taipei"
  }).format(date);
}

function displayEnvironment(value: string) {
  if (value === "production") return "正式環境";
  if (value === "staging") return "測試環境";
  if (value === "development") return "開發環境";
  return value;
}

function displayPublishMode(value: string) {
  const labels: Record<string, string> = {
    kv_runtime: "即時文章發布",
    d1_override: "結構化覆寫",
    api_feed_build_sync: "API 資料源建置同步",
    workflow_module_source: "工作流程模組來源"
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function displaySiteType(value: string) {
  const labels: Record<string, string> = {
    brand_local_seo: "在地品牌 SEO",
    programmatic_seo_tools: "程式化工具 SEO",
    platform_with_embedded_seo: "平台內建 SEO",
    workflow_module_source: "工作流程模組來源"
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function displayJobType(value: string) {
  const labels: Record<string, string> = {
    technical_audit: "技術巡檢",
    content_generation: "內容生成",
    published_feed_sync: "發布內容同步",
    ranking_sync: "排名同步",
    repair_generation: "SEO 修復稿生成",
    repair_apply: "SEO 修復套用",
    build_sync_deploy: "建置部署觸發"
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function displayEventType(value: string) {
  const labels: Record<string, string> = {
    started: "開始",
    progress: "進行中",
    completed: "完成",
    failed: "失敗",
    skipped: "略過",
    fetch_started: "開始抓取",
    fetch_completed: "抓取完成",
    import_completed: "匯入完成",
    audit_started: "巡檢開始",
    audit_completed: "巡檢完成",
    ranking_started: "排名同步開始",
    ranking_completed: "排名同步完成",
    deploy_trigger_started: "部署觸發開始",
    deploy_trigger_completed: "部署觸發完成",
    content_topic_selected: "已選擇主題",
    draft_generated: "草稿已生成",
    draft_published: "內容已發布",
    override_refreshed: "覆寫已刷新",
    repair_candidate_selected: "已選擇修復目標",
    repair_draft_generated: "修復稿已生成",
    repair_applied: "修復已套用",
    repair_skipped: "修復已略過"
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function displayTriggerSource(value: string) {
  const labels: Record<string, string> = {
    manual_api: "手動執行",
    scheduled_cron: "排程執行",
    bootstrap: "初始化"
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function displayStatus(value: string | null | undefined) {
  const labels: Record<string, string> = {
    completed: "已完成",
    running: "執行中",
    failed: "失敗",
    ok: "正常",
    warn: "警告",
    fail: "失敗",
    error: "錯誤",
    triggered: "已觸發",
    pending_deploy: "等待部署",
    deploy_triggered: "已觸發部署",
    deploy_failed: "部署失敗",
    draft: "草稿",
    published_pending_sync: "已發布待同步",
    applied: "已套用"
  };
  if (!value) return "尚未執行";
  return labels[value] ?? value.replaceAll("_", " ");
}

function displayConnectorLabel(value: string) {
  const labels: Record<string, string> = {
    "demo-brand-runtime": "品牌站即時發布",
    "demo-local-site-brand": "餐飲在地 SEO",
    "demo-calculator-d1": "工具頁結構化覆寫",
    "demo-platform-build-sync": "平台 API 資料源同步",
    "demo-runtime-platform": "平台站即時發布",
    "module-donor-only": "工作流程模組來源"
  };
  return labels[value] ?? value;
}

function connectorSummary(value: string) {
  const labels: Record<string, string> = {
    "demo-brand-runtime": "適合品牌或在地網站，直接由 Worker 管理文章發布。",
    "demo-local-site-brand": "適合餐飲與在地搜尋意圖網站，支援簡單內容節奏。",
    "demo-calculator-d1": "適合工具站，把 AI 產生的標題、描述與內容覆寫到 D1。",
    "demo-platform-build-sync": "適合透過 API 資料源發布內容，再於建置或部署時同步的網站。",
    "demo-runtime-platform": "適合同一個 Worker 同時承載產品主站與 SEO 公開頁的網站，可直接即時發布內容。",
    "module-donor-only": "只作為可重用工作流程來源，不當作正式管理網站。"
  };
  return labels[value] ?? "此連接器可接入中控台的 SEO 工作流程。";
}

function displayWorkflowModuleCategory(value: string) {
  const labels: Record<string, string> = {
    engine: "引擎",
    workflow: "工作流",
    playbook: "移植手冊"
  };
  return labels[value] ?? value;
}

function displayWorkflowCapability(value: string) {
  const labels: Record<string, string> = {
    technical_audit: "技術巡檢",
    draft_generation: "草稿生成",
    manual_publish_review: "人工審核／發佈",
    ranking_sync: "排名同步",
    repair_workflow: "SEO 修復",
    cloudflare_cron: "Cloudflare 排程",
    operator_playbook: "營運手冊"
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function displayRankingPrerequisite(value: string) {
  const labels: Record<string, string> = {
    "Ranking sync is disabled for this site.": "這個網站的排名同步目前尚未啟用。",
    "Search Console property URL is not configured.": "還沒有設定 Search Console 網站網址。",
    "GSC_SERVICE_ACCOUNT_EMAIL is not configured.": "Cloudflare 尚未設定 `GSC_SERVICE_ACCOUNT_EMAIL` secret。",
    "GSC_SERVICE_ACCOUNT_PRIVATE_KEY is not configured.": "Cloudflare 尚未設定 `GSC_SERVICE_ACCOUNT_PRIVATE_KEY` secret。",
    "D1 binding is not configured yet.": "目前尚未設定 D1 綁定。"
  };
  return labels[value] ?? value;
}

function displayCapability(key: string, value: unknown) {
  const labels: Record<string, string> = {
    deployTarget: "部署目標",
    supportsManagedSites: "支援多站管理",
    supportsConnectorModel: "支援連接器模型",
    supportsCronAutomation: "支援排程自動化",
    supportsWorkersAI: "支援 Workers AI",
    supportsD1: "支援 D1 資料庫",
    supportsPerSiteSeoState: "支援每站 SEO 狀態",
    supportsSeoSettingsWrites: "支援調整 SEO 自動化設定",
    supportsStructuredOverrides: "支援結構化覆寫",
    supportsStructuredOverrideWrites: "支援寫入結構化覆寫",
    supportsStructuredOverrideDelete: "支援刪除結構化覆寫",
    supportsBuildSyncConfig: "支援建置同步設定",
    supportsBuildSyncConfigWrites: "支援寫入建置同步設定",
    supportsBuildSyncDeployTrigger: "支援觸發建置部署",
    supportsScheduledBuildSyncDeploy: "支援排程建置部署",
    supportsPublishedFeedSnapshotSync: "支援已發布內容同步",
    supportsContentGeneration: "支援內容生成",
    supportsScheduledContentGeneration: "支援排程內容生成",
    supportsSeoJobs: "支援任務紀錄",
    supportsScheduledPublishedFeedSync: "支援排程發布同步",
    supportsTechnicalAuditRuns: "支援技術巡檢",
    supportsScheduledTechnicalAudit: "支援排程技術巡檢",
    supportsRankingSync: "支援排名同步",
    supportsRankingConfigWrites: "支援寫入排名設定",
    supportsScheduledRankingSync: "支援排程排名同步",
    supportsWorkflowModules: "支援工作流模組庫",
    supportsSeoRepairs: "支援 SEO 修復稿",
    supportsSeoRepairApply: "支援套用 SEO 修復"
  };

  if (typeof value === "boolean") {
    return `${labels[key] ?? key}：${value ? "是" : "否"}`;
  }

  if (key === "deployTarget") {
    return `${labels[key] ?? key}：Cloudflare Workers`;
  }

  return `${labels[key] ?? key}：${String(value)}`;
}

function statusTone(status: string | null | undefined) {
  if (!status) {
    return "neutral";
  }

  if (status === "completed" || status === "ok" || status === "running" || status === "triggered") {
    return "good";
  }

  if (status === "failed" || status === "fail" || status === "error") {
    return "bad";
  }

  return "warn";
}

function automationLabel(entry: LoadedSite) {
  if (entry.site.publishMode === "workflow_module_source") {
    return "模組來源";
  }

  return entry.state?.settings.automationEnabled ? "已啟用" : "已暫停";
}

function automationTone(entry: LoadedSite) {
  if (entry.site.publishMode === "workflow_module_source") {
    return "neutral";
  }

  return entry.state?.settings.automationEnabled ? "good" : "warn";
}

function renderBadge(value: string, tone = "neutral") {
  return `<span class="badge badge--${escapeHtml(tone)}">${escapeHtml(value)}</span>`;
}

function renderEmptyState(message: string) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function renderStat(label: string, value: string | number, note: string) {
  return `
    <section class="stat-block">
      <p class="stat-label">${escapeHtml(label)}</p>
      <p class="stat-value">${escapeHtml(value)}</p>
      <p class="stat-note">${escapeHtml(note)}</p>
    </section>
  `;
}

function siteSlug(site: ManagedSiteItem) {
  return `<a class="site-link" href="/sites/${encodeURIComponent(site.id)}">${escapeHtml(site.label)}</a>`;
}

function flattenJobs(items: LoadedSite[]) {
  return items
    .flatMap<SiteJobRow>((entry) => (entry.state?.jobs ?? []).map((job) => ({ site: entry.site, job })))
    .sort((left, right) => Date.parse(right.job.createdAt) - Date.parse(left.job.createdAt));
}

function flattenPublished(items: LoadedSite[]) {
  return items
    .flatMap<SiteContentRow>((entry) => (entry.state?.published ?? []).map((item) => ({ site: entry.site, item })))
    .sort((left, right) => Date.parse(right.item.publishedAt) - Date.parse(left.item.publishedAt));
}

function flattenKeywords(items: LoadedSite[]) {
  return items
    .flatMap<SiteKeywordRow>((entry) => (entry.state?.topics ?? []).map((item) => ({ site: entry.site, item })))
    .sort((left, right) => Date.parse(right.item.updatedAt) - Date.parse(left.item.updatedAt));
}

function summarizeSite(entry: LoadedSite) {
  const state = entry.state;
  const lastAudit = state?.lastAudit;
  const failingTargets = lastAudit?.summary.failingTargets ?? 0;
  const warningTargets = lastAudit?.summary.warningTargets ?? 0;
  const jobStatus = state?.lastJob?.status ?? null;

  return {
    topicsCount: state?.topics.length ?? 0,
    draftsCount: state?.drafts.length ?? 0,
    publishedCount: state?.published.length ?? 0,
    structuredOverrideCount: state?.structuredOverrides.length ?? 0,
    repairCount: state?.repairs.length ?? 0,
    automationEnabled: state?.settings.automationEnabled ?? false,
    lastPublishedAt: state?.settings.lastPublishedAt ?? null,
    lastAuditLabel:
      failingTargets > 0
        ? `${failingTargets} 個失敗`
        : warningTargets > 0
          ? `${warningTargets} 個警告`
          : lastAudit
            ? "巡檢正常"
            : "尚未巡檢",
    lastAuditTone: failingTargets > 0 ? "bad" : warningTargets > 0 ? "warn" : lastAudit ? "good" : "neutral",
    lastJobLabel: jobStatus ? displayStatus(jobStatus) : "尚無任務",
    lastJobTone: statusTone(jobStatus),
    rankingReady: state?.ranking.ready ?? false,
    buildSyncReady: Boolean(state?.buildSync),
    lastError: state?.settings.lastError ?? null
  };
}

function hasConfiguredSecret(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

async function loadAdminContext(env: Cloudflare.Env): Promise<AdminContext> {
  const [database, sites] = await Promise.all([getDatabaseHealth(env), listManagedSitesForRequest(env)]);
  const states = await Promise.all(sites.map(async (site) => ({ site, state: await readManagedSiteSeoState(env, site.id) })));
  const runtimeManagedSiteCount = states.filter((entry) => entry.site.publishMode !== "workflow_module_source").length;
  const buildSyncSiteCount = states.filter((entry) => entry.site.publishMode === "api_feed_build_sync").length;
  const buildSyncConfiguredCount = states.filter((entry) => entry.site.publishMode === "api_feed_build_sync" && Boolean(entry.state?.buildSync)).length;
  const rawEnv = env as unknown as Record<string, unknown>;

  return {
    appName: UI_APP_NAME,
    environment: env.APP_ENV ?? "production",
    database,
    mainlineSource: getMainlineSource(),
    publishModes: listSupportedPublishModes(),
    connectors: listConnectorDefinitions(),
    workflowModules: listWorkflowModules(),
    models: seoModelOptions,
    sites: states,
    readiness: {
      hasBasicAuthConfigured: hasConfiguredSecret(env.BASIC_AUTH_USERNAME) && hasConfiguredSecret(env.BASIC_AUTH_PASSWORD),
      hasGscCredentials:
        hasConfiguredSecret(rawEnv.GSC_SERVICE_ACCOUNT_EMAIL) && hasConfiguredSecret(rawEnv.GSC_SERVICE_ACCOUNT_PRIVATE_KEY),
      managedSiteCount: states.length,
      automationEnabledCount: states.filter(
        (entry) => entry.site.publishMode !== "workflow_module_source" && Boolean(entry.state?.settings.automationEnabled)
      ).length,
      rankingEnabledCount: states.filter((entry) => Boolean(entry.state?.ranking.enabled)).length,
      rankingReadyCount: states.filter((entry) => Boolean(entry.state?.ranking.ready)).length,
      buildSyncSiteCount,
      buildSyncConfiguredCount,
      workflowModuleSourceCount: states.filter((entry) => entry.site.publishMode === "workflow_module_source").length,
      runtimeManagedSiteCount,
      promptTemplatesEditable: false
    }
  };
}

function renderPageLayout(context: AdminContext, options: { activeNav: string; title: string; subtitle: string; content: string; aside?: string }) {
  const nav = NAV_ITEMS.map((item) => {
    const active = item.key === options.activeNav;
    return `
      <a class="nav-link${active ? " nav-link--active" : ""}" href="${escapeHtml(item.href)}">
        <span class="nav-key">${escapeHtml(item.label)}</span>
      </a>
    `;
  }).join("");

  const aside = options.aside
    ? `<aside class="workspace-aside">${options.aside}</aside>`
    : `<aside class="workspace-aside">${renderEmptyState("請選擇網站或功能區，查看操作細節。")}</aside>`;

  return html(`<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.title)} | ${escapeHtml(UI_APP_NAME)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f2efe8;
        --surface: rgba(255, 255, 255, 0.86);
        --surface-strong: rgba(255, 255, 255, 0.96);
        --surface-muted: rgba(28, 33, 41, 0.05);
        --text: #182029;
        --muted: #56606f;
        --line: rgba(24, 32, 41, 0.12);
        --accent: #185c46;
        --accent-soft: rgba(24, 92, 70, 0.12);
        --good: #1f7a52;
        --warn: #9a6812;
        --bad: #a13a32;
        --shadow: 0 18px 40px rgba(28, 33, 41, 0.08);
        --radius: 20px;
        --sidebar: 240px;
        font-family: "IBM Plex Sans", "Avenir Next", "Helvetica Neue", sans-serif;
      }

      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background:
        radial-gradient(circle at top left, rgba(24, 92, 70, 0.08), transparent 28rem),
        linear-gradient(180deg, #f7f3ec 0%, #f0ede6 46%, #ebe8e0 100%);
        color: var(--text);
      }

      a { color: inherit; text-decoration: none; }
      button, input, select, textarea {
        font: inherit;
      }

      .app-shell {
        min-height: 100vh;
        display: grid;
        grid-template-columns: var(--sidebar) minmax(0, 1fr);
      }

      .sidebar {
        position: sticky;
        top: 0;
        align-self: start;
        min-height: 100vh;
        padding: 28px 22px;
        border-right: 1px solid var(--line);
        background: rgba(247, 243, 236, 0.92);
        backdrop-filter: blur(18px);
      }

      .brand {
        margin-bottom: 28px;
      }

      .brand-mark {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        border-radius: 999px;
        background: var(--surface-strong);
        box-shadow: var(--shadow);
        font-weight: 700;
        letter-spacing: 0.02em;
      }

      .brand-copy {
        margin-top: 16px;
      }

      .brand-copy p {
        margin: 6px 0 0;
        color: var(--muted);
        line-height: 1.5;
        font-size: 0.95rem;
      }

      .nav-stack {
        display: grid;
        gap: 8px;
      }

      .nav-link {
        display: flex;
        align-items: center;
        min-height: 44px;
        padding: 0 14px;
        border-radius: 14px;
        color: var(--muted);
        transition: transform 140ms ease, background-color 140ms ease, color 140ms ease;
      }

      .nav-link:hover {
        transform: translateX(4px);
        color: var(--text);
        background: rgba(255, 255, 255, 0.6);
      }

      .nav-link--active {
        background: var(--accent);
        color: white;
        box-shadow: 0 12px 28px rgba(24, 92, 70, 0.22);
      }

      .sidebar-meta {
        margin-top: 24px;
        padding-top: 24px;
        border-top: 1px solid var(--line);
        display: grid;
        gap: 10px;
      }

      .sidebar-meta p {
        margin: 0;
        font-size: 0.92rem;
        color: var(--muted);
      }

      .workspace {
        padding: 28px;
      }

      .workspace-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 20px;
        margin-bottom: 24px;
      }

      .workspace-header h1 {
        margin: 0;
        font-size: clamp(1.75rem, 2.6vw, 2.65rem);
        letter-spacing: -0.03em;
      }

      .workspace-header p {
        margin: 8px 0 0;
        max-width: 64ch;
        color: var(--muted);
        line-height: 1.6;
      }

      .workspace-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.65fr) minmax(260px, 0.95fr);
        gap: 22px;
      }

      .workspace-main,
      .workspace-aside {
        display: grid;
        gap: 18px;
        align-content: start;
      }

      .panel {
        background: var(--surface);
        border: 1px solid rgba(255, 255, 255, 0.55);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        backdrop-filter: blur(16px);
        padding: 20px;
        animation: panel-in 260ms ease both;
      }

      @keyframes panel-in {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .panel h2,
      .panel h3 {
        margin: 0 0 12px;
        font-size: 1.05rem;
      }

      .panel p {
        margin: 0;
        line-height: 1.6;
        color: var(--muted);
      }

      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
      }

      .stat-block {
        padding: 18px;
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(249,248,245,0.88));
        border: 1px solid var(--line);
      }

      .stat-label, .stat-note {
        margin: 0;
        color: var(--muted);
      }

      .stat-value {
        margin: 12px 0 10px;
        font-size: clamp(1.55rem, 2vw, 2.2rem);
        font-weight: 700;
        letter-spacing: -0.04em;
      }

      .list-stack, .detail-list {
        display: grid;
        gap: 12px;
      }

      .site-row,
      .log-row {
        display: grid;
        gap: 8px;
        padding: 16px 0;
        border-top: 1px solid var(--line);
      }

      .site-row:first-child,
      .log-row:first-child {
        padding-top: 0;
        border-top: 0;
      }

      .site-row header,
      .log-row header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .site-link {
        font-weight: 700;
        color: var(--text);
      }

      .micro-copy {
        font-size: 0.92rem;
        color: var(--muted);
      }

      .chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        padding: 0 10px;
        border-radius: 999px;
        background: rgba(28, 33, 41, 0.08);
        color: var(--text);
        font-size: 0.85rem;
        white-space: nowrap;
      }

      .badge--good { background: rgba(31, 122, 82, 0.14); color: var(--good); }
      .badge--warn { background: rgba(154, 104, 18, 0.14); color: var(--warn); }
      .badge--bad { background: rgba(161, 58, 50, 0.14); color: var(--bad); }
      .badge--neutral { background: rgba(86, 96, 111, 0.12); color: var(--muted); }

      .table-wrap {
        overflow-x: auto;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th, td {
        text-align: left;
        padding: 12px 0;
        border-top: 1px solid var(--line);
        vertical-align: top;
      }

      th {
        padding-top: 0;
        border-top: 0;
        font-size: 0.85rem;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--muted);
      }

      td {
        color: var(--text);
      }

      .action-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .action-button {
        appearance: none;
        border: 0;
        padding: 0 16px;
        min-height: 42px;
        border-radius: 999px;
        background: var(--accent);
        color: white;
        cursor: pointer;
        transition: transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease;
      }

      .action-button:hover {
        transform: translateY(-1px);
        box-shadow: 0 14px 28px rgba(24, 92, 70, 0.22);
      }

      .action-button[disabled] {
        opacity: 0.6;
        cursor: wait;
      }

      .action-button--secondary {
        background: rgba(24, 32, 41, 0.08);
        color: var(--text);
      }

      .form-grid {
        display: grid;
        gap: 12px;
      }

      .field-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      label {
        display: grid;
        gap: 6px;
        font-size: 0.92rem;
        color: var(--muted);
      }

      input,
      select,
      textarea {
        width: 100%;
        min-height: 44px;
        border-radius: 14px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.92);
        padding: 10px 14px;
        color: var(--text);
      }

      textarea {
        min-height: 120px;
        resize: vertical;
      }

      .empty-state {
        padding: 18px;
        border-radius: 16px;
        background: rgba(24, 32, 41, 0.04);
        color: var(--muted);
      }

      .system-callout {
        padding: 16px;
        border-radius: 16px;
        background: linear-gradient(135deg, rgba(24, 92, 70, 0.1), rgba(24, 92, 70, 0.02));
        color: var(--text);
      }

      .system-callout p {
        margin-top: 6px;
      }

      .feedback {
        position: fixed;
        right: 24px;
        bottom: 24px;
        z-index: 40;
        max-width: min(460px, calc(100vw - 32px));
        padding: 16px 18px;
        border-radius: 16px;
        background: rgba(24, 32, 41, 0.94);
        color: white;
        box-shadow: 0 20px 40px rgba(24, 32, 41, 0.28);
        opacity: 0;
        transform: translateY(10px);
        pointer-events: none;
        transition: opacity 180ms ease, transform 180ms ease;
      }

      .feedback--visible {
        opacity: 1;
        transform: translateY(0);
      }

      details {
        border-top: 1px solid var(--line);
        padding-top: 14px;
      }

      summary {
        cursor: pointer;
        font-weight: 700;
        color: var(--text);
      }

      @media (max-width: 1080px) {
        .app-shell {
          grid-template-columns: 1fr;
        }

        .sidebar {
          position: static;
          min-height: auto;
          border-right: 0;
          border-bottom: 1px solid var(--line);
        }

        .workspace-grid {
          grid-template-columns: 1fr;
        }

        .metrics-grid,
        .field-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">${escapeHtml(UI_APP_NAME)}</div>
          <div class="brand-copy">
            <strong>${escapeHtml(context.appName)}</strong>
            <p>多站點 SEO 內容生成、排程、發布、巡檢與排名同步。</p>
          </div>
        </div>
        <nav class="nav-stack">${nav}</nav>
        <div class="sidebar-meta">
          <p>${escapeHtml(displayEnvironment(context.environment))}</p>
          <p>D1：${context.database.connected ? "已連線" : "未連線"}</p>
          <p>${escapeHtml(`${context.sites.length} 個管理網站`)}</p>
        </div>
      </aside>
      <main class="workspace">
        <header class="workspace-header">
          <div>
            <h1>${escapeHtml(options.title)}</h1>
            <p>${escapeHtml(options.subtitle)}</p>
          </div>
        </header>
        <div class="workspace-grid">
          <section class="workspace-main">${options.content}</section>
          ${aside}
        </div>
      </main>
    </div>
    <div id="admin-feedback" class="feedback" aria-live="polite"></div>
    <script>
      const feedback = document.getElementById("admin-feedback");

      function showFeedback(message, isError) {
        if (!feedback) return;
        feedback.textContent = message;
        feedback.style.background = isError ? "rgba(161, 58, 50, 0.96)" : "rgba(24, 32, 41, 0.94)";
        feedback.classList.add("feedback--visible");
        window.clearTimeout(window.__seoFeedbackTimer);
        window.__seoFeedbackTimer = window.setTimeout(() => {
          feedback.classList.remove("feedback--visible");
        }, 3200);
      }

      async function runAction(path, method, payload) {
        const response = await fetch(path, {
          method,
          headers: payload ? { "content-type": "application/json" } : undefined,
          body: payload ? JSON.stringify(payload) : undefined
        });

        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = { ok: response.ok, raw: text };
        }

        if (!response.ok || data.ok === false) {
          throw new Error(data.error || data.raw || "操作失敗。");
        }

        return data;
      }

      function serializeForm(form) {
        const payload = {};
        const data = new FormData(form);
        for (const [key, rawValue] of data.entries()) {
          if (typeof rawValue !== "string") continue;
          const field = form.querySelector("[name=\\"" + CSS.escape(key) + "\\"]");
          if (field instanceof HTMLInputElement && field.type === "checkbox") {
            payload[key] = field.checked;
            continue;
          }
          if (field instanceof HTMLInputElement && field.type === "number") {
            payload[key] = rawValue.trim() ? Number(rawValue) : null;
            continue;
          }
          payload[key] = rawValue.trim();
        }

        form.querySelectorAll("input[type=checkbox][data-bool]").forEach((field) => {
          if (!(field instanceof HTMLInputElement) || !field.name) return;
          payload[field.name] = field.checked;
        });

        return payload;
      }

      document.querySelectorAll("[data-api-action]").forEach((button) => {
        button.addEventListener("click", async () => {
          if (!(button instanceof HTMLButtonElement)) return;
          const confirmText = button.dataset.confirm;
          if (confirmText && !window.confirm(confirmText)) {
            return;
          }
          const path = button.dataset.apiPath;
          const method = button.dataset.apiAction || "POST";
          if (!path) return;
          button.disabled = true;
          try {
            await runAction(path, method, null);
            showFeedback(button.dataset.successMessage || "操作已完成。", false);
            window.setTimeout(() => window.location.reload(), 700);
          } catch (error) {
            showFeedback(error instanceof Error ? error.message : "操作失敗。", true);
          } finally {
            button.disabled = false;
          }
        });
      });

      document.querySelectorAll("form[data-api-form]").forEach((form) => {
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (!(form instanceof HTMLFormElement)) return;
          const submitButton = form.querySelector("[type=submit]");
          if (submitButton instanceof HTMLButtonElement) {
            submitButton.disabled = true;
          }
          try {
            const payload = serializeForm(form);
            await runAction(form.dataset.apiForm, form.dataset.method || "POST", payload);
            showFeedback(form.dataset.successMessage || "已儲存。", false);
            if (form.dataset.resetOnSuccess === "true") {
              form.reset();
            }
            window.setTimeout(() => window.location.reload(), 700);
          } catch (error) {
            showFeedback(error instanceof Error ? error.message : "儲存失敗。", true);
          } finally {
            if (submitButton instanceof HTMLButtonElement) {
              submitButton.disabled = false;
            }
          }
        });
      });
    </script>
  </body>
</html>`);
}

function renderDashboard(context: AdminContext) {
  const totalGenerated = context.sites.reduce((sum, item) => sum + (item.state?.usageSummary.generatedTodayCount ?? 0), 0);
  const totalDrafts = context.sites.reduce((sum, item) => sum + (item.state?.drafts.length ?? 0), 0);
  const publishedItems = flattenPublished(context.sites);
  const jobs = flattenJobs(context.sites);
  const failedJobs = jobs.filter((item) => item.job.status === "failed").length;
  const activeSchedules = context.sites.filter((item) => item.state?.settings.automationEnabled).length;

  const siteCards = context.sites.length
    ? context.sites
        .map((entry) => {
          const summary = summarizeSite(entry);
          return `
            <article class="site-row">
              <header>
                <div>
                  <div>${siteSlug(entry.site)}</div>
                  <div class="micro-copy">${escapeHtml(entry.site.canonicalUrl)}</div>
                </div>
                <div class="chip-row">
                  ${renderBadge(displayPublishMode(entry.site.publishMode), "neutral")}
                  ${renderBadge(summary.lastAuditLabel, summary.lastAuditTone)}
                  ${renderBadge(summary.lastJobLabel, summary.lastJobTone)}
                </div>
              </header>
              <div class="micro-copy">
                ${escapeHtml(`${summary.topicsCount} 個主題 · ${summary.draftsCount} 篇草稿 · ${summary.publishedCount} 篇已發布 · 最近發布 ${formatDate(summary.lastPublishedAt)}`)}
              </div>
            </article>
          `;
        })
        .join("")
    : renderEmptyState("目前尚未註冊任何管理網站。");

  const jobsTable = jobs.length
    ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>網站</th>
              <th>任務類型</th>
              <th>狀態</th>
              <th>觸發方式</th>
              <th>開始時間</th>
            </tr>
          </thead>
          <tbody>
            ${jobs
              .slice(0, 8)
              .map(
                ({ site, job }) => `
                  <tr>
                    <td>${siteSlug(site)}</td>
                    <td>${escapeHtml(displayJobType(job.jobType))}</td>
                    <td>${renderBadge(displayStatus(job.status), statusTone(job.status))}</td>
                    <td>${escapeHtml(displayTriggerSource(job.triggerSource))}</td>
                    <td>${escapeHtml(formatDate(job.startedAt ?? job.createdAt))}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `
    : renderEmptyState("目前尚未記錄任何任務。");

  const publishedTable = publishedItems.length
    ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>標題</th>
              <th>網站</th>
              <th>狀態</th>
              <th>發布時間</th>
            </tr>
          </thead>
          <tbody>
            ${publishedItems
              .slice(0, 8)
              .map(
                ({ site, item }) => `
                  <tr>
                    <td>
                      <div>${escapeHtml(item.title)}</div>
                      <div class="micro-copy">${escapeHtml(item.liveUrl)}</div>
                    </td>
                    <td>${siteSlug(site)}</td>
                    <td>${renderBadge(displayStatus(item.syncStatus), statusTone(item.syncStatus))}</td>
                    <td>${escapeHtml(formatDate(item.publishedAt))}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `
    : renderEmptyState("第一次同步後，已發布內容會顯示在這裡。");

  const content = `
    <section class="panel">
      <h2>怎麼使用這個中控台</h2>
      <div class="detail-list">
        <p><strong>已啟用</strong>：這個網站會依照排程自動跑巡檢、內容生成或同步。</p>
        <p><strong>已暫停</strong>：不會自動跑，但仍可進入網站頁面手動按「執行巡檢」、「生成內容」、「生成修復稿」。</p>
        <p><strong>模組來源</strong>：有些站只提供可重用工作流與 SOP，不一定要啟用排程；像 Runtime Demo 這種正式站，也可以同時提供模組給其他站重用。</p>
        <p>建議流程：到「網站」選一個站，再依序使用「執行巡檢」→「生成修復稿」→「套用修復」→「生成內容」。像示範平台站這類 API 同步站，才需要「同步發布內容」與「觸發建置部署」。</p>
      </div>
    </section>
    <section class="panel">
      <div class="metrics-grid">
        ${renderStat("管理網站", context.sites.length, "目前已接入中控台的網站數")}
        ${renderStat("今日生成", totalGenerated, "依已記錄的生成事件估算")}
        ${renderStat("草稿待辦", totalDrafts, "等待審核或發布的草稿")}
        ${renderStat("已發布快照", publishedItems.length, "目前 D1 中的已發布內容")}
        ${renderStat("失敗任務", failedJobs, "近期需要處理的自動化任務")}
        ${renderStat("啟用排程", activeSchedules, "已啟用自動化排程的網站")}
      </div>
    </section>
    <section class="panel">
      <h2>網站總覽</h2>
      <p>集中顯示每個網站的內容數量、巡檢狀態與最近一次任務結果。</p>
      <div class="list-stack">${siteCards}</div>
    </section>
    <section class="panel">
      <h2>最近任務</h2>
      <p>顯示巡檢、發布同步與排名同步的最近執行紀錄。</p>
      ${jobsTable}
    </section>
    <section class="panel">
      <h2>最近發布</h2>
      <p>中控台目前讀取到的已發布內容快照。</p>
      ${publishedTable}
    </section>
  `;

  const aside = `
    <section class="panel">
      <h2>系統狀態</h2>
      <div class="detail-list">
        <div class="system-callout">
          <strong>D1 ${context.database.connected ? "可用" : "需要處理"}</strong>
          <p>${escapeHtml(context.database.connected ? "Worker 可以讀寫中控台操作資料。" : context.database.error ?? "資料庫綁定無法使用。")}</p>
        </div>
        <div class="chip-row">
          ${context.publishModes.map((mode) => renderBadge(displayPublishMode(mode), "neutral")).join("")}
        </div>
      </div>
    </section>
    <section class="panel">
      <h2>主幹來源</h2>
      <p>${escapeHtml(context.mainlineSource.projectPath)}</p>
      <p>目前以示範平台站的 SEO 管理、狀態、發布同步與部署流程作為公開範例主幹。</p>
    </section>
  `;

  return renderPageLayout(context, {
    activeNav: "dashboard",
    title: "AI SEO 中控台",
    subtitle: "多站點 SEO 內容生成、發布、排程、技術巡檢與排名同步的控制面板。",
    content,
    aside
  });
}

function renderReadinessItem(item: { title: string; statusLabel: string; tone: string; detail: string; note?: string }) {
  return `
    <article class="log-row">
      <header>
        <strong>${escapeHtml(item.title)}</strong>
        ${renderBadge(item.statusLabel, item.tone)}
      </header>
      <p>${escapeHtml(item.detail)}</p>
      ${item.note ? `<div class="micro-copy">${escapeHtml(item.note)}</div>` : ""}
    </article>
  `;
}

function renderReadinessPage(context: AdminContext) {
  const { readiness } = context;
  const completedItems = [
    {
      title: "多站點中控與站點註冊",
      statusLabel: "已完成",
      tone: "good",
      detail: `目前已可集中管理 ${readiness.managedSiteCount} 個網站，包含 connector、站點類型、發布方式與每站 SEO 狀態。`
    },
    {
      title: "巡檢、內容生成與 SEO 修復流程",
      statusLabel: "已完成",
      tone: "good",
      detail: `目前 ${readiness.runtimeManagedSiteCount} 個正式管理站都可由中控台觸發巡檢、生成內容與生成修復稿。`
    },
    {
      title: "排程、任務與操作紀錄",
      statusLabel: "已完成",
      tone: "good",
      detail: `Cloudflare 排程、任務追蹤、操作紀錄與網站頁面的手動操作入口都已經整合完成。`
    },
    {
      title: "後台保護與權限控管",
      statusLabel: readiness.hasBasicAuthConfigured ? "已完成" : "待設定",
      tone: readiness.hasBasicAuthConfigured ? "good" : "warn",
      detail: readiness.hasBasicAuthConfigured
        ? "目前部署已啟用 Basic Auth 保護，可避免未授權直接進入中控台。"
        : "目前尚未完整設定 Basic Auth，正式環境上線前應先補齊。"
    },
    {
      title: "工作流模組庫",
      statusLabel: "已完成",
      tone: "good",
      detail: `目前已整理 ${context.workflowModules.length} 個可重用模組，並保留 ${readiness.workflowModuleSourceCount} 個模組來源站供後續擴站重用。`
    }
  ];

  const externalItems = [
    {
      title: "Google Search Console 排名同步",
      statusLabel: readiness.hasGscCredentials && readiness.rankingReadyCount > 0 ? "可用" : "待補設定",
      tone: readiness.hasGscCredentials && readiness.rankingReadyCount > 0 ? "good" : "warn",
      detail: readiness.hasGscCredentials
        ? `目前已有 ${readiness.rankingEnabledCount} 個網站開啟排名同步，其中 ${readiness.rankingReadyCount} 個已就緒。`
        : "Cloudflare 尚未補齊 GSC service account secrets，所以排名同步仍停在待設定狀態。",
      note: "要真正抓到排名，還需要把 Google service account 加到 Search Console 網站資產權限。"
    },
    {
      title: "Build Sync 類型站點的下游部署設定",
      statusLabel:
        readiness.buildSyncSiteCount === 0
          ? "目前不需要"
          : readiness.buildSyncConfiguredCount === readiness.buildSyncSiteCount
            ? "已補齊"
            : "待補設定",
      tone:
        readiness.buildSyncSiteCount === 0
          ? "neutral"
          : readiness.buildSyncConfiguredCount === readiness.buildSyncSiteCount
            ? "good"
            : "warn",
      detail:
        readiness.buildSyncSiteCount === 0
          ? "目前沒有需要 API feed 建置同步的網站。"
          : `目前有 ${readiness.buildSyncSiteCount} 個網站使用 build-sync，已完成 ${readiness.buildSyncConfiguredCount} 個站的中控台建置同步設定。`,
      note: "若下游網站還需要 deploy hook、GitHub token 或 build webhook，仍要到對應站點補齊。"
    }
  ];

  const pendingItems = [
    {
      title: "可編輯 Prompt 模板層",
      statusLabel: readiness.promptTemplatesEditable ? "已完成" : "待收尾",
      tone: readiness.promptTemplatesEditable ? "good" : "neutral",
      detail: readiness.promptTemplatesEditable
        ? "目前已能直接在中控台管理 Prompt 模板。"
        : "現在模板頁主要還是用 connector 定義與工作流模組充當模板層，尚未抽成真正可編輯的 Prompt 模板。"
    }
  ];

  const siteRows = context.sites
    .map((entry) => {
      const rankingLabel =
        entry.site.publishMode === "workflow_module_source"
          ? "模組重用"
          : entry.state?.ranking.ready
            ? "已就緒"
            : entry.state?.ranking.enabled
              ? "待補設定"
              : "未啟用";
      const rankingTone =
        entry.site.publishMode === "workflow_module_source"
          ? "neutral"
          : entry.state?.ranking.ready
            ? "good"
            : entry.state?.ranking.enabled
              ? "warn"
              : "neutral";
      const publishLabel =
        entry.site.publishMode === "api_feed_build_sync"
          ? entry.state?.buildSync
            ? "建置同步已設定"
            : "建置同步待補設定"
          : entry.site.publishMode === "workflow_module_source"
            ? "不適用"
            : displayPublishMode(entry.site.publishMode);
      const publishTone =
        entry.site.publishMode === "api_feed_build_sync"
          ? entry.state?.buildSync
            ? "good"
            : "warn"
          : "neutral";

      return `
        <tr>
          <td>${siteSlug(entry.site)}</td>
          <td>${renderBadge(displayPublishMode(entry.site.publishMode), "neutral")}</td>
          <td>${renderBadge(automationLabel(entry), automationTone(entry))}</td>
          <td>${renderBadge(rankingLabel, rankingTone)}</td>
          <td>${renderBadge(publishLabel, publishTone)}</td>
        </tr>
      `;
    })
    .join("");

  const content = `
    <section class="panel">
      <h2>目前判定</h2>
      <p>這套 AI SEO 中控台目前已經能管理多站、執行排程、巡檢、生成內容、產出修復稿與操作發布流程。真正還沒完全收尾的，主要是 GSC 憑證接入與可編輯 Prompt 模板層。</p>
      <div class="metrics-grid">
        ${renderStat("已管理網站", readiness.managedSiteCount, "中控台目前註冊的網站")}
        ${renderStat("啟用自動化", readiness.automationEnabledCount, "正式管理站中已開啟排程的網站")}
        ${renderStat("排名已就緒", readiness.rankingReadyCount, "已可直接同步 Search Console 的網站")}
      </div>
    </section>
    <section class="panel">
      <h2>已完成</h2>
      <div class="list-stack">${completedItems.map(renderReadinessItem).join("")}</div>
    </section>
    <section class="panel">
      <h2>待補外部設定</h2>
      <div class="list-stack">${externalItems.map(renderReadinessItem).join("")}</div>
    </section>
    <section class="panel">
      <h2>仍在收尾</h2>
      <div class="list-stack">${pendingItems.map(renderReadinessItem).join("")}</div>
    </section>
  `;

  const aside = `
    <section class="panel">
      <h2>各站完成度</h2>
      <p>用每個網站目前的真實設定，快速看出哪一段已可用、哪一段還差外部設定。</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>網站</th>
              <th>主流程</th>
              <th>自動化</th>
              <th>排名</th>
              <th>發布／建置</th>
            </tr>
          </thead>
          <tbody>${siteRows}</tbody>
        </table>
      </div>
    </section>
    <section class="panel">
      <h2>下一步建議</h2>
      <div class="detail-list">
        <p>1. 先補齊 GSC secrets，讓排名同步真的可用。</p>
        <p>2. 若某站需要 build-sync，自站點頁補 deploy hook 或 token。</p>
        <p>3. 最後再把模板頁抽成可編輯 Prompt 模板，讓擴站更省事。</p>
      </div>
    </section>
  `;

  return renderPageLayout(context, {
    activeNav: "readiness",
    title: "完成度",
    subtitle: "把中控台目前哪些已完成、哪些待補設定、哪些還在收尾，一次整理清楚。",
    content,
    aside
  });
}

function renderSitesPage(context: AdminContext) {
  const rows = context.sites.length
    ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>名稱</th>
              <th>網域</th>
              <th>站點類型</th>
              <th>發布方式</th>
              <th>自動化</th>
              <th>更新時間</th>
            </tr>
          </thead>
          <tbody>
            ${context.sites
              .map((entry) => {
                const summary = summarizeSite(entry);
                return `
                  <tr>
                    <td>${siteSlug(entry.site)}</td>
                    <td>${escapeHtml(entry.site.canonicalUrl)}</td>
                    <td>${escapeHtml(displaySiteType(entry.site.siteType))}</td>
                    <td>${renderBadge(displayPublishMode(entry.site.publishMode), "neutral")}</td>
                    <td>${renderBadge(automationLabel(entry), automationTone(entry))}</td>
                    <td>${escapeHtml(formatDate(entry.state?.settings.lastPublishedAt ?? entry.state?.lastAudit?.createdAt ?? null))}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `
    : renderEmptyState("請使用右側表單新增第一個管理網站。");

  const connectorOptions = context.connectors
    .map(
      (item) =>
        `<option value="${escapeHtml(item.connectorName)}">${escapeHtml(`${displayConnectorLabel(item.connectorName)} · ${displayPublishMode(item.publishMode)}`)}</option>`
    )
    .join("");

  const content = `
    <section class="panel">
      <h2>管理網站</h2>
      <p>所有已註冊網站都會統一成同一套中控台資料、連接器與每站 SEO 狀態。</p>
      ${rows}
    </section>
  `;

  const aside = `
    <section class="panel">
      <h2>新增網站</h2>
      <p>直接把新網站寫進 D1，之後擴站不用先手動改 manifest。</p>
      <form class="form-grid" data-api-form="/api/sites" data-method="POST" data-success-message="網站已儲存。" data-reset-on-success="true">
        <div class="field-grid">
          <label>網站 ID<input name="id" placeholder="my-site" required /></label>
          <label>網站名稱<input name="label" placeholder="我的網站" required /></label>
          <label>正式網址<input name="canonicalUrl" placeholder="https://example.com" required /></label>
          <label>主要語言<input name="primaryLanguage" value="zh-TW" /></label>
          <label>站點類型
            <select name="siteType">
              <option value="brand_local_seo">在地品牌 SEO</option>
              <option value="programmatic_seo_tools">程式化工具 SEO</option>
              <option value="platform_with_embedded_seo">平台內建 SEO</option>
              <option value="workflow_module_source">工作流程模組來源</option>
            </select>
          </label>
          <label>發布方式
            <select name="publishMode">
              <option value="kv_runtime">即時文章發布</option>
              <option value="d1_override">結構化覆寫</option>
              <option value="api_feed_build_sync">API 資料源建置同步</option>
              <option value="workflow_module_source">工作流程模組來源</option>
            </select>
          </label>
          <label>連接器類型
            <select name="connectorName">${connectorOptions}</select>
          </label>
          <label>排序優先度<input name="migrationPriority" type="number" min="1" value="${escapeHtml(context.sites.length + 1)}" /></label>
        </div>
        <label>來源專案路徑<input name="sourceProjectPath" placeholder="manual://my-site" /></label>
        <button class="action-button" type="submit">建立管理網站</button>
      </form>
    </section>
  `;

  return renderPageLayout(context, {
    activeNav: "sites",
    title: "網站",
    subtitle: "集中管理所有網站設定、connector 模式與 onboarding 狀態。",
    content,
    aside
  });
}

function renderSiteDetail(context: AdminContext, siteId: string) {
  const entry = context.sites.find((item) => item.site.id === siteId);
  if (!entry) {
    return notFound(`/sites/${siteId}`);
  }

  const state = entry.state;
  const connectorDefinition = context.connectors.find((item) => item.connectorName === entry.site.connectorName) ?? null;
  const summary = summarizeSite(entry);
  const buildSync = state?.buildSync;
  const latestAudit = state?.lastAudit;
  const structuredOverrides = state?.structuredOverrides ?? [];
  const repairs = state?.repairs ?? [];
  const donorModules = listWorkflowModulesBySourceSite(siteId);

  const recentJobs = state?.jobs.length
    ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>任務類型</th>
              <th>狀態</th>
              <th>觸發方式</th>
              <th>開始時間</th>
            </tr>
          </thead>
          <tbody>
            ${state.jobs
              .slice(0, 6)
              .map(
                (job) => `
                  <tr>
                    <td>${escapeHtml(displayJobType(job.jobType))}</td>
                    <td>${renderBadge(displayStatus(job.status), statusTone(job.status))}</td>
                    <td>${escapeHtml(displayTriggerSource(job.triggerSource))}</td>
                    <td>${escapeHtml(formatDate(job.startedAt ?? job.createdAt))}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `
    : renderEmptyState("這個網站目前尚未記錄任何任務。");

  const keywords = state?.topics.length
    ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>關鍵字</th>
              <th>網址代稱</th>
              <th>分類</th>
              <th>更新時間</th>
            </tr>
          </thead>
          <tbody>
            ${state.topics
              .slice(0, 8)
              .map(
                (topic) => `
                  <tr>
                    <td>
                      <div>${escapeHtml(topic.focusKeyword)}</div>
                      <div class="micro-copy">${escapeHtml(topic.title)}</div>
                    </td>
                    <td>${escapeHtml(topic.slug)}</td>
                    <td>${escapeHtml(topic.category || "未分類")}</td>
                    <td>${escapeHtml(formatDate(topic.updatedAt))}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `
    : renderEmptyState("這個網站尚未儲存任何主題種子。");

  const auditPanel = latestAudit
    ? `
      <div class="detail-list">
        <div class="chip-row">
          ${renderBadge(`${latestAudit.summary.okTargets} 個正常`, "good")}
          ${renderBadge(`${latestAudit.summary.warningTargets} 個警告`, latestAudit.summary.warningTargets > 0 ? "warn" : "neutral")}
          ${renderBadge(`${latestAudit.summary.failingTargets} 個失敗`, latestAudit.summary.failingTargets > 0 ? "bad" : "neutral")}
        </div>
        <p>最近執行：${escapeHtml(formatDate(latestAudit.createdAt))}</p>
        ${
          latestAudit.issues.length
            ? `<div class="list-stack">
                ${latestAudit.issues.slice(0, 8).map(
                  (issue) => `
                    <article class="log-row">
                      <header>
                        <strong>${escapeHtml(issue.label)}</strong>
                        ${renderBadge(issue.severity, statusTone(issue.severity))}
                      </header>
                      <div class="micro-copy">${escapeHtml(issue.path)}</div>
                      <div>${escapeHtml(issue.message)}</div>
                    </article>
                  `
                ).join("")}
              </div>`
            : renderEmptyState("最近一次巡檢沒有記錄到問題。")
        }
      </div>
    `
    : renderEmptyState("這個網站尚未記錄任何巡檢結果。");

  const structuredOverridesPanel = structuredOverrides.length
    ? `
      <div class="list-stack">
        ${structuredOverrides
          .slice(0, 16)
          .map(
            (item) => `
              <article class="log-row">
                <header>
                  <strong>${escapeHtml(item.title || item.heading || item.entityKey)}</strong>
                  ${renderBadge(item.entityType, "neutral")}
                </header>
                <div class="micro-copy">${escapeHtml(`${item.routePath} · 最近更新 ${formatDate(item.updatedAt)}`)}</div>
                <div class="chip-row">
                  ${renderBadge(`鍵值：${item.entityKey}`, "neutral")}
                  ${item.updatedBy ? renderBadge(`更新者：${item.updatedBy}`, "neutral") : ""}
                </div>
                <div class="micro-copy">${escapeHtml(item.description || item.intro || "這個覆寫項目目前沒有摘要。")}</div>
                <div class="action-row">
                  <button
                    class="action-button action-button--secondary"
                    type="button"
                    data-api-action="DELETE"
                    data-api-path="/api/sites/${escapeHtml(siteId)}/seo/structured-overrides/${encodeURIComponent(item.entityType)}/${encodeURIComponent(item.entityKey)}"
                    data-success-message="覆寫項目已刪除。"
                    data-confirm="確定要刪除 ${escapeHtml(item.entityKey)} 這筆覆寫嗎？"
                  >刪除覆寫</button>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    `
    : renderEmptyState("這個網站目前沒有結構化覆寫項目。");

  const repairsPanel = repairs.length
    ? `
      <div class="list-stack">
        ${repairs
          .slice(0, 16)
          .map(
            (item) => `
              <article class="log-row">
                <header>
                  <strong>${escapeHtml(item.title || item.path)}</strong>
                  ${renderBadge(displayStatus(item.status), statusTone(item.status))}
                </header>
                <div class="micro-copy">${escapeHtml(`${item.path} · ${formatDate(item.createdAt)}`)}</div>
                <div class="chip-row">
                  ${renderBadge(item.applyMode === "structured_override" ? "結構化覆寫" : "文章修復", "neutral")}
                  ${item.model ? renderBadge(item.model, "neutral") : ""}
                  ${item.issueSummary.slice(0, 3).map((issue) => renderBadge(issue, "warn")).join("")}
                </div>
                <div>${escapeHtml(item.summary)}</div>
                <div class="action-row">
                  ${
                    item.status === "draft"
                      ? `<button class="action-button action-button--secondary" type="button" data-api-action="POST" data-api-path="/api/sites/${escapeHtml(siteId)}/seo/repairs/${encodeURIComponent(item.id)}/apply" data-success-message="修復已套用。">套用修復</button>`
                      : `<span class="micro-copy">已於 ${escapeHtml(formatDate(item.appliedAt))} 套用</span>`
                  }
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    `
    : renderEmptyState("這個網站目前沒有待套用的 SEO 修復稿。");

  const actionButtons = [
    `<button class="action-button" type="button" data-api-action="POST" data-api-path="/api/sites/${escapeHtml(siteId)}/bootstrap" data-success-message="初始化完成。" data-confirm="現在要初始化 ${escapeHtml(entry.site.label)} 嗎？">初始化網站</button>`,
    connectorDefinition?.supportsTechnicalAudit
      ? `<button class="action-button" type="button" data-api-action="POST" data-api-path="/api/sites/${escapeHtml(siteId)}/seo/audit" data-success-message="巡檢已開始。">執行巡檢</button>`
      : "",
    connectorDefinition?.supportsDraftGeneration
      ? `<button class="action-button" type="button" data-api-action="POST" data-api-path="/api/sites/${escapeHtml(siteId)}/seo/content/generate" data-success-message="內容生成已開始。">生成內容</button>`
      : "",
    entry.site.publishMode !== "workflow_module_source"
      ? `<button class="action-button action-button--secondary" type="button" data-api-action="POST" data-api-path="/api/sites/${escapeHtml(siteId)}/seo/repairs/generate" data-success-message="SEO 修復稿已生成。">生成修復稿</button>`
      : "",
    connectorDefinition?.supportsBuildSync
      ? `<button class="action-button action-button--secondary" type="button" data-api-action="POST" data-api-path="/api/sites/${escapeHtml(siteId)}/seo/published/sync-feed" data-success-message="已開始同步發布內容。">同步發布內容</button>`
      : "",
    connectorDefinition?.supportsBuildSync
      ? `<button class="action-button action-button--secondary" type="button" data-api-action="POST" data-api-path="/api/sites/${escapeHtml(siteId)}/seo/build-sync/trigger" data-success-message="已觸發建置部署。">觸發建置部署</button>`
      : "",
    connectorDefinition?.supportsRankingSync
      ? `<button class="action-button action-button--secondary" type="button" data-api-action="POST" data-api-path="/api/sites/${escapeHtml(siteId)}/seo/ranking/sync" data-success-message="已開始同步排名。">同步排名</button>`
      : ""
  ]
    .filter(Boolean)
    .join("");

  const donorModulesPanel = donorModules.length
    ? `
      <section class="panel">
        <h2>工作流模組</h2>
        <p>這個網站目前提供給中控台重用的 SEO 模組。</p>
        <div class="list-stack">
          ${donorModules
            .map(
              (module) => `
                <article class="log-row">
                  <header>
                    <strong>${escapeHtml(module.label)}</strong>
                    ${renderBadge(displayWorkflowModuleCategory(module.category), "neutral")}
                  </header>
                  <div>${escapeHtml(module.summary)}</div>
                  <div class="chip-row">
                    ${module.capabilities.map((capability) => renderBadge(displayWorkflowCapability(capability), "neutral")).join("")}
                  </div>
                  <div class="micro-copy">${escapeHtml(module.sourceFilePath)}</div>
                </article>
              `
            )
            .join("")}
        </div>
      </section>
    `
    : "";

  const isWorkflowModuleSource = entry.site.publishMode === "workflow_module_source";
  const isFormalManagedSite = !isWorkflowModuleSource;
  const statusNotes = [
    isFormalManagedSite
      ? "這是正式管理站，已接入 AI SEO 中控台。"
      : "這個站點目前主要提供可重用工作流與 SOP，沒有正式站點排程。 ",
    isFormalManagedSite
      ? state?.settings.automationEnabled
        ? `自動化功能已導入，目前為啟用狀態，會依排程 ${state.settings.scheduleLocalTime}（${state.settings.scheduleTimezone}）自動執行。`
        : "自動化功能已導入，但目前為手動模式；打開排程後才會自動跑。"
      : "這個站點不需要啟用排程，模組會由其他正式站點重用。",
    state?.ranking.enabled
      ? state.ranking.ready
        ? "排名同步已啟用且已就緒，之後可直接由中控台同步 Search Console 排名。"
        : "排名同步已啟用，但尚未完成就緒設定，通常是憑證或網站授權還沒補齊。"
      : "排名同步尚未啟用，這不影響巡檢、修復與內容自動化。",
    connectorDefinition?.supportsBuildSync
      ? buildSync
        ? "這站目前已設定建置同步，可在生成內容後往下游建置或部署流程推送。"
        : "這站支援建置同步，但目前尚未設定部署目標或 webhook。"
      : "這站不使用建置同步，所以看到「不使用建置同步」是正常的。",
    donorModules.length > 0 && isFormalManagedSite
      ? `這站同時提供 ${donorModules.length} 個可重用工作流模組給其他網站使用；這不代表本站沒有導入自動化。`
      : null
  ]
    .filter((item): item is string => Boolean(item))
    .map((item) => `<p>${escapeHtml(item)}</p>`)
    .join("");

  const automationSettingsPanel =
    isWorkflowModuleSource
      ? `
        <section class="panel">
          <h2>自動化設定</h2>
          <p>這個站點目前被設成工作流程模組來源，主要提供巡檢、排名、修復等可重用模組給其他網站使用，所以這裡不需要啟用排程。</p>
          <div class="chip-row">${renderBadge("模組來源", "neutral")}</div>
        </section>
      `
      : `
        <section class="panel">
          <h2>自動化設定</h2>
          <p>${escapeHtml(donorModules.length > 0 ? "這是正式站的自動化開關；下方工作流模組只是提供其他網站重用，不代表本站未導入。" : "這裡控制「會不會自動跑」。關閉時仍可用左邊操作區手動執行。")}</p>
          <form class="form-grid" data-api-form="/api/sites/${escapeHtml(siteId)}/seo/settings" data-method="POST" data-success-message="自動化設定已儲存。">
            <label><input data-bool name="automationEnabled" type="checkbox" ${state?.settings.automationEnabled ? "checked" : ""} /> 啟用自動化排程</label>
            <label><input data-bool name="dailyAuditEnabled" type="checkbox" ${state?.settings.dailyAuditEnabled ? "checked" : ""} /> 排程自動巡檢</label>
            ${
              entry.site.publishMode === "kv_runtime"
                ? `
                  <label><input data-bool name="autoPublishEnabled" type="checkbox" ${state?.settings.autoPublishEnabled ? "checked" : ""} /> 自動生成並發布文章</label>
                  <p>這個開關只影響排程生成的內容；手動生成的草稿仍可先人工檢查後再發布。</p>
                `
                : ""
            }
            ${
              entry.site.publishMode === "api_feed_build_sync"
                ? `
                  <label><input data-bool name="autoQueueForSync" type="checkbox" ${state?.settings.autoQueueForSync ? "checked" : ""} /> 自動生成內容並加入同步佇列</label>
                  <label><input data-bool name="autoDeployEnabled" type="checkbox" ${state?.settings.autoDeployEnabled ? "checked" : ""} /> 自動觸發建置部署（需先設定 secret）</label>
                `
                : ""
            }
            ${
              entry.site.publishMode === "d1_override"
                ? `<p>工具站開啟自動化後，會依排程刷新結構化覆寫。</p>`
                : ""
            }
            <div class="field-grid">
              <label>本地時間<input name="scheduleLocalTime" value="${escapeHtml(state?.settings.scheduleLocalTime ?? "03:15")}" /></label>
              <label>時區<input name="scheduleTimezone" value="${escapeHtml(state?.settings.scheduleTimezone ?? "Asia/Taipei")}" /></label>
              <label>UTC 排程<input name="scheduleCronUtc" value="${escapeHtml(state?.settings.scheduleCronUtc ?? "15 19 * * *")}" /></label>
            </div>
            <button class="action-button" type="submit">儲存自動化設定</button>
          </form>
        </section>
      `;

  const content = `
    <section class="panel">
      <h2>一眼看懂目前狀態</h2>
      <div class="detail-list">${statusNotes}</div>
    </section>
    <section class="panel">
      <h2>網站總覽</h2>
      <div class="chip-row">
        ${renderBadge(displayPublishMode(entry.site.publishMode), "neutral")}
        ${renderBadge(displaySiteType(entry.site.siteType), "neutral")}
        ${renderBadge(summary.lastAuditLabel, summary.lastAuditTone)}
        ${renderBadge(summary.lastJobLabel, summary.lastJobTone)}
        ${renderBadge(summary.rankingReady ? "排名同步已就緒" : "排名同步未就緒", summary.rankingReady ? "good" : "warn")}
      </div>
      <div class="metrics-grid" style="margin-top:16px;">
        ${renderStat("主題", summary.topicsCount, "已追蹤的主題種子")}
        ${renderStat("草稿", summary.draftsCount, "目前儲存的草稿")}
        ${renderStat("已發布", summary.publishedCount, "已發布內容快照")}
        ${renderStat("覆寫", summary.structuredOverrideCount, "結構化覆寫項目")}
        ${renderStat("修復稿", summary.repairCount, "等待人工套用的 SEO 修復")}
        ${renderStat("自動化", automationLabel(entry), entry.site.publishMode === "workflow_module_source" ? "此站提供可重用模組" : "由 Cloudflare 排程控制")}
        ${renderStat("最近發布", formatDate(summary.lastPublishedAt), "最近一次成功發布時間")}
      </div>
    </section>
    <section class="panel">
      <h2>操作</h2>
      <p>${escapeHtml(entry.site.publishMode === "workflow_module_source" ? "這個站點是模組來源，主要用來提供可重用工作流與移植手冊。" : "直接從中控台觸發最常用的 SEO 工作流程。")}</p>
      <div class="action-row">${actionButtons || renderEmptyState("這個站點目前沒有可直接執行的 SEO 工作流。")}</div>
    </section>
    <section class="panel">
      <h2>最近任務</h2>
      <p>這個網站最近記錄到的操作任務。</p>
      ${recentJobs}
    </section>
    <section class="panel">
      <h2>最近巡檢</h2>
      <p>目前最新的技術 SEO 巡檢快照與問題清單。</p>
      ${auditPanel}
    </section>
    <section class="panel">
      <h2>SEO 修復</h2>
      <p>把最近巡檢的可修問題整理成修復稿，確認後可以直接套用到文章或結構化覆寫。</p>
      ${repairsPanel}
    </section>
    <section class="panel">
      <h2>關鍵字</h2>
      <p>這個網站目前可用的主題種子與主要關鍵字。</p>
      ${keywords}
    </section>
    ${
      connectorDefinition?.supportsStructuredOverrides
        ? `
          <section class="panel">
            <h2>結構化覆寫</h2>
            <p>適用於工具站或程式化 SEO 頁面，直接管理頁面標題、摘要與內容覆寫。</p>
            ${structuredOverridesPanel}
          </section>
        `
        : ""
    }
    ${donorModulesPanel}
  `;

  const aside = `
    <section class="panel">
      <h2>網站細節</h2>
      <div class="detail-list">
        <p>${escapeHtml(entry.site.canonicalUrl)}</p>
        <p>${escapeHtml(entry.site.sourceProjectPath)}</p>
        <div class="chip-row">
          ${renderBadge(isFormalManagedSite ? "正式管理站" : "模組來源站", isFormalManagedSite ? "good" : "neutral")}
          ${renderBadge(displayConnectorLabel(entry.site.connectorName), "neutral")}
          ${renderBadge(state?.ranking.enabled ? "排名同步已啟用" : "排名同步未啟用", state?.ranking.enabled ? "good" : "neutral")}
          ${
            connectorDefinition?.supportsBuildSync
              ? renderBadge(buildSync ? "建置同步已設定" : "建置同步未設定", buildSync ? "good" : "neutral")
              : renderBadge("不使用建置同步", "neutral")
          }
          ${donorModules.length > 0 ? renderBadge(`提供 ${donorModules.length} 個模組`, "neutral") : ""}
        </div>
      </div>
    </section>
    ${automationSettingsPanel}
    <section class="panel">
      <h2>排名設定</h2>
      <form class="form-grid" data-api-form="/api/sites/${escapeHtml(siteId)}/seo/ranking" data-method="POST" data-success-message="排名設定已儲存。">
        <label><input data-bool name="enabled" type="checkbox" ${state?.ranking.enabled ? "checked" : ""} /> 啟用 Google Search Console 同步</label>
        <label>網站網址<input name="siteUrl" value="${escapeHtml(state?.ranking.siteUrl ?? entry.site.canonicalUrl)}" required /></label>
        <button class="action-button" type="submit">儲存排名設定</button>
      </form>
      <p>就緒狀態：${escapeHtml(state?.ranking.ready ? "是" : "否")}</p>
      <p>${escapeHtml(state?.ranking.enabled ? "如果就緒狀態仍是否，通常表示 Search Console 憑證或權限還沒補齊。" : "這裡沒開不會影響網站自動巡檢或自動發文，只是暫時不抓排名資料。")}</p>
      <div class="chip-row">
        ${renderBadge(state?.ranking.hasCredentials ? "Cloudflare 憑證已設定" : "Cloudflare 憑證未設定", state?.ranking.hasCredentials ? "good" : "warn")}
        ${renderBadge(state?.ranking.serviceAccountEmail ? "已找到 service account" : "尚未設定 service account", state?.ranking.serviceAccountEmail ? "good" : "warn")}
      </div>
      ${
        state?.ranking.serviceAccountEmail
          ? `<p>目前 service account：${escapeHtml(state.ranking.serviceAccountEmail)}</p>`
          : `<p>目前尚未從 Cloudflare Worker 讀到 Google service account email。</p>`
      }
      ${
        state?.ranking.missingPrerequisites.length
          ? `
            <div class="detail-list">
              <p><strong>目前缺少的條件</strong></p>
              ${state.ranking.missingPrerequisites.map((item) => `<p>${escapeHtml(displayRankingPrerequisite(item))}</p>`).join("")}
            </div>
          `
          : `<p>目前缺少的條件：沒有，已可執行排名同步。</p>`
      }
      <div class="detail-list">
        <p><strong>啟用步驟</strong></p>
        <p>1. 在 Cloudflare Worker 設定 <code>GSC_SERVICE_ACCOUNT_EMAIL</code> 與 <code>GSC_SERVICE_ACCOUNT_PRIVATE_KEY</code>。</p>
        <p>2. 把該 Google service account 加到你的正式網站 Search Console property。</p>
        <p>3. 回到這裡打開「啟用 Google Search Console 同步」，再按「同步排名」。</p>
      </div>
    </section>
    ${
      connectorDefinition?.supportsStructuredOverrides
        ? `
          <section class="panel">
            <h2>新增覆寫項目</h2>
            <p>使用既有的結構化覆寫 API 建立或更新單一頁面覆寫。</p>
            <form class="form-grid" data-api-form="/api/sites/${escapeHtml(siteId)}/seo/structured-overrides" data-method="POST" data-success-message="覆寫項目已儲存。">
              <div class="field-grid">
                <label>實體類型<input name="entityType" placeholder="calculator" required /></label>
                <label>實體鍵值<input name="entityKey" placeholder="bmi-calculator" required /></label>
                <label>路由路徑<input name="routePath" placeholder="/calculators/bmi-calculator" required /></label>
                <label>更新者<input name="updatedBy" value="admin-ui" /></label>
              </div>
              <label>標題<input name="title" placeholder="頁面 SEO 標題" /></label>
              <label>描述<input name="description" placeholder="頁面描述" /></label>
              <label>主標題<input name="heading" placeholder="頁面 H1" /></label>
              <label>前言<textarea name="intro" placeholder="頁面前言"></textarea></label>
              <label>主內容<textarea name="content" placeholder="頁面主要內容"></textarea></label>
              <button class="action-button" type="submit">儲存覆寫項目</button>
            </form>
          </section>
        `
        : ""
    }
    <section class="panel">
      <h2>建置同步</h2>
      ${
        connectorDefinition?.supportsBuildSync
          ? `
            <form class="form-grid" data-api-form="/api/sites/${escapeHtml(siteId)}/seo/build-sync" data-method="POST" data-success-message="建置同步設定已儲存。">
              <div class="field-grid">
                <label>服務類型
                  <select name="provider">
                    <option value="github-actions-repository-dispatch" ${(buildSync?.provider ?? "") === "github-actions-repository-dispatch" ? "selected" : ""}>GitHub Actions 觸發部署</option>
                    <option value="cloudflare-pages-deploy-hook" ${(buildSync?.provider ?? "") === "cloudflare-pages-deploy-hook" ? "selected" : ""}>Cloudflare Pages 部署鉤子</option>
                  </select>
                </label>
                <label>設定名稱<input name="label" value="${escapeHtml(buildSync?.label ?? `${entry.site.label} 建置同步`)}" required /></label>
              </div>
              <label>公開資料源網址<input name="publicFeedUrl" value="${escapeHtml(buildSync?.publicFeedUrl ?? `${entry.site.canonicalUrl.replace(/\/$/, "")}/api/seo/published-content`)}" required /></label>
              <div class="field-grid">
                <label>同步腳本路徑<input name="syncScriptPath" value="${escapeHtml(buildSync?.syncScriptPath ?? "")}" /></label>
                <label>輸出資料夾<input name="outputDirectory" value="${escapeHtml(buildSync?.outputDirectory ?? "")}" /></label>
                <label>部署目標<input name="deployTarget" value="${escapeHtml(buildSync?.deployTarget ?? "")}" /></label>
                <label>部署程式庫<input name="deployRepository" value="${escapeHtml(buildSync?.deployRepository ?? "")}" /></label>
                <label>部署分支<input name="deployBranch" value="${escapeHtml(buildSync?.deployBranch ?? "")}" /></label>
                <label>部署事件類型<input name="deployEventType" value="${escapeHtml(buildSync?.deployEventType ?? "")}" /></label>
                <label>鉤子密鑰名稱<input name="deployHookSecretName" value="${escapeHtml(buildSync?.deployHookSecretName ?? "")}" /></label>
                <label>單篇網址模板<input name="publicSingleUrlTemplate" value="${escapeHtml(buildSync?.publicSingleUrlTemplate ?? "")}" /></label>
              </div>
              <input name="syncMode" type="hidden" value="build-time-api-sync" />
              <input name="publicFeedFormat" type="hidden" value="json" />
              <button class="action-button" type="submit">儲存建置同步設定</button>
            </form>
          `
          : renderEmptyState("這個連接器不使用建置同步發布。")
      }
    </section>
  `;

  return renderPageLayout(context, {
    activeNav: "sites",
    title: entry.site.label,
    subtitle: `${entry.site.id} 的網站詳情。連接器：${displayConnectorLabel(entry.site.connectorName)}，發布方式：${displayPublishMode(entry.site.publishMode)}。`,
    content,
    aside
  });
}

function renderKeywordsPage(context: AdminContext) {
  const keywords = flattenKeywords(context.sites);
  const content = keywords.length
    ? `
      <section class="panel">
        <h2>關鍵字</h2>
        <p>由所有管理網站的主題種子整理出的關鍵字池。</p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>關鍵字</th>
                <th>網站</th>
                <th>搜尋意圖</th>
                <th>分類</th>
                <th>更新時間</th>
              </tr>
            </thead>
            <tbody>
              ${keywords
                .slice(0, 60)
                .map(
                  ({ site, item }) => `
                    <tr>
                      <td>
                        <div>${escapeHtml(item.focusKeyword)}</div>
                        <div class="micro-copy">${escapeHtml(item.title)}</div>
                      </td>
                      <td>${siteSlug(site)}</td>
                      <td>${escapeHtml(item.searchIntent || "未指定")}</td>
                      <td>${escapeHtml(item.category || "未分類")}</td>
                      <td>${escapeHtml(formatDate(item.updatedAt))}</td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>
    `
    : `<section class="panel"><h2>關鍵字</h2>${renderEmptyState("網站初始化後，關鍵字清單會顯示在這裡。")}</section>`;

  return renderPageLayout(context, {
    activeNav: "keywords",
    title: "關鍵字",
    subtitle: "管理所有網站的關鍵字池與主題種子。",
    content
  });
}

function renderTemplatesPage(context: AdminContext) {
  const connectorRows = context.connectors
    .map(
      (connector) => `
        <tr>
          <td>
            <div>${escapeHtml(displayConnectorLabel(connector.connectorName))}</div>
            <div class="micro-copy">${escapeHtml(connector.connectorName)}</div>
          </td>
          <td>${escapeHtml(displayPublishMode(connector.publishMode))}</td>
          <td>${renderBadge(connector.supportsTechnicalAudit ? "支援巡檢" : "不支援巡檢", connector.supportsTechnicalAudit ? "good" : "neutral")}</td>
          <td>${escapeHtml(connectorSummary(connector.connectorName))}</td>
        </tr>
      `
    )
    .join("");

  const workflowModuleRows = context.workflowModules
    .map(
      (module) => `
        <tr>
          <td>
            <div>${escapeHtml(module.label)}</div>
            <div class="micro-copy">${escapeHtml(module.id)}</div>
          </td>
          <td>
            <div>${escapeHtml(module.sourceSiteLabel)}</div>
            <div class="micro-copy">${escapeHtml(module.sourceFilePath)}</div>
          </td>
          <td>${renderBadge(displayWorkflowModuleCategory(module.category), "neutral")}</td>
          <td>
            <div class="chip-row">
              ${module.capabilities.map((capability) => renderBadge(displayWorkflowCapability(capability), "neutral")).join("")}
            </div>
          </td>
          <td>${escapeHtml(module.summary)}</td>
        </tr>
      `
    )
    .join("");

  const modelBadges = context.models.map((model) => renderBadge(model.id, "neutral")).join("");

  const content = `
    <section class="panel">
      <h2>模板</h2>
      <p>目前先以連接器定義作為模板層，之後再逐步抽成可編輯的 Prompt 模板。</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>模板來源</th>
              <th>發布方式</th>
              <th>巡檢</th>
              <th>說明</th>
            </tr>
          </thead>
          <tbody>${connectorRows}</tbody>
        </table>
      </div>
    </section>
    <section class="panel">
      <h2>工作流模組</h2>
      <p>目前把像 Runtime Demo 這種已驗證過的 SEO 流程抽成可查詢模組庫，方便後續把巡檢、排名、草稿與修復流程重用到更多網站。</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>模組</th>
              <th>來源</th>
              <th>類型</th>
              <th>能力</th>
              <th>說明</th>
            </tr>
          </thead>
          <tbody>${workflowModuleRows}</tbody>
        </table>
      </div>
    </section>
  `;

  const aside = `
    <section class="panel">
      <h2>SEO 模型</h2>
      <div class="chip-row">${modelBadges}</div>
    </section>
    <section class="panel">
      <h2>模組來源摘要</h2>
      <div class="list-stack">
        ${Array.from(new Set(context.workflowModules.map((item) => item.sourceSiteLabel)))
          .map(
            (sourceLabel) => `
              <article class="log-row">
                <header>
                  <strong>${escapeHtml(sourceLabel)}</strong>
                  ${renderBadge(`${context.workflowModules.filter((item) => item.sourceSiteLabel === sourceLabel).length} 個模組`, "neutral")}
                </header>
                <div class="micro-copy">工作流程模組可先作為 connector / SOP / 後續可編輯模板的來源。</div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;

  return renderPageLayout(context, {
    activeNav: "templates",
    title: "模板",
    subtitle: "目前以連接器定義、工作流模組庫與 SEO 模型清單當作模板層，方便後續抽象成可編輯模板。",
    content,
    aside
  });
}

function renderJobsPage(context: AdminContext) {
  const jobs = flattenJobs(context.sites);
  const content = jobs.length
    ? `
      <section class="panel">
        <h2>任務</h2>
        <p>所有技術巡檢、發布內容同步與排名同步的任務紀錄。</p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>網站</th>
                <th>任務類型</th>
                <th>狀態</th>
                <th>觸發方式</th>
                <th>開始時間</th>
                <th>完成時間</th>
              </tr>
            </thead>
            <tbody>
              ${jobs
                .slice(0, 80)
                .map(
                  ({ site, job }) => `
                    <tr>
                      <td>${siteSlug(site)}</td>
                      <td>${escapeHtml(displayJobType(job.jobType))}</td>
                      <td>${renderBadge(displayStatus(job.status), statusTone(job.status))}</td>
                      <td>${escapeHtml(displayTriggerSource(job.triggerSource))}</td>
                      <td>${escapeHtml(formatDate(job.startedAt ?? job.createdAt))}</td>
                      <td>${escapeHtml(formatDate(job.finishedAt))}</td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>
    `
    : `<section class="panel"><h2>任務</h2>${renderEmptyState("目前尚未追蹤任何任務。")}</section>`;

  return renderPageLayout(context, {
    activeNav: "jobs",
    title: "任務",
    subtitle: "追蹤所有 AI 生成、巡檢、同步與排程任務。",
    content
  });
}

function renderContentsPage(context: AdminContext) {
  const published = flattenPublished(context.sites);
  const draftRows = context.sites.flatMap((entry) =>
    (entry.state?.drafts ?? []).map((draft) => ({ site: entry.site, draft }))
  );

  const publishedPanel = published.length
    ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>標題</th>
              <th>網站</th>
              <th>狀態</th>
              <th>發布時間</th>
            </tr>
          </thead>
          <tbody>
            ${published
              .slice(0, 40)
              .map(
                ({ site, item }) => `
                  <tr>
                    <td>
                      <div>${escapeHtml(item.title)}</div>
                      <div class="micro-copy">${escapeHtml(item.slug)}</div>
                    </td>
                    <td>${siteSlug(site)}</td>
                    <td>${renderBadge(displayStatus(item.syncStatus), statusTone(item.syncStatus))}</td>
                    <td>${escapeHtml(formatDate(item.publishedAt))}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `
    : renderEmptyState("目前尚未有已發布內容。");

  const draftPanel = draftRows.length
    ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>草稿</th>
              <th>網站</th>
              <th>狀態</th>
              <th>更新時間</th>
            </tr>
          </thead>
          <tbody>
            ${draftRows
              .slice(0, 40)
              .map(
                ({ site, draft }) => `
                  <tr>
                    <td>
                      <div>${escapeHtml(draft.title)}</div>
                      <div class="micro-copy">${escapeHtml(draft.slug)}</div>
                    </td>
                    <td>${siteSlug(site)}</td>
                    <td>${renderBadge(displayStatus(draft.status), statusTone(draft.status))}</td>
                    <td>${escapeHtml(formatDate(draft.updatedAt))}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `
    : renderEmptyState("目前尚未儲存任何草稿。");

  const content = `
    <section class="panel">
      <h2>已發布</h2>
      <p>已同步到中控台的發布內容快照。</p>
      ${publishedPanel}
    </section>
    <section class="panel">
      <h2>草稿</h2>
      <p>目前各管理網站可用的草稿紀錄。</p>
      ${draftPanel}
    </section>
  `;

  return renderPageLayout(context, {
    activeNav: "contents",
    title: "內容",
    subtitle: "集中檢視草稿、已發布內容與同步狀態。",
    content
  });
}

function renderLogsPage(context: AdminContext) {
  const jobs = flattenJobs(context.sites);
  const auditIssues = context.sites.flatMap((entry) =>
    (entry.state?.lastAudit?.issues ?? []).map((issue) => ({ site: entry.site, issue }))
  );

  const jobEventRows = jobs.flatMap(({ site, job }) =>
    job.events.map((event) => ({ site, job, event }))
  );

  const content = `
    <section class="panel">
      <h2>最近任務事件</h2>
      ${
        jobEventRows.length
          ? `<div class="list-stack">
              ${jobEventRows
                .slice(0, 20)
                .map(
                  ({ site, job, event }) => `
                    <article class="log-row">
                      <header>
                        <strong>${escapeHtml(displayEventType(event.eventType))}</strong>
                        ${renderBadge(displayStatus(job.status), statusTone(job.status))}
                      </header>
                      <div class="micro-copy">${escapeHtml(`${site.label} · ${displayJobType(job.jobType)} · ${formatDate(event.createdAt)}`)}</div>
                      <div>${escapeHtml(event.message)}</div>
                    </article>
                  `
                )
                .join("")}
            </div>`
          : renderEmptyState("目前尚未記錄任何任務事件。")
      }
    </section>
    <section class="panel">
      <h2>最新巡檢問題</h2>
      ${
        auditIssues.length
          ? `<div class="list-stack">
              ${auditIssues
                .slice(0, 20)
                .map(
                  ({ site, issue }) => `
                    <article class="log-row">
                      <header>
                        <strong>${escapeHtml(issue.label)}</strong>
                        ${renderBadge(displayStatus(issue.severity), statusTone(issue.severity))}
                      </header>
                      <div class="micro-copy">${escapeHtml(`${site.label} · ${issue.path}`)}</div>
                      <div>${escapeHtml(issue.message)}</div>
                    </article>
                  `
                )
                .join("")}
            </div>`
          : renderEmptyState("目前尚未儲存任何巡檢問題。")
      }
    </section>
  `;

  return renderPageLayout(context, {
    activeNav: "logs",
    title: "紀錄",
    subtitle: "彙整最近的任務事件與最新巡檢問題。",
    content
  });
}

function renderSchedulesPage(context: AdminContext) {
  const content = `
    <section class="panel">
      <h2>排程</h2>
      <p>每個管理網站的自動化節奏、cron 設定與目前啟用狀態。</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>網站</th>
              <th>自動化</th>
              <th>本地時間</th>
              <th>時區</th>
              <th>排程（UTC）</th>
            </tr>
          </thead>
          <tbody>
            ${context.sites
              .map(
                (entry) => `
                  <tr>
                    <td>${siteSlug(entry.site)}</td>
                    <td>${renderBadge(automationLabel(entry), automationTone(entry))}</td>
                    <td>${escapeHtml(entry.state?.settings.scheduleLocalTime ?? "03:15")}</td>
                    <td>${escapeHtml(entry.state?.settings.scheduleTimezone ?? "Asia/Taipei")}</td>
                    <td>${escapeHtml(entry.state?.settings.scheduleCronUtc ?? "15 19 * * *")}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;

  return renderPageLayout(context, {
    activeNav: "schedules",
    title: "排程",
    subtitle: "排程層目前以每站設定與 Cloudflare 排程處理器為主。",
    content
  });
}

function renderSettingsPage(context: AdminContext) {
  const capabilityBadges = Object.entries(controlPlaneCapabilities)
    .map(([key, value]) => renderBadge(displayCapability(key, value), value === true ? "good" : "neutral"))
    .join("");

  const content = `
    <section class="panel">
      <h2>系統設定</h2>
      <p>中控台的部署環境、資料來源、連接器與模型清單。</p>
      <div class="detail-list">
        <p>環境：${escapeHtml(displayEnvironment(context.environment))}</p>
        <p>D1 狀態：${escapeHtml(context.database.connected ? "已連線" : context.database.error ?? "未連線")}</p>
        <p>主幹來源：${escapeHtml(context.mainlineSource.projectPath)}</p>
      </div>
    </section>
    <section class="panel">
      <h2>支援能力</h2>
      <div class="chip-row">${capabilityBadges}</div>
    </section>
  `;

  const aside = `
    <section class="panel">
      <h2>連接器</h2>
      <div class="list-stack">
        ${context.connectors
          .map(
            (connector) => `
              <article class="log-row">
                <header>
                  <strong>${escapeHtml(displayConnectorLabel(connector.connectorName))}</strong>
                  ${renderBadge(displayPublishMode(connector.publishMode), "neutral")}
                </header>
                <div>${escapeHtml(connectorSummary(connector.connectorName))}</div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;

  return renderPageLayout(context, {
    activeNav: "settings",
    title: "設定",
    subtitle: "系統層設定、connector registry 與目前可用能力總覽。",
    content,
    aside
  });
}

export async function buildControlPlaneOverview(env: Cloudflare.Env) {
  const database = await getDatabaseHealth(env);
  const sites = await listManagedSitesForRequest(env);
  const workflowModules = listWorkflowModules();

  return {
    ok: true,
    app: env.APP_NAME ?? "AI SEO Control",
    environment: env.APP_ENV ?? "production",
    deploymentTarget: "cloudflare-workers",
    cloudflareFirst: true,
    extensibleSiteOnboarding: true,
    database,
    mainlineSource: getMainlineSource(),
    managedSiteCount: sites.length,
    workflowModuleCount: workflowModules.length,
    publishModes: listSupportedPublishModes()
  };
}

export async function handleAdminRequest(request: Request, env: Cloudflare.Env) {
  if (request.method !== "GET") {
    return null;
  }

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/") || url.pathname === "/healthz") {
    return null;
  }

  const context = await loadAdminContext(env);

  if (url.pathname === "/") {
    return renderDashboard(context);
  }

  if (url.pathname === "/sites") {
    return renderSitesPage(context);
  }

  if (url.pathname === "/readiness") {
    return renderReadinessPage(context);
  }

  const siteMatch = url.pathname.match(/^\/sites\/([^/]+)$/);
  if (siteMatch) {
    return renderSiteDetail(context, decodeURIComponent(siteMatch[1]));
  }

  if (url.pathname === "/keywords") {
    return renderKeywordsPage(context);
  }

  if (url.pathname === "/templates") {
    return renderTemplatesPage(context);
  }

  if (url.pathname === "/jobs") {
    return renderJobsPage(context);
  }

  if (url.pathname === "/contents") {
    return renderContentsPage(context);
  }

  if (url.pathname === "/logs") {
    return renderLogsPage(context);
  }

  if (url.pathname === "/schedules") {
    return renderSchedulesPage(context);
  }

  if (url.pathname === "/settings") {
    return renderSettingsPage(context);
  }

  return notFound(url.pathname);
}
