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

test("protects control-plane routes when credentials are missing", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/api/control-plane/capabilities"),
    {
      APP_ENV: "production",
      BASIC_AUTH_USERNAME: "admin",
      BASIC_AUTH_PASSWORD: "secret"
    } as Env,
    createExecutionContext()
  );

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("www-authenticate"), 'Basic realm="AI SEO Control"');
});

test("allows health checks without credentials", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/healthz"),
    {
      APP_ENV: "production",
      APP_NAME: "AI SEO Control"
    } as Env,
    createExecutionContext()
  );

  assert.equal(response.status, 200);
  const payload = (await response.json()) as { ok: boolean; managedSiteCount?: number };
  assert.equal(payload.ok, true);
  assert.equal("managedSiteCount" in payload, false);
});

test("fails closed on protected routes when auth secrets are not configured", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/api/control-plane/capabilities"),
    {
      APP_ENV: "production"
    } as Env,
    createExecutionContext()
  );

  assert.equal(response.status, 503);
  const payload = (await response.json()) as { ok: boolean; error: string };
  assert.equal(payload.ok, false);
  assert.match(payload.error, /Basic Auth/i);
});

test("accepts valid basic auth credentials for protected routes", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/api/control-plane/capabilities", {
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

  assert.equal(response.status, 200);
  const payload = (await response.json()) as { ok: boolean };
  assert.equal(payload.ok, true);
});
