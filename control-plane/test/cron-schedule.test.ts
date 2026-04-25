import test from "node:test";
import assert from "node:assert/strict";

import { matchesScheduledTick } from "../src/core/cron-schedule";

test("matches hourly schedules at the top of the hour", () => {
  const scheduledTime = new Date("2026-04-21T08:00:00.000Z");

  assert.equal(matchesScheduledTick("0 * * * *", scheduledTime), true);
  assert.equal(matchesScheduledTick("15 * * * *", scheduledTime), false);
});

test("matches stepped hour schedules used by brand sites", () => {
  assert.equal(matchesScheduledTick("0 */6 * * *", new Date("2026-04-21T00:00:00.000Z")), true);
  assert.equal(matchesScheduledTick("0 */6 * * *", new Date("2026-04-21T06:00:00.000Z")), true);
  assert.equal(matchesScheduledTick("0 */6 * * *", new Date("2026-04-21T12:00:00.000Z")), true);
  assert.equal(matchesScheduledTick("0 */6 * * *", new Date("2026-04-21T08:00:00.000Z")), false);
});

test("matches fixed daily schedules like demo-local-site", () => {
  assert.equal(matchesScheduledTick("15 11 * * *", new Date("2026-04-21T11:15:00.000Z")), true);
  assert.equal(matchesScheduledTick("15 11 * * *", new Date("2026-04-21T11:00:00.000Z")), false);
  assert.equal(matchesScheduledTick("15 11 * * *", new Date("2026-04-21T10:15:00.000Z")), false);
});

test("returns false for empty or invalid cron expressions", () => {
  const scheduledTime = new Date("2026-04-21T11:15:00.000Z");

  assert.equal(matchesScheduledTick("", scheduledTime), false);
  assert.equal(matchesScheduledTick("not-a-cron", scheduledTime), false);
  assert.equal(matchesScheduledTick("61 * * * *", scheduledTime), false);
});
