import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index";

function createExecutionContext(): ExecutionContext {
  return {
    waitUntil() {},
    passThroughOnException() {}
  } as ExecutionContext;
}

function createBasicAuthorization(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function createProtectedEnv(overrides: Partial<Env> = {}) {
  return {
    APP_ENV: "production",
    BASIC_AUTH_USERNAME: "admin",
    BASIC_AUTH_PASSWORD: "secret",
    ...overrides
  } as Env;
}

test("returns ranking state for known managed sites", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/api/sites/demo-platform-site/seo/ranking", {
      headers: {
        authorization: createBasicAuthorization("admin", "secret")
      }
    }),
    createProtectedEnv(),
    createExecutionContext()
  );

  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    ok: boolean;
    siteId: string;
    item: { enabled: boolean; hasCredentials: boolean; ready: boolean };
  };
  assert.equal(payload.ok, true);
  assert.equal(payload.siteId, "demo-platform-site");
  assert.equal(typeof payload.item.enabled, "boolean");
  assert.equal(payload.item.hasCredentials, false);
  assert.equal(payload.item.ready, false);
});

test("rejects ranking config writes when D1 is unavailable", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/api/sites/demo-platform-site/seo/ranking", {
      method: "POST",
      headers: {
        authorization: createBasicAuthorization("admin", "secret"),
        "content-type": "application/json"
      },
      body: JSON.stringify({
        enabled: true,
        siteUrl: "https://platform.example/"
      })
    }),
    createProtectedEnv(),
    createExecutionContext()
  );

  assert.equal(response.status, 503);
  const payload = (await response.json()) as { ok: boolean; error: string };
  assert.equal(payload.ok, false);
  assert.match(payload.error, /D1 binding/i);
});

test("rejects ranking sync when D1 is unavailable", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/api/sites/demo-platform-site/seo/ranking/sync", {
      method: "POST",
      headers: {
        authorization: createBasicAuthorization("admin", "secret")
      }
    }),
    createProtectedEnv(),
    createExecutionContext()
  );

  assert.equal(response.status, 503);
  const payload = (await response.json()) as { ok: boolean; error: string };
  assert.equal(payload.ok, false);
  assert.match(payload.error, /D1 binding/i);
});
