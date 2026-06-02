ALTER TABLE public.admin_config
  ADD COLUMN IF NOT EXISTS topup_min_gb integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS topup_price numeric NOT NULL DEFAULT 0;