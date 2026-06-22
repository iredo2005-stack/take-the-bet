export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          clerk_id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          date_of_birth: string | null
          age_verified: boolean
          role: string
          balance: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clerk_id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          date_of_birth?: string | null
          age_verified?: boolean
          role?: string
          balance?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['users']['Insert']>
      }
      creators: {
        Row: {
          id: string
          user_id: string
          display_name: string
          bio: string | null
          photo_url: string | null
          slug: string
          status: string
          platform: string | null
          declared_followers: number | null
          profile_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          display_name: string
          bio?: string | null
          photo_url?: string | null
          slug: string
          status?: string
          platform?: string | null
          declared_followers?: number | null
          profile_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['creators']['Insert']>
      }
      offerings: {
        Row: {
          id: string
          creator_id: string
          title: string
          description: string | null
          image_url: string | null
          total_shares: number
          shares_available: number
          initial_price: number
          current_price: number
          status: string
          primary_commission_rate: number
          shares_sold: number
          total_raised: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          creator_id: string
          title: string
          description?: string | null
          image_url?: string | null
          total_shares: number
          shares_available: number
          initial_price: number
          current_price: number
          status?: string
          primary_commission_rate?: number
          shares_sold?: number
          total_raised?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['offerings']['Insert']>
      }
      holdings: {
        Row: {
          id: string
          user_id: string
          offering_id: string
          shares_owned: number
          avg_buy_price: number
          total_invested: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          offering_id: string
          shares_owned?: number
          avg_buy_price: number
          total_invested: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['holdings']['Insert']>
      }
      transactions: {
        Row: {
          id: string
          offering_id: string
          buyer_id: string
          shares: number
          price_per_share: number
          total_amount: number
          commission_rate: number
          commission_amount: number
          net_amount: number
          payment_ref: string | null
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          offering_id: string
          buyer_id: string
          shares: number
          price_per_share: number
          total_amount: number
          commission_rate: number
          commission_amount: number
          net_amount: number
          payment_ref?: string | null
          status?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['transactions']['Insert']>
      }
      price_history: {
        Row: {
          id: string
          offering_id: string
          price: number
          recorded_at: string
        }
        Insert: {
          id?: string
          offering_id: string
          price: number
          recorded_at?: string
        }
        Update: Partial<Database['public']['Tables']['price_history']['Insert']>
      }
    }
  }
}

export type UserRow       = Database['public']['Tables']['users']['Row']
export type CreatorRow    = Database['public']['Tables']['creators']['Row']
export type OfferingRow   = Database['public']['Tables']['offerings']['Row']
export type HoldingRow    = Database['public']['Tables']['holdings']['Row']
export type TransactionRow = Database['public']['Tables']['transactions']['Row']
export type PriceHistoryRow = Database['public']['Tables']['price_history']['Row']
