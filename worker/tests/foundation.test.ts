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

test("unconfirmed listing queue is authenticated, filtered, and paginated without private data", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user"))
      return Response.json({
        id: "22222222-2222-4222-8222-222222222222",
        email: "moderator@example.org",
      });
    if (url.includes("moderator_profiles"))
      return Response.json([{ role: "reviewer" }]);
    throw new Error(`Unexpected request: ${url}`);
  };
  const records = [
    {
      id: "old-grant",
      provider: "Example Foundation",
      title: "Old Grant",
      description: "An unconfirmed grant.",
      benefit: "$1,000",
      category: "funding",
      categoryLabel: "Funding",
      status: "unconfirmed",
      reviewDate: "2025-01-01",
      resourceType: "funding",
      defaultSearchEligible: true,
      canonicalUrl: "/opportunities/old-grant/",
      destinationUrl: "https://example.org/grant",
    },
    {
      id: "current-grant",
      provider: "Example Foundation",
      title: "Current Grant",
      description: "A confirmed grant.",
      benefit: "$2,000",
      category: "funding",
      categoryLabel: "Funding",
      status: "open",
      reviewDate: "2026-01-01",
      resourceType: "funding",
      defaultSearchEligible: true,
      canonicalUrl: "/opportunities/current-grant/",
      destinationUrl: "https://example.org/current",
    },
    {
      id: "old-resource",
      provider: "Other Provider",
      title: "Old Resource",
      description: "An unconfirmed resource.",
      benefit: "Free access",
      category: "education-training",
      categoryLabel: "Education and training",
      status: "unconfirmed",
      reviewDate: "2025-02-01",
      resourceType: "learning-resource",
      defaultSearchEligible: false,
      canonicalUrl: "/opportunities/old-resource/",
      destinationUrl: "https://other.example/resource",
    },
  ];
  const env = {
    ...baseEnv,
    ASSETS: {
      fetch: async (request: Request) => {
        assert.equal(new URL(request.url).pathname, "/catalog-index.json");
        return Response.json({ records });
      },
    },
  } satisfies Env;
  try {
    const unauthorized = await worker.fetch(
      new Request("https://fork.example/api/moderation/listings/unconfirmed"),
      env,
    );
    assert.equal(unauthorized.status, 401);

    const response = await worker.fetch(
      new Request(
        "https://fork.example/api/moderation/listings/unconfirmed?category=funding&search=foundation&limit=1",
        { headers: { cookie: "pc_moderator_session=test-session" } },
      ),
      env,
    );
    assert.equal(response.status, 200);
    const body = await response.json() as {
      total: number;
      count: number;
      nextCursor: string | null;
      listings: Array<Record<string, unknown>>;
    };
    assert.equal(body.total, 1);
    assert.equal(body.count, 1);
    assert.equal(body.nextCursor, null);
    assert.equal(body.listings[0]?.id, "old-grant");
    assert.equal("submitter_email" in body.listings[0]!, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("listing edits create an audited pending update instead of mutating the static asset", async () => {
  const originalFetch = globalThis.fetch;
  const rpcBodies: Record<string, unknown>[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user"))
      return Response.json({
        id: "22222222-2222-4222-8222-222222222222",
        email: "moderator@example.org",
      });
    if (url.includes("moderator_profiles"))
      return Response.json([{ role: "reviewer" }]);
    if (
      url.includes("opportunity_submissions?submission_kind=eq.listing_update")
    )
      return Response.json([]);
    if (url.endsWith("/rpc/create_listing_update")) {
      rpcBodies.push(
        JSON.parse(String(init?.body)) as Record<string, unknown>,
      );
      return Response.json("11111111-1111-4111-8111-111111111111");
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const env = {
    ...baseEnv,
    ASSETS: {
      fetch: async (request: Request) => {
        assert.equal(new URL(request.url).pathname, "/data/opportunities.json");
        return Response.json({
          records: [
            {
              id: "existing-grant",
              provider: "Example Foundation",
              title: "Existing Grant",
              category: "funding",
              subcategories: ["research-funding"],
              tags: ["open-source"],
              description: "Existing public description.",
              eligibility: "Existing public eligibility.",
              value: "$1,000",
              sourceUrl: "https://example.org/grant",
              officialUrl: "https://example.org/grant/apply",
              status: "unconfirmed",
              reviewDate: "2025-01-01",
              reviewedAt: "2025-01-01T12:00:00Z",
            },
          ],
        });
      },
    },
  } satisfies Env;
  try {
    const response = await worker.fetch(
      new Request(
        "https://fork.example/api/moderation/listings/existing-grant/updates",
        {
          method: "POST",
          headers: {
            cookie: "pc_moderator_session=test-session",
            origin: "https://fork.example",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            normalized: {
              title: "Existing Grant",
              organization: "Example Foundation",
              primary_category: "funding",
              categories: ["funding"],
              subcategories: ["research-funding"],
              tags: ["open-source"],
              description: "A moderator-researched factual description.",
              eligibility: "Open-source maintainers may apply.",
              benefits: "$1,000 in funding.",
              location: "Global",
              deadline: "",
              resource_type: "funding",
              default_search_eligible: true,
              availability_status: "open",
              status_reason: "Applications are open on the official page.",
              deadline_type: "none",
              global: true,
              remote: true,
              countries: [],
              program_url: "https://example.org/grant",
              provider_url: "https://example.org",
              application_url: "https://example.org/grant/apply",
              claims_checked: [
                "program-exists",
                "eligibility",
                "benefit",
                "application-url",
              ],
              next_review_at: "2026-10-24",
              sponsored: false,
              sponsorship_type: "",
              sponsorship_disclosure: "",
            },
          }),
        },
      ),
      env,
    );
    assert.equal(response.status, 202);
    assert.equal(rpcBodies[0]?.p_target_listing_id, "existing-grant");
    assert.equal(
      rpcBodies[0]?.p_original_created_at,
      "2025-01-01T12:00:00Z",
    );
    assert.equal(
      (rpcBodies[0]?.p_normalized as Record<string, unknown>)
        .availability_status,
      "open",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
