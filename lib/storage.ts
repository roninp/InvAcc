import type { Asset, LockedPortfolioEntry, PortfolioCollectionMeta, PortfolioData } from "./types"

/**
 * Слой персистентности: localStorage + экспорт/импорт в JSON-файл.
 */
export class PortfolioStorage {
  static STORAGE_KEY = "portfolioRebalancerData"
  static DATA_VERSION = 4

  /**
   * Ключ портфеля в localStorage. Портфель №1 живёт на историческом ключе
   * `portfolioRebalancerData` — существующие данные пользователей мигрируют
   * без переноса байтов, остальные портфели — `portfolioRebalancerData:<id>`.
   */
  static getPortfolioKey(id: number): string {
    return id === 1 ? this.STORAGE_KEY : `${this.STORAGE_KEY}:${id}`
  }

  /** Сохранить данные портфеля по его id (портфель №1 — исторический ключ). */
  static savePortfolioData(id: number, data: PortfolioData): void {
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
      localStorage.setItem(this.getPortfolioKey(id), JSON.stringify(payload))
    } catch (err) {
      console.warn("[v0][PortfolioStorage] Ошибка сохранения портфеля:", (err as Error).message)
    }
  }

  /** Прочитать данные портфеля по его id (null, если их нет). */
  static loadPortfolioData(id: number): PortfolioData | null {
    try {
      const raw = localStorage.getItem(this.getPortfolioKey(id))
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

  /** Удалить данные портфеля по его id. */
  static removePortfolioData(id: number): void {
    try {
      localStorage.removeItem(this.getPortfolioKey(id))
    } catch {
      /* ignore */
    }
  }

  /** Чистый рабочий стол нового портфеля. */
  static emptyPortfolio(): PortfolioData {
    return {
      assets: [],
      nextId: 1,
      cashBalance: 0,
      tier: "free",
      useGroups: false,
      groups: [],
      nextGroupId: 1,
    }
  }

  /** Сохранить данные портфеля №1 (синоним `savePortfolioData(1, data)`). */
  static save(data: PortfolioData): void {
    this.savePortfolioData(1, data)
  }

  /** Прочитать данные портфеля №1 (синоним `loadPortfolioData(1)`). */
  static load(): PortfolioData | null {
    return this.loadPortfolioData(1)
  }

  /** Удалить данные портфеля №1 (синоним `removePortfolioData(1)`). */
  static clear(): void {
    this.removePortfolioData(1)
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

  /** Индекс коллекции портфелей (`PortfolioCollectionMeta`). */
  static META_STORAGE_KEY = "portfolioRebalancerMeta"
  static META_VERSION = 1

  /** Сохранить индекс коллекции портфелей. */
  static saveMeta(meta: PortfolioCollectionMeta): void {
    try {
      localStorage.setItem(this.META_STORAGE_KEY, JSON.stringify(meta))
    } catch (err) {
      console.warn("[v0][PortfolioStorage] Ошибка сохранения индекса портфелей:", (err as Error).message)
    }
  }

  /**
   * Прочитать (и при необходимости создать) индекс коллекции портфелей.
   * Если индекса нет — создаётся индекс с единственным портфелем №1 «Основной»
   * и записывается в хранилище. Легаси-данные на историческом ключе портфеля
   * №1 при этом сохраняются как есть.
   */
  static loadMeta(): PortfolioCollectionMeta {
    const buildFallback = (): PortfolioCollectionMeta => ({
      version: this.META_VERSION,
      nextPortfolioId: 2,
      activePortfolioId: 1,
      portfolios: [{ id: 1, name: "Основной", createdAt: new Date().toISOString() }],
    })
    try {
      const raw = localStorage.getItem(this.META_STORAGE_KEY)
      let meta: PortfolioCollectionMeta
      if (raw) {
        meta = JSON.parse(raw) as PortfolioCollectionMeta
        const valid =
          meta !== null &&
          typeof meta === "object" &&
          Array.isArray(meta.portfolios) &&
          meta.portfolios.length > 0 &&
          meta.portfolios.every(
            (p) =>
              p !== null &&
              typeof p === "object" &&
              typeof p.id === "number" &&
              typeof p.name === "string" &&
              typeof p.createdAt === "string",
          ) &&
          meta.portfolios.some((p) => p.id === meta.activePortfolioId)
        if (!valid) return buildFallback()
      } else {
        meta = buildFallback()
      }
      this.saveMeta(meta)
      return meta
    } catch {
      return buildFallback()
    }
  }

  /** Хранилище припаркованных портфелей (превышение лимита тарифа). */
  static LOCKED_COLLECTION_STORAGE_KEY = "portfolioRebalancerLockedCollection"
  static LOCKED_COLLECTION_VERSION = 1

  /** Сохранить коллекцию припаркованных портфелей. */
  static saveLockedCollection(entries: LockedPortfolioEntry[]): void {
    try {
      const payload = {
        version: this.LOCKED_COLLECTION_VERSION,
        lockedAt: new Date().toISOString(),
        entries,
      }
      localStorage.setItem(this.LOCKED_COLLECTION_STORAGE_KEY, JSON.stringify(payload))
    } catch (err) {
      console.warn("[v0][PortfolioStorage] Ошибка сохранения резервной коллекции портфелей:", (err as Error).message)
    }
  }

  /** Прочитать коллекцию припаркованных портфелей (null, если её нет). */
  static loadLockedCollection(): LockedPortfolioEntry[] | null {
    try {
      const raw = localStorage.getItem(this.LOCKED_COLLECTION_STORAGE_KEY)
      if (!raw) return null
      const data = JSON.parse(raw)
      if (data === null || typeof data !== "object" || !Array.isArray(data.entries)) {
        return null
      }
      const valid = (data.entries as LockedPortfolioEntry[]).every(
        (entry) =>
          entry !== null &&
          typeof entry === "object" &&
          entry.meta !== null &&
          typeof entry.meta === "object" &&
          typeof entry.meta.id === "number" &&
          typeof entry.meta.name === "string" &&
          typeof entry.meta.createdAt === "string" &&
          this.validate(entry.data),
      )
      if (!valid) return null
      return data.entries
    } catch {
      return null
    }
  }

  /** Удалить коллекцию припаркованных портфелей. */
  static clearLockedCollection(): void {
    try {
      localStorage.removeItem(this.LOCKED_COLLECTION_STORAGE_KEY)
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
