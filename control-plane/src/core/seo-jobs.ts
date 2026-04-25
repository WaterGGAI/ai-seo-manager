import type { SeoJob, SeoJobEvent, SeoJobStatus, SeoJobTriggerSource } from "./seo-types";

const DEFAULT_JOB_LIMIT = 10;
const DEFAULT_EVENT_LIMIT = 12;

type SeoJobRow = {
  id: string;
  site_id: string;
  job_type: string;
  status: string;
  trigger_source: string;
  payload_json: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

type SeoJobEventRow = {
  id: string;
  job_id: string;
  event_type: string;
  message: string;
  metadata_json: string | null;
  created_at: string;
};

type RecordMetadata = Record<string, unknown>;

export class SeoJobError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "SeoJobError";
    this.status = status;
  }
}

export type SeoJobReporter = {
  jobId: string;
  siteId: string;
  event: (eventType: string, message: string, metadata?: RecordMetadata) => Promise<void>;
};

function parseObject(value: string | null): RecordMetadata {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as RecordMetadata;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeJobStatus(value: string): SeoJobStatus {
  if (value === "completed" || value === "failed") {
    return value;
  }

  return "running";
}

function normalizeTriggerSource(value: string): SeoJobTriggerSource {
  if (value === "scheduled_cron" || value === "bootstrap") {
    return value;
  }

  return "manual_api";
}

function mapJob(row: SeoJobRow, events: SeoJobEvent[]): SeoJob {
  return {
    id: row.id,
    jobType: row.job_type,
    status: normalizeJobStatus(row.status),
    triggerSource: normalizeTriggerSource(row.trigger_source),
    payload: parseObject(row.payload_json),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    events
  };
}

async function createSeoJobRecord(
  db: D1Database,
  options: {
    jobId: string;
    siteId: string;
    jobType: string;
    triggerSource: SeoJobTriggerSource;
    payload?: RecordMetadata;
    startedAt: string;
  }
) {
  await db
    .prepare(
      `
      INSERT INTO seo_jobs (
        id,
        site_id,
        job_type,
        status,
        trigger_source,
        payload_json,
        started_at,
        finished_at,
        created_at,
        updated_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8, ?9)
      `
    )
    .bind(
      options.jobId,
      options.siteId,
      options.jobType,
      "running",
      options.triggerSource,
      options.payload ? JSON.stringify(options.payload) : null,
      options.startedAt,
      options.startedAt,
      options.startedAt
    )
    .run();
}

async function updateSeoJobStatus(
  db: D1Database,
  jobId: string,
  status: SeoJobStatus,
  finishedAt: string | null
) {
  await db
    .prepare(
      `
      UPDATE seo_jobs
      SET status = ?2,
          finished_at = ?3,
          updated_at = ?4
      WHERE id = ?1
      `
    )
    .bind(jobId, status, finishedAt, finishedAt ?? new Date().toISOString())
    .run();
}

export async function appendSeoJobEvent(
  db: D1Database,
  options: {
    jobId: string;
    eventType: string;
    message: string;
    metadata?: RecordMetadata;
  }
) {
  const createdAt = new Date().toISOString();
  await db
    .prepare(
      `
      INSERT INTO seo_job_events (
        id,
        job_id,
        event_type,
        message,
        metadata_json,
        created_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      `
    )
    .bind(
      crypto.randomUUID(),
      options.jobId,
      options.eventType,
      options.message,
      options.metadata ? JSON.stringify(options.metadata) : null,
      createdAt
    )
    .run();
}

async function listSeoJobEvents(db: D1Database, jobId: string, limit: number) {
  const result = await db
    .prepare(
      `
      SELECT id, job_id, event_type, message, metadata_json, created_at
      FROM seo_job_events
      WHERE job_id = ?1
      ORDER BY created_at DESC
      LIMIT ?2
      `
    )
    .bind(jobId, limit)
    .all<SeoJobEventRow>();

  return (result.results ?? [])
    .slice()
    .reverse()
    .map((row) => ({
      id: row.id,
      eventType: row.event_type,
      message: row.message,
      metadata: parseObject(row.metadata_json),
      createdAt: row.created_at
    }));
}

export async function readSeoJob(env: Cloudflare.Env, jobId: string, options: { eventLimit?: number } = {}) {
  if (!env.DB) {
    return null;
  }

  const row = await env.DB
    .prepare(
      `
      SELECT id, site_id, job_type, status, trigger_source, payload_json, started_at, finished_at, created_at, updated_at
      FROM seo_jobs
      WHERE id = ?1
      LIMIT 1
      `
    )
    .bind(jobId)
    .first<SeoJobRow>();

  if (!row) {
    return null;
  }

  const events = await listSeoJobEvents(env.DB, jobId, options.eventLimit ?? DEFAULT_EVENT_LIMIT);
  return mapJob(row, events);
}

export async function listSeoJobsForSite(
  env: Cloudflare.Env,
  siteId: string,
  options: { limit?: number; eventLimit?: number } = {}
) {
  if (!env.DB) {
    return [];
  }

  const result = await env.DB
    .prepare(
      `
      SELECT id, site_id, job_type, status, trigger_source, payload_json, started_at, finished_at, created_at, updated_at
      FROM seo_jobs
      WHERE site_id = ?1
      ORDER BY created_at DESC
      LIMIT ?2
      `
    )
    .bind(siteId, options.limit ?? DEFAULT_JOB_LIMIT)
    .all<SeoJobRow>();

  const items: SeoJob[] = [];
  for (const row of result.results ?? []) {
    const events = await listSeoJobEvents(env.DB, row.id, options.eventLimit ?? DEFAULT_EVENT_LIMIT);
    items.push(mapJob(row, events));
  }

  return items;
}

export async function runSeoJob<T>(
  env: Cloudflare.Env,
  options: {
    siteId: string;
    jobType: string;
    triggerSource: SeoJobTriggerSource;
    payload?: RecordMetadata;
    eventLimit?: number;
  },
  handler: (reporter: SeoJobReporter) => Promise<T>
) {
  if (!env.DB) {
    throw new SeoJobError("D1 binding is not configured yet.", 503);
  }

  const startedAt = new Date().toISOString();
  const jobId = crypto.randomUUID();

  await createSeoJobRecord(env.DB, {
    jobId,
    siteId: options.siteId,
    jobType: options.jobType,
    triggerSource: options.triggerSource,
    payload: options.payload,
    startedAt
  });

  await appendSeoJobEvent(env.DB, {
    jobId,
    eventType: "job_started",
    message: `Started ${options.jobType}.`,
    metadata: {
      triggerSource: options.triggerSource,
      ...options.payload
    }
  });

  const reporter: SeoJobReporter = {
    jobId,
    siteId: options.siteId,
    event: async (eventType, message, metadata = {}) => {
      await appendSeoJobEvent(env.DB!, {
        jobId,
        eventType,
        message,
        metadata
      });
    }
  };

  try {
    const result = await handler(reporter);
    const finishedAt = new Date().toISOString();

    await appendSeoJobEvent(env.DB, {
      jobId,
      eventType: "job_completed",
      message: `Completed ${options.jobType}.`,
      metadata: {
        triggerSource: options.triggerSource
      }
    });
    await updateSeoJobStatus(env.DB, jobId, "completed", finishedAt);

    return {
      job: (await readSeoJob(env, jobId, { eventLimit: options.eventLimit }))!,
      result
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);

    await appendSeoJobEvent(env.DB, {
      jobId,
      eventType: "job_failed",
      message,
      metadata: {
        triggerSource: options.triggerSource
      }
    });
    await updateSeoJobStatus(env.DB, jobId, "failed", finishedAt);

    throw error;
  }
}
