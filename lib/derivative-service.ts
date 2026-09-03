/**
 * Детекция инструментов срочного рынка Московской биржи (фьючерсы, опционы
 * и прочие производные). Чистая бизнес-логика БЕЗ UI-зависимостей.
 *
 * Такие активы НЕЛЬЗЯ использовать в расчёте: система производит расчёт
 * только для фондового сектора Московской биржи (акции, облигации, ETF).
 *
 * Особенность MOEX ISS: GET /engines/{engine}/markets/{market}/securities/{SECID}.json
 * возвращает HTTP 200 даже для несуществующего secid, но с пустым `securities.data`.
 * Поэтому критерий «инструмент существует на этой площадке» — непустой
 * `securities.data`, а НЕ HTTP-статус (проверено: `SiZ6` → данные есть,
 * `ZZZZZZZZZ` → data пуст).
 */

/** Единый текст информационного сообщения про фондовый сектор. */
export const DERIVATIVE_SECTOR_STATEMENT = "Система производит расчёт только для фондового сектора Московской биржи"

/** Рынки срочного отдела (engine `futures`): фьючерсы и опционы. */
const DERIVATIVE_MARKETS = ["forts", "options"] as const

/** Кэш сектора тикера на сессию: инструмент не «переезжает» между секторами на лету. */
const derivativeCache = new Map<string, boolean>()

/**
 * Критерий «инструмент существует на площадке»: непустой массив `securities.data`.
 * Хак ISS: endpoint отдаёт HTTP 200 с пустым `data` для несуществующих secid.
 */
export function parseHasRows(data: unknown): boolean {
  if (!data || typeof data !== "object") return false
  const securities = (data as { securities?: { data?: unknown } }).securities
  if (!securities || typeof securities !== "object") return false
  const rows = (securities as { data?: unknown }).data
  return Array.isArray(rows) && rows.length > 0
}

/**
 * Текст сообщения для UI: перечисляет заблокированные тикеры и сообщает,
 * что расчёт производится только для фондового сектора Мосбиржи.
 */
export function buildDerivativeSectorMessage(tickers: string[]): string {
  const unique = Array.from(new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean)))
  if (unique.length === 0) return DERIVATIVE_SECTOR_STATEMENT
  const single = unique.length === 1
  const names = single ? `Актив «${unique[0]}»` : `Активы «${unique.join("», «")}»`
  const excluded = single ? "инструмент исключён из расчёта" : "инструменты исключены из расчёта"
  return `${names} ${single ? "относится" : "относятся"} к срочному рынку Московской биржи (фьючерсы, опционы). ${DERIVATIVE_SECTOR_STATEMENT} — ${excluded}.`
}

/**
 * Сервис определения принадлежности тикера к срочному отделу Мосбиржи.
 * Паттерн — как у MoexPriceService: только static-методы, без состояния.
 */
export class MoexDerivativeService {
  static ISS_URL = "https://iss.moex.com/iss"

  /** URL проверки тикера на конкретном рынке срочного отдела (forts/options). */
  static buildSecurityUrl(ticker: string, market: string): string {
    const t = ticker.trim().toUpperCase()
    return `${this.ISS_URL}/engines/futures/markets/${market}/securities/${encodeURIComponent(t)}.json?iss.meta=off&iss.only=securities`
  }

  /**
   * Проверка одного тикера БЕЗ кэша: последовательный обход рынков срочного
   * отдела до первого попадания. Сетевые сбои не бросают ошибку: судьбу
   * тикера решит обычный поиск цены («не найден на Мосбирже»).
   */
  static async checkTickerRaw(ticker: string): Promise<boolean> {
    const t = ticker.trim().toUpperCase()
    if (!t) return false
    for (const market of DERIVATIVE_MARKETS) {
      try {
        const response = await fetch(this.buildSecurityUrl(t, market), { signal: AbortSignal.timeout(5000) })
        if (!response.ok) continue
        const body: unknown = await response.json()
        if (parseHasRows(body)) return true
      } catch {
        // Неудачная проверка не должна ломать приложение — продолжаем.
      }
    }
    return false
  }

  /** Является ли тикер инструментом срочного рынка (кэшируется на сессию). */
  static async isDerivativeTicker(ticker: string): Promise<boolean> {
    const t = ticker.trim().toUpperCase()
    if (!t) return false
    const cached = derivativeCache.get(t)
    if (cached !== undefined) return cached
    const result = await this.checkTickerRaw(t)
    derivativeCache.set(t, result)
    return result
  }

  /**
   * Отфильтровать список тикеров, оставив только инструменты срочного рынка
   * (возвращает в ВЕРХНЕМ регистре, дедуплицирует, никогда не бросает).
   */
  static async filterDerivativeTickers(tickers: string[]): Promise<string[]> {
    const unique = Array.from(new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean)))
    const flags = await Promise.all(unique.map((t) => this.isDerivativeTicker(t)))
    return unique.filter((_, index) => flags[index])
  }

  /** Сброс кэша (для тестов). */
  static clearCache(): void {
    derivativeCache.clear()
  }
}