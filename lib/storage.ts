import type { Asset, Portfolio, PortfolioContent, PortfoliosState } from "./types"

/** Поля, составляющие «содержимое» портфеля (всё, что относится к расчёту). */
const toContent = (p: Portfolio | PortfolioContent): PortfolioContent => ({
  assets: p.assets,
  nextId: p.nextId,
  cashBalance: p.cashBalance,
  useGroups: p.useGroups,
  groups: p.groups,
  nextGroupId: p.nextGroupId,
})

/**
 * Слой персистентности: localStorage + экспорт/импорт в JSON-файл.
 * Хранит набор портфелей (PortfoliosState) в одном ключе.
 */
export class PortfolioStorage {
  static STORAGE_KEY = "portfolioRebalancerData"
  static DATA_VERSION = 4

  static save(state: PortfoliosState): void {
    try {
      const payload = {
        version: this.DATA_VERSION,
        savedAt: new Date().toISOString(),
        tier: state.tier ?? "basic",
        nextPortfolioId: state.nextPortfolioId ?? 1,
        activePortfolioId: state.activePortfolioId ?? 1,
        portfolios: (state.portfolios ?? []).map((p) => ({
          id: p.id,
          name: p.name ?? "Портфель",
          ...toContent(p),
          lockedSnapshot: p.lockedSnapshot ?? null,
        })),
      }
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(payload))
    } catch (err) {
      console.warn("[v0][PortfolioStorage] Ошибка сохранения:", (err as Error).message)
    }
  }

  static load(): PortfoliosState | null {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY)
      if (!raw) return null
      const data = JSON.parse(raw)
      const migrated = this.migrate(data)
      if (!migrated || !this.validate(migrated)) return null
      return this.defaults(migrated)
    } catch {
      return null
    }
  }

  static clear(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }

  static exportToFile(portfolio: Portfolio): void {
    try {
      const payload = {
        version: this.DATA_VERSION,
        exportedAt: new Date().toISOString(),
        type: "portfolio",
        name: portfolio.name,
        ...toContent(portfolio),
        lockedSnapshot: portfolio.lockedSnapshot ?? null,
      }
      const json = JSON.stringify(payload, null, 2)
      const blob = new Blob([json], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const date = new Date().toISOString().slice(0, 10)
      const safeName = (portfolio.name || "portfolio").replace(/[^\wа-яё\- ]+/gi, "_").trim() || "portfolio"
      const a = document.createElement("a")
      a.href = url
      a.download = `portfolio_${safeName}_${date}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error("[v0][PortfolioStorage] Ошибка экспорта:", (err as Error).message)
      throw err
    }
  }

  static async importFromFile(file: File): Promise<Portfolio> {
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target?.result as string)
      reader.onerror = () => reject(new Error("Ошибка чтения файла"))
      reader.readAsText(file)
    })
    let data
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error("Файл не является корректным JSON")
    }
    // Принимаем как одиночный портфель (экспорт активного), так и сохраняемый набор.
    const source = Array.isArray(data && data.portfolios) && data.portfolios.length > 0 ? data.portfolios[0] : data
    const name = typeof source.name === "string" && source.name.trim() ? source.name : "Импортированный"
    const cont: Portfolio = {
      id: -1,
      name,
      assets: source.assets ?? [],
      nextId: source.nextId ?? 1,
      cashBalance: source.cashBalance ?? 0,
      useGroups: source.useGroups ?? false,
      groups: source.groups ?? [],
      nextGroupId: source.nextGroupId ?? 1,
      lockedSnapshot: source.lockedSnapshot ?? null,
    }
    if (!this.validateContent(cont)) throw new Error("Неверный формат файла")
    return cont
  }

  /** Приводит произвольный payload к новой структуре (миграция из v3). */
  static migrate(data: unknown): PortfoliosState | null {
    if (!data || typeof data !== "object") return null
    const d = data as Record<string, unknown>
    if (Array.isArray(d.portfolios)) {
      return {
        version: this.DATA_VERSION,
        tier: (d.tier as PortfoliosState["tier"]) ?? "basic",
        nextPortfolioId: (d.nextPortfolioId as number) ?? (d.portfolios as unknown[]).length + 1,
        activePortfolioId: (d.activePortfolioId as number) ?? 1,
        portfolios: d.portfolios as Portfolio[],
      }
    }
    if (Array.isArray(d.assets)) {
      // Старый (одиночный, v3) формат: оборачиваем в первый портфель.
      const first: Portfolio = {
        id: 1,
        name: "Основной",
        assets: d.assets as Asset[],
        nextId: (d.nextId as number) ?? 1,
        cashBalance: (d.cashBalance as number) ?? 0,
        useGroups: (d.useGroups as boolean) ?? false,
        groups: (d.groups as Portfolio["groups"]) ?? [],
        nextGroupId: (d.nextGroupId as number) ?? 1,
        lockedSnapshot: (d.lockedSnapshot as Portfolio["lockedSnapshot"]) ?? null,
      }
      return {
        version: this.DATA_VERSION,
        tier: (d.tier as PortfoliosState["tier"]) ?? "basic",
        nextPortfolioId: 2,
        activePortfolioId: 1,
        portfolios: [first],
      }
    }
    return null
  }

  static validate(state: PortfoliosState): boolean {
    if (!state || typeof state !== "object") return false
    if (!Array.isArray(state.portfolios) || state.portfolios.length === 0) return false
    return state.portfolios.every((p) => this.validateContent(p))
  }

  static validateContent(p: Portfolio): boolean {
    if (!p || typeof p !== "object") return false
    if (typeof p.id !== "number" || typeof p.name !== "string") return false
    if (!Array.isArray(p.assets)) return false
    const assetsValid = (p.assets as Asset[]).every(
      (a) =>
        a &&
        typeof a.id === "number" &&
        typeof a.ticker === "string" &&
        typeof a.quantity === "number" &&
        typeof a.price === "number" &&
        typeof a.targetPercent === "number",
    )
    if (!assetsValid) return false
    if (p.groups != null && !Array.isArray(p.groups)) return false
    return true
  }

  /** Заполняет дефолты для опциональных полей. */
  private static defaults(state: PortfoliosState): PortfoliosState {
    return {
      version: this.DATA_VERSION,
      tier: state.tier ?? "basic",
      nextPortfolioId: state.nextPortfolioId ?? state.portfolios.length + 1,
      activePortfolioId: state.activePortfolioId ?? state.portfolios[0]?.id ?? 1,
      portfolios: state.portfolios.map((p) => ({
        id: p.id,
        name: p.name ?? "Портфель",
        assets: p.assets ?? [],
        nextId: p.nextId ?? 1,
        cashBalance: p.cashBalance ?? 0,
        useGroups: p.useGroups ?? false,
        groups: p.groups ?? [],
        nextGroupId: p.nextGroupId ?? 1,
        lockedSnapshot: p.lockedSnapshot ?? null,
      })),
    }
  }
}

/** Нормализация одного актива: гарантирует целочисленный lotSize >= 1. */
export const normalizeAsset = (asset: Asset): Asset => {
  const lot = Number(asset && asset.lotSize)
  return { ...asset, lotSize: Number.isFinite(lot) && lot >= 1 ? Math.floor(lot) : 1 }
}

/** Нормализация массива активов. */
export const normalizeAssets = (assets: Asset[]): Asset[] =>
  Array.isArray(assets) ? assets.map(normalizeAsset) : []