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
