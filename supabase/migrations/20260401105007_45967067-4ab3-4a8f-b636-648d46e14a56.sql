
-- Create regions table for geographic area management
CREATE TABLE public.regions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '新地区',
  inbound_id INTEGER NOT NULL DEFAULT 1,
  protocol TEXT NOT NULL DEFAULT 'mixed',
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add region_id to plans table (nullable, only used for new purchase plans)
ALTER TABLE public.plans ADD COLUMN region_id UUID REFERENCES public.regions(id) ON DELETE SET NULL;

-- Enable RLS on regions
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;

-- Public can read enabled regions
CREATE POLICY "Public can read enabled regions" ON public.regions FOR SELECT TO public USING (true);
CREATE POLICY "Service can insert regions" ON public.regions FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Service can update regions" ON public.regions FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Service can delete regions" ON public.regions FOR DELETE TO public USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_regions_updated_at BEFORE UPDATE ON public.regions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
