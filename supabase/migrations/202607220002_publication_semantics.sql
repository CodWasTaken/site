begin;

-- This migration is intentionally additive. Existing approved rows remain
-- incomplete until a moderator explicitly reviews the new semantic fields.
alter table public.normalized_opportunities
  add column if not exists resource_type text,
  add column if not exists default_search_eligible boolean,
  add column if not exists availability_status text,
  add column if not exists status_reason text,
  add column if not exists deadline_type text,
  add column if not exists global boolean,
  add column if not exists remote boolean,
  add column if not exists countries text[] not null default '{}',
  add column if not exists physical_locations text[] not null default '{}',
  add column if not exists provider_url text,
  add column if not exists program_url text,
  add column if not exists application_url text,
  add column if not exists sponsored boolean,
  add column if not exists sponsorship_type text,
  add column if not exists sponsorship_disclosure text,
  add column if not exists claims_checked text[] not null default '{}',
  add column if not exists next_review_at date;

alter table public.normalized_opportunities
  drop constraint if exists normalized_opportunities_resource_type_check,
  drop constraint if exists normalized_opportunities_availability_status_check,
  drop constraint if exists normalized_opportunities_deadline_type_check,
  drop constraint if exists normalized_opportunities_countries_check,
  drop constraint if exists normalized_opportunities_sponsorship_check,
  drop constraint if exists normalized_opportunities_claims_checked_check;

alter table public.normalized_opportunities
  add constraint normalized_opportunities_resource_type_check check (
    resource_type is null or resource_type in (
      'opportunity', 'resource', 'benefit', 'program', 'event', 'funding',
      'fellowship', 'competition', 'community', 'learning-resource',
      'public-dataset', 'general-free-product'
    )
  ),
  add constraint normalized_opportunities_availability_status_check check (
    availability_status is null or availability_status in (
      'open', 'rolling', 'upcoming', 'limited', 'waitlist',
      'temporarily-unavailable', 'closed', 'expired', 'unconfirmed',
      'disputed', 'archived'
    )
  ),
  add constraint normalized_opportunities_deadline_type_check check (
    deadline_type is null or deadline_type in ('fixed', 'rolling', 'periodic', 'unknown', 'none')
  ),
  add constraint normalized_opportunities_countries_check check (
    cardinality(countries) <= 30 and (
      cardinality(countries) = 0 or array_to_string(countries, ',') ~ '^[A-Z]{2}(,[A-Z]{2})*$'
    )
  ),
  add constraint normalized_opportunities_sponsorship_check check (
    sponsored is distinct from true or (
      nullif(btrim(sponsorship_type), '') is not null and
      nullif(btrim(sponsorship_disclosure), '') is not null
    )
  ),
  add constraint normalized_opportunities_claims_checked_check check (
    claims_checked <@ array[
      'program-exists', 'eligibility', 'benefit', 'application-url', 'deadline', 'geography'
    ]::text[]
  );

