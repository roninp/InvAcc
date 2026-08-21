"use client"

import { ChartCandlestick, Layers, Settings, Tag } from "lucide-react"
import type { Page, Tier } from "@/lib/types"

const NAV: { id: Page; label: string; icon: typeof Layers }[] = [
  { id: "portfolio", label: "Портфель", icon: Layers },
  { id: "settings", label: "Настройки", icon: Settings },
  { id: "tariffs", label: "Тарифы", icon: Tag },
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
}: {
  activePage: Page
  onNavigate: (page: Page) => void
  tier: Tier
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
              <h1 className="text-[15px] font-semibold tracking-tight text-foreground">Ребалансировка</h1>
              <p className="hidden text-xs text-muted-foreground sm:block">Портфель Московской биржи</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Тариф: <span className="text-foreground">{TIER_LABEL[tier]}</span>
            </span>
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
