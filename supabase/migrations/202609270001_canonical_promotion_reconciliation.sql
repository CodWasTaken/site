begin;

-- Canonical PerkCommons promotion reconciliation.
--
-- The hosted Supabase project predates Supabase's recorded migration history,
-- so this migration is deliberately forward-only. It reconciles the live
-- schema without replaying the historical migration chain or rebuilding data.

-- Trigger/event-trigger helpers do not need browser-callable EXECUTE grants.
revoke execute on function public.rls_auto_enable()
  from public, anon, authenticated;
revoke execute on function public.touch_updated_at()
  from public, anon, authenticated;
revoke execute on function public.bump_submission_revision()
  from public, anon, authenticated;

-- Fix mutable search paths. These trigger functions use only NEW/OLD values and
-- pg_catalog built-ins, so they do not require access through public search_path.
alter function public.touch_updated_at()
  set search_path = pg_catalog;
alter function public.bump_submission_revision()
  set search_path = pg_catalog;

-- Existing server-only listing-update RPC is fully schema-qualified internally.
alter function public.create_listing_update(
  uuid, text, timestamptz, jsonb
) set search_path = '';

-- Publication payloads must carry the real moderation event. Normalization time
-- is not a human-review timestamp and must never be promoted into one.
drop function if exists public.publication_batch_payload(uuid);

create function public.publication_batch_payload(
  p_batch_id uuid
) returns table (
  submission_id uuid,
  target_listing_id text,
  original_created_at timestamptz,
  title text,
  organization text,
  primary_category text,
  subcategories text[],
  tags text[],
  description text,
  eligibility text,
  benefits text,
  resource_type text,
  default_search_eligible boolean,
  availability_status text,
  status_reason text,
  deadline_type text,
  deadline date,
  global boolean,
  remote boolean,
  countries text[],
  physical_locations text[],
  provider_url text,
  program_url text,
  application_url text,
  sponsored boolean,
  sponsorship_type text,
  sponsorship_disclosure text,
  claims_checked text[],
  next_review_at date,
  normalized_at timestamptz,
  review_method text,
  review_state text,
  reviewed_at timestamptz,
  reviewer_reference text,
  source_fetched_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    items.submission_id,
    submissions.target_listing_id,
    submissions.original_created_at,
    normalized.title,
    normalized.organization,
    normalized.primary_category,
    normalized.subcategories,
    normalized.tags,
    normalized.description,
    normalized.eligibility,
    normalized.benefits,
    normalized.resource_type,
    normalized.default_search_eligible,
    normalized.availability_status,
    normalized.status_reason,
    normalized.deadline_type,
    normalized.deadline,
    normalized.global,
    normalized.remote,
    normalized.countries,
    normalized.physical_locations,
    normalized.provider_url,
    normalized.program_url,
    normalized.application_url,
    normalized.sponsored,
    normalized.sponsorship_type,
    normalized.sponsorship_disclosure,
    normalized.claims_checked,
    normalized.next_review_at,
    normalized.updated_at,
    case
      when submissions.reviewed_at is not null
       and submissions.reviewed_by is not null
      then 'human'::text
      else 'legacy-record-migration'::text
    end as review_method,
    case
      when submissions.reviewed_at is not null
       and submissions.reviewed_by is not null
      then 'published'::text
      else 'needs-human-review'::text
    end as review_state,
    case
      when submissions.reviewed_at is not null
       and submissions.reviewed_by is not null
      then submissions.reviewed_at
      else null::timestamptz
    end as reviewed_at,
    case
      when submissions.reviewed_at is not null
       and submissions.reviewed_by is not null
      then 'role:moderator'::text
      else 'migration:missing-human-review-provenance'::text
    end as reviewer_reference,
    null::timestamptz as source_fetched_at
  from public.publication_batch_items as items
  inner join public.opportunity_submissions as submissions
    on submissions.id = items.submission_id
  inner join public.normalized_opportunities as normalized
    on normalized.submission_id = items.submission_id
  where items.batch_id = p_batch_id
  order by normalized.organization, normalized.title, items.submission_id;
$$;

revoke all on function public.publication_batch_payload(uuid)
  from public, anon, authenticated;
grant execute on function public.publication_batch_payload(uuid)
  to service_role;

-- Reassert server-only listing-update access after hardening its search path.
revoke all on function public.create_listing_update(
  uuid, text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.create_listing_update(
  uuid, text, timestamptz, jsonb
) to service_role;

-- Cover foreign keys used by moderation/publication integrity operations.
create index if not exists listing_moderation_state_removal_report_id_fk_idx
  on public.listing_moderation_state (removal_report_id);
create index if not exists listing_moderation_state_updated_by_fk_idx
  on public.listing_moderation_state (updated_by);
create index if not exists listing_removal_batches_created_by_fk_idx
  on public.listing_removal_batches (created_by);
create index if not exists listing_reports_assigned_to_fk_idx
  on public.listing_reports (assigned_to);
create index if not exists moderation_actions_moderator_id_fk_idx
  on public.moderation_actions (moderator_id);
create index if not exists moderation_bans_created_by_fk_idx
  on public.moderation_bans (created_by);
create index if not exists normalized_opportunities_normalized_by_fk_idx
  on public.normalized_opportunities (normalized_by);
create index if not exists opportunity_submissions_assigned_moderator_fk_idx
  on public.opportunity_submissions (assigned_moderator);
create index if not exists opportunity_submissions_proposed_by_moderator_fk_idx
  on public.opportunity_submissions (proposed_by_moderator);
create index if not exists opportunity_submissions_reviewed_by_fk_idx
  on public.opportunity_submissions (reviewed_by);
create index if not exists opportunity_submissions_second_reviewer_fk_idx
  on public.opportunity_submissions (second_reviewer);
create index if not exists publication_batches_created_by_fk_idx
  on public.publication_batches (created_by);
create index if not exists submission_flags_moderator_id_fk_idx
  on public.submission_flags (moderator_id);
create index if not exists submission_flags_resolved_by_fk_idx
  on public.submission_flags (resolved_by);

commit;
