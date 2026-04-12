ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS inbound_id integer;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS inbound_remark text DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS client_remark text DEFAULT '';