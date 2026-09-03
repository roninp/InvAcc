/**
 * Серверный провайдер котировок Finam Trade API (тариф «Про»).
 *
 * Назначение: предоставить frontend-приложению обновление цен в реальном времени
 * (без задержки) через Finam Trade API (https://api.finam.ru/getting-started/).
 *
 * Finam Trade API требует секретный токен (FINAM_API_SECRET) и на его основе выдаёт
 * короткоживущий JWT-токен (15 минут). Браузер не может обращаться к API напрямую:
 * секрет нельзя хранить на клиенте, а JWT нужно регулярно перевыпускать. Поэтому
 * вызовы выполняются на стороне сервера через единый контракт fetchFinamPrices:
 *   1) секрет хранится на сервере (env FINAM_API_SECRET, не попадает в клиент);
 *   2) секрет обменивается на JWT (POST /v1/sessions) и перевыпускается при протухании;
 *   3) для каждого тикера/ISIN получаются цена последней сделки и размер лота;
 *   4) результат возвращается в формате, совместимом с MoexPriceService:
 *      { prices, lotSizes, errors }.
 *
 * Модуль является чистой бизнес-логикой: не зависит ни от UI, ни от Next.js
 * и может использоваться (и покрываться тестами) вне веб-окружения.
 */

// ----------------------------------------------------------------------------
// Публичные контракты и типы ответов Finam API
// ----------------------------------------------------------------------------

/** Значение в формате money (строкой или числом) из ответов Finam API. */
type FinamValue = string | number | null | undefined

interface FinamQuote {
  last?: { value?: FinamValue }
  close?: { value?: FinamValue }
}

/** Ответ GET /v1/instruments/{symbol}/quotes/latest. */
interface FinamQuoteResponse {
  quote?: FinamQuote | null
}

/** Элемент каталога инструментов GET /v1/assets/all. */
interface FinamAsset {
  mic?: string | null
  isin?: string | null
  symbol?: string | null
}

/** Страница каталога инструментов GET /v1/assets/all. */
interface FinamCatalogPage {
  assets?: FinamAsset[] | null
  next_cursor?: string | null
}

/** Ответ POST /v1/sessions (обмен секрета на JWT). */
interface FinamSessionResponse {
  token?: string | null
}

/** Ответ GET /v1/assets/{symbol}/params (параметры инструмента). */
interface FinamSymbolParams {
  trade_lot_size?: FinamValue
}

/** Результат получения цен — предсказуемый контракт для потребителя (Result). */
export interface FinamPriceResult {
  prices: (number | null)[]
  lotSizes: (number | null)[]
  errors: string[]
}
// ----------------------------------------------------------------------------
// Конфигурация
// ----------------------------------------------------------------------------

/** Базовый URL Finam Trade API (REST). */
const FINAM_API_BASE = "https://api.finam.ru"
/** Таймаут одного HTTP-запроса к Finam API (мс). */
const FINAM_REQUEST_TIMEOUT_MS = 15000
/** JWT Finam живёт 15 минут; перевыпускаем заранее за 1 минуту до истечения. */
const JWT_TTL_MS = 15 * 60 * 1000
const JWT_REFRESH_BEFORE_MS = 60 * 1000
/** Срок жизни кэша каталога инструментов и размера лота (мс). */
const CATALOG_TTL_MS = 60 * 60 * 1000
const LOT_CACHE_TTL_MS = 60 * 60 * 1000
/** Предохранитель от бесконечной пагинации каталога. */
const CATALOG_MAX_PAGES = 500

/** Обход корпоративного TLS-перехвата (только локальная разработка). */
if (process.env.FINAM_TLS_INSECURE === "1") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
  console.warn("[finam-proxy] FINAM_TLS_INSECURE=1: проверка TLS отключена (только для разработки)")
}

/** Считать секретный токен Finam из окружения. */
function getSecret(): string {
  return (process.env.FINAM_API_SECRET || "").trim()
}