create or replace function public.perform_moderation_action(
  p_submission_id uuid,
  p_moderator_id uuid,
  p_action text,
  p_reason text default null,
  p_notes text default null,
  p_normalized jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_previous text;
  v_next text;
  v_action_id uuid;
begin
  select role into v_role from public.moderator_profiles
  where user_id = p_moderator_id and active = true;
  if v_role is null then raise exception 'moderator access required'; end if;

  select status::text into v_previous from public.opportunity_submissions
  where id = p_submission_id for update;
  if v_previous is null then raise exception 'submission not found'; end if;

  v_next := case p_action
    when 'approve' then 'approved'
    when 'decline' then 'rejected'
    when 'flag' then 'flagged'
    when 'unflag' then 'pending'
    when 'publish' then 'published'
    when 'withdraw' then 'withdrawn'
    else v_previous
  end;

  if p_action not in ('approve', 'decline', 'flag', 'unflag', 'publish', 'withdraw', 'note', 'edit') then
    raise exception 'unsupported moderation action';
  end if;

  update public.opportunity_submissions
  set status = v_next,
      reviewed_by = p_moderator_id,
      decision_reason = case when p_action in ('approve', 'decline') then p_reason else decision_reason end,
      reviewed_at = case when p_action in ('approve', 'decline') then now() else reviewed_at end,
      published_at = case when p_action = 'publish' then now() else published_at end,
      last_action_at = now(),
      flag_count = case when p_action = 'flag' then flag_count + 1 when p_action = 'unflag' then 0 else flag_count end
  where id = p_submission_id;

  if p_action = 'flag' then
    insert into public.submission_flags (submission_id, reason, notes, moderator_id)
    values (p_submission_id, coalesce(p_reason, 'Other'), p_notes, p_moderator_id);
  elsif p_action = 'unflag' then
    update public.submission_flags
    set resolved = true, resolved_by = p_moderator_id, resolved_at = now()
    where submission_id = p_submission_id and resolved = false;
  end if;

  if p_action = 'approve' and p_normalized is not null then
    insert into public.normalized_opportunities (
      submission_id, title, organization, categories, primary_category,
      subcategories, tags, description, eligibility, benefits, location,
      deadline, source_url, organization_website_url, resource_type, default_search_eligible,
      availability_status, status_reason, deadline_type, global, remote,
      countries, physical_locations, provider_url, program_url,
      application_url, sponsored, sponsorship_type,
      sponsorship_disclosure, claims_checked, next_review_at, normalized_by
    ) values (
      p_submission_id, p_normalized->>'title', p_normalized->>'organization',
      coalesce(array(select jsonb_array_elements_text(p_normalized->'categories')), '{}'),
      p_normalized->>'primary_category',
      coalesce(array(select jsonb_array_elements_text(p_normalized->'subcategories')), '{}'),
      coalesce(array(select jsonb_array_elements_text(p_normalized->'tags')), '{}'),
      p_normalized->>'description', p_normalized->>'eligibility', p_normalized->>'benefits',
      p_normalized->>'location', nullif(p_normalized->>'deadline', '')::date,
      p_normalized->>'source_url', p_normalized->>'organization_website_url',
      p_normalized->>'resource_type', (p_normalized->>'default_search_eligible')::boolean,
      p_normalized->>'availability_status',
      p_normalized->>'status_reason', p_normalized->>'deadline_type',
      nullif(p_normalized->>'global', '')::boolean,
      nullif(p_normalized->>'remote', '')::boolean,
      coalesce(array(select jsonb_array_elements_text(p_normalized->'countries')), '{}'),
      coalesce(array(select jsonb_array_elements_text(p_normalized->'physical_locations')), '{}'),
      p_normalized->>'provider_url', p_normalized->>'program_url',
      p_normalized->>'application_url', nullif(p_normalized->>'sponsored', '')::boolean,
      p_normalized->>'sponsorship_type', p_normalized->>'sponsorship_disclosure',
      coalesce(array(select jsonb_array_elements_text(p_normalized->'claims_checked')), '{}'),
      nullif(p_normalized->>'next_review_at', '')::date, p_moderator_id
    ) on conflict (submission_id) do update set
      title = excluded.title,
      organization = excluded.organization,
      categories = excluded.categories,
      primary_category = excluded.primary_category,
      subcategories = excluded.subcategories,
      tags = excluded.tags,
      description = excluded.description,
      eligibility = excluded.eligibility,
      benefits = excluded.benefits,
      location = excluded.location,
      deadline = excluded.deadline,
      source_url = excluded.source_url,
      organization_website_url = excluded.organization_website_url,
      resource_type = excluded.resource_type,
      default_search_eligible = excluded.default_search_eligible,
      availability_status = excluded.availability_status,
      status_reason = excluded.status_reason,
      deadline_type = excluded.deadline_type,
      global = excluded.global,
      remote = excluded.remote,
      countries = excluded.countries,
      physical_locations = excluded.physical_locations,
      provider_url = excluded.provider_url,
      program_url = excluded.program_url,
      application_url = excluded.application_url,
      sponsored = excluded.sponsored,
      sponsorship_type = excluded.sponsorship_type,
      sponsorship_disclosure = excluded.sponsorship_disclosure,
      claims_checked = excluded.claims_checked,
      next_review_at = excluded.next_review_at,
      normalized_by = excluded.normalized_by,
      updated_at = now();
  end if;

  insert into public.moderation_actions (
    submission_id, moderator_id, action, reason, notes, previous_status, new_status, metadata
  ) values (
    p_submission_id, p_moderator_id, p_action, p_reason, p_notes, v_previous, v_next,
    case when p_normalized is null then '{}'::jsonb else jsonb_build_object(
      'normalized_fields', true,
      'resource_type', p_normalized->>'resource_type',
      'default_search_eligible', p_normalized->>'default_search_eligible',
      'availability_status', p_normalized->>'availability_status',
      'claims_checked', p_normalized->'claims_checked'
    ) end
  ) returning id into v_action_id;
  return v_action_id;
end;
$$;

drop function if exists public.publication_batch_payload(uuid);
create function public.publication_batch_payload(
  p_batch_id uuid
) returns table (
  submission_id uuid,
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
  inner join public.normalized_opportunities as normalized
    on normalized.submission_id = items.submission_id
  where items.batch_id = p_batch_id
  order by normalized.organization, normalized.title, items.submission_id;
$$;

revoke execute on function public.perform_moderation_action(uuid, uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.perform_moderation_action(uuid, uuid, text, text, text, jsonb)
  to service_role;
revoke execute on function public.publication_batch_payload(uuid)
  from public, anon, authenticated;
grant execute on function public.publication_batch_payload(uuid) to service_role;

commit;
