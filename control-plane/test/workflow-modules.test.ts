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

function createEnv() {
  return {
    APP_ENV: "production",
    APP_NAME: "AI SEO Control",
    BASIC_AUTH_USERNAME: "admin",
    BASIC_AUTH_PASSWORD: "secret"
  } as Env;
}

test("returns the reusable workflow module catalog as JSON", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/api/workflow-modules", {
      headers: {
        authorization: createBasicAuthorization("admin", "secret")
      }
    }),
    createEnv(),
    createExecutionContext()
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/i);

  const payload = (await response.json()) as {
    ok: boolean;
    items: Array<{ sourceSiteId: string; label: string; capabilities: string[] }>;
  };

  assert.equal(payload.ok, true);
  assert.ok(payload.items.length >= 4);
  assert.ok(payload.items.some((item) => item.sourceSiteId === "demo-runtime-site" && item.label.includes("SEO 修復")));
  assert.ok(payload.items.some((item) => item.capabilities.includes("ranking_sync")));
});
