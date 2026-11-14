import { supabaseUrl } from "@/integrations/supabase/client";

export function publicImageUrl(url: string) {
  const value = String(url || "").trim();
  if (!value) return "";
  return `${supabaseUrl}/functions/v1/public-image?url=${encodeURIComponent(value)}`;
}
