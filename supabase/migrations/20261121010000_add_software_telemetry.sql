CREATE TABLE IF NOT EXISTS public.software_online_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_identifier text NOT NULL UNIQUE,
  user_remark text NOT NULL DEFAULT '',
  app_version text NOT NULL DEFAULT '',
  ip_address text NOT NULL DEFAULT '',
  current_node text NOT NULL DEFAULT '',
  is_online boolean NOT NULL DEFAULT true,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS software_online_users_last_seen_idx
  ON public.software_online_users (last_seen DESC);

ALTER TABLE public.software_online_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.software_subscription_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_url text NOT NULL UNIQUE,
  subscription_label text NOT NULL DEFAULT '',
  user_identifier text NOT NULL DEFAULT '',
  ip_address text NOT NULL DEFAULT '',
  first_seen timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS software_subscription_logs_first_seen_idx
  ON public.software_subscription_logs (first_seen DESC);

ALTER TABLE public.software_subscription_logs ENABLE ROW LEVEL SECURITY;

