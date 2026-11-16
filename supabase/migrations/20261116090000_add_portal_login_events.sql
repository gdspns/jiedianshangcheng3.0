CREATE TABLE IF NOT EXISTS public.portal_login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_identifier text NOT NULL,
  client_remark text,
  inbound_id bigint,
  inbound_remark text,
  login_method text NOT NULL DEFAULT 'uuid',
  ip_address inet,
  user_agent text,
  browser text,
  operating_system text,
  device_type text,
  logged_in_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_login_events_time_idx ON public.portal_login_events (logged_in_at DESC);
CREATE INDEX IF NOT EXISTS portal_login_events_user_idx ON public.portal_login_events (user_identifier);
CREATE INDEX IF NOT EXISTS portal_login_events_remark_idx ON public.portal_login_events (client_remark);

ALTER TABLE public.portal_login_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_login_events FROM anon, authenticated;
GRANT ALL ON public.portal_login_events TO service_role;

COMMENT ON TABLE public.portal_login_events IS 'Successful client portal resolution logins; service-role access only.';
