# Greenfield Supabase baseline

`00000000000000_perkcommons_fork.sql` creates the complete private database
required by the experimental fork from an empty Supabase project.

It is generated from the checked-in incremental migrations plus the root
`opportunity_submissions` table that the historical migration chain assumed
already existed.

## Use

1. Create a new isolated Supabase project. Do not reuse production.
2. Copy only `00000000000000_perkcommons_fork.sql` into that project's empty
   `supabase/migrations/` directory.
3. Apply it with the Supabase CLI migration workflow.
4. Create moderator users through Supabase Auth.
5. Insert their Auth user UUIDs into `public.moderator_profiles` as `reviewer`
   or `admin`.
6. Configure the fork Worker with that isolated project's URL and keys.

Do not run the greenfield baseline after the incremental migration chain. It
intentionally aborts when `public.opportunity_submissions` already exists.

The migration creates no users, passwords, API keys, storage buckets,
Cloudflare resources, GitHub credentials, or production integrations.

Regenerate after changing an incremental migration:

```bash
node scripts/build-greenfield-migration.mjs
```
