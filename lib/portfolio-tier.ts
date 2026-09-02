import type { LockedPortfolioEntry, PortfolioData, PortfolioMeta, Tier } from "./types"

/**
 * Контроль соответствия портфеля тарифу — чистая бизнес-логика БЕЗ UI-зависимостей.
 *
 * Если сохранённый портфель превышает лимиты текущего тарифа (больше активов,
 * чем разрешает бесплатный/базовый, либо используются группы — фича тарифа
 * «Про»), портфель «паркуется» в резервную копию localStorage, а рабочий стол
 * обнуляется. После повышения тарифа резервная копия автоматически
 * восстанавливается и затирает текущий портфель.
 *
 * Правила по требованиям:
 * - при несоответствии тарифу текущий портфель сбрасывается, приложение остаётся
 *   полностью рабочим в рамках текущего тарифа;
 * - «прошлый портфель» сохраняется в резервной копии и восстанавливается после
 *   смены тарифа на соответствующий портфелю;
 * - показывается надпись «Ваш портфель соответствует тарифу «…». Будет доступен
 *   после оплаты подписки» (тариф из резервной копии).
 */

/** Ранг тарифа: чем больше, тем «лучше» и «дороже». */
export const TIER_RANK: Record<Tier, number> = { free: 0, basic: 1, pro: 2 }

/** Максимум активов на бесплатном тарифе. */
export const MAX_ASSETS_FREE = 2
/** Максимум активов на платных тарифах. */
export const MAX_ASSETS_PAID = 100

/** Максимум портфелей на бесплатном тарифе. */
export const MAX_PORTFOLIOS_FREE = 1
/** Максимум портфелей на тарифе «Базовый». */
export const MAX_PORTFOLIOS_BASIC = 1
/** Максимум портфелей на тарифе «Про». */
export const MAX_PORTFOLIOS_PRO = 5

/** Доступное число портфелей для текущего тарифа. */
export function maxPortfoliosForTier(tier: Tier): number {
  switch (tier) {
    case "free":
      return MAX_PORTFOLIOS_FREE
    case "basic":
      return MAX_PORTFOLIOS_BASIC
    case "pro":
      return MAX_PORTFOLIOS_PRO
  }
}

/** Информация о «припаркованном» (заблокированном тарифом) портфеле для UI. */
export interface LockedPortfolioInfo {
  requiredTier: Tier
}

/** Решение guard-эффекта за один проход. */
export type LockDecision =
  | { action: "none" }
  | { action: "park"; requiredTier: Tier }
  | { action: "reset-excess"; requiredTier: Tier }
  | { action: "restore"; backup: PortfolioData }

/**
 * Минимальный тариф, которому соответствует портфель.
 * - Группы (включённые, созданные либо привязанные к активу) — тариф «Про».
 * - Больше лимита бесплатного тарифа активов — тариф «Базовый».
 * - Иначе — «Бесплатный».
 */
export function computeRequiredTier(
  portfolio: Pick<PortfolioData, "assets" | "useGroups" | "groups">,
  portfolioCount = 1,
): Tier {
  const usesGroups =
    portfolio.useGroups ||
    portfolio.groups.length > 0 ||
    portfolio.assets.some((asset) => asset.groupId != null)
  let contentTier: Tier = "free"
  if (usesGroups) contentTier = "pro"
  else if (portfolio.assets.length > MAX_ASSETS_FREE) contentTier = "basic"

  // Число портфелей: 2+ требуют тариф «Про» (free и basic — по одному портфелю).
  const countTier: Tier =
    portfolioCount > MAX_PORTFOLIOS_BASIC
      ? "pro"
      : portfolioCount > MAX_PORTFOLIOS_FREE
        ? "basic"
        : "free"

  return TIER_RANK[contentTier] >= TIER_RANK[countTier] ? contentTier : countTier
}

/** Достаточен ли текущий тариф для портфеля, требующего тариф `required`. */
export function isTierSufficient(required: Tier, current: Tier): boolean {
  return TIER_RANK[required] <= TIER_RANK[current]
}

