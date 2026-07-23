begin;

-- Fork-only workflow for proposing changes to records that already exist in
-- the canonical Git dataset. A proposal remains a normal pending moderation
-- item and cannot reach Git until it is explicitly approved and published.
alter table public.opportunity_submissions
  add column if not exists submission_kind text not null default 'public_submission',
  add column if not exists target_listing_id text,
  add column if not exists proposed_by_moderator uuid references auth.users(id) on delete set null,
  add column if not exists original_created_at timestamptz;

alter table public.opportunity_submissions
  drop constraint if exists opportunity_submissions_kind_check,
  drop constraint if exists opportunity_submissions_target_listing_check,
  add constraint opportunity_submissions_kind_check
    check (submission_kind in ('public_submission', 'listing_update')),
  add constraint opportunity_submissions_target_listing_check
    check (
      (submission_kind = 'public_submission' and target_listing_id is null)
      or
      (
        submission_kind = 'listing_update'
        and target_listing_id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      )
    );

create unique index if not exists opportunity_submissions_one_active_listing_update
  on public.opportunity_submissions (target_listing_id)
  where submission_kind = 'listing_update'
    and status in ('pending', 'reviewing', 'flagged', 'approved');

create or replace function public.create_listing_update(
  p_moderator_id uuid,
  p_target_listing_id text,
  p_original_created_at timestamptz,
  p_normalized jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission_id uuid;
begin
  if not exists (
    select 1 from public.moderator_profiles
    where user_id = p_moderator_id and active = true
  ) then
    raise exception 'moderator access required';
  end if;
  if p_target_listing_id is null
     or p_target_listing_id !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'invalid target listing';
  end if;
  if p_normalized is null or jsonb_typeof(p_normalized) <> 'object' then
    raise exception 'normalized listing is required';
  end if;

  insert into public.opportunity_submissions (
    organization, name, categories, primary_category, subcategories, tags,
    source_url, organization_website_url, description, eligibility, benefits,
    location, deadline, status, submission_kind, target_listing_id,
    proposed_by_moderator, original_created_at, submitter_name,
    submitter_email, submitter_notes
  ) values (
    p_normalized->>'organization',
    p_normalized->>'title',
    coalesce(array(select jsonb_array_elements_text(p_normalized->'categories')), '{}'),
    p_normalized->>'primary_category',
    coalesce(array(select jsonb_array_elements_text(p_normalized->'subcategories')), '{}'),
    coalesce(array(select jsonb_array_elements_text(p_normalized->'tags')), '{}'),
    p_normalized->>'source_url',
    p_normalized->>'organization_website_url',
    p_normalized->>'description',
    p_normalized->>'eligibility',
    p_normalized->>'benefits',
    p_normalized->>'location',
    nullif(p_normalized->>'deadline', '')::date,
    'pending',
    'listing_update',
    p_target_listing_id,
    p_moderator_id,
    p_original_created_at,
    null,
    null,
    'Moderator-proposed update to an existing canonical listing.'
  )
  returning id into v_submission_id;

  insert into public.normalized_opportunities (
    submission_id, title, organization, categories, primary_category,
    subcategories, tags, description, eligibility, benefits, location,
    deadline, source_url, organization_website_url, resource_type,
    default_search_eligible, availability_status, status_reason,
    deadline_type, global, remote, countries, physical_locations,
    provider_url, program_url, application_url, sponsored,
    sponsorship_type, sponsorship_disclosure, claims_checked,
    next_review_at, normalized_by
  ) values (
    v_submission_id,
    p_normalized->>'title',
    p_normalized->>'organization',
    coalesce(array(select jsonb_array_elements_text(p_normalized->'categories')), '{}'),
    p_normalized->>'primary_category',
    coalesce(array(select jsonb_array_elements_text(p_normalized->'subcategories')), '{}'),
    coalesce(array(select jsonb_array_elements_text(p_normalized->'tags')), '{}'),
    p_normalized->>'description',
    p_normalized->>'eligibility',
    p_normalized->>'benefits',
    p_normalized->>'location',
    nullif(p_normalized->>'deadline', '')::date,
    p_normalized->>'source_url',
    p_normalized->>'organization_website_url',
    p_normalized->>'resource_type',
    (p_normalized->>'default_search_eligible')::boolean,
    p_normalized->>'availability_status',
    p_normalized->>'status_reason',
    p_normalized->>'deadline_type',
    nullif(p_normalized->>'global', '')::boolean,
    nullif(p_normalized->>'remote', '')::boolean,
    coalesce(array(select jsonb_array_elements_text(p_normalized->'countries')), '{}'),
    coalesce(array(select jsonb_array_elements_text(p_normalized->'physical_locations')), '{}'),
    p_normalized->>'provider_url',
    p_normalized->>'program_url',
    p_normalized->>'application_url',
    nullif(p_normalized->>'sponsored', '')::boolean,
    p_normalized->>'sponsorship_type',
    p_normalized->>'sponsorship_disclosure',
    coalesce(array(select jsonb_array_elements_text(p_normalized->'claims_checked')), '{}'),
    nullif(p_normalized->>'next_review_at', '')::date,
    p_moderator_id
  );

  insert into public.moderation_actions (
    submission_id, moderator_id, action, reason, previous_status, new_status,
    metadata
  ) values (
    v_submission_id,
    p_moderator_id,
    'listing_update_proposed',
    'Proposed an update to an existing canonical listing',
    null,
    'pending',
    jsonb_build_object('target_listing_id', p_target_listing_id)
  );

  return v_submission_id;
end;
$$;

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
  normalized_at timestamptz
)
language sql
security definer
set search_path = public
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
    normalized.updated_at
  from public.publication_batch_items as items
  inner join public.opportunity_submissions as submissions
    on submissions.id = items.submission_id
  inner join public.normalized_opportunities as normalized
    on normalized.submission_id = items.submission_id
  where items.batch_id = p_batch_id
  order by normalized.organization, normalized.title, items.submission_id;
$$;

revoke execute on function public.create_listing_update(uuid, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_listing_update(uuid, text, timestamptz, jsonb)
  to service_role;
revoke execute on function public.publication_batch_payload(uuid)
  from public, anon, authenticated;
grant execute on function public.publication_batch_payload(uuid)
  to service_role;

commit;
