import { createBrowserClient } from "@supabase/ssr"
import type { Database } from "./database.types"

/**
 * Создать Supabase-клиент на стороне браузера.
 * Сессия хранится в cookie-пакете (@supabase/ssr), поэтому после входа и
 * перезагрузки страницы серверный клиент «увидит» того же пользователя.
 */
export function createClient(): ReturnType<typeof createBrowserClient<Database>> {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}