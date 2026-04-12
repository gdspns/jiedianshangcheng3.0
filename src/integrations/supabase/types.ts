export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_config: {
        Row: {
          admin_password_hash: string
          created_at: string
          crypto_address: string | null
          crypto_key: string | null
          crypto_trx: boolean
          crypto_usdt: boolean
          hupi_alipay: boolean
          hupi_alipay_app_id: string | null
          hupi_alipay_app_secret: string | null
          hupi_wechat: boolean
          hupi_wechat_app_id: string | null
          hupi_wechat_app_secret: string | null
          id: string
          landing_image: string
          notify_email: string
          notify_stock_out: boolean
          panel_pass: string
          panel_url: string
          panel_user: string
          price_exclusive_month: number
          price_exclusive_quarter: number
          price_exclusive_year: number
          price_month: number
          price_quarter: number
          price_shared_month: number
          price_shared_quarter: number
          price_shared_year: number
          price_year: number
          qq_qrcode_url: string
          resend_api_key: string
          sales_inbound_id: number
          sales_protocol: string
          tawk_id: string
          telegram_link: string
          updated_at: string
          video_embed: string
        }
        Insert: {
          admin_password_hash?: string
          created_at?: string
          crypto_address?: string | null
          crypto_key?: string | null
          crypto_trx?: boolean
          crypto_usdt?: boolean
          hupi_alipay?: boolean
          hupi_alipay_app_id?: string | null
          hupi_alipay_app_secret?: string | null
          hupi_wechat?: boolean
          hupi_wechat_app_id?: string | null
          hupi_wechat_app_secret?: string | null
          id?: string
          landing_image?: string
          notify_email?: string
          notify_stock_out?: boolean
          panel_pass?: string
          panel_url?: string
          panel_user?: string
          price_exclusive_month?: number
          price_exclusive_quarter?: number
          price_exclusive_year?: number
          price_month?: number
          price_quarter?: number
          price_shared_month?: number
          price_shared_quarter?: number
          price_shared_year?: number
          price_year?: number
          qq_qrcode_url?: string
          resend_api_key?: string
          sales_inbound_id?: number
          sales_protocol?: string
          tawk_id?: string
          telegram_link?: string
          updated_at?: string
          video_embed?: string
        }
        Update: {
          admin_password_hash?: string
          created_at?: string
          crypto_address?: string | null
          crypto_key?: string | null
          crypto_trx?: boolean
          crypto_usdt?: boolean
          hupi_alipay?: boolean
          hupi_alipay_app_id?: string | null
          hupi_alipay_app_secret?: string | null
          hupi_wechat?: boolean
          hupi_wechat_app_id?: string | null
          hupi_wechat_app_secret?: string | null
          id?: string
          landing_image?: string
          notify_email?: string
          notify_stock_out?: boolean
          panel_pass?: string
          panel_url?: string
          panel_user?: string
          price_exclusive_month?: number
          price_exclusive_quarter?: number
          price_exclusive_year?: number
          price_month?: number
          price_quarter?: number
          price_shared_month?: number
          price_shared_quarter?: number
          price_shared_year?: number
          price_year?: number
          qq_qrcode_url?: string
          resend_api_key?: string
          sales_inbound_id?: number
          sales_protocol?: string
          tawk_id?: string
          telegram_link?: string
          updated_at?: string
          video_embed?: string
        }
        Relationships: []
      }
      articles: {
        Row: {
          content: string
          created_at: string
          enabled: boolean
          id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          enabled?: boolean
          id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          enabled?: boolean
          id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount: number
          client_remark: string | null
          created_at: string
          crypto_amount: number | null
          crypto_currency: string | null
          currency: string
          duration_days: number
          email: string | null
          fulfilled_at: string | null
          id: string
          inbound_id: number | null
          inbound_remark: string | null
          months: number
          notify_data: Json | null
          order_type: string
          paid_at: string | null
          payment_method: string
          plan_name: string
          status: string
          trade_no: string | null
          tx_hash: string | null
          updated_at: string
          uuid: string
        }
        Insert: {
          amount: number
          client_remark?: string | null
          created_at?: string
          crypto_amount?: number | null
          crypto_currency?: string | null
          currency?: string
          duration_days?: number
          email?: string | null
          fulfilled_at?: string | null
          id?: string
          inbound_id?: number | null
          inbound_remark?: string | null
          months: number
          notify_data?: Json | null
          order_type?: string
          paid_at?: string | null
          payment_method: string
          plan_name: string
          status?: string
          trade_no?: string | null
          tx_hash?: string | null
          updated_at?: string
          uuid: string
        }
        Update: {
          amount?: number
          client_remark?: string | null
          created_at?: string
          crypto_amount?: number | null
          crypto_currency?: string | null
          currency?: string
          duration_days?: number
          email?: string | null
          fulfilled_at?: string | null
          id?: string
          inbound_id?: number | null
          inbound_remark?: string | null
          months?: number
          notify_data?: Json | null
          order_type?: string
          paid_at?: string | null
          payment_method?: string
          plan_name?: string
          status?: string
          trade_no?: string | null
          tx_hash?: string | null
          updated_at?: string
          uuid?: string
        }
        Relationships: []
      }
      plan_regions: {
        Row: {
          created_at: string
          id: string
          plan_id: string
          region_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          plan_id: string
          region_id: string
        }
        Update: {
          created_at?: string
          id?: string
          plan_id?: string
          region_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_regions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_regions_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          category: string
          created_at: string
          description: string
          duration_days: number
          duration_months: number
          enabled: boolean
          featured: boolean
          id: string
          price: number
          region_id: string | null
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string
          duration_days?: number
          duration_months?: number
          enabled?: boolean
          featured?: boolean
          id?: string
          price?: number
          region_id?: string | null
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          duration_days?: number
          duration_months?: number
          enabled?: boolean
          featured?: boolean
          id?: string
          price?: number
          region_id?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      regions: {
        Row: {
          created_at: string
          current_clients: number
          enabled: boolean
          id: string
          inbound_id: number
          max_clients: number
          name: string
          protocol: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_clients?: number
          enabled?: boolean
          id?: string
          inbound_id?: number
          max_clients?: number
          name?: string
          protocol?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_clients?: number
          enabled?: boolean
          id?: string
          inbound_id?: number
          max_clients?: number
          name?: string
          protocol?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      tutorials: {
        Row: {
          content: string
          created_at: string
          enabled: boolean
          id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          enabled?: boolean
          id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          enabled?: boolean
          id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