/** Человекочитаемая подпись тарифа. */
export function getTierLabel(tier: Tier): string {
  switch (tier) {
    case "free":
      return "Бесплатный"
    case "basic":
      return "Базовый"
    case "pro":
      return "Про"
  }
}

/** Текст баннера для портфеля, заблокированного тарифом. */
export function buildLockMessage(requiredTier: Tier): string {
  return `Ваш портфель соответствует тарифу «${getTierLabel(requiredTier)}». Будет доступен после оплаты подписки.`
}

/**
 * Решение по текущему и резервному портфелю:
 * 1) Резервная копия есть, и текущий тариф её покрывает → `restore`
 *    (восстанавливаем «прошлый портфель», затирая текущий).
 * 2) Резервная копия есть, тариф её не покрывает, а текущий рабочий портфель
 *    снова не влезает в тариф → `reset-excess` (только сброс; существующая
 *    резервная копия НЕ перезаписывается).
 * 3) Резервной копии нет, а текущий портфель не влезает → `park`
 *    (сохраняем «прошлый портфель` в резервную копию и сбрасываем рабочий стол).
 * 4) Иначе → `none` (баннер продолжает показываться, пока резервная копия
 *    существует, а тариф её не покрывает).
 */
export function decideLockState(input: {
  tier: Tier
  current: PortfolioData | null
  backup: PortfolioData | null
}): LockDecision {
  const { tier, current, backup } = input

  if (backup) {
    const requiredOfBackup = computeRequiredTier(backup)
    if (isTierSufficient(requiredOfBackup, tier)) {
      return { action: "restore", backup }
    }
    if (current && !isTierSufficient(computeRequiredTier(current), tier)) {
      return { action: "reset-excess", requiredTier: requiredOfBackup }
    }
    return { action: "none" }
  }

  if (current && !isTierSufficient(computeRequiredTier(current), tier)) {
    return { action: "park", requiredTier: computeRequiredTier(current) }
  }

  return { action: "none" }
}

/** Решение guard-эффекта по числу портфелей относительно тарифа. */
export type PortfolioCountDecision =
  | { action: "none" }
  | { action: "park-extra"; activeId: number; extraIds: number[] }
  | { action: "restore"; restoreAll: true }

/**
 * Guard числа портфелей:
 * 1) Припаркованные портфели есть, и текущий тариф покрывает всё множество
 *    (рабочие + припаркованные) → `restore`.
 * 2) Рабочих портфелей больше лимита тарифа → `park-extra`: остаётся активный
 *    и (если лимит позволяет) самые старые по `createdAt` (при равенстве —
 *    меньший `id`), остальные id попадают в `extraIds`.
 * 3) Иначе → `none`.
 */
export function decidePortfolioCountLock(input: {
  tier: Tier
  portfolios: PortfolioMeta[]
  activeId: number
  locked: LockedPortfolioEntry[] | null
}): PortfolioCountDecision {
  const { tier, portfolios, activeId, locked } = input
  const limit = maxPortfoliosForTier(tier)

  if (locked && locked.length > 0 && portfolios.length + locked.length <= limit) {
    return { action: "restore", restoreAll: true }
  }

  if (portfolios.length > limit) {
    const hasActive = portfolios.some((p) => p.id === activeId)
    const keepId = hasActive ? activeId : (portfolios[0]?.id ?? activeId)
    const keptIds = new Set<number>([keepId])

    const sorted = [...portfolios]
      .filter((p) => p.id !== keepId)
      .sort((a, b) => {
        const byDate = a.createdAt.localeCompare(b.createdAt)
        if (byDate !== 0) return byDate
        return a.id - b.id
      })

    for (const p of sorted) {
      if (keptIds.size >= limit) break
      keptIds.add(p.id)
    }

    const extraIds = portfolios.filter((p) => !keptIds.has(p.id)).map((p) => p.id)
    return { action: "park-extra", activeId: keepId, extraIds }
  }

  return { action: "none" }
}