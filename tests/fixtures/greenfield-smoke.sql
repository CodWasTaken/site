begin;

do $smoke$
declare
  v_admin uuid := '11111111-1111-4111-8111-111111111111';
  v_submission uuid;
  v_action uuid;
  v_batch uuid;
  v_report uuid;
  v_listing text;
  v_count integer;
begin
  if (
    select count(*)
    from pg_class
    where relnamespace = 'public'::regnamespace
      and relkind = 'r'
      and relname in (
        'opportunity_submissions', 'moderator_profiles',
        'normalized_opportunities', 'moderation_actions', 'submission_flags',
        'listing_reports', 'moderation_bans', 'submission_fingerprints',
        'moderation_retention_runs', 'listing_moderation_state',
        'publication_batches', 'publication_batch_items',
        'listing_removal_batches'
      )
  ) <> 13 then
    raise exception 'expected all 13 application tables';
  end if;

  if exists (
    select 1
    from pg_class
    where relnamespace = 'public'::regnamespace
      and relkind = 'r'
      and relname in (
        'opportunity_submissions', 'moderator_profiles',
        'normalized_opportunities', 'moderation_actions', 'submission_flags',
        'listing_reports', 'moderation_bans', 'submission_fingerprints',
        'moderation_retention_runs', 'listing_moderation_state',
        'publication_batches', 'publication_batch_items',
        'listing_removal_batches'
      )
      and not relrowsecurity
  ) then
    raise exception 'every private application table must enable RLS';
  end if;

  if has_table_privilege('anon', 'public.opportunity_submissions', 'select')
     or has_table_privilege('authenticated', 'public.opportunity_submissions', 'select')
     or not has_table_privilege('service_role', 'public.opportunity_submissions', 'select,insert,update,delete') then
    raise exception 'private table grants are incorrect';
  end if;

  insert into auth.users (id) values (v_admin);
  insert into public.moderator_profiles (user_id, role)
  values (v_admin, 'admin');

  insert into public.opportunity_submissions (
    organization, name, categories, primary_category, subcategories, tags,
    source_url, website_url, organization_website_url, description,
    eligibility, benefits, location, deadline
  ) values (
    'Example Foundation', 'Open Infrastructure Grant', array['funding'],
    'funding', array['research-funding'], array['open-source'],
    'https://example.org/grant', 'https://example.org',
    'https://example.org', 'Funding for maintainers of public infrastructure.',
    'Open-source maintainers may apply.', '$10,000 grant.', 'Global',
    date '2027-01-31'
  ) returning id into v_submission;

  select public.perform_moderation_action(
    v_submission,
    v_admin,
    'approve',
    'Evidence reviewed',
    null,
    jsonb_build_object(
      'title', 'Open Infrastructure Grant',
      'organization', 'Example Foundation',
      'categories', jsonb_build_array('funding'),
      'primary_category', 'funding',
      'subcategories', jsonb_build_array('research-funding'),
      'tags', jsonb_build_array('open-source'),
      'description', 'Funding for maintainers of public infrastructure.',
      'eligibility', 'Open-source maintainers may apply.',
      'benefits', '$10,000 grant.',
      'location', 'Global',
      'deadline', '2027-01-31',
      'source_url', 'https://example.org/grant',
      'organization_website_url', 'https://example.org',
      'resource_type', 'funding',
      'default_search_eligible', true,
      'availability_status', 'open',
      'status_reason', 'Applications are open.',
      'deadline_type', 'fixed',
      'global', true,
      'remote', true,
      'countries', '[]'::jsonb,
      'physical_locations', '[]'::jsonb,
      'provider_url', 'https://example.org',
      'program_url', 'https://example.org/grant',
      'application_url', 'https://example.org/grant/apply',
      'sponsored', false,
      'claims_checked', jsonb_build_array(
        'program-exists', 'eligibility', 'benefit', 'application-url',
        'deadline', 'geography'
      ),
      'next_review_at', '2027-04-30'
    )
  ) into v_action;

  if v_action is null or not exists (
    select 1
    from public.normalized_opportunities
    where submission_id = v_submission
      and resource_type = 'funding'
      and default_search_eligible
      and availability_status = 'open'
      and program_url = 'https://example.org/grant'
      and application_url = 'https://example.org/grant/apply'
  ) then
    raise exception 'v2 approval normalization failed';
  end if;

  select public.begin_publication_batch(v_admin) into v_batch;
  if v_batch is null then
    raise exception 'publication batch was not created';
  end if;
  select count(*) into v_count
  from public.publication_batch_payload(v_batch);
  if v_count <> 1 then
    raise exception 'publication payload did not contain the approved record';
  end if;

  insert into public.listing_reports (listing_id, reason)
  values ('example-foundation-open-infrastructure-grant', 'Incorrect details')
  returning id into v_report;
  select public.resolve_listing_report(
    v_report, v_admin, 'upheld', 'Provider source changed.'
  ) into v_listing;
  if v_listing <> 'example-foundation-open-infrastructure-grant'
     or not exists (
       select 1 from public.listing_removal_batches where report_id = v_report
     ) then
    raise exception 'report resolution did not create removal state';
  end if;

  if not exists (
    select 1 from cron.job
    where jobname = 'perkcommons-moderation-retention'
  ) then
    raise exception 'retention job was not scheduled';
  end if;
end
$smoke$;

rollback;
