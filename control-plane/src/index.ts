import {
  getConnectorDefinition,
  getMainlineSource,
  listConnectorDefinitions,
  listSupportedPublishModes
} from "./connectors/registry";
import { listScheduledAuditTargets, runManagedSiteSeoAuditJob, SeoAuditError } from "./core/seo-audit";
import { bootstrapManagedSite, syncManagedSitesFromManifest } from "./core/seo-bootstrap";
import { BuildSyncError, readBuildSyncConfig, upsertBuildSyncConfig } from "./core/build-sync";
import {
  BuildSyncTriggerError,
  listScheduledBuildSyncDeployTargets,
  runBuildSyncDeployJob
} from "./core/build-sync-trigger";
import {
  listScheduledContentTargets,
  runManagedSiteSeoContentJob,
  SeoContentPipelineError
} from "./core/seo-content-pipeline";
import { countManagedSites, listManagedSitesForRequest, readManagedSiteForRequest } from "./core/managed-sites";
import { listSeoJobsForSite, SeoJobError } from "./core/seo-jobs";
import {
  listPublishedFeedSyncTargets,
  PublishedFeedSyncError,
  runPublishedFeedSyncJob
} from "./core/published-feed-sync";
import {
  listScheduledRankingTargets,
  readSeoRankingState,
  runManagedSiteSeoRankingSyncJob,
  SeoRankingError,
  upsertSeoRankingConfig
} from "./core/seo-ranking";
import { applySeoRepair, generateSeoRepairs, listSeoRepairs, SeoRepairError } from "./core/seo-repairs";
import { SeoSettingsError, updateSeoSiteSettings } from "./core/seo-settings";
import { createOrUpdateManagedSite, SiteOnboardingError } from "./core/site-onboarding";
import {
  createOrUpdateStructuredOverride,
  deleteStructuredOverride,
  listStructuredOverrides,
  readStructuredOverride,
  StructuredOverrideError
} from "./core/structured-overrides";
import { seoModelOptions } from "./core/seo-models";
import { readManagedSiteSeoState } from "./core/seo-state";
import { getWorkflowModule, listWorkflowModules } from "./core/workflow-modules";
import { enforceBasicAuth } from "./lib/basic-auth";
import { getDatabaseHealth } from "./lib/db";
import { json, notFound } from "./lib/http";
import { buildControlPlaneOverview, controlPlaneCapabilities, handleAdminRequest } from "./ui/admin";

const MAX_JSON_REQUEST_BYTES = 24 * 1024;
const MAX_STRUCTURED_OVERRIDE_JSON_REQUEST_BYTES = 96 * 1024;
const MAX_BUILD_SYNC_JSON_REQUEST_BYTES = 24 * 1024;

function extractSiteId(pathname: string) {
  const match = pathname.match(/^\/api\/sites\/([^/]+)$/);
  return match?.[1] ?? null;
}

function extractSiteSeoStateId(pathname: string) {
  const match = pathname.match(/^\/api\/sites\/([^/]+)\/seo\/state$/);
  return match?.[1] ?? null;
}

function extractSiteSeoSettingsId(pathname: string) {
  const match = pathname.match(/^\/api\/sites\/([^/]+)\/seo\/settings$/);
  return match?.[1] ?? null;
}

function extractSiteBootstrapId(pathname: string) {
  const match = pathname.match(/^\/api\/sites\/([^/]+)\/bootstrap$/);
  return match?.[1] ?? null;
}

function extractSiteStructuredOverridesId(pathname: string) {
  const match = pathname.match(/^\/api\/sites\/([^/]+)\/seo\/structured-overrides$/);
  return match?.[1] ?? null;
}

function extractSiteBuildSyncId(pathname: string) {
  const match = pathname.match(/^\/api\/sites\/([^/]+)\/seo\/build-sync$/);
  return match?.[1] ?? null;
}

function extractSiteBuildSyncTriggerId(pathname: string) {
  const match = pathname.match(/^\/api\/sites\/([^/]+)\/seo\/build-sync\/trigger$/);
  return match?.[1] ?? null;
}

function extractSitePublishedFeedSyncId(pathname: string) {
  const match = pathname.match(/^\/api\/sites\/([^/]+)\/seo\/published\/sync-feed$/);
  return match?.[1] ?? null;
}

