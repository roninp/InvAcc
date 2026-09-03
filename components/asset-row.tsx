"use client"

import { ArrowDownToLine, Info, Scale, Trash2 } from "lucide-react"
import { PortfolioCalculator } from "@/lib/portfolio-calculator"
import { formatNumber, formatRub } from "@/lib/format"
import { getGroupColor, type Asset, type AssetAnalysis, type Group } from "@/lib/types"
import { NumericInput } from "./numeric-input"

interface AssetRowProps {
  asset: Asset
  analysis?: AssetAnalysis
  onUpdate: (asset: Asset) => void
  onRemove: (id: number) => void
  onDistributeEvenly: () => void
  onTargetEmptyChange: (id: number, isEmpty: boolean) => void
  onQuantityChanged: (id: number) => void
  onApplyAdjustment: (assetId: number, requiredQuantity: number, adjustmentValue: number) => void
  isLoading: boolean
  isLastAsset: boolean
  animate: boolean
  animateDelay: number
  isAdjustmentActive: boolean
  /** Актив относится к срочному рынку Мосбиржи (фьючерс/опцион) — использовать нельзя. */
  isDerivative: boolean
  useGroups: boolean
  groups: Group[]
}

const inputBase =
  "rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm outline-none transition-shadow focus:ring-2 focus:ring-ring/40 disabled:bg-muted disabled:opacity-60"

