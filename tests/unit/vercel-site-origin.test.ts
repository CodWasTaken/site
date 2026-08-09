import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("Next Vercel builds do not canonicalize to the official production domain", async () => {
  const config = await readFile(new URL("../../astro.config.ts", import.meta.url), "utf8");

  assert.match(config, /PUBLIC_SITE_URL/);
  assert.match(config, /VERCEL_PROJECT_PRODUCTION_URL/);
  assert.doesNotMatch(config, /site:\s*["']https:\/\/perkcommons\.com["']/);
});
