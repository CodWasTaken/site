import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("Next Vercel builds do not canonicalize to the official production domain", async () => {
  const config = await readFile(new URL("../../astro.config.ts", import.meta.url), "utf8");

  assert.match(config, /PUBLIC_SITE_URL/);
  assert.match(config, /VERCEL_PROJECT_PRODUCTION_URL/);
  assert.doesNotMatch(config, /site:\s*["']https:\/\/perkcommons\.com["']/);
});

test("Vercel applies the reviewed security header baseline to every route", async () => {
  const vercelText = await readFile(
    new URL("../../vercel.json", import.meta.url),
    "utf8",
  ).catch(() => null);
  assert.ok(vercelText, "vercel.json must exist");

  const staticHeaders = await readFile(
    new URL("../../public/_headers", import.meta.url),
    "utf8",
  );
  const config = JSON.parse(vercelText) as {
    headers?: Array<{
      source?: string;
      headers?: Array<{ key?: string; value?: string }>;
    }>;
    rewrites?: Array<{ source?: string; destination?: string }>;
  };
  const catchAll = config.headers?.find((entry) => entry.source === "/(.*)");
  assert.ok(catchAll, "vercel.json must apply headers to /(.*)");
  assert.deepEqual(
    config.rewrites,
    [{ source: "/api/:path*", destination: "/api?__pc_path=:path*" }],
    "Vercel should use only the narrow same-origin API rewrite",
  );
  assert.equal(
    config.rewrites?.some((entry) => entry.source === "/(.*)") ?? false,
    false,
    "Vercel must not use a catch-all rewrite",
  );

  const headers = new Map(
    (catchAll.headers ?? []).map(({ key, value }) => [key?.toLowerCase(), value]),
  );
  const csp = headers.get("content-security-policy") ?? "";
  for (const directive of [
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ]) {
    assert.match(csp, new RegExp(directive.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.ok(
    headers.get("content-security-policy-report-only"),
    "detailed CSP must remain report-only",
  );

  const parityHeaders = [
    "Referrer-Policy",
    "Permissions-Policy",
    "X-Content-Type-Options",
    "Strict-Transport-Security",
    "Cross-Origin-Opener-Policy",
  ];
  for (const name of parityHeaders) {
    const staticMatch = staticHeaders.match(new RegExp(`^\\s*${name}:\\s*(.+)$`, "mi"));
    assert.ok(staticMatch, `${name} must exist in public/_headers`);
    assert.equal(headers.get(name.toLowerCase()), staticMatch[1]?.trim(), `${name} must match public/_headers`);
  }
});