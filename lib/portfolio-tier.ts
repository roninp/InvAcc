import type { PortfolioData, Tier } from "./types"

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
): Tier {
  const usesGroups =
    portfolio.useGroups ||
    portfolio.groups.length > 0 ||
    portfolio.assets.some((asset) => asset.groupId != null)
  if (usesGroups) return "pro"
  if (portfolio.assets.length > MAX_ASSETS_FREE) return "basic"
  return "free"
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