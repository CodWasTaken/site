import assert from "node:assert/strict";
import test from "node:test";
import worker from "../index";
import type { Env } from "../lib/types";

const baseEnv = {
  ASSETS: {
    fetch: async () => new Response("asset", { status: 200 }),
  },
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "public-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  SUBMISSION_FINGERPRINT_SECRET: "fingerprint-secret",
} satisfies Env;

test("public moderator probe is quiet when no session is present", async () => {
  const response = await worker.fetch(
    new Request("https://fork.example/api/auth/me"),
    baseEnv,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { moderator: null });
});
