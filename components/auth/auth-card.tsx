"use client"

import { ChartCandlestick } from "lucide-react"

/**
 * Карточка бренда для страниц входа/регистрации.
 * Повторяет визуальный стиль приложения: rounded-2xl, bg-card, border-border.
 */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm shadow-primary/30">
            <ChartCandlestick className="h-6 w-6" strokeWidth={2.25} />
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">Ребалансировка и учёт инвестиций</h1>
          <p className="mt-1 text-sm text-muted-foreground">Портфель Московской биржи</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground text-pretty">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  )
}