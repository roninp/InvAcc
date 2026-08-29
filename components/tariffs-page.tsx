"use client"

import { Check, Sparkles } from "lucide-react"
import type { Tier } from "@/lib/types"

const PLANS: {
  id: Tier
  name: string
  price: string
  period: string
  description: string
  features: string[]
  highlight?: boolean
}[] = [
  {
    id: "free",
    name: "Бесплатный",
    price: "0 ₽",
    period: "навсегда",
    description: "Для знакомства с ребалансировкой",
    features: ["До 2 активов в портфеле", "Цены Мосбиржи (задержка ~15 мин)", "Расчёт целевых долей", "Сохранение в файл"],
  },
  {
    id: "basic",
    name: "Базовый",
    price: "299 ₽",
    period: "в месяц",
    description: "Для частного инвестора",
    features: [
      "До 100 активов в портфеле",
      "Цены Мосбиржи (задержка ~15 мин)",
      "Учёт свободных денег и бюджета",
      "Экспорт и импорт портфеля",
    ],
    highlight: true,
  },
  {
    id: "pro",
    name: "Про",
    price: "899 ₽",
    period: "в месяц",
    description: "Для продвинутого управления",
    features: [
      "Всё из тарифа «Базовый»",
      "Группы активов по категориям",
      "Мгновенные цены через Finam API",
      "Приоритетная поддержка",
    ],
  },
]

export function TariffsPage({ tier }: { tier: Tier }) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground text-balance">
          Выберите подходящий тариф
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground text-pretty">
          Управляйте портфелем эффективнее — от базового расчёта долей до групп активов и мгновенных котировок.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = tier === plan.id
          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl border p-6 shadow-sm transition-all duration-300 hover:shadow-md ${
                plan.highlight ? "border-primary/40 bg-card ring-1 ring-primary/20" : "border-border bg-card"
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-sm">
                  <Sparkles className="h-3 w-3" strokeWidth={2.5} />
                  Популярный
                </span>
              )}
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-foreground">{plan.name}</h3>
                {isCurrent && (
                  <span className="rounded-md bg-positive-muted px-2 py-0.5 text-xs font-medium text-positive">
                    Текущий
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="font-mono text-3xl font-semibold tracking-tight text-foreground">{plan.price}</span>
                <span className="text-sm text-muted-foreground">/ {plan.period}</span>
              </div>

              <ul className="mt-5 flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm text-foreground">
                    <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-positive-muted text-positive">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    <span className="text-pretty">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                disabled
                className={`mt-6 w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isCurrent
                    ? "cursor-default border border-border bg-muted text-muted-foreground"
                    : "cursor-default border border-border bg-muted/40 text-muted-foreground"
                }`}
                title="Тариф назначается вручную в базе данных"
              >
                {isCurrent ? "Активен" : "Назначается вручную"}
              </button>
            </div>
          )
        })}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        Смена тарифа выполняется администратором вручную и не может быть изменена на сайте.
      </p>
    </div>
  )
}
