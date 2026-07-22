import assert from "node:assert/strict";
import test from "node:test";
import worker from "../index";
import type { Env } from "../lib/types";

const baseEnv = {
  ASSETS: { fetch: async () => new Response("asset", { status: 200, headers: { "content-type": "text/plain" } }) },
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "public-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  SUBMISSION_FINGERPRINT_SECRET: "fingerprint-secret",
} satisfies Env;

test("central security headers wrap static asset responses", async () => {
  const response = await worker.fetch(new Request("https://fork.example/about/"), baseEnv);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-security-policy-report-only") ?? "", /default-src 'self'/);
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(response.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin-allow-popups");
});

test("edge tombstones return 410 without consulting Supabase", async () => {
  let databaseCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { databaseCalled = true; throw new Error("Database must not be called"); };
  const env = {
    ...baseEnv,
    TOMBSTONE_STORE: {
      get: async (key: string) => key === "unsafe-listing" ? "{\"state\":\"suppressed\"}" : null,
      put: async () => undefined,
    },
  } satisfies Env;
  try {
    const response = await worker.fetch(new Request("https://fork.example/opportunities/unsafe-listing/"), env);
    assert.equal(response.status, 410);
    assert.equal(databaseCalled, false);
    assert.match(response.headers.get("content-security-policy-report-only") ?? "", /frame-ancestors 'none'/);
  } finally { globalThis.fetch = originalFetch; }
});

test("public catalogue API paginates static records and exposes metadata", async () => {
  const env = {
    ...baseEnv,
    ASSETS: {
      fetch: async (request: Request) => {
        assert.equal(new URL(request.url).pathname, "/data/opportunities.json");
        return Response.json({ metadata: { dataCommitSha: "data-sha", schemaVersion: "1+2.0" }, records: [{ id: "one" }, { id: "two" }, { id: "three" }] });
      },
    },
  } satisfies Env;
  const response = await worker.fetch(new Request("https://fork.example/api/v1/opportunities?limit=2"), env);
  assert.equal(response.status, 200);
  const body = await response.json() as { pagination: { returned: number; total: number; nextCursor: string }; records: Array<{ id: string }> };
  assert.equal(body.pagination.returned, 2);
  assert.equal(body.pagination.total, 3);
  assert.deepEqual(body.records.map((record) => record.id), ["one", "two"]);
  assert.ok(body.pagination.nextCursor);
});

test("public listing state is ID-scoped, deduplicated, and cacheable", async () => {
  const originalFetch = globalThis.fetch;
  let query = "";
  globalThis.fetch = async (input) => {
    query = String(input);
    return Response.json([
      { listing_id: "one", featured: true, removed: false },
    ]);
  };
  try {
    const first = await worker.fetch(
      new Request("https://fork.example/api/listings/state?id=one&id=one&id=two"),
      baseEnv,
    );
    assert.equal(first.status, 200);
    assert.match(query, /listing_id=in\.\(one,two\)/);
    assert.match(first.headers.get("cache-control") ?? "", /s-maxage=60/);
    const etag = first.headers.get("etag");
    assert.ok(etag);
    const second = await worker.fetch(
      new Request("https://fork.example/api/listings/state?id=one&id=two", {
        headers: { "if-none-match": etag },
      }),
      baseEnv,
    );
    assert.equal(second.status, 304);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("publication and removal cron reconciliation settle independently", async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  let removalQueried = false;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("publication_batches?status=in.")) return Response.json({ message: "publication unavailable" }, { status: 500 });
    if (url.includes("listing_removal_batches?status=in.")) { removalQueried = true; return Response.json([]); }
    if (url.includes("listing_removal_batches?status=eq.removed")) return Response.json([]);
    throw new Error(`Unexpected request: ${url}`);
  };
  console.error = () => undefined;
  let pending: Promise<unknown> | undefined;
  const context = { waitUntil(promise: Promise<unknown>) { pending = promise; } } as ExecutionContext;
  const env = { ...baseEnv, GITHUB_DATA_PUBLICATION_TOKEN: "fork-token", GITHUB_SITE_DEPLOY_TOKEN: "fork-token" } satisfies Env;
  try {
    await worker.scheduled({} as ScheduledController, env, context);
    await pending;
    assert.equal(removalQueried, true);
  } finally { globalThis.fetch = originalFetch; console.error = originalError; }
});

test("one-sided Turnstile configuration fails closed in production mode", async () => {
  const env = { ...baseEnv, ENVIRONMENT: "production", TURNSTILE_SECRET_KEY: "secret" } satisfies Env;
  const response = await worker.fetch(new Request("https://fork.example/api/submissions", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), env);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: { code: "configuration_error", message: "Submission protection is misconfigured." } });
});

test("queue summary pagination excludes private submission fields", async () => {
  const originalFetch = globalThis.fetch;
  let summaryQuery = "";
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user")) return Response.json({ id: "22222222-2222-4222-8222-222222222222", email: "moderator@example.org" });
    if (url.includes("moderator_profiles")) return Response.json([{ role: "reviewer" }]);
    if (url.includes("opportunity_submissions")) {
      summaryQuery = url;
      return Response.json([{ id: "11111111-1111-4111-8111-111111111111", name: "Public title", organization: "Provider", primary_category: "funding", status: "pending", risk_score: 0, flag_count: 0, submission_country_code: "PL", created_at: "2026-07-22T10:00:00Z", updated_at: "2026-07-22T10:00:00Z" }], { headers: { "content-range": "0-0/37" } });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    const response = await worker.fetch(new Request("https://fork.example/api/moderation/queue/summary?status=pending&limit=25", { headers: { cookie: "pc_moderator_session=test-session" } }), baseEnv);
    assert.equal(response.status, 200);
    const body = await response.json() as { total: number; submissions: Array<Record<string, unknown>> };
    assert.equal(body.total, 37);
    assert.equal(body.submissions[0]?.name, "Public title");
    assert.equal("submitter_email" in body.submissions[0]!, false);
    assert.doesNotMatch(summaryQuery, /submitter_(email|name|notes)|description|eligibility/);
  } finally { globalThis.fetch = originalFetch; }
});
