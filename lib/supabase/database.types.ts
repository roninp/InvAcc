/** Типы базы данных Supabase (проект hqpskrzxodjhbnucguww, сгенерировано 2026-08-29). */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

/** Допустимые тарифы пользователей (check-ограничение в БД). */
export type ProfileTier = "free" | "basic" | "pro"

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          tier: ProfileTier
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          tier?: ProfileTier
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          tier?: ProfileTier
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