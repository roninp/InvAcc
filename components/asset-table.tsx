"use client"

import { CheckCheck } from "lucide-react"
import type { Asset, AssetAnalysis, Group } from "@/lib/types"
import { AssetRow } from "./asset-row"

interface AssetTableProps {
  assets: Asset[]
  analysis: AssetAnalysis[]
  useGroups: boolean
  groups: Group[]
  loading: boolean
  animationKey: number
  isCalculated: boolean
  appliedAdjustmentIds: Set<number>
  /** Тикеры инструментов срочного рынка Мосбиржи — они подсвечиваются и не участвуют в расчёте. */
  derivativeTickers: ReadonlySet<string>
  onUpdate: (asset: Asset) => void
  onRemove: (id: number) => void
  onDistributeEvenly: () => void
  onTargetEmptyChange: (id: number, isEmpty: boolean) => void
  onQuantityChanged: (id: number) => void
  onApplyAdjustment: (assetId: number, requiredQuantity: number, adjustmentValue: number) => void
  onApplyAll: () => void
}

const th = "px-3 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"

export function AssetTable({
  assets,
  analysis,
  useGroups,
  groups,
  loading,
  animationKey,
  isCalculated,
  appliedAdjustmentIds,
  derivativeTickers,
  onUpdate,
  onRemove,
  onDistributeEvenly,
  onTargetEmptyChange,
  onQuantityChanged,
  onApplyAdjustment,
  onApplyAll,
}: AssetTableProps) {
  const canApplyAll = analysis.length > 0

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className={`${th} text-left`}>Актив</th>
              {useGroups && <th className={`${th} text-left`}>Группа</th>}
              <th className={`${th} text-left`}>Кол-во</th>
              <th className={`${th} text-right`}>Цена шт. / лот</th>
              <th className={`${th} text-right`}>Сумма</th>
              <th className={`${th} text-left`}>Цель %</th>
              <th className={`${th} text-center`}>Текущий %</th>
              <th className={`${th} text-right`}>Требуется</th>
              <th className={`${th} text-right`}>
                <div className="flex items-center justify-end gap-2">
                  <span>Купить / Продать</span>
                  <button
                    onClick={onApplyAll}
                    disabled={!canApplyAll}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium normal-case tracking-normal text-primary-foreground transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Применить требуемое количество ко всем активам"
                  >
                    <CheckCheck className="h-3.5 w-3.5" strokeWidth={2.25} />
                    Ко всем
                  </button>
                </div>
              </th>
              <th className={`${th} text-center`}>
                <span className="sr-only">Удалить</span>
              </th>
            </tr>
          </thead>
          <tbody key={animationKey}>
            {assets.map((asset, index) => (
              <AssetRow
                key={asset.id}
                asset={asset}
                analysis={analysis.find((a) => a.id === asset.id)}
                onUpdate={onUpdate}
                onRemove={onRemove}
                onDistributeEvenly={onDistributeEvenly}
                onTargetEmptyChange={onTargetEmptyChange}
                onQuantityChanged={onQuantityChanged}
                onApplyAdjustment={onApplyAdjustment}
                isLoading={loading}
                isLastAsset={assets.length <= 1}
                animate={isCalculated}
                animateDelay={index}
                isAdjustmentActive={appliedAdjustmentIds.has(asset.id)}
                isDerivative={derivativeTickers.has(asset.ticker.trim().toUpperCase())}
                useGroups={useGroups}
                groups={groups}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
