"use client"

import Link from "next/link"
import { ChartCandlestick, House, Layers, LogIn, LogOut, Settings } from "lucide-react"
import type { AuthUser, Page, Tier } from "@/lib/types"

const NAV: { id: Page; label: string; icon: typeof Layers }[] = [
  { id: "home", label: "Главная", icon: House },
  { id: "portfolio", label: "Портфель", icon: Layers },
  { id: "settings", label: "Настройки", icon: Settings },
]

const TIER_LABEL: Record<Tier, string> = {
  free: "Бесплатный",
  basic: "Базовый",
  pro: "Про",
}

export function AppHeader({
  activePage,
  onNavigate,
  tier,
  user,
  onSignOut,
}: {
  activePage: Page
  onNavigate: (page: Page) => void
  tier: Tier
  user: AuthUser | null
  onSignOut: () => void
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/30">
              <ChartCandlestick className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div className="leading-tight">
              <h1 className="text-[15px] font-semibold tracking-tight text-foreground">Ребалансировка и учёт инвестиций</h1>
              <p className="hidden text-xs text-muted-foreground sm:block">Портфель Московской биржи</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Тариф: <span className="text-foreground">{TIER_LABEL[tier]}</span>
            </span>

            {user ? (
              <div className="flex items-center gap-2">
                <span className="hidden max-w-[180px] truncate text-xs font-medium text-muted-foreground md:block" title={user.email ?? undefined}>
                  {user.email}
                </span>
                <button
                  onClick={onSignOut}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-negative-muted hover:text-negative"
                  title="Выйти из аккаунта"
                >
                  <LogOut className="h-3.5 w-3.5" strokeWidth={2.25} />
                  Выйти
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm shadow-primary/30 transition-all hover:opacity-90 active:scale-95"
              >
                <LogIn className="h-3.5 w-3.5" strokeWidth={2.25} />
                Войти
              </Link>
            )}
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto pb-3 pt-1">
          {NAV.map((item) => {
            const Icon = item.icon
            const active = activePage === item.id
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`group inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
                  active
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <Icon
                  className={`h-4 w-4 transition-colors ${active ? "text-background" : "text-muted-foreground group-hover:text-foreground"}`}
                  strokeWidth={2}
                />
                {item.label}
              </button>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
