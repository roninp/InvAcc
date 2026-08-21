import type { Asset, Group } from "./types"

export class AssetValidator {
  static validate(asset: Asset, requireGroup = false): { isValid: boolean; errors: string[] } {
    const errors: string[] = []
    if (asset.quantity < 0) errors.push("Количество не может быть отрицательным")
    if (asset.lotSize != null && asset.lotSize < 1) errors.push("Лот не может быть меньше 1")
    if (asset.price < 0) errors.push("Цена не может быть отрицательной")
    if (asset.targetPercent < 0 || asset.targetPercent > 100)
      errors.push("Целевой процент должен быть от 0 до 100")
    if (requireGroup && asset.groupId == null) errors.push("Выберите группу для актива")
    return { isValid: errors.length === 0, errors }
  }

  static validatePortfolio(
    assets: Asset[],
    groups: Group[] | null = null,
  ): { isValid: boolean; error?: string; shouldShow?: boolean } {
    const hasAny = assets.some((a) => a.targetPercent > 0)
    if (!hasAny) return { isValid: true, shouldShow: false }

    if (groups && groups.length > 0) {
      const ungrouped = assets.filter((a) => a.groupId == null)
      if (ungrouped.length > 0) {
        return { isValid: false, shouldShow: true, error: "Все активы должны быть привязаны к группе" }
      }

      const sumGroupPercents = groups.reduce((s, g) => s + g.percent, 0)
      if (Math.abs(sumGroupPercents - 100) > 0.01) {
        return {
          isValid: false,
          shouldShow: true,
          error: `Сумма долей групп должна быть 100%, сейчас ${sumGroupPercents.toFixed(2)}%`,
        }
      }

      for (const g of groups) {
        const groupAssets = assets.filter((a) => a.groupId === g.id)
        if (groupAssets.length === 0) continue
        const sum = groupAssets.reduce((s, a) => s + a.targetPercent, 0)
        if (Math.abs(sum - 100) > 0.01) {
          return {
            isValid: false,
            shouldShow: true,
            error: `Сумма целей активов группы «${g.name}» должна быть 100%, сейчас ${sum.toFixed(2)}%`,
          }
        }
      }
      return { isValid: true, shouldShow: true }
    }

    const sum = assets.reduce((s, a) => s + a.targetPercent, 0)
    if (Math.abs(sum - 100) > 0.01)
      return { isValid: false, shouldShow: true, error: `Сумма целевых процентов должна быть 100%, сейчас ${sum.toFixed(2)}%` }
    return { isValid: true, shouldShow: true }
  }
}
