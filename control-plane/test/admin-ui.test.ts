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

function createRequest(pathname: string) {
  return new Request(`https://example.com${pathname}`, {
    headers: {
      authorization: createBasicAuthorization("admin", "secret")
    }
  });
}

function createEnv() {
  return {
    APP_ENV: "production",
    APP_NAME: "AI SEO Control",
    BASIC_AUTH_USERNAME: "admin",
    BASIC_AUTH_PASSWORD: "secret"
  } as Env;
}

test("renders an authenticated Traditional Chinese dashboard shell at root", async () => {
  const response = await worker.fetch(createRequest("/"), createEnv(), createExecutionContext());

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/i);

  const body = await response.text();
  assert.match(body, /AI SEO 中控台/);
  assert.match(body, /怎麼使用這個中控台/);
  assert.match(body, /已暫停/);
  assert.match(body, /模組來源/);
  assert.match(body, /總覽/);
  assert.match(body, /網站/);
  assert.match(body, /任務/);
  assert.doesNotMatch(body, /Dashboard|Sites|Jobs/);
});

test("renders a Traditional Chinese site detail HTML page for known managed sites", async () => {
  const response = await worker.fetch(createRequest("/sites/demo-brand-site"), createEnv(), createExecutionContext());

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/i);

  const body = await response.text();
  assert.match(body, /demo-brand-site/i);
  assert.match(body, /網站總覽/);
  assert.match(body, /執行巡檢/);
  assert.match(body, /自動化設定/);
  assert.match(body, /啟用自動化排程/);
  assert.doesNotMatch(body, /Site Overview|Run audit/i);
});

test("renders structured override management for d1 override sites", async () => {
  const response = await worker.fetch(createRequest("/sites/demo-tools-site"), createEnv(), createExecutionContext());

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/i);

  const body = await response.text();
  assert.match(body, /結構化覆寫/);
  assert.match(body, /新增覆寫項目/);
  assert.doesNotMatch(body, /Structured Override/i);
});

test("renders SEO repair controls on site detail pages", async () => {
  const response = await worker.fetch(createRequest("/sites/demo-local-site"), createEnv(), createExecutionContext());

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/i);

  const body = await response.text();
  assert.match(body, /SEO 修復/);
  assert.match(body, /生成修復稿/);
  assert.doesNotMatch(body, /SEO Repairs|Generate repair/i);
});

test("renders build sync deploy trigger controls for api-feed sites", async () => {
  const response = await worker.fetch(createRequest("/sites/demo-platform-site"), createEnv(), createExecutionContext());

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/i);

  const body = await response.text();
  assert.match(body, /觸發建置部署/);
  assert.match(body, /\/api\/sites\/demo-platform-site\/seo\/build-sync\/trigger/);
  assert.doesNotMatch(body, /Trigger deploy|Build Sync Deploy/i);
});

test("explains workflow-module source sites instead of showing them as paused runtime sites", async () => {
  const response = await worker.fetch(createRequest("/sites/demo-runtime-site"), createEnv(), createExecutionContext());

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/i);

  const body = await response.text();
  assert.match(body, /Runtime Demo/);
  assert.match(body, /https:\/\/runtime\.example/);
  assert.match(body, /一眼看懂目前狀態/);
  assert.match(body, /正式管理站/);
  assert.match(body, /自動化功能已導入/);
  assert.match(body, /這站不使用建置同步/);
  assert.match(body, /自動化設定/);
  assert.match(body, /啟用自動化排程/);
  assert.match(body, /工作流模組/);
  assert.match(body, /目前缺少的條件/);
  assert.match(body, /目前尚未設定 D1 綁定/);
  assert.match(body, /啟用步驟/);
  assert.doesNotMatch(body, /不需要啟用排程/);
});

test("renders other admin navigation pages as HTML", async () => {
  const response = await worker.fetch(createRequest("/jobs"), createEnv(), createExecutionContext());

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/i);

  const body = await response.text();
  assert.match(body, /任務/);
  assert.match(body, /AI SEO 中控台/);
  assert.doesNotMatch(body, /Jobs|AI SEO Control/);
});

test("renders workflow modules on the templates page", async () => {
  const response = await worker.fetch(createRequest("/templates"), createEnv(), createExecutionContext());

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/i);

  const body = await response.text();
  assert.match(body, /工作流模組/);
  assert.match(body, /Runtime Demo/);
  assert.match(body, /SEO 修復/);
  assert.doesNotMatch(body, /Workflow Modules|SEO Repair/i);
});

test("renders the readiness page with a Traditional Chinese completion checklist", async () => {
  const response = await worker.fetch(createRequest("/readiness"), createEnv(), createExecutionContext());

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/i);

  const body = await response.text();
  assert.match(body, /完成度/);
  assert.match(body, /待補外部設定/);
  assert.match(body, /仍在收尾/);
  assert.match(body, /Google Search Console 排名同步/);
  assert.match(body, /可編輯 Prompt 模板層/);
  assert.match(body, /各站完成度/);
});

test("keeps the control-plane overview available as JSON under the api namespace", async () => {
  const response = await worker.fetch(
    createRequest("/api/control-plane/overview"),
    createEnv(),
    createExecutionContext()
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/i);

  const payload = (await response.json()) as { ok: boolean; managedSiteCount: number };
  assert.equal(payload.ok, true);
  assert.ok(payload.managedSiteCount >= 1);
});
