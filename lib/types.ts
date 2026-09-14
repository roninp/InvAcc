export type Tier = "free" | "basic" | "pro"

export type Page = "home" | "portfolio" | "settings"

export interface Asset {
  id: number
  ticker: string
  quantity: number
  price: number
  targetPercent: number
  groupId: number | null
  lotSize: number
}

export interface Group {
  id: number
  name: string
  percent: number
  color: string
}

export interface AssetAnalysis extends Asset {
  currentValue: number
  currentPercent: number
  requiredQuantity: number
  adjustment: number
  adjustmentValue: number
  isOverweight: boolean
  isUnderweight: boolean
}

/** Содержимое одного портфеля (всё, что относится к его расчёту). */
export interface PortfolioContent {
  assets: Asset[]
  nextId: number
  cashBalance: number
  useGroups: boolean
  groups: Group[]
  nextGroupId: number
}

/** Портфель = содержимое + идентификация + снапшот блокировки. */
export interface Portfolio extends PortfolioContent {
  id: number
  name: string
  /** Снапшот содержимого, заблокированного из-за несоответствия тарифу (для восстановления после оплаты). */
  lockedSnapshot?: PortfolioContent | null
}

/** Корневое состояние приложения, сохраняемое в localStorage. */
export interface PortfoliosState {
  version: number
  tier: Tier
  nextPortfolioId: number
  activePortfolioId: number
  portfolios: Portfolio[]
}

/** Создаёт портфель в пустом состоянии. */
export function createEmptyPortfolio(id: number, name: string): Portfolio {
  return {
    id,
    name,
    assets: [],
    nextId: 1,
    cashBalance: 0,
    useGroups: false,
    groups: [],
    nextGroupId: 1,
    lockedSnapshot: null,
  }
}

/** Базовый URL backend-прокси Finam Trade API (пустая строка = same-origin). */
export const TBANK_PROXY_URL = ""

/** Длительность cooldown кнопки «Обновить цены» (секунды) — только на тарифе «Про». */
export const PRICE_REFRESH_COOLDOWN_SECONDS = 60

/** Палитра цветов для групп активов. */
export const GROUP_COLORS = ["#059669", "#0ea5e9", "#8b5cf6", "#f59e0b", "#f43f5e", "#14b8a6"]

/**
 * Получить hex-цвет группы по её id.
 * Если группа не найдена или groupId == null — возвращается серый (slate-400).
 */
export function getGroupColor(groupId: number | null, groups: Group[]): string {
  if (groupId == null) return "#94a3b8"
  const group = groups.find((g) => g.id === groupId)
  return group?.color || "#94a3b8"
}
