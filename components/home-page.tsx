"use client"

import { ArrowRight, Check, LineChart, PiggyBank, RefreshCw, ShieldCheck, Users } from "lucide-react"
import type { Page, Tier } from "@/lib/types"

/** Порядок тарифов по возрастанию стоимости (для плашки «Перейти»). */
const TIER_ORDER: Tier[] = ["free", "basic", "pro"]

const PLANS: {
  id: Tier
  name: string
  price: string
  period: string
  description: string
  features: string[]
}[] = [
  {
    id: "free",
    name: "Бесплатный",
    price: "0 ₽",
    period: "навсегда",
    description: "Для знакомства с ребалансировкой",
    features: [
      "Два актива в портфеле",
      "Настройка целевых долей",
      "Автоматическое определение цен",
      "Расчёт существующих долей",
      "Автоматическое сохранение и загрузка портфеля",
      "Сохранение и загрузка портфеля из файла",
    ],
  },
  {
    id: "basic",
    name: "Базовый",
    price: "199 ₽",
    period: "в месяц",
    description: "Наиболее подходит для инвестиций в БПИФы",
    features: [
      "Все возможности бесплатного тарифа",
      "До 100 активов в портфеле",
    ],
  },
  {
    id: "pro",
    name: "Про",
    price: "399 ₽",
    period: "в месяц",
    description: "Для продвинутого управления",
    features: [
      "Все возможности тарифа «Базовый»",
      "Группы активов по категориям",
      "Расчёт долей групп и активов в группе",
      "Мгновенные котировки в реальном времени",
      "Учёт 5-ти разных портфелей",
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
        <div className="relative space-y-6">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" strokeWidth={2.25} />
            Быстрый и удобный расчет инвестиций под ваши цели
          </span>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground text-balance sm:text-3xl">
            Ребалансировка и учёт инвестиций
          </h2>
          <p className="text-sm text-muted-foreground text-pretty sm:text-base">
            Сервис предназначен для инвесторов Московской биржи: просто внесите активы вашего портфеля, укажите их целевые доли — и получайте точные расчёты, что из них докупить или продать чтобы привести портфель к нужному вам состоянию. Цены подтягиваются автоматически, свободные деньги учитываются, а результат сохраняется прямо в браузере.
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
            const currentTierIndex = TIER_ORDER.indexOf(tier)
            const planTierIndex = TIER_ORDER.indexOf(plan.id)
            // «Перейти» — заглушка: показываем только для тарифов дороже текущего.
            const isUpgrade = currentTierIndex >= 0 && planTierIndex > currentTierIndex
            const isCurrent = tier === plan.id
            return (
              <div
                key={plan.id}
                className="relative flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-300 hover:shadow-md"
              >
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

                {isCurrent ? (
                  <button
                    disabled
                    className="mt-6 w-full cursor-default rounded-lg border border-border bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground"
                  >
                    Активен
                  </button>
                ) : isUpgrade ? (
                  // Заглушка системы оплаты: кнопка появится вместе с подключением оплаты.
                  <button
                    disabled
                    title="Система оплаты появится позже"
                    className="mt-6 w-full cursor-not-allowed rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    Перейти
                  </button>
                ) : null}
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