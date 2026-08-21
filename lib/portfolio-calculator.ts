import type { Asset, AssetAnalysis, Group } from "./types"

/**
 * Сервис расчёта портфеля — вся математика, независимая от UI.
 * Логика полностью сохранена из исходного приложения.
 */
export class PortfolioCalculator {
  /** Округление денежной суммы строго вниз до сотых долей. */
  static floorMoney(value: number): number {
    return Math.floor(value * 100) / 100
  }

  /** Округление количества активов строго вниз до целого числа. */
  static floorQuantity(value: number): number {
    return Math.floor(value)
  }

  /** Безопасное получение размера лота актива (>= 1). */
  static getLotSize(asset: Pick<Asset, "lotSize">): number {
    const raw = Number(asset && asset.lotSize)
    return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1
  }

  /** Округление строго вниз до целого числа лотов. */
  static floorToLot(value: number, lotSize: number): number {
    const lot = Number.isFinite(lotSize) && lotSize >= 1 ? Math.floor(lotSize) : 1
    return Math.floor(value / lot)
  }

  /** Количество знаков после запятой у цены актива. */
  static getPriceDecimals(price: number): number {
    const text = String(price)
    const dotIndex = text.indexOf(".")
    return dotIndex === -1 ? 0 : text.length - dotIndex - 1
  }

