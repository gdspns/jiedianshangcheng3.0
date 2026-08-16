# Own Supabase Migration Runbook

This project can run on a normal Supabase project without Lovable Cloud credits.

## What is migrated

- Database schema from `supabase/migrations`
- Edge Functions from `supabase/functions`
- Frontend Supabase connection in `.env`

## What must be configured manually

- Supabase account and project creation
- Supabase database password
- `DATABASE_URL` secret for `cron-status`
- Admin settings inside the app database
- 3x-ui panel URL/user/password
- Hupi payment configuration and callback URL
- Scheduled jobs

## Required values

- `ProjectRef`: Supabase project ref, for example `abcdefghijklmnopqrst`
- `DbPassword`: database password set when creating the project
- `SupabaseUrl`: `https://PROJECT_REF.supabase.co`
- `AnonKey`: public anon key
- `DatabaseUrl`: direct or pooler PostgreSQL connection string

## Run

```powershell
.\scripts\migrate-to-own-supabase.ps1 `
  -ProjectRef "YOUR_PROJECT_REF" `
  -DbPassword "YOUR_DB_PASSWORD" `
  -SupabaseUrl "https://YOUR_PROJECT_REF.supabase.co" `
  -AnonKey "YOUR_ANON_KEY" `
  -DatabaseUrl "postgresql://postgres.YOUR_PROJECT_REF:YOUR_DB_PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres"
```

## Scheduled jobs

Configure these in Supabase/Lovable scheduler or SQL cron:

- `auto-test-panels`, every 5 minutes, body `{}`.
- `auto-reset-traffic`, every 5 minutes, body `{"enforceQuota":true,"source":"cron"}`.

## Hupi callback URL

After migration, update Hupi to call:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/payment-callback
```
