import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("review concurrency migration enforces stale-write and independent-review invariants", async () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const sql = await readFile(join(root, "supabase/migrations/202607220001_next_review_concurrency.sql"), "utf8");
  assert.match(sql, /revision bigint not null default 0/);
  assert.match(sql, /v_submission\.revision <> p_expected_revision/);
  assert.match(sql, /v_submission\.reviewed_by = p_moderator_id/);
  assert.match(sql, /second reviewer must be independent/);
  assert.match(sql, /conflict of interest requires escalation/);
  assert.match(sql, /to service_role/);
  assert.doesNotMatch(sql, /grant execute[\s\S]*to authenticated/);
});
