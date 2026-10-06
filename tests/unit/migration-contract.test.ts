import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("review concurrency migration enforces stale-write and independent-review invariants", async () => {
  const sql = await readFile(join(root, "supabase/migrations/202607220001_next_review_concurrency.sql"), "utf8");
  assert.match(sql, /revision bigint not null default 0/);
  assert.match(sql, /v_submission\.revision <> p_expected_revision/);
  assert.match(sql, /v_submission\.reviewed_by = p_moderator_id/);
  assert.match(sql, /second reviewer must be independent/);
  assert.match(sql, /conflict of interest requires escalation/);
  assert.match(sql, /to service_role/);
  assert.doesNotMatch(sql, /grant execute[\s\S]*to authenticated/);
});

test("publication semantics migration preserves explicit v2 editorial decisions", async () => {
  const sql = await readFile(join(root, "supabase/migrations/202607220002_publication_semantics.sql"), "utf8");
  for (const field of [
    "resource_type", "default_search_eligible", "availability_status", "deadline_type", "program_url",
    "application_url", "claims_checked", "sponsored", "next_review_at",
  ]) assert.match(sql, new RegExp(field));
  assert.match(sql, /approved rows remain[\s\S]*explicitly reviews/i);
  assert.match(sql, /role:moderator|claims_checked/);
  assert.match(sql, /to service_role/);
  assert.doesNotMatch(sql, /grant execute[\s\S]*to authenticated/);
});

test("listing update migration keeps edits in the audited publication workflow", async () => {
  const sql = await readFile(
    join(
      root,
      "supabase/migrations/202607240001_listing_update_workflow.sql",
    ),
    "utf8",
  );
  assert.match(sql, /submission_kind text not null default 'public_submission'/);
  assert.match(sql, /target_listing_id text/);
  assert.match(sql, /create unique index if not exists opportunity_submissions_one_active_listing_update/);
  assert.match(sql, /function public\.create_listing_update/);
  assert.match(sql, /'listing_update_proposed'/);
  assert.match(sql, /submissions\.target_listing_id/);
  assert.match(sql, /grant execute on function public\.create_listing_update[\s\S]*to service_role/);
  assert.doesNotMatch(sql, /grant execute[\s\S]*to (?:anon|authenticated)/);
});

test("canonical promotion reconciliation hardens RPCs and carries review provenance", async () => {
  const migrationPath = join(
    root,
    "supabase/migrations/202609270001_canonical_promotion_reconciliation.sql",
  );
  const sql = await readFile(migrationPath, "utf8").catch(() => null);
  assert.ok(sql, "canonical promotion reconciliation migration must exist");

  assert.match(sql, /revoke execute on function public\.rls_auto_enable\(\)[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /alter function public\.touch_updated_at\(\)[\s\S]*set search_path/i);
  assert.match(sql, /alter function public\.bump_submission_revision\(\)[\s\S]*set search_path/i);
  assert.match(sql, /publication_batch_payload/i);
  for (const field of [
    "review_method",
    "review_state",
    "reviewed_at",
    "reviewer_reference",
    "source_fetched_at",
  ]) assert.match(sql, new RegExp(field));
  assert.match(sql, /submissions\.reviewed_at/);
  assert.match(sql, /submissions\.reviewed_by/);
  assert.match(sql, /grant execute on function public\.publication_batch_payload\(uuid\)[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /disable row level security/i);

  for (const indexTarget of [
    "opportunity_submissions.*reviewed_by",
    "opportunity_submissions.*assigned_moderator",
    "opportunity_submissions.*second_reviewer",
    "normalized_opportunities.*normalized_by",
    "moderation_actions.*moderator_id",
    "listing_reports.*assigned_to",
    "publication_batches.*created_by",
  ]) assert.match(sql, new RegExp(indexTarget, "is"));
});

test("greenfield generator includes canonical promotion reconciliation", async () => {
  const generator = await readFile(
    join(root, "scripts/build-greenfield-migration.mjs"),
    "utf8",
  );
  assert.match(
    generator,
    /supabase\/migrations\/202609270001_canonical_promotion_reconciliation\.sql/,
  );
  assert.match(
    generator,
    /supabase\/migrations\/202610060001_structured_application_cycle\.sql/,
  );
});

test("structured application-cycle migration preserves cadence through moderation and publication", async () => {
  const sql = await readFile(
    join(root, "supabase/migrations/202610060001_structured_application_cycle.sql"),
    "utf8",
  );
  assert.match(sql, /add column if not exists application_cycle text/);
  assert.match(sql, /p_normalized->>'application_cycle'/);
  assert.match(sql, /application_cycle = excluded\.application_cycle/);
  assert.match(sql, /normalized\.application_cycle/);
  assert.match(sql, /application_cycle text/);
  assert.match(sql, /grant execute on function public\.publication_batch_payload\(uuid\)[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /security definer\s+set search_path = public/i);
  assert.match(sql, /security definer\s+set search_path = ''/i);
  assert.doesNotMatch(sql, /grant execute[\s\S]*to (?:anon|authenticated)/i);
});
