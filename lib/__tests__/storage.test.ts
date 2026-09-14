import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PortfolioStorage, normalizeAssets } from "../storage"
import type { PortfoliosState } from "../types"

/**
 * Регрессионные unit-тесты слоя персистентности (PortfolioStorage).
 *
 * Покрывают в т.ч. сценарий «портфель не сохраняется при перезапуске» и миграцию
 * старого (одиночного, v3) формата в новый набор портфелей.
 */

/** Полностью заполненные данные набора портфелей. */
const makeData = (): PortfoliosState => ({
  version: 4,
  tier: "pro",
  nextPortfolioId: 2,
  activePortfolioId: 1,
  portfolios: [
    {
      id: 1,
      name: "Основной",
      assets: [{ id: 1, ticker: "SBER", quantity: 5, price: 290, targetPercent: 100, groupId: null, lotSize: 10 }],
      nextId: 2,
      cashBalance: 500,
      useGroups: true,
      groups: [{ id: 1, name: "Банки", percent: 100, color: "#059669" }],
      nextGroupId: 2,
      lockedSnapshot: null,
    },
  ],
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
  it("сохраняет и загружает набор портфелей целостно (roundtrip)", () => {
    const data = makeData()
    PortfolioStorage.save(data)

    const loaded = PortfolioStorage.load()
    expect(loaded).toEqual(data)
  })

  it("возвращает null, если данных в хранилище нет", () => {
    expect(PortfolioStorage.load()).toBeNull()
  })

  it("мигрирует старый (v3) одиночный портфель в первый портфель новой структуры", () => {
    memory.set(
      KEY,
      JSON.stringify({
        assets: [{ id: 1, ticker: "SBER", quantity: 5, price: 290, targetPercent: 100, groupId: null, lotSize: 10 }],
        nextId: 2,
        cashBalance: 500,
        tier: "pro",
        useGroups: true,
        groups: [{ id: 1, name: "Банки", percent: 100, color: "#059669" }],
        nextGroupId: 2,
        lockedSnapshot: null,
      }),
    )
    const loaded = PortfolioStorage.load()
    expect(loaded).not.toBeNull()
    expect(loaded?.portfolios).toHaveLength(1)
    expect(loaded?.portfolios[0]?.name).toBe("Основной")
    expect(loaded?.activePortfolioId).toBe(1)
    expect(loaded?.nextPortfolioId).toBe(2)
    expect(loaded?.tier).toBe("pro")
    expect(loaded?.portfolios[0]?.assets).toHaveLength(1)
    expect(loaded?.portfolios[0]?.cashBalance).toBe(500)
    expect(loaded?.portfolios[0]?.groups).toHaveLength(1)
  })

  it("применяет дефолты для отсутствующих опциональных полей", () => {
    memory.set(
      KEY,
      JSON.stringify({ assets: [] }), // даже старый формат без portfolios
    )
    const loaded = PortfolioStorage.load()
    expect(loaded).not.toBeNull()
    expect(loaded?.portfolios).toHaveLength(1)
    expect(loaded?.portfolios[0]).toEqual({
      id: 1,
      name: "Основной",
      assets: [],
      nextId: 1,
      cashBalance: 0,
      useGroups: false,
      groups: [],
      nextGroupId: 1,
      lockedSnapshot: null,
    })
    expect(loaded?.tier).toBe("basic")
    expect(loaded?.nextPortfolioId).toBe(2)
    expect(loaded?.activePortfolioId).toBe(1)
  })

  it("сохраняет несколько портфелей (roundtrip)", () => {
    const state: PortfoliosState = {
      version: 4,
      tier: "pro",
      nextPortfolioId: 3,
      activePortfolioId: 2,
      portfolios: [
        { id: 1, name: "Основной", assets: [], nextId: 1, cashBalance: 0, useGroups: false, groups: [], nextGroupId: 1, lockedSnapshot: null },
        { id: 2, name: "Второй", assets: [], nextId: 1, cashBalance: 0, useGroups: false, groups: [], nextGroupId: 1, lockedSnapshot: null },
      ],
    }
    PortfolioStorage.save(state)
    const loaded = PortfolioStorage.load()
    expect(loaded).toEqual(state)
    expect(loaded?.portfolios).toHaveLength(2)
  })

  it("отвергает данные с некорректной структурой (validate)", () => {
    // assets не массив в новом формате
    memory.set(
      KEY,
      JSON.stringify({ tier: "pro", nextPortfolioId: 2, activePortfolioId: 1, portfolios: [{ id: 1, name: "X", assets: "не-массив" }] }),
    )
    expect(PortfolioStorage.load()).toBeNull()

    // некорректный актив в старом формате (assets не массив)
    memory.set(KEY, JSON.stringify({ assets: "не-массив", tier: "pro", nextId: 2 }))
    expect(PortfolioStorage.load()).toBeNull()
  })

  it("не теряет сохранённый портфель на повторном монтировании (регрессия несохранения)", () => {
    // 1) Ранее сохранённые данные пользователя.
    PortfolioStorage.save(makeData())

    // 2) Монтирование: восстановление читает saved, а первый авто-save
    //    (пустое дефолтное состояние) пропускается guard'ом.
    const saved = PortfolioStorage.load()
    let state: PortfoliosState | null = null
    if (saved) {
      state = {
        version: 4,
        tier: saved.tier,
        nextPortfolioId: saved.nextPortfolioId,
        activePortfolioId: saved.activePortfolioId,
        portfolios: saved.portfolios.map((p) => ({
          ...p,
          assets: normalizeAssets(p.assets || []),
          groups: p.groups || [],
        })),
      }
    }
    // 3) После восстановления сохранение снова выполняется с реальными данными.
    if (state) PortfolioStorage.save(state)

    // 4) (Симулируем) перезапуск.
    const after = PortfolioStorage.load()

    expect(after).not.toBeNull()
    expect(after?.tier).toBe("pro")
    expect(after?.portfolios[0]?.assets).toHaveLength(1)
    expect(after?.portfolios[0]?.assets[0]?.ticker).toBe("SBER")
    expect(after?.portfolios[0]?.nextId).toBe(2)
  })

  it("normalizeAssets нормализует lotSize до целого >= 1", () => {
    const normalized = normalizeAssets([
      { id: 1, ticker: "A", quantity: 1, price: 1, targetPercent: 100, groupId: null, lotSize: 0 },
      { id: 2, ticker: "B", quantity: 1, price: 1, targetPercent: 100, groupId: null, lotSize: 3.7 },
    ])
    expect(normalized[0]?.lotSize).toBe(1)
    expect(normalized[1]?.lotSize).toBe(3)
  })
})