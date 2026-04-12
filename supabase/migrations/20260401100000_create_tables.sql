CREATE TABLE IF NOT EXISTS public.admin_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  panel_url TEXT NOT NULL DEFAULT 'http://127.0.0.1:2053',
  panel_user TEXT NOT NULL DEFAULT 'admin',
  panel_pass TEXT NOT NULL DEFAULT '',
  price_month NUMERIC NOT NULL DEFAULT 15,
  price_quarter NUMERIC NOT NULL DEFAULT 40,
  price_year NUMERIC NOT NULL DEFAULT 150,
  price_exclusive_month NUMERIC NOT NULL DEFAULT 25,
  price_exclusive_quarter NUMERIC NOT NULL DEFAULT 65,
  price_exclusive_year NUMERIC NOT NULL DEFAULT 240,
  price_shared_month NUMERIC NOT NULL DEFAULT 15,
  price_shared_quarter NUMERIC NOT NULL DEFAULT 40,
  price_shared_year NUMERIC NOT NULL DEFAULT 150,
  hupi_wechat_app_id TEXT DEFAULT '',
  hupi_wechat_app_secret TEXT DEFAULT '',
  hupi_alipay_app_id TEXT DEFAULT '',
  hupi_alipay_app_secret TEXT DEFAULT '',
  hupi_wechat BOOLEAN NOT NULL DEFAULT true,
  hupi_alipay BOOLEAN NOT NULL DEFAULT true,
  crypto_address TEXT DEFAULT '',
  crypto_key TEXT DEFAULT '',
  crypto_usdt BOOLEAN NOT NULL DEFAULT true,
  crypto_trx BOOLEAN NOT NULL DEFAULT true,
  admin_password_hash TEXT NOT NULL DEFAULT '',
  tawk_id TEXT NOT NULL DEFAULT '',
  qq_qrcode_url TEXT NOT NULL DEFAULT '',
  telegram_link TEXT NOT NULL DEFAULT '',
  video_embed TEXT NOT NULL DEFAULT '',
  resend_api_key TEXT NOT NULL DEFAULT '',
  notify_email TEXT NOT NULL DEFAULT '',
  sales_inbound_id INTEGER NOT NULL DEFAULT 1,
  sales_protocol TEXT NOT NULL DEFAULT 'mixed',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read pricing config" ON public.admin_config FOR SELECT USING (true);
CREATE POLICY "Service role can update config" ON public.admin_config FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Service role can insert config" ON public.admin_config FOR INSERT WITH CHECK (true);
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER update_admin_config_updated_at BEFORE UPDATE ON public.admin_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.admin_config (admin_password_hash) VALUES ('admin123');

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uuid text NOT NULL, email text, plan_name text NOT NULL, months integer NOT NULL,
  amount numeric NOT NULL, currency text NOT NULL DEFAULT 'CNY', payment_method text NOT NULL,
  status text NOT NULL DEFAULT 'pending', trade_no text, crypto_amount numeric, crypto_currency text,
  tx_hash text, notify_data jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), paid_at timestamptz, fulfilled_at timestamptz
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read own orders by uuid" ON public.orders FOR SELECT TO public USING (true);
CREATE POLICY "Service can insert orders" ON public.orders FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Service can update orders" ON public.orders FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Service can delete orders" ON public.orders FOR DELETE TO public USING (true);
CREATE OR REPLACE FUNCTION public.update_orders_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = 'public' AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_orders_updated_at();

CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL,
  category text NOT NULL DEFAULT 'exclusive', duration_months integer NOT NULL DEFAULT 1,
  duration_days integer NOT NULL DEFAULT 30, price numeric NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '', sort_order integer NOT NULL DEFAULT 0,
  featured boolean NOT NULL DEFAULT false, enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read enabled plans" ON public.plans FOR SELECT TO public USING (true);
CREATE POLICY "Service can insert plans" ON public.plans FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Service can update plans" ON public.plans FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Service can delete plans" ON public.plans FOR DELETE TO public USING (true);
INSERT INTO public.plans (title, category, duration_months, duration_days, price, description, sort_order, featured) VALUES
  ('独享月付', 'exclusive', 1, 30, 25, '带宽独享，速度有保障', 1, false),
  ('独享季付', 'exclusive', 3, 90, 65, '带宽独享，速度有保障', 2, true),
  ('独享年付', 'exclusive', 12, 365, 240, '带宽独享，速度有保障', 3, false),
  ('共享月付', 'shared', 1, 30, 15, '多人共享，价格实惠', 4, false),
  ('共享季付', 'shared', 3, 90, 40, '多人共享，价格实惠', 5, true),
  ('共享年付', 'shared', 12, 365, 150, '多人共享，价格实惠', 6, false);
CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
