
CREATE TABLE public.plan_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  region_id uuid NOT NULL REFERENCES public.regions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plan_id, region_id)
);

ALTER TABLE public.plan_regions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read plan_regions" ON public.plan_regions FOR SELECT TO public USING (true);
CREATE POLICY "Service can insert plan_regions" ON public.plan_regions FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Service can delete plan_regions" ON public.plan_regions FOR DELETE TO public USING (true);

-- Migrate existing region_id data from plans to plan_regions
INSERT INTO public.plan_regions (plan_id, region_id)
SELECT id, region_id FROM public.plans WHERE region_id IS NOT NULL
ON CONFLICT DO NOTHING;
