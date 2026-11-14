-- Visits recorded before Cloudflare trace IP support contain the VPS proxy IP,
-- which is not attributable to a visitor. Keep the session metrics but mark the
-- address unknown; active sessions will be corrected by their next heartbeat.
UPDATE public.visitor_sessions
SET ip_address = NULL, updated_at = now()
WHERE ip_address = '192.129.217.73'::inet;
