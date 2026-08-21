import { TBANK_PROXY_URL } from "./types"

export interface PriceResult {
  prices: (number | null)[]
  lotSizes: (number | null)[]
  errors: string[]
}

/**
 * Сервис получения цен через ISS API Московской биржи.
 */
export class MoexPriceService {
  static ISS_URL = "https://iss.moex.com/iss"
  static MARKETS = [
    { engine: "stock", market: "shares" },
    { engine: "stock", market: "etf" },
    { engine: "stock", market: "bonds" },
    { engine: "stock", market: "foreignshares" },
    { engine: "stock", market: "depositaryreceipts" },
  ]
  static BOARD_PRIORITY = ["TQBR", "TQTF", "TQOB", "TQTD", "TQPI", "SMAL", "CETS"]

  static isIsin(value: string): boolean {
    return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(value.toUpperCase())
  }

  static async resolveIsin(isin: string): Promise<string> {
    const isinUpper = isin.toUpperCase()
    const url = `${this.ISS_URL}/securities.json?q=${encodeURIComponent(isinUpper)}&iss.meta=off`
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    const securities = data.securities
    if (!securities?.data?.length) {
      throw new Error(`ISIN "${isinUpper}" не найден на Мосбирже`)
    }
    const cols = securities.columns
    const si = cols.indexOf("secid")
    if (si === -1) throw new Error(`ISIN "${isinUpper}" не найден на Мосбирже`)
    return securities.data[0][si]
  }

  static async fetchPrice(value: string): Promise<{ price: number; lotSize: number | null }> {
    const ticker = this.isIsin(value) ? await this.resolveIsin(value) : value
    const tickerUpper = ticker.toUpperCase()
    let lastError: Error | null = null
    for (const { engine, market } of this.MARKETS) {
      try {
        const url = `${this.ISS_URL}/engines/${engine}/markets/${market}/securities/${tickerUpper}.json?iss.meta=off`
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
        if (response.status === 404) continue
        if (!response.ok) {
          lastError = new Error(`HTTP ${response.status}`)
          continue
        }
        const data = await response.json()
        const marketdata = data.marketdata
        const securities = data.securities
        if (!marketdata?.data?.length) continue
        const cols = marketdata.columns
        const bi = cols.indexOf("BOARDID")
        const li = cols.indexOf("LAST")
        const mi = cols.indexOf("MARKETPRICE")
        const lci = cols.indexOf("LCLOSEPRICE")
        if (bi === -1 || li === -1) continue
        const buildResult = (price: string, boardId: string) => ({
          price: Number.parseFloat(price),
          lotSize: this.extractLotSize(data, boardId),
        })
        for (const b of this.BOARD_PRIORITY) {
          const r = marketdata.data.find((row: unknown[]) => row[bi] === b)
          if (!r) continue
          if (r[li] && Number.parseFloat(r[li]) > 0) return buildResult(r[li], b)
          if (mi !== -1 && r[mi] && Number.parseFloat(r[mi]) > 0) return buildResult(r[mi], b)
          if (lci !== -1 && r[lci] && Number.parseFloat(r[lci]) > 0) return buildResult(r[lci], b)
        }
        for (const r of marketdata.data) {
          if (r[li] && Number.parseFloat(r[li]) > 0) return buildResult(r[li], r[bi])
          if (mi !== -1 && r[mi] && Number.parseFloat(r[mi]) > 0) return buildResult(r[mi], r[bi])
          if (lci !== -1 && r[lci] && Number.parseFloat(r[lci]) > 0) return buildResult(r[lci], r[bi])
        }
        if (securities?.data?.length) {
          const sc = securities.columns
          const pi = sc.indexOf("PREVPRICE")
          if (pi !== -1)
            for (const r of securities.data) if (r[pi] && Number.parseFloat(r[pi]) > 0) return buildResult(r[pi], r[bi])
        }
      } catch (err) {
        lastError = err as Error
      }
    }
    throw lastError || new Error(`Актив "${tickerUpper}" не найден на Мосбирже`)
  }

  static extractLotSize(data: { securities?: { columns: string[]; data: unknown[][] } }, boardId: string): number | null {
    const securities = data && data.securities
    if (!securities?.data?.length) return null
    const cols = securities.columns
    const bi = cols.indexOf("BOARDID")
    const li = cols.indexOf("LOTSIZE")
    if (bi === -1 || li === -1) return null
    const row = securities.data.find((r) => r[bi] === boardId) || securities.data[0]
    const v = row && (row[li] as string | number | null)
    return v != null && Number.parseFloat(String(v)) > 0 ? Math.floor(Number.parseFloat(String(v))) : null
  }

  static async fetchPrices(tickers: string[]): Promise<PriceResult> {
    const results = await Promise.allSettled(tickers.map((t) => this.fetchPrice(t)))
    const prices = results.map((r) => (r.status === "fulfilled" ? r.value.price : null))
    const lotSizes = results.map((r) => (r.status === "fulfilled" ? r.value.lotSize : null))
    const errors = tickers
      .map((t, i) => (results[i].status === "rejected" ? `${t}: ${(results[i] as PromiseRejectedResult).reason.message}` : null))
      .filter(Boolean) as string[]
    return { prices, lotSizes, errors }
  }
}

/**
 * Сервис получения цен через локальный backend-прокси Finam Trade API (тариф «Про»).
 */
export class TBankProxyPriceService {
  static async fetchPrices(tickers: string[]): Promise<PriceResult> {
    const url = `${TBANK_PROXY_URL}/api/prices?tickers=${encodeURIComponent(tickers.join(","))}`
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!response.ok) {
      const text = await response.text().catch(() => "")
      throw new Error(`Прокси Finam ответил ${response.status}: ${text}`)
    }
    const data = await response.json()
    return {
      prices: data.prices ?? [],
      lotSizes: data.lotSizes ?? [],
      errors: data.errors ?? [],
    }
  }
}
