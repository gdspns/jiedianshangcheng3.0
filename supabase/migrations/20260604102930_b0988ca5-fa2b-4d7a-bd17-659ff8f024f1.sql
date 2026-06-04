CREATE TABLE public.traffic_default_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'all',
  plan_id UUID,
  default_traffic_gb INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.traffic_default_rules TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.traffic_default_rules TO authenticated;
GRANT ALL ON public.traffic_default_rules TO service_role;

ALTER TABLE public.traffic_default_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read traffic_default_rules"
  ON public.traffic_default_rules FOR SELECT USING (true);

CREATE POLICY "Service can insert traffic_default_rules"
  ON public.traffic_default_rules FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can update traffic_default_rules"
  ON public.traffic_default_rules FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Service can delete traffic_default_rules"
  ON public.traffic_default_rules FOR DELETE USING (true);

CREATE TRIGGER update_traffic_default_rules_updated_at
  BEFORE UPDATE ON public.traffic_default_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();