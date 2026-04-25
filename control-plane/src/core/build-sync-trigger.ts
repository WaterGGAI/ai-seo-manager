import { matchesScheduledTick } from "./cron-schedule";
import { readBuildSyncConfig } from "./build-sync";
import { readManagedSiteRecord } from "./managed-sites";
import { runSeoJob } from "./seo-jobs";
import type { SeoBuildSyncConfig, SeoJobTriggerSource } from "./seo-types";

const GITHUB_API_BASE_URL = "https://api.github.com";
const DEFAULT_GITHUB_TOKEN_SECRET_NAME = "GITHUB_REPOSITORY_DISPATCH_TOKEN";
const MAX_RESPONSE_PREVIEW_BYTES = 4_096;

type ScheduledBuildSyncDeployTarget = {
  siteId: string;
  label: string;
  scheduleCronUtc: string | null;
};

export type BuildSyncTriggerPlan = {
  provider: SeoBuildSyncConfig["provider"];
  providerUsed: SeoBuildSyncConfig["provider"];
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: string | null;
  redactedTarget: string;
};

export type BuildSyncTriggerResult = {
  siteId: string;
  provider: SeoBuildSyncConfig["provider"];
  providerUsed: SeoBuildSyncConfig["provider"];
  status: "triggered";
  statusCode: number;
  redactedTarget: string;
  responsePreview: string | null;
  triggeredAt: string;
};

export class BuildSyncTriggerError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "BuildSyncTriggerError";
    this.status = status;
  }
}

