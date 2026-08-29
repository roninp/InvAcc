import { createClient } from "@/lib/supabase/server"
import { AuthService } from "@/lib/auth-service"
import { PortfolioRebalancer } from "@/components/portfolio-rebalancer"
import type { AuthUser, Tier } from "@/lib/types"

/**
 * Корневая страница — async Server Component.
 * Читает сессию и тариф из БД (profiles) и передаёт начальное состояние
 * в клиентский PortfolioRebalancer.
 */
export default async function Page() {
  const supabase = await createClient()
  let initialUser: AuthUser | null = null
  let initialTier: Tier = "free"

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      initialUser = { id: user.id, email: user.email ?? null }
      initialTier = await AuthService.getTier(supabase)
    }
  } catch {
    // Недоступная сеть/не настроенный Supabase — показываем приложение как гостю (free).
  }

  return <PortfolioRebalancer initialUser={initialUser} initialTier={initialTier} />
}