/**
 * Считать номер брокерского счёта из окружения (FINAM_ACCOUNT_ID).
 * Указывается без префикса «КлФ» — только номерные символы, как параметр
 * account_id в Finam Trade API. Пустое значение означает, что метод
 * /assets/{symbol}/params недоступен и размер лота берётся из fallback (MOEX).
 */
function getAccountId(): string {
  return (process.env.FINAM_ACCOUNT_ID || "").trim()
}
/** Готов ли провайдер к работе (задан ли ключ Finam). */
export function isFinamConfigured(): boolean {
  return Boolean(getSecret())
}

// ----------------------------------------------------------------------------
// Управление JWT-токеном Finam Trade API
// ----------------------------------------------------------------------------

/** Текущий JWT-токен (null — ещё не получен / протух). */
let accessToken: string | null = null
/** Момент (мс) истечения текущего JWT. */
let accessTokenExpiresAt: number = 0

/** Ошибка HTTP-ответа Finam API. */
class HttpError extends Error {
  status: number
  body: string

  constructor(status: number, body = "") {
    super(`Источник цен ответил HTTP ${status}`)
    this.name = "HttpError"
    this.status = status
    this.body = body
  }
}

/** Получить актуальный JWT-токен, при необходимости перевыпустив его из секрета. */
async function getAccessToken(): Promise<string> {
  const now = Date.now()
  if (accessToken && now < accessTokenExpiresAt - JWT_REFRESH_BEFORE_MS) {
    return accessToken
  }
  const secret = getSecret()
  if (!secret) {
    throw new Error("Источник мгновенных котировок не настроен на сервере")
  }

  const response = await fetch(`${FINAM_API_BASE}/v1/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret }),
    signal: AbortSignal.timeout(FINAM_REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new HttpError(response.status, text)
  }

  const data = (await response.json().catch(() => null)) as FinamSessionResponse | null
  if (!data || typeof data.token !== "string" || !data.token) {
    throw new Error("Источник цен вернул невалидный токен доступа")
  }

  accessToken = data.token
  accessTokenExpiresAt = Date.now() + JWT_TTL_MS
  return accessToken
}

/** Сбросить кэш JWT (при истечении токена прямо во время запроса). */
function resetAccessToken(): void {
  accessToken = null
  accessTokenExpiresAt = 0
}

interface FinamRequestOptions extends RequestInit {
  /** Признак уже выполненного повтора после 401 — защита от бесконечного ретрая. */
  _retriedAuth?: boolean
}
/**
 * Универсальный запрос к Finam API с авторизацией и автоматическим перевыпуском
 * JWT при истечении (401) — повторяется один раз.
 */
async function finamRequest(path: string, options: FinamRequestOptions = {}): Promise<unknown> {
  const token = await getAccessToken()
  const response = await fetch(`${FINAM_API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(FINAM_REQUEST_TIMEOUT_MS),
  })

  if (response.status === 401) {
    // JWT мог протухнуть между проверкой кэша и самим запросом — перевыпускаем один раз
    resetAccessToken()
    if (!options._retriedAuth) {
      return finamRequest(path, { ...options, _retriedAuth: true })
    }
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new HttpError(response.status, text)
  }
  return response.json().catch(() => ({}))
}
// ----------------------------------------------------------------------------
// Каталог инструментов (резолв ISIN -> Symbol) и размер лота
// ----------------------------------------------------------------------------

/** Кэш: ISIN -> Symbol (только российские бумаги Мосбиржи). */
let catalogByIsin: Map<string, string> | null = null
/** Момент обновления каталога (мс). */
let catalogBuiltAt: number = 0
/** Promise текущей сборки каталога (single-flight). */
let catalogPromise: Promise<void> | null = null

/** Пройти весь каталог активов Finam и собрать соответствия ISIN -> Symbol (MISX). */
async function buildCatalog(): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  let cursor: string | null = null
  let pages = 0

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const params = new URLSearchParams({ only_active: "true" })
    if (cursor) params.set("cursor", cursor)
    const data = (await finamRequest(`/v1/assets/all?${params.toString()}`)) as FinamCatalogPage

    for (const assetEntry of data.assets || []) {
      const mic = String(assetEntry.mic || "").toUpperCase()
      if (mic !== "MISX") continue // только российские бумаги Мосбиржи
      if (assetEntry.isin && assetEntry.symbol) {
        result.set(String(assetEntry.isin).toUpperCase(), assetEntry.symbol)
      }
    }

    const next = data.next_cursor || null
    if (!next || next === cursor) break // пагинация завершена
    cursor = next
    if (++pages >= CATALOG_MAX_PAGES) break // предохранитель от бесконечного цикла
  }

  return result
}

