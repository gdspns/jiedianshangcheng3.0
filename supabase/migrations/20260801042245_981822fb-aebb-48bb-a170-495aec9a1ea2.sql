DROP VIEW IF EXISTS public.public_config;

CREATE OR REPLACE FUNCTION public.get_public_config()
RETURNS TABLE (
  price_month numeric, price_quarter numeric, price_year numeric,
  price_exclusive_month numeric, price_exclusive_quarter numeric, price_exclusive_year numeric,
  price_shared_month numeric, price_shared_quarter numeric, price_shared_year numeric,
  hupi_wechat boolean, hupi_alipay boolean, crypto_usdt boolean, crypto_trx boolean,
  crypto_address text, tawk_id text, qq_qrcode_url text, telegram_link text,
  landing_image text, video_embed text,
  topup_min_gb integer, topup_price numeric, topup_blacklist text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.price_month, a.price_quarter, a.price_year,
         a.price_exclusive_month, a.price_exclusive_quarter, a.price_exclusive_year,
         a.price_shared_month, a.price_shared_quarter, a.price_shared_year,
         a.hupi_wechat, a.hupi_alipay, a.crypto_usdt, a.crypto_trx,
         a.crypto_address, a.tawk_id, a.qq_qrcode_url, a.telegram_link,
         a.landing_image, a.video_embed,
         a.topup_min_gb, a.topup_price, a.topup_blacklist
  FROM public.admin_config a
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_config() TO anon, authenticated;