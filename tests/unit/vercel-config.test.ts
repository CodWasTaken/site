import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

interface VercelConfig {
  crons?: Array<{ path: string; schedule: string }>;
}

test("Vercel reconciliation cron is deployable on Hobby", async () => {
  const raw = await readFile(new URL("../../vercel.json", import.meta.url), "utf8");
  const config = JSON.parse(raw) as VercelConfig;
  const reconciliation = config.crons?.find(
    (cron) => cron.path === "/api/cron/reconcile",
  );

  assert.ok(reconciliation, "reconciliation cron must remain configured");
  assert.equal(
    reconciliation.schedule,
    "0 3 * * *",
    "Hobby deployments must not schedule reconciliation more than once per day",
  );
});

test("Vercel API graph uses bundler module resolution", async () => {
  const raw = await readFile(
    new URL("../../api/tsconfig.json", import.meta.url),
    "utf8",
  );
  const config = JSON.parse(raw) as {
    compilerOptions?: { module?: string; moduleResolution?: string };
  };

  assert.equal(config.compilerOptions?.module, "ESNext");
  assert.equal(config.compilerOptions?.moduleResolution, "Bundler");
});


test("Vercel public API uses build-time catalogue assets instead of self-fetching", async () => {
  const [apiSource, packageRaw] = await Promise.all([
    readFile(new URL("../../api/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../package.json", import.meta.url), "utf8"),
  ]);
  const pkg = JSON.parse(packageRaw) as { scripts?: Record<string, string> };

  assert.match(apiSource, /generated-catalog\.mjs/);
  assert.match(apiSource, /createCatalogAssetsBinding/);
  assert.match(apiSource, /env\.ASSETS\s*=/);
  assert.match(
    pkg.scripts?.build ?? "",
    /generate-vercel-catalog/,
    "the build must generate catalogue data before Vercel traces functions",
  );
});
