import { describe, expect, it } from "vitest"
import { getRequiredTier, tierCovers } from "../tariff"
import type { Asset, Group, Tier } from "../types"

const makeAsset = (id: number): Asset => ({
  id,
  ticker: `T${id}`,
  quantity: 1,
  price: 100,
  targetPercent: 100,
  groupId: null,
  lotSize: 1,
})

const makeAssets = (count: number): Asset[] => Array.from({ length: count }, (_, i) => makeAsset(i + 1))

const makeGroup = (id: number): Group => ({ id, name: `Группа ${id}`, percent: 100, color: "#059669" })

describe("getRequiredTier", () => {
  it("пустой/свободный портфель (<= 2 активов) соответствует тарифу free", () => {
    expect(getRequiredTier([], false, [])).toBe<Tier>("free")
    expect(getRequiredTier(makeAssets(2), false, [])).toBe<Tier>("free")
  })

  it("3+ активов без групп соответствует basic", () => {
    expect(getRequiredTier(makeAssets(3), false, [])).toBe<Tier>("basic")
    expect(getRequiredTier(makeAssets(100), false, [])).toBe<Tier>("basic")
  })

  it("более 100 активов соответствует pro", () => {
    expect(getRequiredTier(makeAssets(101), false, [])).toBe<Tier>("pro")
  })

  it("использование групп требует тариф pro", () => {
    expect(getRequiredTier(makeAssets(1), true, [makeGroup(1)])).toBe<Tier>("pro")
    expect(getRequiredTier([], true, [makeGroup(1)])).toBe<Tier>("pro")
  })

  it("непустые группы требуют pro, даже если активов мало", () => {
    expect(getRequiredTier(makeAssets(2), true, [makeGroup(1)])).toBe<Tier>("pro")
  })
})

describe("tierCovers", () => {
  it("текущий тариф покрывает требования равного или меньшего уровня", () => {
    expect(tierCovers("basic", "pro")).toBe(true)
    expect(tierCovers("pro", "pro")).toBe(true)
    expect(tierCovers("free", "free")).toBe(true)
    expect(tierCovers("free", "basic")).toBe(true)
  })

  it("текущий тариф не покрывает более высокое требование", () => {
    expect(tierCovers("pro", "basic")).toBe(false)
    expect(tierCovers("basic", "free")).toBe(false)
    expect(tierCovers("pro", "free")).toBe(false)
  })
})
