begin;

-- Experimental fork migration. Apply only to an isolated development project.
alter table public.opportunity_submissions
  add column if not exists assigned_moderator uuid references auth.users(id) on delete set null,
  add column if not exists claimed_at timestamptz,
  add column if not exists review_started_at timestamptz,
  add column if not exists revision bigint not null default 0,
  add column if not exists second_review_required boolean not null default false,
  add column if not exists second_reviewer uuid references auth.users(id) on delete set null,
  add column if not exists second_reviewed_at timestamptz,
  add column if not exists conflict_of_interest boolean not null default false;

alter table public.opportunity_submissions
  drop constraint if exists opportunity_submissions_distinct_reviewers;
alter table public.opportunity_submissions
  add constraint opportunity_submissions_distinct_reviewers
  check (second_reviewer is null or reviewed_by is null or second_reviewer <> reviewed_by);

create or replace function public.bump_submission_revision()
returns trigger language plpgsql as $$
begin
  new.revision = old.revision + 1;
  return new;
end;
$$;

drop trigger if exists opportunity_submissions_bump_revision on public.opportunity_submissions;
create trigger opportunity_submissions_bump_revision
before update on public.opportunity_submissions
for each row execute function public.bump_submission_revision();

create or replace function public.claim_submission(
  p_submission_id uuid,
  p_moderator_id uuid,
  p_expected_revision bigint
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission public.opportunity_submissions%rowtype;
begin
  if not exists (
    select 1 from public.moderator_profiles
    where user_id = p_moderator_id and active = true
  ) then raise exception 'moderator access required'; end if;

  select * into v_submission
  from public.opportunity_submissions
  where id = p_submission_id
  for update;
  if v_submission.id is null then raise exception 'submission not found'; end if;
  if v_submission.revision <> p_expected_revision then raise exception 'stale revision'; end if;
  if v_submission.assigned_moderator is not null and v_submission.assigned_moderator <> p_moderator_id then
    raise exception 'submission already claimed';
  end if;

  update public.opportunity_submissions
  set assigned_moderator = p_moderator_id,
      claimed_at = coalesce(claimed_at, now()),
      review_started_at = coalesce(review_started_at, now()),
      status = case when status = 'pending' then 'reviewing' else status end
  where id = p_submission_id
  returning revision into v_submission.revision;
  return v_submission.revision;
end;
$$;

create or replace function public.complete_second_review(
  p_submission_id uuid,
  p_moderator_id uuid,
  p_expected_revision bigint
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission public.opportunity_submissions%rowtype;
begin
  if not exists (
    select 1 from public.moderator_profiles
    where user_id = p_moderator_id and active = true
  ) then raise exception 'moderator access required'; end if;

  select * into v_submission
  from public.opportunity_submissions
  where id = p_submission_id
  for update;
  if v_submission.id is null then raise exception 'submission not found'; end if;
  if v_submission.revision <> p_expected_revision then raise exception 'stale revision'; end if;
  if not v_submission.second_review_required then raise exception 'second review is not required'; end if;
  if v_submission.reviewed_by is null then raise exception 'first review is incomplete'; end if;
  if v_submission.reviewed_by = p_moderator_id then raise exception 'second reviewer must be independent'; end if;
  if v_submission.conflict_of_interest then raise exception 'conflict of interest requires escalation'; end if;

  update public.opportunity_submissions
  set second_reviewer = p_moderator_id,
      second_reviewed_at = now()
  where id = p_submission_id
  returning revision into v_submission.revision;

  insert into public.moderation_actions (
    submission_id, moderator_id, action, reason, previous_status, new_status,
    metadata
  ) values (
    p_submission_id, p_moderator_id, 'second_review',
    'Independent second review completed', v_submission.status, v_submission.status,
    jsonb_build_object('expected_revision', p_expected_revision)
  );
  return v_submission.revision;
end;
$$;

revoke execute on function public.claim_submission(uuid, uuid, bigint) from public, anon, authenticated;
revoke execute on function public.complete_second_review(uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function public.claim_submission(uuid, uuid, bigint) to service_role;
grant execute on function public.complete_second_review(uuid, uuid, bigint) to service_role;

commit;
