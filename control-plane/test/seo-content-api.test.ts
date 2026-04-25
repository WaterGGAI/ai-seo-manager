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

test("rejects content generation when D1 is unavailable", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/api/sites/demo-brand-site/seo/content/generate", {
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
