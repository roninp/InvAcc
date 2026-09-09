import type { Asset, Group, Tier } from "./types"

/** Ранг тарифа: чем выше, тем больше прав. */
export const TIER_RANK: Record<Tier, number> = {
  free: 0,
  basic: 1,
  pro: 2,
}

/** Лимиты активов по тарифам. */
export const TIER_MAX_ASSETS: Record<Tier, number> = {
  free: 2,
  basic: 100,
  pro: 100,
}

/** Человекочитаемые названия тарифов. */
export const TIER_LABELS: Record<Tier, string> = {
  free: "Бесплатный",
  basic: "Базовый",
  pro: "Про",
}

export function getTierLabel(tier: Tier): string {
  return TIER_LABELS[tier]
}

/** Лучший тариф, которому соответствует заданный портфель. */
export function getRequiredTier(assets: Asset[], useGroups: boolean, groups: Group[]): Tier {
  // Группы активов доступны только на тарифе «Про».
  if (useGroups && groups.length > 0) return "pro"
  const count = Array.isArray(assets) ? assets.length : 0
  if (count > TIER_MAX_ASSETS.basic) return "pro"
  if (count > TIER_MAX_ASSETS.free) return "basic"
  return "free"
}

/** Достаточно ли текущего тарифа для портфеля, требующего required. */
export function tierCovers(required: Tier, current: Tier): boolean {
  return TIER_RANK[current] >= TIER_RANK[required]
}
