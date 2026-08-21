"use client"

import { PortfolioCalculator } from "@/lib/portfolio-calculator"
import { getGroupColor, type Asset, type Group } from "@/lib/types"

export function GroupAllocations({ groups, assets }: { groups: Group[]; assets: Asset[] }) {
  const totalValue = PortfolioCalculator.calculateTotalValue(assets)

  const data = groups.map((g) => {
    const groupAssets = assets.filter((a) => a.groupId === g.id)
    const groupValue = PortfolioCalculator.calculateTotalValue(groupAssets)
    const currentPercent = totalValue > 0 ? (groupValue / totalValue) * 100 : 0
    const targetPercent = g.percent
    const diff = currentPercent - targetPercent
    const color = getGroupColor(g.id, groups)
    return { ...g, groupValue, currentPercent, targetPercent, diff, color }
  })

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">Доли групп в портфеле</h2>
        <span className="text-xs text-muted-foreground">текущая / цель</span>
      </div>
      <div className="space-y-4">
        {data.map((item) => {
          const isUnderweight = item.currentPercent < item.targetPercent
          const isOverweight = item.currentPercent > item.targetPercent
          const diffSign = isUnderweight ? "+" : isOverweight ? "−" : ""
          const diffValue = Math.abs(item.diff)
          const diffColor = isOverweight ? "text-negative" : "text-positive"
          return (
            <div key={item.id} className="flex items-center gap-3">
              <span
                className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs font-medium text-white shadow-sm"
                style={{ backgroundColor: item.color }}
              >
                {item.name}
              </span>
              <div className="flex-1">
                <div className="relative h-2 overflow-hidden rounded-full bg-muted">
                  {/* Целевая отметка */}
                  <div
                    className="absolute top-1/2 z-10 h-3 w-0.5 -translate-y-1/2 rounded-full bg-foreground/40"
                    style={{ left: `${Math.min(Math.max(item.targetPercent, 0), 100)}%` }}
                    aria-hidden
                  />
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(Math.max(item.currentPercent, 0), 100)}%`,
                      backgroundColor: item.color,
                    }}
                  />
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <div className="font-mono text-sm tabular-nums text-foreground">
                  {item.currentPercent.toFixed(1)}
                  <span className="text-muted-foreground"> / {item.targetPercent.toFixed(1)}%</span>
                </div>
                <div className={`font-mono text-xs tabular-nums ${diffColor}`}>
                  {diffSign}
                  {diffValue.toFixed(2)}%
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
