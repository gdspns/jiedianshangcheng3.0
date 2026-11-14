CREATE TABLE IF NOT EXISTS public.visitor_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE,
  ip_address inet,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  entry_path text NOT NULL DEFAULT '/',
  last_path text NOT NULL DEFAULT '/',
  page_views integer NOT NULL DEFAULT 1 CHECK (page_views >= 1),
  referrer text,
  user_agent text,
  browser text,
  operating_system text,
  device_type text,
  country text,
  region text,
  city text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visitor_sessions_first_seen_idx ON public.visitor_sessions (first_seen_at DESC);
CREATE INDEX IF NOT EXISTS visitor_sessions_last_seen_idx ON public.visitor_sessions (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS visitor_sessions_ip_idx ON public.visitor_sessions (ip_address);

ALTER TABLE public.visitor_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.visitor_sessions FROM anon, authenticated;
GRANT ALL ON public.visitor_sessions TO service_role;

COMMENT ON TABLE public.visitor_sessions IS 'Privacy-sensitive website visit sessions; service-role access only.';
