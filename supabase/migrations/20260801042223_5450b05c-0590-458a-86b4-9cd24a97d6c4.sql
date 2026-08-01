-- 1. Lock down admin_config / panels / orders / client_records public reads
DROP POLICY IF EXISTS "Public can read pricing config" ON public.admin_config;
DROP POLICY IF EXISTS "Public can read panels" ON public.panels;
DROP POLICY IF EXISTS "Public can read own orders by uuid" ON public.orders;
DROP POLICY IF EXISTS "Public can read client_records" ON public.client_records;

REVOKE SELECT ON public.admin_config FROM anon, authenticated;
REVOKE SELECT ON public.panels FROM anon, authenticated;
REVOKE SELECT ON public.orders FROM anon, authenticated;
REVOKE SELECT ON public.client_records FROM anon, authenticated;

GRANT ALL ON public.admin_config TO service_role;
GRANT ALL ON public.panels TO service_role;
GRANT ALL ON public.orders TO service_role;
GRANT ALL ON public.client_records TO service_role;

-- 2. Public-safe config view
CREATE OR REPLACE VIEW public.public_config AS
SELECT
  price_month, price_quarter, price_year,
  price_exclusive_month, price_exclusive_quarter, price_exclusive_year,
  price_shared_month, price_shared_quarter, price_shared_year,
  hupi_wechat, hupi_alipay, crypto_usdt, crypto_trx, crypto_address,
  tawk_id, qq_qrcode_url, telegram_link, landing_image, video_embed,
  topup_min_gb, topup_price, topup_blacklist
FROM public.admin_config;

GRANT SELECT ON public.public_config TO anon, authenticated;

-- 3. Scoped order lookups
CREATE OR REPLACE FUNCTION public.get_orders_by_uuid(p_uuid text)
RETURNS TABLE (
  id uuid, uuid text, plan_name text, months integer, duration_days integer,
  amount numeric, currency text, payment_method text, order_type text,
  status text, created_at timestamptz, paid_at timestamptz, fulfilled_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.uuid, o.plan_name, o.months, o.duration_days, o.amount, o.currency,
         o.payment_method, o.order_type, o.status, o.created_at, o.paid_at, o.fulfilled_at
  FROM public.orders o
  WHERE p_uuid IS NOT NULL AND length(p_uuid) >= 8 AND o.uuid = p_uuid
  ORDER BY o.created_at DESC
  LIMIT 20;
$$;

CREATE OR REPLACE FUNCTION public.get_orders_by_email(p_email text)
RETURNS TABLE (
  id uuid, uuid text, plan_name text, months integer, duration_days integer,
  amount numeric, currency text, payment_method text, order_type text,
  status text, created_at timestamptz, paid_at timestamptz, fulfilled_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.uuid, o.plan_name, o.months, o.duration_days, o.amount, o.currency,
         o.payment_method, o.order_type, o.status, o.created_at, o.paid_at, o.fulfilled_at
  FROM public.orders o
  WHERE p_email IS NOT NULL AND length(p_email) >= 5 AND lower(o.email) = lower(p_email)
    AND o.status IN ('fulfilled','paid','processing')
  ORDER BY o.created_at DESC
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.get_orders_by_uuid(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_orders_by_email(text) TO anon, authenticated;