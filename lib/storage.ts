import type { Asset, PortfolioData } from "./types"

/**
 * Слой персистентности: localStorage + экспорт/импорт в JSON-файл.
 */
export class PortfolioStorage {
  static STORAGE_KEY = "portfolioRebalancerData"
  static DATA_VERSION = 3

  static save(data: PortfolioData): void {
    try {
      const payload = {
        version: this.DATA_VERSION,
        savedAt: new Date().toISOString(),
        assets: data.assets,
        nextId: data.nextId,
        cashBalance: data.cashBalance ?? 0,
        tier: data.tier ?? "basic",
        useGroups: data.useGroups ?? false,
        groups: data.groups ?? [],
        nextGroupId: data.nextGroupId ?? 1,
      }
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(payload))
    } catch (err) {
      console.warn("[v0][PortfolioStorage] Ошибка сохранения:", (err as Error).message)
    }
  }

  static load(): PortfolioData | null {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY)
      if (!raw) return null
      const data = JSON.parse(raw)
      if (!this.validate(data)) return null
      return {
        assets: data.assets,
        nextId: data.nextId,
        cashBalance: data.cashBalance ?? 0,
        tier: data.tier ?? "basic",
        useGroups: data.useGroups ?? false,
        groups: data.groups ?? [],
        nextGroupId: data.nextGroupId ?? 1,
      }
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

  /**
   * Резервная копия портфеля, заблокированного тарифом («прошлый портфель»).
   * Хранится отдельным ключом и НЕ затрагивается обычным save/load/clear:
   * она удаляется только после успешного восстановления (clearLocked) либо
   * перезаписывается при новой парковке (saveLocked).
   */
  static LOCKED_STORAGE_KEY = "portfolioRebalancerLockedData"
  static LOCKED_DATA_VERSION = 1

  static saveLocked(data: PortfolioData): void {
    try {
      const payload = {
        version: this.LOCKED_DATA_VERSION,
        lockedAt: new Date().toISOString(),
        assets: data.assets,
        nextId: data.nextId,
        cashBalance: data.cashBalance ?? 0,
        tier: data.tier ?? "basic",
        useGroups: data.useGroups ?? false,
        groups: data.groups ?? [],
        nextGroupId: data.nextGroupId ?? 1,
      }
      localStorage.setItem(this.LOCKED_STORAGE_KEY, JSON.stringify(payload))
    } catch (err) {
      console.warn("[v0][PortfolioStorage] Ошибка сохранения резервной копии:", (err as Error).message)
    }
  }

  static loadLocked(): PortfolioData | null {
    try {
      const raw = localStorage.getItem(this.LOCKED_STORAGE_KEY)
      if (!raw) return null
      const data = JSON.parse(raw)
      if (!this.validate(data)) return null
      return {
        assets: data.assets,
        nextId: data.nextId,
        cashBalance: data.cashBalance ?? 0,
        tier: data.tier ?? "basic",
        useGroups: data.useGroups ?? false,
        groups: data.groups ?? [],
        nextGroupId: data.nextGroupId ?? 1,
      }
    } catch {
      return null
    }
  }

  static clearLocked(): void {
    try {
      localStorage.removeItem(this.LOCKED_STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }

  static exportToFile(data: PortfolioData): void {
    try {
      const payload = {
        version: this.DATA_VERSION,
        exportedAt: new Date().toISOString(),
        assets: data.assets,
        nextId: data.nextId,
        cashBalance: data.cashBalance ?? 0,
        tier: data.tier ?? "basic",
        useGroups: data.useGroups ?? false,
        groups: data.groups ?? [],
        nextGroupId: data.nextGroupId ?? 1,
      }
      const json = JSON.stringify(payload, null, 2)
      const blob = new Blob([json], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const date = new Date().toISOString().slice(0, 10)
      const a = document.createElement("a")
      a.href = url
      a.download = `portfolio_${date}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error("[v0][PortfolioStorage] Ошибка экспорта:", (err as Error).message)
      throw err
    }
  }

  static async importFromFile(file: File): Promise<PortfolioData> {
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
    if (!this.validate(data)) throw new Error("Неверный формат файла")
    return {
      assets: data.assets,
      nextId: data.nextId,
      cashBalance: data.cashBalance ?? 0,
      tier: data.tier ?? "basic",
      useGroups: data.useGroups ?? false,
      groups: data.groups ?? [],
      nextGroupId: data.nextGroupId ?? 1,
    }
  }

  static validate(data: unknown): data is PortfolioData {
    if (!data || typeof data !== "object") return false
    const d = data as Record<string, unknown>
    if (!Array.isArray(d.assets)) return false
    const assetsValid = (d.assets as Asset[]).every(
      (a) =>
        typeof a.id === "number" &&
        typeof a.ticker === "string" &&
        typeof a.quantity === "number" &&
        typeof a.price === "number" &&
        typeof a.targetPercent === "number",
    )
    if (!assetsValid) return false
    if (d.groups != null && !Array.isArray(d.groups)) return false
    return true
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
