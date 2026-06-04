
CREATE TABLE public.client_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uuid text NOT NULL,
  plan_id uuid,
  plan_title text NOT NULL DEFAULT '',
  default_traffic_gb integer NOT NULL DEFAULT 0,
  panel_url text NOT NULL DEFAULT '',
  inbound_id integer NOT NULL DEFAULT 0,
  client_email text NOT NULL DEFAULT '',
  is_socks5 boolean NOT NULL DEFAULT false,
  last_reset_expiry bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_records_uuid ON public.client_records(uuid);

GRANT SELECT ON public.client_records TO anon, authenticated;
GRANT ALL ON public.client_records TO service_role;

ALTER TABLE public.client_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read client_records" ON public.client_records FOR SELECT USING (true);
CREATE POLICY "Service can insert client_records" ON public.client_records FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can update client_records" ON public.client_records FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Service can delete client_records" ON public.client_records FOR DELETE USING (true);

CREATE TRIGGER update_client_records_updated_at
  BEFORE UPDATE ON public.client_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
