
CREATE TABLE IF NOT EXISTS public.panels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '主面板',
  panel_url text NOT NULL DEFAULT '',
  panel_user text NOT NULL DEFAULT 'admin',
  panel_pass text NOT NULL DEFAULT '',
  is_primary boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS panels_only_one_primary
  ON public.panels (is_primary) WHERE is_primary = true;

ALTER TABLE public.panels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read panels" ON public.panels FOR SELECT USING (true);
CREATE POLICY "Service can insert panels" ON public.panels FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can update panels" ON public.panels FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Service can delete panels" ON public.panels FOR DELETE USING (true);

CREATE TRIGGER update_panels_updated_at
  BEFORE UPDATE ON public.panels
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Migrate existing admin_config panel into panels table as the primary panel
INSERT INTO public.panels (name, panel_url, panel_user, panel_pass, is_primary, enabled, sort_order)
SELECT '主面板', panel_url, panel_user, panel_pass, true, true, 0
FROM public.admin_config
WHERE NOT EXISTS (SELECT 1 FROM public.panels)
LIMIT 1;
