
-- Table: each region can have multiple inbound IDs
CREATE TABLE public.region_inbounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id uuid NOT NULL REFERENCES public.regions(id) ON DELETE CASCADE,
  inbound_id integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.region_inbounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read region_inbounds" ON public.region_inbounds FOR SELECT USING (true);
CREATE POLICY "Service can insert region_inbounds" ON public.region_inbounds FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can update region_inbounds" ON public.region_inbounds FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Service can delete region_inbounds" ON public.region_inbounds FOR DELETE USING (true);

-- Table: each inbound maps to specific plans
CREATE TABLE public.inbound_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_inbound_id uuid NOT NULL REFERENCES public.region_inbounds(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(region_inbound_id, plan_id)
);

ALTER TABLE public.inbound_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read inbound_plans" ON public.inbound_plans FOR SELECT USING (true);
CREATE POLICY "Service can insert inbound_plans" ON public.inbound_plans FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can update inbound_plans" ON public.inbound_plans FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Service can delete inbound_plans" ON public.inbound_plans FOR DELETE USING (true);
