import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database } from "./database.types"

/**
 * Создать Supabase-клиент для Server Components / Route Handlers.
 * Cookie-сессии с refresh-ротацией; обновлённые cookies записываются в ответ.
 */
export async function createClient(): Promise<ReturnType<typeof createServerClient<Database>>> {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            // ReadonlyRequestCookies в Next.js 16 не имеет setAll, но позволяет
            // записывать отдельные cookies через set (пишет в ответ).
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Вызов происходит из Server Component — cookies только для чтения.
            // Продление сессии здесь выполнит proxy.ts (middleware).
          }
        },
      },
    },
  )
}