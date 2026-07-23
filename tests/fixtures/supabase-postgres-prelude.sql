-- Minimal Supabase-owned objects for disposable PostgreSQL syntax validation.
-- This is not an application migration and must never be applied to Supabase.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key
);

-- Vanilla PostgreSQL images do not package pg_cron. These objects model only
-- the signatures used by the migration; hosted/local Supabase supplies the
-- real extension.
create schema cron;
create table cron.job (
  jobid bigint generated always as identity primary key,
  jobname text not null
);
create function cron.unschedule(p_jobid bigint)
returns boolean
language sql
as $$
  delete from cron.job where jobid = p_jobid returning true;
$$;
create function cron.schedule(p_jobname text, p_schedule text, p_command text)
returns bigint
language plpgsql
as $$
declare
  v_jobid bigint;
begin
  insert into cron.job (jobname) values (p_jobname) returning jobid into v_jobid;
  return v_jobid;
end;
$$;