export function AssetRow({
  asset,
  analysis,
  onUpdate,
  onRemove,
  onDistributeEvenly,
  onTargetEmptyChange,
  onQuantityChanged,
  onApplyAdjustment,
  isLoading,
  isLastAsset,
  animate,
  animateDelay,
  isAdjustmentActive,
  isDerivative,
  useGroups,
  groups,
}: AssetRowProps) {
  const groupColorHex = useGroups ? getGroupColor(asset.groupId, groups) : null
  const priceDecimals = PortfolioCalculator.getPriceDecimals(asset.price)
  const lotPrice = PortfolioCalculator.roundUpToDecimals(
    PortfolioCalculator.getLotSize(asset) * asset.price,
    priceDecimals,
  )

  const percentStyles = (() => {
    if (!analysis) return ""
    if (analysis.currentPercent < asset.targetPercent) return "bg-negative-muted text-negative"
    if (analysis.currentPercent > asset.targetPercent) return "bg-positive-muted text-positive"
    return "bg-info-muted text-info"
  })()

  const adjustmentColor = analysis
    ? analysis.adjustment > 0.1
      ? "text-positive"
      : analysis.adjustment < -0.1
        ? "text-negative"
        : "text-muted-foreground"
    : "text-muted-foreground"

  return (
    <tr
      className={`border-b border-border/70 transition-colors hover:bg-muted/40 ${
        isDerivative ? "bg-negative-muted/40 hover:bg-negative-muted/60" : ""
      } ${animate ? "animate-fade-in-up" : ""}`}
      style={animate ? { animationDelay: `${Math.min(animateDelay, 9) * 0.04}s` } : undefined}
    >
      {/* Актив */}
      <td className="px-3 py-3 align-middle">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            {useGroups && (
              <span
                className="h-8 w-1 shrink-0 rounded-full"
                style={{ backgroundColor: groupColorHex || "var(--muted-foreground)" }}
                aria-hidden
              />
            )}
            <input
              type="text"
              value={asset.ticker}
              onChange={(e) => onUpdate({ ...asset, ticker: e.target.value.toUpperCase() })}
              className={`w-28 font-mono font-medium tracking-wide ${inputBase} ${
                isDerivative ? "border-negative/50 focus:ring-negative/30" : ""
              }`}
              maxLength={12}
              placeholder="ТИКЕР/ISIN"
              aria-label="Тикер актива"
            />
          </div>
          {isDerivative && (
            <span
              className="inline-flex w-fit items-center gap-1 rounded-md border border-negative/25 bg-negative-muted px-1.5 py-0.5 text-[11px] font-medium leading-none text-negative"
              title="Фьючерсы и опционы не поддерживаются — расчёт только для фондового сектора Мосбиржи"
            >
              <Info className="h-3 w-3" strokeWidth={2} />
              Срочный рынок
            </span>
          )}
        </div>
      </td>

      {/* Группа */}
      {useGroups && (
        <td className="px-3 py-3 align-middle">
          <select
            value={asset.groupId ?? ""}
            onChange={(e) => onUpdate({ ...asset, groupId: e.target.value === "" ? null : Number(e.target.value) })}
            className={`w-32 ${inputBase}`}
            aria-label="Группа актива"
          >
            <option value="">— Группа —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </td>
      )}

      {/* Кол-во */}
      <td className="px-3 py-3 align-middle">
        <NumericInput
          value={asset.quantity}
          onChange={(val) => {
            onUpdate({ ...asset, quantity: val })
            onQuantityChanged(asset.id)
          }}
          isInteger
          className={`w-20 text-right font-mono tabular-nums ${inputBase}`}
          placeholder="0"
          aria-label="Количество лотов"
        />
      </td>

      {/* Цена за шт./лот */}
      <td className="px-3 py-3 align-middle">
        <div className="flex items-center justify-end gap-2">
          <NumericInput
            value={asset.price}
            onChange={(val) => onUpdate({ ...asset, price: val })}
            disabled={isLoading}
            className={`w-24 text-right font-mono tabular-nums ${inputBase}`}
            placeholder="0.00"
            aria-label="Цена за штуку"
          />
          <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
            / {lotPrice.toFixed(priceDecimals)}
          </span>
        </div>
      </td>

      {/* Сумма */}
      <td className="px-3 py-3 text-right align-middle font-mono text-sm font-medium tabular-nums text-foreground">
        {analysis ? formatRub(analysis.currentValue) : "—"}
      </td>

      {/* Цель % */}
      <td className="px-3 py-3 align-middle">
        <div className="flex items-center gap-1">
          <NumericInput
            value={asset.targetPercent}
            onChange={(val) => onUpdate({ ...asset, targetPercent: val })}
            onEmptyChange={(isEmpty) => onTargetEmptyChange(asset.id, isEmpty)}
            className={`w-16 text-right font-mono tabular-nums ${inputBase}`}
            placeholder="0"
            aria-label="Целевой процент"
          />
          <button
            onClick={onDistributeEvenly}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
            title="Распределить поровну"
            aria-label="Распределить цели поровну"
          >
            <Scale className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </td>

      {/* Текущий % */}
      <td className="px-3 py-3 text-center align-middle">
        {analysis ? (
          <span
            className={`inline-block min-w-[3.5rem] rounded-full px-2.5 py-1 font-mono text-xs font-semibold tabular-nums ${percentStyles}`}
          >
            {analysis.currentPercent.toFixed(1)}%
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      {/* Требуется */}
      <td className="px-3 py-3 text-right align-middle font-mono text-sm tabular-nums text-muted-foreground">
        {analysis ? formatNumber(Math.round(analysis.requiredQuantity)) : "—"}
      </td>

      {/* Купить / Продать */}
      <td className={`px-3 py-3 text-right align-middle font-mono text-sm font-medium ${adjustmentColor}`}>
        {analysis && isAdjustmentActive ? (
          <div className="flex items-center justify-end gap-2">
            <div className="flex flex-col items-end leading-tight">
              <span className="tabular-nums">
                {analysis.adjustment > 0 ? "+" : ""}
                {formatNumber(Math.round(analysis.adjustment))}
              </span>
              <span className="text-[11px] tabular-nums opacity-80">
                {analysis.adjustmentValue > 0 ? "+" : ""}
                {analysis.adjustmentValue.toFixed(2)} ₽
              </span>
            </div>
            <button
              onClick={() => onApplyAdjustment(asset.id, analysis.requiredQuantity, analysis.adjustmentValue)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
              title="Применить требуемое количество"
              aria-label="Применить требуемое количество"
            >
              <ArrowDownToLine className="h-3.5 w-3.5" strokeWidth={2.25} />
            </button>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      {/* Удалить */}
      <td className="px-3 py-3 text-center align-middle">
        <button
          onClick={() => onRemove(asset.id)}
          disabled={isLastAsset}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-negative-muted hover:text-negative disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
          title={isLastAsset ? "Минимум 1 актив" : "Удалить актив"}
          aria-label="Удалить актив"
        >
          <Trash2 className="h-4 w-4" strokeWidth={2} />
        </button>
      </td>
    </tr>
  )
}
