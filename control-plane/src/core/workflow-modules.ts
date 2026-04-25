export type WorkflowModuleCapability =
  | "technical_audit"
  | "draft_generation"
  | "manual_publish_review"
  | "ranking_sync"
  | "repair_workflow"
  | "cloudflare_cron"
  | "operator_playbook";

export type WorkflowModuleDefinition = {
  id: string;
  label: string;
  sourceSiteId: string;
  sourceSiteLabel: string;
  category: "engine" | "workflow" | "playbook";
  summary: string;
  capabilities: WorkflowModuleCapability[];
  sourceProjectPath: string;
  sourceFilePath: string;
  intendedSiteTypes: string[];
  adoptionNotes: string[];
};

const RUNTIME_SOURCE_ROOT = "/workspace/examples/runtime-app";

export const workflowModules: WorkflowModuleDefinition[] = [
  {
    id: "runtime-demo-seo-audit-engine",
    label: "Runtime Demo 技術 SEO 巡檢",
    sourceSiteId: "demo-runtime-site",
    sourceSiteLabel: "Runtime Demo",
    category: "engine",
    summary: "抽出公開頁、保護頁、robots、sitemap 的日常 SEO 巡檢流程，適合作為多站共用引擎。",
    capabilities: ["technical_audit", "cloudflare_cron"],
    sourceProjectPath: RUNTIME_SOURCE_ROOT,
    sourceFilePath: `${RUNTIME_SOURCE_ROOT}/src/lib/seo-audit.ts`,
    intendedSiteTypes: ["brand_local_seo", "programmatic_seo_tools", "platform_with_embedded_seo"],
    adoptionNotes: [
      "適合先接進所有有公開頁的 managed site。",
      "保留 Cloudflare Cron 與後台手動重跑兩條入口。"
    ]
  },
  {
    id: "runtime-demo-seo-draft-publish",
    label: "Runtime Demo AI 草稿與發布流程",
    sourceSiteId: "demo-runtime-site",
    sourceSiteLabel: "Runtime Demo",
    category: "workflow",
    summary: "把草稿生成、人工審核、手動發布與排程自動發布整理成可移植工作流。",
    capabilities: ["draft_generation", "manual_publish_review", "cloudflare_cron"],
    sourceProjectPath: RUNTIME_SOURCE_ROOT,
    sourceFilePath: `${RUNTIME_SOURCE_ROOT}/src/lib/seo-content.ts`,
    intendedSiteTypes: ["brand_local_seo", "platform_with_embedded_seo"],
    adoptionNotes: [
      "適合內容型網站或品牌站採用。",
      "若站點走 feed/build 模式，可只重用草稿結構與發布節點。"
    ]
  },
  {
    id: "runtime-demo-search-console-ranking",
    label: "Runtime Demo 排名同步",
    sourceSiteId: "demo-runtime-site",
    sourceSiteLabel: "Runtime Demo",
    category: "engine",
    summary: "封裝 Search Console 排名追蹤、窗口比較與快照整理，適合作為多站統一模組。",
    capabilities: ["ranking_sync", "cloudflare_cron"],
    sourceProjectPath: RUNTIME_SOURCE_ROOT,
    sourceFilePath: `${RUNTIME_SOURCE_ROOT}/src/lib/seo-ranking.ts`,
    intendedSiteTypes: ["brand_local_seo", "programmatic_seo_tools", "platform_with_embedded_seo"],
    adoptionNotes: [
      "需要搭配 GSC service account secrets。",
      "可作為 control plane 的統一 ranking engine。"
    ]
  },
  {
    id: "runtime-demo-seo-repair-loop",
    label: "Runtime Demo SEO 修復流程",
    sourceSiteId: "demo-runtime-site",
    sourceSiteLabel: "Runtime Demo",
    category: "workflow",
    summary: "把 audit 後的修復草稿、套用、重跑檢查串成可重用的維運閉環。",
    capabilities: ["repair_workflow", "technical_audit"],
    sourceProjectPath: RUNTIME_SOURCE_ROOT,
    sourceFilePath: `${RUNTIME_SOURCE_ROOT}/src/lib/seo-repair.ts`,
    intendedSiteTypes: ["brand_local_seo", "platform_with_embedded_seo"],
    adoptionNotes: [
      "適合把中控台從『發現問題』推進到『協助修正問題』。",
      "可跟 technical audit engine 串成同一個運維閉環。"
    ]
  },
  {
    id: "runtime-demo-seo-admin-playbook",
    label: "Runtime Demo SEO 後台移植手冊",
    sourceSiteId: "demo-runtime-site",
    sourceSiteLabel: "Runtime Demo",
    category: "playbook",
    summary: "整理 Cloudflare 原生排程、SEO 草稿、人工發布與自動發布流程的移植說明。",
    capabilities: ["operator_playbook", "draft_generation", "technical_audit", "manual_publish_review"],
    sourceProjectPath: RUNTIME_SOURCE_ROOT,
    sourceFilePath: `${RUNTIME_SOURCE_ROOT}/docs/SEO_ADMIN_AUTOMATION_PLAYBOOK.md`,
    intendedSiteTypes: ["brand_local_seo", "platform_with_embedded_seo"],
    adoptionNotes: [
      "適合新站 onboarding 時快速對齊營運流程。",
      "可作為未來可編輯模板與 SOP 的來源。"
    ]
  }
];

export function listWorkflowModules() {
  return workflowModules;
}

export function getWorkflowModule(moduleId: string) {
  return workflowModules.find((item) => item.id === moduleId) ?? null;
}

export function listWorkflowModulesBySourceSite(siteId: string) {
  return workflowModules.filter((item) => item.sourceSiteId === siteId);
}
