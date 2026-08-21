"use client"

import { useState } from "react"
import { Check, Info, Plus, Trash2 } from "lucide-react"
import { GROUP_COLORS, type Group, type Tier } from "@/lib/types"

const TIERS: { id: Tier; label: string; desc: string }[] = [
  { id: "free", label: "Бесплатный", desc: "До 2 активов" },
  { id: "basic", label: "Базовый", desc: "До 100 активов" },
  { id: "pro", label: "Про", desc: "Группы + быстрые цены" },
]

export function SettingsPage({
  tier,
  onTierChange,
  useGroups,
  onUseGroupsChange,
  groups,
  onAddGroup,
  onRemoveGroup,
}: {
  tier: Tier
  onTierChange: (tier: Tier) => void
  useGroups: boolean
  onUseGroupsChange: (value: boolean) => void
  groups: Group[]
  onAddGroup: (name: string, percent: number, color: string) => void
  onRemoveGroup: (id: number) => void
}) {
  const [newGroupName, setNewGroupName] = useState("")
  const [newGroupPercent, setNewGroupPercent] = useState("")
  const [newGroupColor, setNewGroupColor] = useState(GROUP_COLORS[0])
  const [formError, setFormError] = useState<string | null>(null)

  const sumGroupPercents = groups.reduce((s, g) => s + g.percent, 0)
  const isSumValid = Math.abs(sumGroupPercents - 100) <= 0.01

  const handleAddGroup = () => {
    const name = newGroupName.trim()
    const percent = Number.parseFloat(newGroupPercent)
    if (!name) {
      setFormError("Введите название группы")
      return
    }
    if (isNaN(percent) || percent <= 0 || percent > 100) {
      setFormError("Доля группы должна быть от 0 до 100")
      return
    }
    onAddGroup(name, percent, newGroupColor)
    setNewGroupName("")
    setNewGroupPercent("")
    setNewGroupColor(GROUP_COLORS[0])
    setFormError(null)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Настройки</h2>
        <p className="mt-1 text-sm text-muted-foreground">Тарифный план и параметры расчёта портфеля</p>

        {/* Тариф */}
        <div className="mt-6 border-t border-border pt-6">
          <div className="font-medium text-foreground">Тарифный план</div>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            Выберите тариф. Пока выбирается вручную, в дальнейшем будет браться из БД.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {TIERS.map((t) => {
              const active = tier === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onTierChange(t.id)}
                  className={`relative flex flex-col items-start rounded-xl border p-4 text-left transition-all duration-200 ${
                    active
                      ? "border-primary bg-primary/[0.05] shadow-sm"
                      : "border-border bg-card hover:border-primary/40 hover:bg-muted/40"
                  }`}
                >
                  {active && (
                    <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                  )}
                  <span className={`text-sm font-semibold ${active ? "text-primary" : "text-foreground"}`}>
                    {t.label}
                  </span>
                  <span className="mt-1 text-xs text-muted-foreground">{t.desc}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Использовать группы */}
        <div
          className={`mt-6 flex items-center justify-between border-t border-border pt-6 ${tier !== "pro" ? "opacity-55" : ""}`}
        >
          <div>
            <div className="flex items-center gap-2 font-medium text-foreground">
              Использовать группы
              <span className="rounded-md bg-accent px-1.5 py-0.5 text-xs font-semibold text-accent-foreground">
                Про
              </span>
            </div>
            <div className="mt-0.5 text-sm text-muted-foreground">Группировка активов по категориям</div>
          </div>
          <button
            type="button"
            disabled={tier !== "pro"}
            onClick={() => onUseGroupsChange(!useGroups)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              useGroups ? "bg-primary" : "bg-muted-foreground/30"
            } ${tier !== "pro" ? "cursor-not-allowed" : "cursor-pointer"}`}
            aria-label="Использовать группы"
            role="switch"
            aria-checked={useGroups}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${
                useGroups ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>

        {/* Управление группами */}
        {useGroups && tier === "pro" && (
          <div className="mt-6 border-t border-border pt-6">
            <div className="font-medium text-foreground">Группы активов</div>
            <p className="mb-4 mt-1 text-sm text-muted-foreground">
              Добавьте названия групп и их долю в портфеле. Сумма долей всех групп должна быть 100%.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Название (например, Акции)"
                className="min-w-[200px] flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-shadow focus:ring-2 focus:ring-ring/40"
              />
              <input
                type="text"
                inputMode="decimal"
                value={newGroupPercent}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === "" || /^\d+\.?\d*$/.test(v) || /^\d*\.?\d+$/.test(v)) setNewGroupPercent(v)
                }}
                placeholder="Доля %"
                className="w-24 rounded-lg border border-input bg-background px-3 py-2 text-right font-mono text-sm tabular-nums outline-none transition-shadow focus:ring-2 focus:ring-ring/40"
              />
              <label
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm transition-colors hover:border-primary/40"
                title="Цвет группы"
              >
                <input
                  type="color"
                  value={newGroupColor}
                  onChange={(e) => setNewGroupColor(e.target.value)}
                  className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
                />
                <span className="text-muted-foreground">Цвет</span>
              </label>
              <button
                type="button"
                onClick={handleAddGroup}
                className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-all hover:opacity-90 active:scale-95"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                Добавить
              </button>
            </div>

            {formError && <p className="mt-2 text-sm text-negative">{formError}</p>}

            {groups.length > 0 && (
              <div className="mt-4 space-y-2">
                {groups.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-2.5"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white"
                        style={{ backgroundColor: g.color || "#94a3b8" }}
                      />
                      <span className="font-medium text-foreground">{g.name}</span>
                      <span className="font-mono text-sm tabular-nums text-muted-foreground">
                        {g.percent.toFixed(2)}%
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveGroup(g.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-negative-muted hover:text-negative"
                      title="Удалить группу"
                      aria-label="Удалить группу"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div
              className={`mt-4 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
                isSumValid ? "bg-positive-muted text-positive" : "bg-accent text-accent-foreground"
              }`}
            >
              {isSumValid && <Check className="h-4 w-4" strokeWidth={2.5} />}
              Сумма долей: {sumGroupPercents.toFixed(2)}%{!isSumValid && " (должна быть 100%)"}
            </div>
          </div>
        )}

        {/* Комиссии брокера — заглушки */}
        <div className="mt-6 space-y-4 border-t border-border pt-6 opacity-55">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-foreground">Процент брокера за покупку</div>
              <div className="mt-0.5 text-sm text-muted-foreground">Комиссия при покупке, %</div>
            </div>
            <input
              type="text"
              inputMode="decimal"
              disabled
              className="w-28 cursor-not-allowed rounded-lg border border-input bg-muted px-3 py-2 text-right font-mono text-sm"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-foreground">Процент брокера за продажу</div>
              <div className="mt-0.5 text-sm text-muted-foreground">Комиссия при продаже, %</div>
            </div>
            <input
              type="text"
              inputMode="decimal"
              disabled
              className="w-28 cursor-not-allowed rounded-lg border border-input bg-muted px-3 py-2 text-right font-mono text-sm"
            />
          </div>
        </div>

        <div className="mt-6 flex items-start gap-2.5 rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          Настройки брокера пока неактивны и будут реализованы позже.
        </div>
      </div>
    </div>
  )
}
