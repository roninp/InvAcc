"use client"

import { ArrowRight, Check, LineChart, PiggyBank, RefreshCw, ShieldCheck, Sparkles, Users } from "lucide-react"
import type { Page, Tier } from "@/lib/types"

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
    features: ["Один портфель", "До 2 активов в портфеле", "Цены Мосбиржи (задержка ~15 мин)", "Расчёт целевых долей", "Сохранение в файл"],
  },
  {
    id: "basic",
    name: "Базовый",
    price: "299 ₽",
    period: "в месяц",
    description: "Для частного инвестора",
    features: [
      "Один портфель",
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
      "До 5 портфелей",
      "Группы активов по категориям",
      "Мгновенные котировки в реальном времени",
      "Приоритетная поддержка",
    ],
  },
]

const AUDIENCE: { title: string; description: string; icon: typeof Users }[] = [
  {
    title: "Частные инвесторы",
    description: "Тем, кто держит акции и облигации Московской биржи и хочет держать портфель в целевом соотношении.",
    icon: Users,
  },
  {
    title: "Учёт свободных денег",
    description: "Свободный остаток и дополнительный бюджет учитываются в расчётах — деньги работают, а не лежат мёртвым грузом.",
    icon: PiggyBank,
  },
  {
    title: "Автоматические расчёты",
    description: "Никаких таблиц вручную: точный план покупок и продаж для каждого актива формируется в один клик.",
    icon: RefreshCw,
  },
]

export function HomePage({ tier, onNavigate }: { tier: Tier; onNavigate: (page: Page) => void }) {
  return (
    <div className="space-y-6">
      {/* Hero: краткое описание сервиса */}
      <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
        />
        <div className="relative max-w-2xl space-y-6">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" strokeWidth={2.25} />
            Бесплатный старт для частных инвесторов
          </span>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground text-balance sm:text-3xl">
            Ребалансировка и учёт инвестиций
          </h2>
          <p className="text-sm text-muted-foreground text-pretty sm:text-base">
            Инструмент для частных инвесторов Московской биржи: задайте целевые доли портфеля — и получайте точные
            расчёты, что и когда докупить или продать. Цены подтягиваются автоматически, свободные деньги учитываются,
            а результат сохраняется прямо в браузере.
          </p>

          <div className="grid gap-5">
            {AUDIENCE.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.title} className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-6">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-4.5 w-4.5" strokeWidth={2} />
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-foreground">{item.title}</div>
                    <p className="mt-0.5 text-sm text-muted-foreground text-pretty">{item.description}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => onNavigate("portfolio")}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/30 transition-all hover:opacity-90 active:scale-95"
          >
            <LineChart className="h-4 w-4" strokeWidth={2.25} />
            Перейти к портфелю
            <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>
      </section>
{/* Тарифы (перенесены со страницы «Тарифы», которая удалена) */}
      <section className="space-y-6">
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
      </section>
    </div>
  )
}