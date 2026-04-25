import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index";
import { createBuildSyncTriggerPlan } from "../src/core/build-sync-trigger";
import type { SeoBuildSyncConfig } from "../src/core/seo-types";

function createExecutionContext(): ExecutionContext {
  return {
    waitUntil() {},
    passThroughOnException() {}
  } as ExecutionContext;
}

function createBasicAuthorization(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function createConfig(overrides: Partial<SeoBuildSyncConfig> = {}): SeoBuildSyncConfig {
  return {
    siteId: "demo-platform-site",
    provider: "cloudflare-pages-deploy-hook",
    label: "Cloudflare Pages Deploy Hook",
    syncMode: "build-time-api-sync",
    publicFeedUrl: "https://example.com/api/seo/published-content",
    publicFeedFormat: "json",
    publicSingleUrlTemplate: null,
    syncScriptPath: "scripts/sync-seo-published-content.mjs",
    outputDirectory: "content/blog",
    deployTarget: "example-pages",
    deployRepository: null,
    deployBranch: "main",
    deployEventType: "seo-pages-deploy",
    deployHookSecretName: "EXAMPLE_DEPLOY_HOOK_URL",
    metadata: {},
    updatedAt: "2026-04-21T00:00:00.000Z",
    ...overrides
  };
}

test("creates a Cloudflare Pages deploy hook trigger plan from a named secret", () => {
  const plan = createBuildSyncTriggerPlan(
    {
      EXAMPLE_DEPLOY_HOOK_URL: "https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/secret-value"
    } as Env,
    createConfig(),
    {
      siteId: "demo-platform-site",
      triggerSource: "manual_api",
      payload: {
        requestedPath: "/api/sites/demo-platform-site/seo/build-sync/trigger"
      }
    }
  );

  assert.equal(plan.providerUsed, "cloudflare-pages-deploy-hook");
  assert.equal(plan.method, "POST");
  assert.equal(plan.headers["content-type"], "application/json");
  assert.match(plan.redactedTarget, /^https:\/\/api\.cloudflare\.com/);

  const body = JSON.parse(plan.body ?? "{}") as Record<string, unknown>;
  assert.equal(body.siteId, "demo-platform-site");
  assert.equal(body.deployTarget, "example-pages");
  assert.equal(body.triggerSource, "manual_api");
});

test("creates a GitHub repository dispatch trigger plan when a token secret is available", () => {
  const plan = createBuildSyncTriggerPlan(
    {
      GITHUB_REPOSITORY_DISPATCH_TOKEN: "ghp_test_token"
    } as Env,
    createConfig({
      provider: "github-actions-repository-dispatch",
      deployRepository: "owner/repo",
      deployEventType: "seo-pages-deploy",
      metadata: {
        githubApiBaseUrl: "https://api.github.test"
      }
    }),
    {
      siteId: "demo-platform-site",
      triggerSource: "manual_api"
    }
  );

  assert.equal(plan.providerUsed, "github-actions-repository-dispatch");
  assert.equal(plan.url, "https://api.github.test/repos/owner/repo/dispatches");
  assert.equal(plan.headers.authorization, "Bearer ghp_test_token");

  const body = JSON.parse(plan.body ?? "{}") as {
    event_type: string;
    client_payload: Record<string, unknown>;
  };
  assert.equal(body.event_type, "seo-pages-deploy");
  assert.equal(body.client_payload.siteId, "demo-platform-site");
  assert.equal(body.client_payload.syncScriptPath, "scripts/sync-seo-published-content.mjs");
});

test("rejects build-sync deploy trigger when D1 is unavailable", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/api/sites/demo-platform-site/seo/build-sync/trigger", {
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
