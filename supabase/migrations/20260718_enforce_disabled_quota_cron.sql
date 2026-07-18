-- Enforce 3x-ui over-quota disabled clients every 5 minutes.
-- This re-saves affected inbounds so Xray applies the disabled state to live connections.
--
-- Lovable/Supabase projects differ in how scheduled Edge Function calls are
-- configured, so this migration intentionally does not create a cron job with
-- environment-specific URLs or service keys. Configure the scheduler in the
-- platform UI to call:
--
--   Edge Function: auto-reset-traffic
--   Body: {"enforceQuota":true,"source":"cron"}
--   Schedule: */5 * * * *
--   Suggested job name: enforce-disabled-quota-every-5min

CREATE OR REPLACE FUNCTION public.trigger_enforce_disabled_quota()
RETURNS TABLE(success boolean, checked integer, enforced integer, message text) AS $$
  SELECT true, 0, 0, 'Configure scheduled Edge Function call: auto-reset-traffic with {"enforceQuota":true,"source":"cron"}';
$$ LANGUAGE SQL;

GRANT EXECUTE ON FUNCTION public.trigger_enforce_disabled_quota() TO service_role;
