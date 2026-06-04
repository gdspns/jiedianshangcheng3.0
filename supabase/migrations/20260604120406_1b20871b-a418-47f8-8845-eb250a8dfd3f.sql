
CREATE TABLE IF NOT EXISTS public.cron_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  checked integer NOT NULL DEFAULT 0,
  reset_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  trigger_source text NOT NULL DEFAULT 'manual',
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.cron_execution_logs TO anon, authenticated;
GRANT ALL ON public.cron_execution_logs TO service_role;
ALTER TABLE public.cron_execution_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read cron logs" ON public.cron_execution_logs FOR SELECT USING (true);
CREATE POLICY "Service insert cron logs" ON public.cron_execution_logs FOR INSERT WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_cron_logs_job_created ON public.cron_execution_logs(job_name, created_at DESC);
