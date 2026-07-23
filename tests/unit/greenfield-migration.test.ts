import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const baselinePath = join(
  root,
  "supabase/greenfield/00000000000000_perkcommons_fork.sql",
);

test("greenfield migration creates every Worker database boundary", async () => {
  const sql = await readFile(baselinePath, "utf8");
  for (const table of [
    "opportunity_submissions",
    "moderator_profiles",
    "normalized_opportunities",
    "moderation_actions",
    "submission_flags",
    "listing_reports",
    "moderation_bans",
    "submission_fingerprints",
    "moderation_retention_runs",
    "listing_moderation_state",
    "publication_batches",
    "publication_batch_items",
    "listing_removal_batches",
  ])
    assert.match(sql, new RegExp(`create table(?: if not exists)? public\\.${table}\\b`));

  for (const rpc of [
    "perform_moderation_action",
    "undo_moderation_action",
    "create_moderation_ban",
    "disable_moderation_ban",
    "create_submission_bans",
    "apply_moderation_retention",
    "resolve_listing_report",
    "set_listing_featured",
    "purge_rejected_submissions",
    "begin_publication_batch",
    "publication_batch_payload",
    "finalize_publication_batch",
    "finalize_listing_removal_batch",
    "claim_submission",
    "complete_second_review",
    "create_listing_update",
  ])
    assert.match(sql, new RegExp(`function public\\.${rpc}\\b`));
});

test("greenfield migration is private, Supabase-specific, and generated once", async () => {
  const sql = await readFile(baselinePath, "utf8");
  assert.match(sql, /to_regclass\('auth\.users'\)/);
  assert.match(sql, /greenfield baseline requires an empty public application schema/);
  assert.match(sql, /enable row level security/g);
  assert.match(sql, /grant all privileges on all tables in schema public to service_role/);
  assert.match(sql, /revoke all privileges on all tables in schema public from anon, authenticated/);
  assert.match(sql, /security definer\s+set search_path = ''/i);
  assert.doesNotMatch(sql, /security definer\s+set search_path = public/i);
  assert.equal((sql.match(/^begin;$/gim) ?? []).length, 1);
  assert.equal((sql.match(/^commit;$/gim) ?? []).length, 1);
  assert.doesNotMatch(sql, /github\.com\/PerkCommons\/(?:site|data|docs|branding)/);
  assert.doesNotMatch(sql, /(?:gh[pousr]_|AKIA)[A-Za-z0-9_-]{12,}/);
});