  /** Округление строго вверх до заданного числа знаков после запятой. */
  static roundUpToDecimals(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals)
    return Math.ceil(value * factor - 1e-9) / factor
  }

  static calculateTotalValue(assets: Asset[]): number {
    return assets.reduce((sum, asset) => sum + asset.quantity * this.getLotSize(asset) * asset.price, 0)
  }

  /**
   * Расчёт процента каждого актива.
   * В режиме групп процент считается внутри группы.
   */
  static calculatePercentages(assets: Asset[], groups: Group[] | null = null): number[] {
    const total = this.calculateTotalValue(assets)
    if (total === 0) return assets.map(() => 0)

    if (groups && groups.length > 0) {
      return assets.map((asset) => {
        if (asset.groupId == null) {
          return ((asset.quantity * this.getLotSize(asset) * asset.price) / total) * 100
        }
        const groupAssets = assets.filter((a) => a.groupId === asset.groupId)
        const groupTotal = this.calculateTotalValue(groupAssets)
        if (groupTotal === 0) return 0
        return ((asset.quantity * this.getLotSize(asset) * asset.price) / groupTotal) * 100
      })
    }

    return assets.map((asset) => ((asset.quantity * this.getLotSize(asset) * asset.price) / total) * 100)
  }

  static calculateRequiredQuantity(asset: Asset, targetPercent: number, totalValue: number): number {
    if (totalValue === 0 || asset.price === 0) return 0
    const rawShares = ((targetPercent / 100) * totalValue) / asset.price
    return this.floorToLot(rawShares, this.getLotSize(asset))
  }

  static calculateAdjustment(currentQuantity: number, requiredQuantity: number): number {
    return requiredQuantity - currentQuantity
  }

  /** Распределение целевых процентов внутри одной группы активов. */
  static distributeGroupTargets(groupAssets: Asset[], emptyTargetIds: Set<number>): Asset[] {
    if (groupAssets.length === 0) return groupAssets

    const isZeroAsset = (a: Asset) => a.targetPercent === 0 || a.targetPercent == null || emptyTargetIds.has(a.id)
    const zeroAssets = groupAssets.filter(isZeroAsset)
    const nonzeroAssets = groupAssets.filter((a) => !isZeroAsset(a))

    if (zeroAssets.length === groupAssets.length) {
      const equalPercent = 100 / groupAssets.length
      return groupAssets.map((asset, index) => {
        if (index === groupAssets.length - 1) {
          const allocated = (groupAssets.length - 1) * Number.parseFloat(equalPercent.toFixed(2))
          return { ...asset, targetPercent: Number.parseFloat((100 - allocated).toFixed(2)) }
        }
        return { ...asset, targetPercent: Number.parseFloat(equalPercent.toFixed(2)) }
      })
    }

    if (zeroAssets.length > 0 && nonzeroAssets.length > 0) {
      const sumNonZero = nonzeroAssets.reduce((sum, a) => sum + a.targetPercent, 0)
      const remaining = 100 - sumNonZero
      if (remaining <= 0) {
        const eq = 100 / groupAssets.length
        return groupAssets.map((a, i) => {
          if (i === groupAssets.length - 1) {
            const al = (groupAssets.length - 1) * Number.parseFloat(eq.toFixed(2))
            return { ...a, targetPercent: Number.parseFloat((100 - al).toFixed(2)) }
          }
          return { ...a, targetPercent: Number.parseFloat(eq.toFixed(2)) }
        })
      }
      const eqPart = remaining / zeroAssets.length
      let zi = 0
      return groupAssets.map((a) => {
        if (isZeroAsset(a)) {
          if (zi === zeroAssets.length - 1) {
            const al = (zeroAssets.length - 1) * Number.parseFloat(eqPart.toFixed(2))
            return { ...a, targetPercent: Number.parseFloat((remaining - al).toFixed(2)) }
          }
          zi++
          return { ...a, targetPercent: Number.parseFloat(eqPart.toFixed(2)) }
        }
        return a
      })
    }

    return groupAssets
  }

  /** Распределение целевых процентов между активами (с учётом групп). */
  static distributeTargets(
    assets: Asset[],
    emptyTargetIds: Set<number> = new Set(),
    groups: Group[] | null = null,
  ): Asset[] {
    if (assets.length === 0) return assets

    if (groups && groups.length > 0) {
      const groupIds = [...new Set(assets.map((a) => a.groupId).filter((id) => id != null))]
      const ungrouped = assets.filter((a) => a.groupId == null)
      let result: Asset[] = []
      for (const gid of groupIds) {
        const groupAssets = assets.filter((a) => a.groupId === gid)
        result = result.concat(this.distributeGroupTargets(groupAssets, emptyTargetIds))
      }
      if (ungrouped.length > 0) {
        result = result.concat(this.distributeGroupTargets(ungrouped, emptyTargetIds))
      }
      return result
    }

    return this.distributeGroupTargets(assets, emptyTargetIds)
  }

  /** Полный анализ портфеля с учётом эффективной стоимости и лимита бюджета. */
  static analyzePortfolio(
    assets: Asset[],
    effectiveTotalValue = 0,
    availableBudget?: number,
    groups: Group[] | null = null,
  ): { analysis: AssetAnalysis[]; cashSpent: number; salesTotal: number } {
    const currentPercentages = this.calculatePercentages(assets, groups)
    const totalPortfolioValue = this.calculateTotalValue(assets)
    const effectiveValue = effectiveTotalValue > 0 ? effectiveTotalValue : totalPortfolioValue

    const groupEffectiveValues: Record<number, number> = {}
    if (groups && groups.length > 0) {
      for (const g of groups) {
        groupEffectiveValues[g.id] = (effectiveValue * g.percent) / 100
      }
    }

    const rawAnalysis = assets.map((asset, index) => {
      let targetValue = effectiveValue
      if (groups && groups.length > 0 && asset.groupId != null) {
        targetValue = groupEffectiveValues[asset.groupId] ?? effectiveValue
      }
      return {
        asset,
        currentPercent: currentPercentages[index],
        requiredQuantity: this.calculateRequiredQuantity(asset, asset.targetPercent, targetValue),
      }
    })

    const salesTotal = rawAnalysis.reduce((sum, { asset, requiredQuantity }) => {
      const adjustment = this.calculateAdjustment(asset.quantity, requiredQuantity)
      return adjustment < 0 ? sum + this.floorMoney(Math.abs(adjustment) * this.getLotSize(asset) * asset.price) : sum
    }, 0)

    let budget = availableBudget != null ? availableBudget + salesTotal : Number.POSITIVE_INFINITY
    let cashSpent = 0

    const analysis: AssetAnalysis[] = rawAnalysis.map(({ asset, currentPercent, requiredQuantity }) => {
      const adjustment = this.calculateAdjustment(asset.quantity, requiredQuantity)
      let finalAdjustment = adjustment
      let finalRequiredQuantity = requiredQuantity

      if (adjustment > 0 && availableBudget != null) {
        const desiredCost = adjustment * this.getLotSize(asset) * asset.price
        if (desiredCost > budget) {
          const affordableQuantity = this.floorQuantity(budget / (this.getLotSize(asset) * asset.price))
          finalAdjustment = affordableQuantity
          finalRequiredQuantity = asset.quantity + affordableQuantity
          const spent = this.floorMoney(affordableQuantity * this.getLotSize(asset) * asset.price)
          budget -= spent
          cashSpent += spent
        } else {
          const spent = this.floorMoney(desiredCost)
          budget -= spent
          cashSpent += spent
        }
      }

      return {
        ...asset,
        currentValue: asset.quantity * this.getLotSize(asset) * asset.price,
        currentPercent,
        requiredQuantity: finalRequiredQuantity,
        adjustment: finalAdjustment,
        adjustmentValue: this.floorMoney(finalAdjustment * this.getLotSize(asset) * asset.price),
        isOverweight: currentPercent > asset.targetPercent,
        isUnderweight: currentPercent < asset.targetPercent,
      }
    })

    return { analysis, cashSpent, salesTotal }
  }
}
