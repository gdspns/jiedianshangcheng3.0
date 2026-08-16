-- Create table for panel connection test history
CREATE TABLE IF NOT EXISTS public.panel_connection_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  panel_id uuid NOT NULL REFERENCES public.panels(id) ON DELETE CASCADE,
  test_time timestamptz NOT NULL DEFAULT now(),
  success boolean NOT NULL,
  response_time_ms integer,
  error_message text,
  test_trigger text NOT NULL DEFAULT 'manual', -- 'manual', 'auto', 'cron'
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_panel_connection_tests_panel_time
  ON public.panel_connection_tests(panel_id, test_time DESC);

CREATE INDEX IF NOT EXISTS idx_panel_connection_tests_created_at
  ON public.panel_connection_tests(created_at DESC);

-- Grant permissions
GRANT SELECT, INSERT ON public.panel_connection_tests TO anon, authenticated;
GRANT ALL ON public.panel_connection_tests TO service_role;

-- Enable RLS
ALTER TABLE public.panel_connection_tests ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Public can read panel_connection_tests"
  ON public.panel_connection_tests FOR SELECT USING (true);

CREATE POLICY "Service can insert panel_connection_tests"
  ON public.panel_connection_tests FOR INSERT WITH CHECK (true);

-- Create table for panel connection test configuration (auto-test settings)
CREATE TABLE IF NOT EXISTS public.panel_test_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  panel_id uuid NOT NULL REFERENCES public.panels(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  test_interval_minutes integer NOT NULL DEFAULT 30,
  notify_on_failure boolean NOT NULL DEFAULT true,
  notify_email text,
  last_test_time timestamptz,
  consecutive_failures integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(panel_id)
);

-- Create index for panel_test_config
CREATE INDEX IF NOT EXISTS idx_panel_test_config_enabled
  ON public.panel_test_config(enabled, last_test_time);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.panel_test_config TO anon, authenticated;
GRANT ALL ON public.panel_test_config TO service_role;

-- Enable RLS
ALTER TABLE public.panel_test_config ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Public can read panel_test_config"
  ON public.panel_test_config FOR SELECT USING (true);

CREATE POLICY "Service can insert panel_test_config"
  ON public.panel_test_config FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can update panel_test_config"
  ON public.panel_test_config FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Service can delete panel_test_config"
  ON public.panel_test_config FOR DELETE USING (true);

-- Trigger to update updated_at
CREATE TRIGGER update_panel_test_config_updated_at
  BEFORE UPDATE ON public.panel_test_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