/** Гарантировать готовность каталога инструментов (кэш на 1 час, single-flight). */
async function ensureCatalog(): Promise<void> {
  if (catalogByIsin && Date.now() - catalogBuiltAt < CATALOG_TTL_MS) return
  if (catalogPromise) {
    await catalogPromise
    return
  }
  catalogPromise = (async () => {
    const found = await buildCatalog()
    catalogByIsin = found
    catalogBuiltAt = Date.now()
  })()
  try {
    await catalogPromise
  } finally {
    catalogPromise = null
  }
}
/** Кэш: symbol -> { lotSize, fetchedAt } — размер лота меняется редко. */
const lotCache = new Map<string, { lotSize: number; fetchedAt: number }>()

/**
 * Получить размер лота для символа вида TICKER@MISX.
 * Источник 1: Finam GET /v1/assets/{symbol}/params?account_id={FINAM_ACCOUNT_ID}
 * (trade_lot_size приходит строкой). Метод требует брокерский счёт, поэтому
 * вызывается только если FINAM_ACCOUNT_ID задан в окружении.
 * Источник 2 (fallback): MOEX ISS board TQBR — надёжный для MOEX-бумаг и
 * используется по умолчанию, пока FINAM_ACCOUNT_ID не сконфигурирован.
 */
async function fetchLotSize(symbol: string): Promise<number | null> {
  const cached = lotCache.get(symbol)
  if (cached && Date.now() - cached.fetchedAt < LOT_CACHE_TTL_MS) {
    return cached.lotSize
  }

  // 1) Finam Trade API (только при заданном FINAM_ACCOUNT_ID)
  const accountId = getAccountId()
  if (accountId) {
    try {
      const token = await getAccessToken()
      const url = `${FINAM_API_BASE}/v1/assets/${encodeURIComponent(symbol)}/params?account_id=${encodeURIComponent(accountId)}`
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      })
      if (resp.ok) {
        const body = (await resp.json()) as FinamSymbolParams
        const finLot = Number(body && body.trade_lot_size)
        if (Number.isFinite(finLot) && finLot > 0) {
          const lotSize = Math.floor(finLot)
          lotCache.set(symbol, { lotSize, fetchedAt: Date.now() })
          return lotSize
        }
      } else {
        console.warn(
          `[finam-proxy] Параметры актива Finam для ${symbol}: HTTP ${resp.status}`,
          await resp.text().catch(() => ""),
        )
      }
    } catch (err) {
      console.warn(`[finam-proxy] Ошибка параметров актива Finam (${symbol}):`, (err as Error).message)
    }
  }

  // 2) Fallback: MOEX ISS (тикер без @-суффикса)
  const ticker = symbol.split("@")[0]
  try {
    const url = `https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities/${encodeURIComponent(ticker)}.json`
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (resp.ok) {
      const body = (await resp.json()) as { securities?: { columns?: string[]; data?: unknown[][] } }
      const rows = body && body.securities && body.securities.data
      const cols = body && body.securities && body.securities.columns
      const lotIndex = Array.isArray(cols) ? cols.indexOf("LOTSIZE") : -1
      const lot = lotIndex >= 0 && Array.isArray(rows) && rows[0] ? Number(rows[0][lotIndex]) : NaN
      if (Number.isFinite(lot) && lot > 0) {
        const lotSize = Math.floor(lot)
        lotCache.set(symbol, { lotSize, fetchedAt: Date.now() })
        return lotSize
      }
    }
  } catch (err) {
    console.warn("ISS lot request error:", (err as Error).message)
  }

  return null
}
// ----------------------------------------------------------------------------
// Резолв символов (тикер/ISIN -> Symbol Finam) и извлечение цены
// ----------------------------------------------------------------------------