function extractSiteSeoAuditId(pathname: string) {
  const match = pathname.match(/^\/api\/sites\/([^/]+)\/seo\/audit$/);
  return match?.[1] ?? null;
}

function extractSiteSeoContentGenerateId(pathname: string) {
  const match = pathname.match(/^\/api\/sites\/([^/]+)\/seo\/content\/generate$/);
  return match?.[1] ?? null;
}

function extractSiteSeoJobsId(pathname: string) {
  const match = pathname.match(/^\/api\/sites\/([^/]+)\/seo\/jobs$/);
  return match?.[1] ?? null;
}

function extractSiteSeoRepairsId(pathname: string) {
  const match = pathname.match(/^\/api\/sites\/([^/]+)\/seo\/repairs$/);
  return match?.[1] ?? null;
}

function extractSiteSeoRepairGenerateId(pathname: string) {
  const match = pathname.match(/^\/api\/sites\/([^/]+)\/seo\/repairs\/generate$/);
  return match?.[1] ?? null;
}

function extractSiteSeoRepairApplyRef(pathname: string) {
  const match = pathname.match(/^\/api\/sites\/([^/]+)\/seo\/repairs\/([^/]+)\/apply$/);
  if (!match) {
    return null;
  }

  return {
    siteId: match[1],
    repairId: decodeURIComponent(match[2])
  };
}

function extractSiteSeoRankingId(pathname: string) {
  const match = pathname.match(/^\/api\/sites\/([^/]+)\/seo\/ranking$/);
  return match?.[1] ?? null;
}

function extractSiteSeoRankingSyncId(pathname: string) {
  const match = pathname.match(/^\/api\/sites\/([^/]+)\/seo\/ranking\/sync$/);
  return match?.[1] ?? null;
}

function extractSiteStructuredOverrideRef(pathname: string) {
  const match = pathname.match(/^\/api\/sites\/([^/]+)\/seo\/structured-overrides\/([^/]+)\/([^/]+)$/);
  if (!match) {
    return null;
  }

  return {
    siteId: match[1],
    entityType: decodeURIComponent(match[2]),
    entityKey: decodeURIComponent(match[3])
  };
}

function extractConnectorName(pathname: string) {
  const match = pathname.match(/^\/api\/connectors\/([^/]+)$/);
  return match?.[1] ?? null;
}

function extractWorkflowModuleId(pathname: string) {
  const match = pathname.match(/^\/api\/workflow-modules\/([^/]+)$/);
  return match?.[1] ?? null;
}

type JsonRequestErrorFactory = (message: string, status?: number) => Error;