function getRequiredDatabase(env: Cloudflare.Env) {
  if (!env.DB) {
    throw new BuildSyncTriggerError("D1 binding is not configured yet.", 503);
  }

  return env.DB;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readDynamicSecret(env: Cloudflare.Env, name: string | null | undefined) {
  if (!name) {
    return null;
  }

  const dynamicEnv = env as Cloudflare.Env & Record<string, unknown>;
  const value = dynamicEnv[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function assertWebhookUrl(value: string, fieldName: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BuildSyncTriggerError(`${fieldName} must be a valid absolute URL.`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new BuildSyncTriggerError(`${fieldName} must use http or https.`);
  }

  return url.toString();
}

function redactUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname.split("/").slice(0, 2).join("/") ? "/..." : ""}`;
  } catch {
    return "redacted";
  }
}

function readGithubTokenSecretName(config: SeoBuildSyncConfig) {
  return readMetadataString(config.metadata, "githubTokenSecretName") ?? DEFAULT_GITHUB_TOKEN_SECRET_NAME;
}

function readGithubApiBaseUrl(config: SeoBuildSyncConfig) {
  return readMetadataString(config.metadata, "githubApiBaseUrl") ?? GITHUB_API_BASE_URL;
}

function buildClientPayload(
  config: SeoBuildSyncConfig,
  options: {
    siteId: string;
    triggerSource: SeoJobTriggerSource;
    payload?: Record<string, unknown>;
  }
) {
  return {
    siteId: options.siteId,
    triggerSource: options.triggerSource,
    buildSyncLabel: config.label,
    deployTarget: config.deployTarget,
    deployBranch: config.deployBranch,
    publicFeedUrl: config.publicFeedUrl,
    syncScriptPath: config.syncScriptPath,
    outputDirectory: config.outputDirectory,
    requestedAt: new Date().toISOString(),
    ...(options.payload ?? {})
  };
}

function createCloudflarePagesDeployHookPlan(
  env: Cloudflare.Env,
  config: SeoBuildSyncConfig,
  options: {
    siteId: string;
    triggerSource: SeoJobTriggerSource;
    payload?: Record<string, unknown>;
  }
): BuildSyncTriggerPlan {
  const secretValue = readDynamicSecret(env, config.deployHookSecretName);
  if (!secretValue) {
    throw new BuildSyncTriggerError(
      `Deploy hook secret "${config.deployHookSecretName ?? "not configured"}" is not configured.`,
      409
    );
  }

  const url = assertWebhookUrl(secretValue, `Secret "${config.deployHookSecretName}"`);
  return {
    provider: config.provider,
    providerUsed: "cloudflare-pages-deploy-hook",
    url,
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      siteId: options.siteId,
      triggerSource: options.triggerSource,
      deployTarget: config.deployTarget,
      deployBranch: config.deployBranch,
      requestedAt: new Date().toISOString(),
      ...(options.payload ?? {})
    }),
    redactedTarget: redactUrl(url)
  };
}

function createGithubRepositoryDispatchPlan(
  env: Cloudflare.Env,
  config: SeoBuildSyncConfig,
  options: {
    siteId: string;
    triggerSource: SeoJobTriggerSource;
    payload?: Record<string, unknown>;
  }
): BuildSyncTriggerPlan {
  if (!config.deployRepository) {
    throw new BuildSyncTriggerError('Build sync config requires "deployRepository" for GitHub dispatch.', 409);
  }

  const eventType = config.deployEventType || "seo-pages-deploy";
  const tokenSecretName = readGithubTokenSecretName(config);
  const token = readDynamicSecret(env, tokenSecretName);

  if (!token) {
    const hookSecret = readDynamicSecret(env, config.deployHookSecretName);
    if (hookSecret && /^https?:\/\//i.test(hookSecret)) {
      return createCloudflarePagesDeployHookPlan(env, config, options);
    }

    throw new BuildSyncTriggerError(
      `GitHub dispatch token secret "${tokenSecretName}" is not configured, and no deploy hook fallback is available.`,
      409
    );
  }

  const apiBaseUrl = assertWebhookUrl(readGithubApiBaseUrl(config), "GitHub API base URL").replace(/\/$/, "");
  const repository = config.deployRepository.replace(/^\/+|\/+$/g, "");
  const url = `${apiBaseUrl}/repos/${repository}/dispatches`;

  return {
    provider: config.provider,
    providerUsed: "github-actions-repository-dispatch",
    url,
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "ai-seo-control-worker",
      "x-github-api-version": "2022-11-28"
    },
    body: JSON.stringify({
      event_type: eventType,
      client_payload: buildClientPayload(config, options)
    }),
    redactedTarget: `${apiBaseUrl}/repos/${repository}/dispatches`
  };
}

export function createBuildSyncTriggerPlan(
  env: Cloudflare.Env,
  config: SeoBuildSyncConfig,
  options: {
    siteId: string;
    triggerSource: SeoJobTriggerSource;
    payload?: Record<string, unknown>;
  }
): BuildSyncTriggerPlan {
  if (config.provider === "cloudflare-pages-deploy-hook") {
    return createCloudflarePagesDeployHookPlan(env, config, options);
  }

  return createGithubRepositoryDispatchPlan(env, config, options);
}

async function readResponsePreview(response: Response, maxBytes = MAX_RESPONSE_PREVIEW_BYTES) {
  if (!response.body) {
    return null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (totalBytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) {
        break;
      }

      const remaining = maxBytes - totalBytes;
      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
      chunks.push(chunk);
      totalBytes += chunk.byteLength;
      if (value.byteLength > remaining) {
        break;
      }
    }
  } finally {
    void reader.cancel().catch(() => {});
  }

  if (chunks.length === 0) {
    return null;
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(combined);
}

async function updateDeployStatus(
  db: D1Database,
  siteId: string,
  options: {
    status: "triggered" | "failed";
    message: string | null;
    requestedAt: string;
  }
) {
  await db
    .prepare(
      `
      UPDATE managed_site_seo_settings
      SET last_deploy_requested_at = ?2,
          last_deploy_status = ?3,
          last_deploy_message = ?4,
          last_error = CASE WHEN ?3 = 'failed' THEN ?4 ELSE NULL END,
          updated_at = CURRENT_TIMESTAMP
      WHERE site_id = ?1
      `
    )
    .bind(siteId, options.requestedAt, options.status, options.message)
    .run();
}

export async function triggerBuildSyncDeploy(
  env: Cloudflare.Env,
  siteId: string,
  options: {
    triggerSource: SeoJobTriggerSource;
    payload?: Record<string, unknown>;
  }
): Promise<BuildSyncTriggerResult> {
  const db = getRequiredDatabase(env);
  const site = await readManagedSiteRecord(env, siteId);
  if (!site) {
    throw new BuildSyncTriggerError(`Unknown site: ${siteId}`, 404);
  }

  if (site.publishMode !== "api_feed_build_sync") {
    throw new BuildSyncTriggerError(`Site ${siteId} does not use api_feed_build_sync publishing.`, 400);
  }

  const config = await readBuildSyncConfig(env, siteId);
  if (!config) {
    throw new BuildSyncTriggerError(`Site ${siteId} does not have a build sync config yet.`, 400);
  }

  const triggeredAt = new Date().toISOString();

  try {
    const plan = createBuildSyncTriggerPlan(env, config, {
      siteId,
      triggerSource: options.triggerSource,
      payload: options.payload
    });
    const response = await fetch(plan.url, {
      method: plan.method,
      headers: plan.headers,
      body: plan.body
    });
    const responsePreview = await readResponsePreview(response);

    if (!response.ok) {
      const message = `Deploy trigger failed with HTTP ${response.status}.`;
      await updateDeployStatus(db, siteId, {
        status: "failed",
        message: responsePreview ? `${message} ${responsePreview}` : message,
        requestedAt: triggeredAt
      });
      throw new BuildSyncTriggerError(message, 502);
    }

    await updateDeployStatus(db, siteId, {
      status: "triggered",
      message: `Triggered ${plan.providerUsed}.`,
      requestedAt: triggeredAt
    });

    return {
      siteId,
      provider: plan.provider,
      providerUsed: plan.providerUsed,
      status: "triggered",
      statusCode: response.status,
      redactedTarget: plan.redactedTarget,
      responsePreview,
      triggeredAt
    };
  } catch (error) {
    if (error instanceof BuildSyncTriggerError) {
      await updateDeployStatus(db, siteId, {
        status: "failed",
        message: error.message,
        requestedAt: triggeredAt
      });
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    await updateDeployStatus(db, siteId, {
      status: "failed",
      message,
      requestedAt: triggeredAt
    });
    throw new BuildSyncTriggerError(`Deploy trigger failed: ${message}`, 502);
  }
}

export async function runBuildSyncDeployJob(
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
      jobType: "build_sync_deploy",
      triggerSource,
      payload: {
        siteId,
        ...(options.payload ?? {})
      }
    },
    async (reporter) => {
      await reporter.event("deploy_trigger_started", `Triggering build sync deploy for ${siteId}.`, {
        siteId
      });
      const result = await triggerBuildSyncDeploy(env, siteId, {
        triggerSource,
        payload: options.payload
      });
      await reporter.event("deploy_trigger_completed", `Triggered ${result.providerUsed} deploy.`, {
        siteId,
        provider: result.provider,
        providerUsed: result.providerUsed,
        statusCode: result.statusCode,
        redactedTarget: result.redactedTarget
      });

      return result;
    }
  );
}

export async function listScheduledBuildSyncDeployTargets(
  env: Cloudflare.Env,
  options: { scheduledTime?: Date | number | string | null } = {}
) {
  if (!env.DB) {
    return [] satisfies ScheduledBuildSyncDeployTarget[];
  }

  const result = await env.DB
    .prepare(
      `
      SELECT ms.id AS site_id, ms.label, s.schedule_cron_utc
      FROM managed_sites ms
      INNER JOIN managed_site_build_sync_configs b
        ON b.site_id = ms.id
      INNER JOIN managed_site_seo_settings s
        ON s.site_id = ms.id
      WHERE ms.is_active = 1
        AND ms.publish_mode = 'api_feed_build_sync'
        AND s.automation_enabled = 1
        AND s.auto_deploy_enabled = 1
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
