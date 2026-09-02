import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PortfolioStorage, normalizeAssets } from "../storage"
import type { LockedPortfolioEntry, PortfolioData } from "../types"

/**
 * Регрессионные unit-тесты слоя персистентности (PortfolioStorage).
 *
 * Покрывают в т.ч. сценарий «портфель не сохраняется при перезапуске»:
 * чтобы не затирать localStorage пустым состоянием на монтировании, компонент
 * пропускает первый auto-save (guard `skipFirstSaveRef`), а затем сохраняет
 * восстановленный state. Эти тесты проверяют, что такая последовательность
 * не теряет данные.
 */

/** Полностью заполненные данные портфеля. */
const makeData = (): PortfolioData => ({
  assets: [{ id: 1, ticker: "SBER", quantity: 5, price: 290, targetPercent: 100, groupId: null, lotSize: 10 }],
  nextId: 2,
  cashBalance: 500,
  tier: "pro",
  useGroups: true,
  groups: [{ id: 1, name: "Банки", percent: 100, color: "#059669" }],
  nextGroupId: 2,
})

/** Мини-эмуляция localStorage под ключ, который использует приложение. */
const KEY = PortfolioStorage.STORAGE_KEY
const memory = new Map<string, string>()

beforeEach(() => {
  memory.clear()
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memory.set(k, String(v))
    },
    removeItem: (k: string) => {
      memory.delete(k)
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("PortfolioStorage", () => {
  it("сохраняет и загружает данные целостно (roundtrip)", () => {
    const data = makeData()
    PortfolioStorage.save(data)

    const loaded = PortfolioStorage.load()
    expect(loaded).toEqual(data)
  })

  it("возвращает null, если данных в хранилище нет", () => {
    expect(PortfolioStorage.load()).toBeNull()
  })

  it("применяет дефолты для отсутствующих опциональных полей", () => {
    memory.set(
      KEY,
      JSON.stringify({ assets: [] }), // без nextId/cashBalance/tier/f-groups
    )
    const loaded = PortfolioStorage.load()
    expect(loaded).toEqual({
      assets: [],
      // Примечание: nextId НЕ получает default в load() (реальное поведение слоя).
      nextId: undefined as unknown as number,
      cashBalance: 0,
      tier: "basic",
      useGroups: false,
      groups: [],
      nextGroupId: 1,
    })
  })

  it("отвергает данные с некорректной структурой (validate)", () => {
    // assets не массив
    memory.set(KEY, JSON.stringify({ assets: "не-массив", tier: "pro", nextId: 2 }))
    expect(PortfolioStorage.load()).toBeNull()

    // некорректный актив
    memory.set(
      KEY,
      JSON.stringify({ assets: [{ id: "x", ticker: "SBER" }] }),
    )
    expect(PortfolioStorage.load()).toBeNull()
  })

  it("не теряет сохранённый портфель на повторном монтировании (регрессия несохранения)", () => {
    // 1) Ранее сохранённые данные пользователя.
    PortfolioStorage.save(makeData())

    // 2) Монтирование: восстановление читает saved, а первый авто-save
    //    (пустое дефолтное состояние) пропускается guard'ом.
    const saved = PortfolioStorage.load()
    let state: PortfolioData | null = null
    if (saved) {
      state = {
        assets: normalizeAssets(saved.assets || []),
        nextId: saved.nextId,
        cashBalance: saved.cashBalance,
        tier: saved.tier,
        useGroups: saved.useGroups,
        groups: saved.groups,
        nextGroupId: saved.nextGroupId,
      }
    }
    // 3) После восстановления сохранение снова выполняется с реальными данными.
    if (state) PortfolioStorage.save(state)

    // 4) (Симулируем) перезапуск.
    const after = PortfolioStorage.load()

    expect(after).not.toBeNull()
    expect(after?.tier).toBe("pro")
    expect(after?.assets).toHaveLength(1)
    expect(after?.assets[0]?.ticker).toBe("SBER")
    expect(after?.nextId).toBe(2)
  })

  it("normalizeAssets нормализует lotSize до целого >= 1", () => {
    const normalized = normalizeAssets([
      { id: 1, ticker: "A", quantity: 1, price: 1, targetPercent: 100, groupId: null, lotSize: 0 } as PortfolioData["assets"][number],
      { id: 2, ticker: "B", quantity: 1, price: 1, targetPercent: 100, groupId: null, lotSize: 3.7 } as PortfolioData["assets"][number],
    ])
    expect(normalized[0]?.lotSize).toBe(1)
    expect(normalized[1]?.lotSize).toBe(3)
  })
})
describe("PortfolioStorage (резервная копия при несоответствии тарифу)", () => {
  it("сохраняет и загружает резервную копию (saveLocked/loadLocked)", () => {
    const data = makeData()
    PortfolioStorage.saveLocked(data)

    expect(PortfolioStorage.loadLocked()).toEqual(data)
  })

  it("clearLocked удаляет резервную копию", () => {
    PortfolioStorage.saveLocked(makeData())
    PortfolioStorage.clearLocked()

    expect(PortfolioStorage.loadLocked()).toBeNull()
  })

  it("отвергает резервную копию с некорректной структурой", () => {
    memory.set(PortfolioStorage.LOCKED_STORAGE_KEY, JSON.stringify({ assets: "не-массив" }))

    expect(PortfolioStorage.loadLocked()).toBeNull()
  })
})

describe("PortfolioStorage (коллекция портфелей)", () => {
  it("getPortfolioKey различает портфель №1 и остальные", () => {
    expect(PortfolioStorage.getPortfolioKey(1)).toBe(PortfolioStorage.STORAGE_KEY)
    expect(PortfolioStorage.getPortfolioKey(2)).toBe(`${PortfolioStorage.STORAGE_KEY}:2`)
  })

  it("сохраняет, читает и удаляет данные портфеля по его id", () => {
    const data = makeData()
    PortfolioStorage.savePortfolioData(2, data)

    expect(PortfolioStorage.loadPortfolioData(2)).toEqual(data)

    PortfolioStorage.removePortfolioData(2)
    expect(PortfolioStorage.loadPortfolioData(2)).toBeNull()
  })

  it("removePortfolioData не трогает данные других портфелей", () => {
    PortfolioStorage.savePortfolioData(1, makeData())
    PortfolioStorage.savePortfolioData(2, makeData())

    PortfolioStorage.removePortfolioData(2)

    expect(PortfolioStorage.loadPortfolioData(2)).toBeNull()
    expect(PortfolioStorage.loadPortfolioData(1)).not.toBeNull()
  })

  it("save/load/clear остаются синонимами портфеля №1", () => {
    PortfolioStorage.save(makeData())

    expect(PortfolioStorage.load()).not.toBeNull()

    PortfolioStorage.clear()
    expect(PortfolioStorage.load()).toBeNull()
  })

  it("emptyPortfolio возвращает пустой рабочий стол", () => {
    expect(PortfolioStorage.emptyPortfolio()).toEqual({
      assets: [],
      nextId: 1,
      cashBalance: 0,
      tier: "free",
      useGroups: false,
      groups: [],
      nextGroupId: 1,
    })
  })

  it("loadMeta создаёт дефолтный индекс с портфелем №1 «Основной» и записывает его", () => {
    const meta = PortfolioStorage.loadMeta()

    expect(meta.activePortfolioId).toBe(1)
    expect(meta.nextPortfolioId).toBe(2)
    expect(meta.portfolios).toHaveLength(1)
    expect(meta.portfolios[0]).toMatchObject({ id: 1, name: "Основной" })
    // Повторный вызов читает уже сохранённый индекс — без потери меты.
    expect(PortfolioStorage.loadMeta()).toEqual(meta)
  })

  it("loadMeta сохраняет легаси-данные на историческом ключе портфеля №1", () => {
    PortfolioStorage.save(makeData())

    const meta = PortfolioStorage.loadMeta()

    expect(meta.portfolios).toHaveLength(1)
    expect(meta.portfolios[0]!.id).toBe(1)
    expect(PortfolioStorage.loadPortfolioData(1)).not.toBeNull()
  })

  it("сохраняет и читает припаркованную коллекцию (roundtrip)", () => {
    const entry: LockedPortfolioEntry = {
      meta: { id: 2, name: "Портфель 2", createdAt: "2026-01-01T00:00:00.000Z" },
      data: makeData(),
    }
    PortfolioStorage.saveLockedCollection([entry])

    expect(PortfolioStorage.loadLockedCollection()).toEqual([entry])
  })

  it("clearLockedCollection удаляет припаркованную коллекцию", () => {
    const entry: LockedPortfolioEntry = {
      meta: { id: 2, name: "Портфель 2", createdAt: "2026-01-01T00:00:00.000Z" },
      data: makeData(),
    }
    PortfolioStorage.saveLockedCollection([entry])
    PortfolioStorage.clearLockedCollection()

    expect(PortfolioStorage.loadLockedCollection()).toBeNull()
  })

  it("отвергает припаркованную коллекцию с некорректной структурой", () => {
    memory.set(
      PortfolioStorage.LOCKED_COLLECTION_STORAGE_KEY,
      JSON.stringify({ entries: [{ meta: {}, data: {} }] }),
    )

    expect(PortfolioStorage.loadLockedCollection()).toBeNull()
  })
})