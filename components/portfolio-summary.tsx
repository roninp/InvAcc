"use client"

import { useCallback, useState } from "react"
import { Plus, Wallet, TrendingUp, Coins } from "lucide-react"
import { PortfolioCalculator } from "@/lib/portfolio-calculator"
import { formatRub } from "@/lib/format"
import type { Asset, AssetAnalysis } from "@/lib/types"
import { NumericInput } from "./numeric-input"

export function PortfolioSummary({
  analysis,
  assets,
  cashBalance,
  onCashBalanceChange,
  additionalCash,
  onAdditionalCashChange,
  onAddCash,
}: {
  analysis: AssetAnalysis[]
  assets: Asset[]
  cashBalance: number
  onCashBalanceChange: (value: number) => void
  additionalCash: number
  onAdditionalCashChange: (value: number) => void
  onAddCash: (amount: number) => void
}) {
  const [canAddCash, setCanAddCash] = useState(false)
  const [liveAddCash, setLiveAddCash] = useState(0)
  const [addCashResetKey, setAddCashResetKey] = useState(0)

  const handleAddCashClick = useCallback(() => {
    const amount = liveAddCash > 0 ? liveAddCash : additionalCash
    if (amount > 0) {
      onAddCash(amount)
      setCanAddCash(false)
      setLiveAddCash(0)
      setAddCashResetKey((k) => k + 1)
    }
  }, [liveAddCash, additionalCash, onAddCash])
  const source = analysis.length > 0 ? analysis : assets
  const totalValueRaw = source.reduce(
    (sum, a) => sum + PortfolioCalculator.floorMoney(a.quantity * PortfolioCalculator.getLotSize(a) * a.price),
    0,
  )
  const totalValue = Math.round(totalValueRaw * 100) / 100
  const portfolioValue = totalValue + cashBalance
  const cashShare = portfolioValue > 0 ? (cashBalance / portfolioValue) * 100 : 0

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {/* Стоимость активов */}
      <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow duration-300 hover:shadow-md">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Стоимость активов</p>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums tracking-tight text-foreground">
              {formatRub(totalValue)}
            </p>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-info-muted text-info">
            <TrendingUp className="h-4.5 w-4.5" strokeWidth={2} />
          </span>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {assets.length} {pluralAssets(assets.length)} в портфеле
        </p>
      </div>

      {/* Деньги */}
      <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow duration-300 hover:shadow-md">
        <div className="flex items-start justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Свободные деньги</p>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Wallet className="h-4.5 w-4.5" strokeWidth={2} />
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <NumericInput
            value={cashBalance || null}
            onChange={onCashBalanceChange}
            aria-label="Остаток денежных средств"
            className="w-full rounded-lg border border-input bg-background px-3 py-1.5 font-mono text-2xl font-semibold tabular-nums tracking-tight text-foreground outline-none transition-shadow hover:border-ring/60 focus:ring-2 focus:ring-ring/40"
            placeholder="0.00"
          />
        </div>
        <div className="mt-3 flex gap-2">
          <NumericInput
            key={addCashResetKey}
            value={additionalCash || null}
            onChange={onAdditionalCashChange}
            onLiveChange={(value) => {
              setCanAddCash(value > 0)
              setLiveAddCash(value)
            }}
            aria-label="Сумма для добавления"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-right font-mono text-sm tabular-nums outline-none transition-shadow focus:ring-2 focus:ring-ring/40"
            placeholder="Внести сумму"
          />
          <button
            onClick={handleAddCashClick}
            disabled={!canAddCash && additionalCash <= 0}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background transition-all duration-200 hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            <span className="hidden sm:inline">Внести</span>
          </button>
        </div>
      </div>

      {/* Стоимость портфеля */}
      <div className="group relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/[0.04] p-5 shadow-sm transition-shadow duration-300 hover:shadow-md">
        <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-primary/10 blur-2xl" />
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-primary/80">Стоимость портфеля</p>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums tracking-tight text-foreground">
              {formatRub(portfolioValue)}
            </p>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/30">
            <Coins className="h-4.5 w-4.5" strokeWidth={2} />
          </span>
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Доля денег</span>
            <span className="font-mono tabular-nums text-foreground">{cashShare.toFixed(1)}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-primary/15">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${Math.min(Math.max(cashShare, 0), 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function pluralAssets(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "актив"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "актива"
  return "активов"
}