async function readJsonRequest(
  request: Request,
  options: {
    maxBytes?: number;
    errorFactory?: JsonRequestErrorFactory;
  } = {}
) {
  const maxBytes = options.maxBytes ?? MAX_JSON_REQUEST_BYTES;
  const errorFactory = options.errorFactory ?? ((message, status) => new SiteOnboardingError(message, status));
  const declaredLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw errorFactory(`Request body exceeds ${maxBytes} bytes.`, 413);
  }

  const raw = await request.text();
  if (!raw.trim()) {
    throw errorFactory("Request body is required.");
  }

  const byteLength = new TextEncoder().encode(raw).byteLength;
  if (byteLength > maxBytes) {
    throw errorFactory(`Request body exceeds ${maxBytes} bytes.`, 413);
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw errorFactory("Request body must be valid JSON.");
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const authResponse = await enforceBasicAuth(request, env);
    if (authResponse) {
      return authResponse;
    }

    if (request.method === "GET" && url.pathname === "/healthz") {
      return json({
        ok: true,
        app: env.APP_NAME ?? "AI SEO Control",
        environment: env.APP_ENV ?? "production",
        protected: true
      });
    }

    const adminResponse = await handleAdminRequest(request, env);
    if (adminResponse) {
      return adminResponse;
    }

    if (request.method === "GET" && url.pathname === "/api/control-plane/overview") {
      return json(await buildControlPlaneOverview(env));
    }

    if (request.method === "GET" && url.pathname === "/api/sites") {
      const items = await listManagedSitesForRequest(env);

      return json({
        ok: true,
        items
      });
    }

    if (request.method === "GET" && url.pathname === "/api/workflow-modules") {
      return json({
        ok: true,
        items: listWorkflowModules()
      });
    }

    if (request.method === "GET") {
      const workflowModuleId = extractWorkflowModuleId(url.pathname);
      if (workflowModuleId) {
        const item = getWorkflowModule(decodeURIComponent(workflowModuleId));
        if (!item) {
          return json({ ok: false, error: `Unknown workflow module: ${workflowModuleId}` }, { status: 404 });
        }

        return json({
          ok: true,
          item
        });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/sites") {
      try {
        const payload = await readJsonRequest(request);
        const result = await createOrUpdateManagedSite(env, payload);
        const item = await readManagedSiteForRequest(env, result.siteId);
        const state = await readManagedSiteSeoState(env, result.siteId);

        return json({
          ok: true,
          item: result,
          site: item,
          state
        });
      } catch (error) {
        if (error instanceof SiteOnboardingError) {
          return json({ ok: false, error: error.message }, { status: error.status });
        }

        throw error;
      }
    }

    if (request.method === "GET") {
      const siteId = extractSiteSeoRankingId(url.pathname);
      if (siteId) {
        try {
          const item = await readSeoRankingState(env, siteId);
          return json({
            ok: true,
            siteId,
            item
          });
        } catch (error) {
          if (error instanceof SeoRankingError || error instanceof SeoJobError) {
            return json({ ok: false, error: error.message }, { status: error.status });
          }

          throw error;
        }
      }
    }

    if (request.method === "POST") {
      const siteId = extractSiteSeoRankingId(url.pathname);
      if (siteId) {
        try {
          const payload = await readJsonRequest(request, {
            errorFactory: (message, status) => new SeoRankingError(message, status)
          });
          const item = await upsertSeoRankingConfig(env, siteId, payload);

          return json({
            ok: true,
            siteId,
            item
          });
        } catch (error) {
          if (error instanceof SeoRankingError || error instanceof SeoJobError) {
            return json({ ok: false, error: error.message }, { status: error.status });
          }

          throw error;
        }
      }
    }

    if (request.method === "POST") {
      const siteId = extractSiteSeoSettingsId(url.pathname);
      if (siteId) {
        try {
          const payload = await readJsonRequest(request, {
            errorFactory: (message, status) => new SeoSettingsError(message, status)
          });
          const item = await updateSeoSiteSettings(env, siteId, payload);
          const state = await readManagedSiteSeoState(env, siteId);

          return json({
            ok: true,
            siteId,
            item,
            state
          });
        } catch (error) {
          if (error instanceof SeoSettingsError) {
            return json({ ok: false, error: error.message }, { status: error.status });
          }

          throw error;
        }
      }
    }

    if (request.method === "POST") {
      const siteId = extractSiteSeoRankingSyncId(url.pathname);
      if (siteId) {
        try {
          const { job, result } = await runManagedSiteSeoRankingSyncJob(env, siteId, {
            triggerSource: "manual_api",
            payload: {
              requestedPath: url.pathname
            }
          });
          const state = await readManagedSiteSeoState(env, siteId);

          return json({
            ok: true,
            item: result,
            job,
            state
          });
        } catch (error) {
          if (error instanceof SeoRankingError || error instanceof SeoJobError) {
            return json({ ok: false, error: error.message }, { status: error.status });
          }

          throw error;
        }
      }
    }

    if (request.method === "GET") {
      const siteId = extractSiteBuildSyncId(url.pathname);
      if (siteId) {
        try {
          const item = await readBuildSyncConfig(env, siteId);
          return json({
            ok: true,
            siteId,
            item
          });
        } catch (error) {
          if (error instanceof BuildSyncError) {
            return json({ ok: false, error: error.message }, { status: error.status });
          }

          throw error;
        }
      }
    }

    if (request.method === "POST") {
      const siteId = extractSiteSeoAuditId(url.pathname);
      if (siteId) {
        try {
          const { job, result } = await runManagedSiteSeoAuditJob(env, siteId, {
            triggerSource: "manual_api",
            source: "manual",
            payload: {
              requestedPath: url.pathname
            }
          });
          const state = await readManagedSiteSeoState(env, siteId);

          return json({
            ok: true,
            item: result,
            job,
            state
          });
        } catch (error) {
          if (error instanceof SeoAuditError) {
            return json({ ok: false, error: error.message }, { status: error.status });
          }

          throw error;
        }
      }
    }

    if (request.method === "POST") {
      const siteId = extractSiteSeoContentGenerateId(url.pathname);
      if (siteId) {
        try {
          const { job, result } = await runManagedSiteSeoContentJob(env, siteId, {
            triggerSource: "manual_api",
            payload: {
              requestedPath: url.pathname
            }
          });
          const state = await readManagedSiteSeoState(env, siteId);

          return json({
            ok: true,
            item: result,
            job,
            state
          });
        } catch (error) {
          if (error instanceof SeoContentPipelineError || error instanceof SeoJobError) {
            return json({ ok: false, error: error.message }, { status: error.status });
          }

          throw error;
        }
      }
    }

    if (request.method === "POST") {
      const siteId = extractSitePublishedFeedSyncId(url.pathname);
      if (siteId) {
        try {
          const { job, result } = await runPublishedFeedSyncJob(env, siteId, {
            triggerSource: "manual_api",
            payload: {
              requestedPath: url.pathname
            }
          });
          const state = await readManagedSiteSeoState(env, siteId);

          return json({
            ok: true,
            item: result,
            job,
            state
          });
        } catch (error) {
          if (error instanceof PublishedFeedSyncError) {
            return json({ ok: false, error: error.message }, { status: error.status });
          }

          throw error;
        }
      }
    }

    if (request.method === "POST") {
      const siteId = extractSiteBuildSyncTriggerId(url.pathname);
      if (siteId) {
        try {
          const { job, result } = await runBuildSyncDeployJob(env, siteId, {
            triggerSource: "manual_api",
            payload: {
              requestedPath: url.pathname
            }
          });
          const state = await readManagedSiteSeoState(env, siteId);

          return json({
            ok: true,
            item: result,
            job,
            state
          });
        } catch (error) {
          if (error instanceof BuildSyncTriggerError || error instanceof SeoJobError) {
            return json({ ok: false, error: error.message }, { status: error.status });
          }

          throw error;
        }
      }
    }

    if (request.method === "GET") {
      const siteId = extractSiteSeoJobsId(url.pathname);
      if (siteId) {
        const site = await readManagedSiteForRequest(env, siteId);
        if (!site) {
          return json({ ok: false, error: `Unknown site: ${siteId}` }, { status: 404 });
        }

        const items = await listSeoJobsForSite(env, siteId);
        return json({
          ok: true,
          siteId,
          count: items.length,
          items
        });
      }
    }

    if (request.method === "GET") {
      const siteId = extractSiteSeoRepairsId(url.pathname);
      if (siteId) {
        try {
          const items = await listSeoRepairs(env, siteId);
          return json({
            ok: true,
            siteId,
            count: items.length,
            items
          });
        } catch (error) {
          if (error instanceof SeoRepairError) {
            return json({ ok: false, error: error.message }, { status: error.status });
          }

          throw error;
        }
      }
    }

    if (request.method === "POST") {
      const siteId = extractSiteSeoRepairGenerateId(url.pathname);
      if (siteId) {
        try {
          const { job, result } = await generateSeoRepairs(env, siteId, {
            triggerSource: "manual_api",
            payload: {
              requestedPath: url.pathname
            }
          });
          const state = await readManagedSiteSeoState(env, siteId);

          return json({
            ok: true,
            item: result,
            job,
            state
          });
        } catch (error) {
          if (error instanceof SeoRepairError || error instanceof SeoJobError) {
            return json({ ok: false, error: error.message }, { status: error.status });
          }

          throw error;
        }
      }
    }

    if (request.method === "POST") {
      const ref = extractSiteSeoRepairApplyRef(url.pathname);
      if (ref) {
        try {
          const { job, result } = await applySeoRepair(env, ref.siteId, ref.repairId, {
            triggerSource: "manual_api",
            payload: {
              requestedPath: url.pathname
            }
          });
          const state = await readManagedSiteSeoState(env, ref.siteId);

          return json({
            ok: true,
            item: result,
            job,
            state
          });
        } catch (error) {
          if (error instanceof SeoRepairError || error instanceof SeoJobError) {
            return json({ ok: false, error: error.message }, { status: error.status });
          }

          throw error;
        }
      }
    }

    if (request.method === "POST") {
      const siteId = extractSiteBuildSyncId(url.pathname);
      if (siteId) {
        try {
          const payload = await readJsonRequest(request, {
            maxBytes: MAX_BUILD_SYNC_JSON_REQUEST_BYTES,
            errorFactory: (message, status) => new BuildSyncError(message, status)
          });
          const item = await upsertBuildSyncConfig(env, siteId, payload);

          return json({
            ok: true,
            siteId,
            item
          });
        } catch (error) {
          if (error instanceof BuildSyncError) {
            return json({ ok: false, error: error.message }, { status: error.status });
          }

          throw error;
        }
      }
    }

    if (request.method === "GET") {
      const siteId = extractSiteStructuredOverridesId(url.pathname);
      if (siteId) {
        try {
          const items = await listStructuredOverrides(env, siteId, {
            entityType: url.searchParams.get("entityType") ?? undefined,
            entityKey: url.searchParams.get("entityKey") ?? undefined,
            routePath: url.searchParams.get("routePath") ?? undefined
          });

          return json({
            ok: true,
            siteId,
            count: items.length,
            items
          });
        } catch (error) {
          if (error instanceof StructuredOverrideError) {
            return json({ ok: false, error: error.message }, { status: error.status });
          }

          throw error;
        }
      }
    }

    if (request.method === "POST") {
      const siteId = extractSiteStructuredOverridesId(url.pathname);
      if (siteId) {
        try {
          const payload = await readJsonRequest(request, {
            maxBytes: MAX_STRUCTURED_OVERRIDE_JSON_REQUEST_BYTES,
            errorFactory: (message, status) => new StructuredOverrideError(message, status)
          });
          const result = await createOrUpdateStructuredOverride(env, siteId, payload);

          return json({
            ok: true,
            siteId,
            created: result.created,
            item: result.item
          });
        } catch (error) {
          if (error instanceof StructuredOverrideError) {
            return json({ ok: false, error: error.message }, { status: error.status });
          }

          throw error;
        }
      }
    }

    if (request.method === "GET") {
      const siteId = extractSiteId(url.pathname);
      if (siteId) {
        const site = await readManagedSiteForRequest(env, siteId);
        if (!site) {
          return json({ ok: false, error: `Unknown site: ${siteId}` }, { status: 404 });
        }

        return json({
          ok: true,
          item: site
        });
      }
    }

    if (request.method === "GET" || request.method === "DELETE") {
      const ref = extractSiteStructuredOverrideRef(url.pathname);
      if (ref) {
        try {
          if (request.method === "GET") {
            const item = await readStructuredOverride(env, ref.siteId, ref.entityType, ref.entityKey);
            if (!item) {
              return json(
                {
                  ok: false,
                  error: `Structured override not found for ${ref.siteId}/${ref.entityType}/${ref.entityKey}.`
                },
                { status: 404 }
              );
            }

            return json({
              ok: true,
              siteId: ref.siteId,
              item
            });
          }

          const result = await deleteStructuredOverride(env, ref.siteId, ref.entityType, ref.entityKey);
          return json({
            ok: true,
            siteId: ref.siteId,
            deleted: result.deleted,
            item: result.item
          });
        } catch (error) {
          if (error instanceof StructuredOverrideError) {
            return json({ ok: false, error: error.message }, { status: error.status });
          }

          throw error;
        }
      }
    }

    if (request.method === "POST" && url.pathname === "/api/bootstrap/sites/sync-manifest") {
      if (!env.DB) {
        return json({ ok: false, error: "D1 binding is not configured yet." }, { status: 503 });
      }

      const result = await syncManagedSitesFromManifest(env);
      const items = await listManagedSitesForRequest(env);

      return json({
        ok: true,
        item: result,
        items
      });
    }

    if (request.method === "POST") {
      const siteId = extractSiteBootstrapId(url.pathname);
      if (siteId) {
        if (!env.DB) {
          return json({ ok: false, error: "D1 binding is not configured yet." }, { status: 503 });
        }

        const result = await bootstrapManagedSite(env, siteId);
        if (!result) {
          return json({ ok: false, error: `Unknown site: ${siteId}` }, { status: 404 });
        }

        const state = await readManagedSiteSeoState(env, siteId);

        return json({
          ok: true,
          item: result,
          state
        });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/control-plane/capabilities") {
      return json({
        ok: true,
        value: controlPlaneCapabilities
      });
    }

    if (request.method === "GET" && url.pathname === "/api/seo/models") {
      return json({
        ok: true,
        items: seoModelOptions
      });
    }

    if (request.method === "GET" && url.pathname === "/api/connectors") {
      return json({
        ok: true,
        items: listConnectorDefinitions()
      });
    }

    if (request.method === "GET") {
      const connectorName = extractConnectorName(url.pathname);
      if (connectorName) {
        const connector = getConnectorDefinition(connectorName);
        if (!connector) {
          return json({ ok: false, error: `Unknown connector: ${connectorName}` }, { status: 404 });
        }

        return json({
          ok: true,
          item: connector
        });
      }
    }

    if (request.method === "GET") {
      const siteId = extractSiteSeoStateId(url.pathname);
      if (siteId) {
        const state = await readManagedSiteSeoState(env, siteId);
        if (!state) {
          return json({ ok: false, error: `Unknown site: ${siteId}` }, { status: 404 });
        }

        return json({
          ok: true,
          item: state,
          models: seoModelOptions
        });
      }
    }

    return notFound(url.pathname);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      (async () => {
        const scheduledTime = new Date(controller.scheduledTime).toISOString();
        const scheduledTickTime = new Date(controller.scheduledTime);
        const [siteCount, auditTargets, contentTargets, feedTargets, deployTargets, rankingTargets] = await Promise.all([
          countManagedSites(env),
          listScheduledAuditTargets(env, { scheduledTime: scheduledTickTime }),
          listScheduledContentTargets(env, { scheduledTime: scheduledTickTime }),
          listPublishedFeedSyncTargets(env, { scheduledTime: scheduledTickTime }),
          listScheduledBuildSyncDeployTargets(env, { scheduledTime: scheduledTickTime }),
          listScheduledRankingTargets(env, { scheduledTime: scheduledTickTime })
        ]);

        console.log(
          JSON.stringify({
            type: "scheduled-control-plane-tick",
            cron: controller.cron,
            scheduledTime,
            environment: env.APP_ENV ?? "production",
            siteCount,
            eligibleAuditSites: auditTargets.length,
            eligibleContentSites: contentTargets.length,
            eligiblePublishedFeedSyncSites: feedTargets.length,
            eligibleBuildSyncDeploySites: deployTargets.length,
            eligibleRankingSites: rankingTargets.length
          })
        );

        const auditResults: Array<Record<string, unknown>> = [];
        for (const target of auditTargets) {
          try {
            const { job, result } = await runManagedSiteSeoAuditJob(env, target.siteId, {
              triggerSource: "scheduled_cron",
              source: "scheduled",
              payload: {
                cron: controller.cron,
                scheduledTime,
                reason: "scheduled_technical_audit"
              }
            });

            auditResults.push({
              siteId: target.siteId,
              label: target.label,
              status: job.status,
              jobId: job.id,
              auditRunId: result.id,
              failingTargets: result.summary.failingTargets,
              warningTargets: result.summary.warningTargets
            });
          } catch (error) {
            auditResults.push({
              siteId: target.siteId,
              label: target.label,
              status: "failed",
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }

        const feedResults: Array<Record<string, unknown>> = [];
        const contentResults: Array<Record<string, unknown>> = [];
        for (const target of contentTargets) {
          try {
            const { job, result } = await runManagedSiteSeoContentJob(env, target.siteId, {
              triggerSource: "scheduled_cron",
              payload: {
                cron: controller.cron,
                scheduledTime,
                reason: "scheduled_content_generation"
              }
            });

            contentResults.push({
              siteId: target.siteId,
              label: target.label,
              publishMode: target.publishMode,
              status: job.status,
              jobId: job.id,
              topicKey: result.topicKey,
              draftId: result.draftId,
              publishedId: result.publishedId,
              structuredOverrideId: result.structuredOverrideId
            });
          } catch (error) {
            contentResults.push({
              siteId: target.siteId,
              label: target.label,
              publishMode: target.publishMode,
              status: "failed",
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }

        for (const target of feedTargets) {
          try {
            const { job, result } = await runPublishedFeedSyncJob(env, target.siteId, {
              triggerSource: "scheduled_cron",
              payload: {
                cron: controller.cron,
                scheduledTime,
                reason: "scheduled_published_feed_sync"
              }
            });

            feedResults.push({
              siteId: target.siteId,
              label: target.label,
              status: job.status,
              jobId: job.id,
              importedCount: result.importedCount,
              deletedCount: result.deletedCount
            });
          } catch (error) {
            feedResults.push({
              siteId: target.siteId,
              label: target.label,
              status: "failed",
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }

        const deployResults: Array<Record<string, unknown>> = [];
        for (const target of deployTargets) {
          try {
            const { job, result } = await runBuildSyncDeployJob(env, target.siteId, {
              triggerSource: "scheduled_cron",
              payload: {
                cron: controller.cron,
                scheduledTime,
                reason: "scheduled_build_sync_deploy"
              }
            });

            deployResults.push({
              siteId: target.siteId,
              label: target.label,
              status: job.status,
              jobId: job.id,
              providerUsed: result.providerUsed,
              statusCode: result.statusCode
            });
          } catch (error) {
            deployResults.push({
              siteId: target.siteId,
              label: target.label,
              status: "failed",
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }

        const rankingResults: Array<Record<string, unknown>> = [];
        for (const target of rankingTargets) {
          try {
            const { job, result } = await runManagedSiteSeoRankingSyncJob(env, target.siteId, {
              triggerSource: "scheduled_cron",
              payload: {
                cron: controller.cron,
                scheduledTime,
                reason: "scheduled_ranking_sync"
              }
            });

            rankingResults.push({
              siteId: target.siteId,
              label: target.label,
              status: job.status,
              jobId: job.id,
              snapshotId: result.id,
              availableDate: result.availableDate
            });
          } catch (error) {
            rankingResults.push({
              siteId: target.siteId,
              label: target.label,
              status: "failed",
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }

        console.log(
          JSON.stringify({
            type: "scheduled-content-generation-summary",
            cron: controller.cron,
            scheduledTime,
            environment: env.APP_ENV ?? "production",
            totalSites: contentTargets.length,
            completedCount: contentResults.filter((item) => item.status === "completed").length,
            failedCount: contentResults.filter((item) => item.status === "failed").length,
            results: contentResults
          })
        );

        console.log(
          JSON.stringify({
            type: "scheduled-published-feed-sync-summary",
            cron: controller.cron,
            scheduledTime,
            environment: env.APP_ENV ?? "production",
            totalSites: feedTargets.length,
            completedCount: feedResults.filter((item) => item.status === "completed").length,
            failedCount: feedResults.filter((item) => item.status === "failed").length,
            results: feedResults
          })
        );

        console.log(
          JSON.stringify({
            type: "scheduled-build-sync-deploy-summary",
            cron: controller.cron,
            scheduledTime,
            environment: env.APP_ENV ?? "production",
            totalSites: deployTargets.length,
            completedCount: deployResults.filter((item) => item.status === "completed").length,
            failedCount: deployResults.filter((item) => item.status === "failed").length,
            results: deployResults
          })
        );

        console.log(
          JSON.stringify({
            type: "scheduled-ranking-sync-summary",
            cron: controller.cron,
            scheduledTime,
            environment: env.APP_ENV ?? "production",
            totalSites: rankingTargets.length,
            completedCount: rankingResults.filter((item) => item.status === "completed").length,
            failedCount: rankingResults.filter((item) => item.status === "failed").length,
            results: rankingResults
          })
        );

        console.log(
          JSON.stringify({
            type: "scheduled-technical-audit-summary",
            cron: controller.cron,
            scheduledTime,
            environment: env.APP_ENV ?? "production",
            totalSites: auditTargets.length,
            completedCount: auditResults.filter((item) => item.status === "completed").length,
            failedCount: auditResults.filter((item) => item.status === "failed").length,
            results: auditResults
          })
        );
      })()
    );
  }
} satisfies ExportedHandler<Cloudflare.Env>;
