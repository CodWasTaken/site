import assert from "node:assert/strict";
import test from "node:test";
import worker from "../index";
import type { Env } from "../lib/types";

const submission = {
  organization: "Example Foundation",
  name: "Example opportunity",
  primary_category: "funding",
  subcategories: ["grants"],
  tags: ["open-source"],
  source_url: "https://example.com/opportunity",
  organization_website_url: null,
  description: "A sufficiently detailed description for server validation.",
  eligibility: "Eligible applicants meet the published requirements.",
  benefits: null,
  location: null,
  deadline: null,
  submitter_name: null,
  submitter_email: null,
  submitter_notes: null,
  affiliation_confirmed: true,
  website: null,
  turnstile_token: null,
};

const env = {
  ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "public-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  SUBMISSION_FINGERPRINT_SECRET: "test-fingerprint-secret",
} satisfies Env;

const request = () =>
  new Request("https://perkcommons.com/api/submissions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "CF-Connecting-IP": "192.0.2.1",
    },
    body: JSON.stringify(submission),
  });

const reportRequest = (listingId: string) =>
  new Request("https://perkcommons.com/api/reports", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "CF-Connecting-IP": "192.0.2.2",
    },
    body: JSON.stringify({
      listing_id: listingId,
      reason: "Broken link",
      details: "The application link no longer opens.",
      website: "",
      turnstile_token: null,
    }),
  });

test("public submissions populate the required legacy website URL", async () => {
  const originalFetch = globalThis.fetch;
  let call = 0;
  globalThis.fetch = async (_input, init) => {
    call += 1;
    if (call <= 2) return Response.json([]);
    if (call === 3) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(body.website_url, submission.source_url);
      assert.equal(body.primary_category, "funding");
      assert.deepEqual(body.subcategories, ["grants"]);
      return Response.json([{ id: "00000000-0000-4000-8000-000000000001" }]);
    }
    return Response.json([{}]);
  };

  try {
    const response = await worker.fetch(request(), env);
    assert.equal(response.status, 201);
    assert.equal(call, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("public database failures are converted to a generic service error", async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  let call = 0;
  globalThis.fetch = async () => {
    call += 1;
    if (call <= 2) return Response.json([]);
    return Response.json(
      {
        code: "23502",
        message: 'null value in column "website_url" violates constraint',
      },
      { status: 400 },
    );
  };
  console.error = () => undefined;

  try {
    const response = await worker.fetch(request(), env);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: {
        code: "service_unavailable",
        message: "The submission service is temporarily unavailable.",
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});

test("public submissions reject invalid Turnstile tokens before insertion", async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  let call = 0;
  const protectedEnv = {
    ...env,
    TURNSTILE_SECRET_KEY: "test-turnstile-secret",
  } satisfies Env;
  globalThis.fetch = async (input) => {
    call += 1;
    if (call === 1) return Response.json([]);
    assert.equal(
      String(input),
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    );
    return Response.json({
      success: false,
      "error-codes": ["invalid-input-response"],
    });
  };
  console.warn = () => undefined;

  try {
    const response = await worker.fetch(request(), protectedEnv);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: {
        code: "spam_check_failed",
        message: "Spam verification failed.",
      },
    });
    assert.equal(call, 2);
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test("reports reject IDs absent from the static manifest", async () => {
  const reportEnv = {
    ...env,
    ASSETS: {
      fetch: async () => Response.json({ listingIds: ["known-listing"] }),
    },
  } satisfies Env;
  const response = await worker.fetch(reportRequest("missing-listing"), reportEnv);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: {
      code: "listing_not_found",
      message: "This listing does not exist in the public catalogue.",
    },
  });
});

test("duplicate open reports return success without another insert", async () => {
  const originalFetch = globalThis.fetch;
  let call = 0;
  const reportEnv = {
    ...env,
    ASSETS: {
      fetch: async () => Response.json({ listingIds: ["known-listing"] }),
    },
  } satisfies Env;
  globalThis.fetch = async () => {
    call += 1;
    return call === 1
      ? Response.json([])
      : Response.json([{ id: "existing-report" }]);
  };
  try {
    const response = await worker.fetch(reportRequest("known-listing"), reportEnv);
    assert.equal(response.status, 201);
    assert.equal(call, 2);
    assert.deepEqual(await response.json(), { message: "Submitted for review." });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