/** Является ли строка международным идентификатором ISIN. */
function isIsin(value: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(value)
}

/**
 * Резолв введённого значения (тикер или ISIN) в символ Finam вида TICKER@MIC.
 * Для российских бумаг Мосбиржи площадка — MISX.
 */
async function resolveSymbol(input: string): Promise<string> {
  const value = String(input || "").trim().toUpperCase()
  if (!value) throw new Error("Пустой тикер")
  if (value.includes("@")) return value // уже полный символ TICKER@MIC

  if (isIsin(value)) {
    await ensureCatalog()
    const symbol = catalogByIsin?.get(value)
    if (!symbol) throw new Error(`ISIN "${value}" не найден на Мосбирже`)
    return symbol
  }

  // Обычный тикер: российские бумаги Мосбиржи торгуются на площадке MISX
  return `${value}@MISX`
}

/** Извлечь цену последней сделки из ответа LastQuote. */
function extractPrice(data: FinamQuoteResponse | null): number | null {
  const quote = data && data.quote
  if (!quote) return null
  const raw = (quote.last && quote.last.value) || (quote.close && quote.close.value)
  if (raw == null) return null
  const price = Number.parseFloat(String(raw))
  return Number.isFinite(price) && price > 0 ? price : null
}

/**
 * Получить цену последней сделки и размер лота по введённому значению (тикер/ISIN).
 * 400/404 от LastQuote означают, что инструмент не торгуется на этой площадке.
 */
async function fetchTickerData(value: string): Promise<{ price: number | null; lotSize: number | null }> {
  const symbol = await resolveSymbol(value)

  let quoteData: FinamQuoteResponse | null = null
  let lotSize: number | null = null
  try {
    const results = await Promise.all([
      finamRequest(`/v1/instruments/${encodeURIComponent(symbol)}/quotes/latest`) as Promise<FinamQuoteResponse>,
      fetchLotSize(symbol),
    ])
    quoteData = results[0]
    lotSize = results[1]
  } catch (err) {
    if (err instanceof HttpError && (err.status === 400 || err.status === 404)) {
      throw new Error(`Актив "${value}" не найден на Мосбирже`)
    }
    throw err
  }

  return { price: extractPrice(quoteData), lotSize }
}
// ----------------------------------------------------------------------------
// Публичный контракт (Result-паттерн: запрос всегда завершается структурным
// результатом, ошибки отдельных тикеров не роняют остальные)
// ----------------------------------------------------------------------------

/** Преобразовать ошибку в понятное пользователю сообщение. */
function friendlyError(err: unknown): string {
  const message = String((err && (err as { message?: unknown }).message) || err || "")
  const status = (err as HttpError | null)?.status
  if (status === 401 || status === 404) {
    return "Источник цен в реальном времени недоступен"
  }
  if (status === 429) {
    return "Превышен лимит запросов. Подождите минуту и повторите"
  }
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|UNAVAILABLE|UND_ERR/i.test(message)) {
    return "Источник цен в реальном времени недоступен"
  }
  return message
}

/**
 * Получить цены и размеры лотов по списку тикеров/ISIN.
 * Тикеры обрабатываются последовательно, чтобы не превысить лимиты API (200/мин)
 * и чтобы частичный сбой одного тикера не ломал остальные.
 */
export async function fetchFinamPrices(tickers: string[]): Promise<FinamPriceResult> {
  const prices: (number | null)[] = []
  const lotSizes: (number | null)[] = []
  const errors: string[] = []

  for (const ticker of tickers) {
    try {
      const { price, lotSize } = await fetchTickerData(ticker)
      prices.push(price)
      lotSizes.push(lotSize)
      if (price == null) errors.push(`${ticker}: нет цены`)
    } catch (err) {
      console.error(`[finam-proxy] Ошибка для ${ticker}:`, (err as Error).message)
      prices.push(null)
      lotSizes.push(null)
      errors.push(`${ticker}: ${friendlyError(err)}`)
    }
  }

  return { prices, lotSizes, errors }
}
