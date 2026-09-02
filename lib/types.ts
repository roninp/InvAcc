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

export interface PortfolioData {
  assets: Asset[]
  nextId: number
  cashBalance: number
  tier: Tier
  useGroups: boolean
  groups: Group[]
  nextGroupId: number
}

/** Метаданные портфеля для переключателя и панели управления. */
export interface PortfolioMeta {
  id: number
  name: string
  /** ISO-дата создания; используется для «кто остаётся» при парковке лишних портфелей. */
  createdAt: string
}

/** Индекс коллекции портфелей (хранится в `portfolioRebalancerMeta`). */
export interface PortfolioCollectionMeta {
  version: number
  /** Монотонный счётчик id портфелей (id не переиспользуются). */
  nextPortfolioId: number
  activePortfolioId: number
  /** Порядок массива = порядок показа в переключателе. */
  portfolios: PortfolioMeta[]
}

/** Запись припаркованной коллекции портфелей — мета + данные целиком. */
export interface LockedPortfolioEntry {
  meta: PortfolioMeta
  data: PortfolioData
}

/** Минимальная длина пароля при регистрации (требование supabase-js — 8). */
export const MIN_PASSWORD_LENGTH = 8

/** Максимальная длина email-адреса по RFC 5321. */
export const EMAIL_MAX_LENGTH = 254

/** ДТО пользователя для UI — изолирует UI от типов Supabase. */
export interface AuthUser {
  id: string
  email: string | null
}

/** Пропсы корневого компонента после SSR-чтения сессии и тарифа. */
export interface RebalancerServerProps {
  initialUser: AuthUser | null
  initialTier: Tier
}

/** Результат операций аутентификации (Result-паттерн). */
export type AuthResult =
  | { success: true; user: AuthUser; needsEmailConfirmation?: boolean }
  | { success: false; error: string }

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
