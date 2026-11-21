ALTER TABLE public.admin_config
  ADD COLUMN IF NOT EXISTS software_update_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS software_latest_version text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS software_windows_download_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS software_macos_download_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS software_update_notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS software_force_update boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.get_public_config();

CREATE FUNCTION public.get_public_config()
RETURNS TABLE (
  price_month numeric, price_quarter numeric, price_year numeric,
  price_exclusive_month numeric, price_exclusive_quarter numeric, price_exclusive_year numeric,
  price_shared_month numeric, price_shared_quarter numeric, price_shared_year numeric,
  hupi_wechat boolean, hupi_alipay boolean,
  official_wechat_enabled boolean, official_alipay_enabled boolean,
  crypto_usdt boolean, crypto_trx boolean,
  crypto_address text, tawk_id text, qq_qrcode_url text, telegram_link text,
  landing_image text, video_embed text,
  topup_min_gb integer, topup_price numeric,
  topup_large_min_gb integer, topup_large_price numeric,
  topup_packages jsonb, topup_blacklist text, subscription_domain text,
  software_notice_enabled boolean, software_notice text, software_api_domain text,
  software_popup_enabled boolean, software_popup_content text,
  software_popup_version text, software_popup_display_count integer,
  software_update_enabled boolean, software_latest_version text,
  software_windows_download_url text, software_macos_download_url text,
  software_update_notes text, software_force_update boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.price_month, a.price_quarter, a.price_year,
         a.price_exclusive_month, a.price_exclusive_quarter, a.price_exclusive_year,
         a.price_shared_month, a.price_shared_quarter, a.price_shared_year,
         a.hupi_wechat, a.hupi_alipay,
         a.official_wechat_enabled, a.official_alipay_enabled,
         a.crypto_usdt, a.crypto_trx,
         a.crypto_address, a.tawk_id, a.qq_qrcode_url, a.telegram_link,
         a.landing_image, a.video_embed,
         a.topup_min_gb, a.topup_price,
         a.topup_large_min_gb, a.topup_large_price,
         a.topup_packages, a.topup_blacklist, a.subscription_domain,
         a.software_notice_enabled, a.software_notice, a.software_api_domain,
         a.software_popup_enabled, a.software_popup_content,
         a.software_popup_version, a.software_popup_display_count,
         a.software_update_enabled, a.software_latest_version,
         a.software_windows_download_url, a.software_macos_download_url,
         a.software_update_notes, a.software_force_update
  FROM public.admin_config a LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_config() TO anon, authenticated;
