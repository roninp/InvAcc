import { describe, expect, it } from "vitest"
import {
  MAX_ASSETS_FREE,
  MAX_PORTFOLIOS_PRO,
  buildLockMessage,
  computeRequiredTier,
  decideLockState,
  decidePortfolioCountLock,
  getTierLabel,
  isTierSufficient,
  maxPortfoliosForTier,
} from "../portfolio-tier"
import type { Asset, Group, LockedPortfolioEntry, PortfolioData, PortfolioMeta } from "../types"

/**
 * Unit-тесты контроля соответствия портфеля тарифу (lib/portfolio-tier.ts).
 * Чистая бизнес-логика без UI-зависимостей: минимальный требуемый тариф,
 * сравнение рангов, текст баннера и решение guard-эффекта
 * (park / reset-excess / restore / none).
 */

const asset = (overrides: Partial<Asset> = {}): Asset => ({
  id: 1,
  ticker: "SBER",
  quantity: 1,
  price: 100,
  targetPercent: 100,
  groupId: null,
  lotSize: 1,
  ...overrides,
})

const makeData = (overrides: Partial<PortfolioData> = {}): PortfolioData => ({
  assets: [asset()],
  nextId: 2,
  cashBalance: 0,
  tier: "free",
  useGroups: false,
  groups: [],
  nextGroupId: 1,
  ...overrides,
})

const manyAssets = (count: number): Asset[] =>
  Array.from({ length: count }, (_, index) => asset({ id: index + 1 }))

const group: Group = { id: 1, name: "Акции", percent: 100, color: "#059669" }

describe("computeRequiredTier", () => {
  it("пустой портфель соответствует тарифу free", () => {
    expect(computeRequiredTier(makeData({ assets: [] }))).toBe("free")
  })

  it("портфель в пределах бесплатного лимита соответствует free", () => {
    expect(computeRequiredTier(makeData({ assets: manyAssets(MAX_ASSETS_FREE) }))).toBe("free")
  })

  it("портфель c лишними активами соответствует basic", () => {
    expect(computeRequiredTier(makeData({ assets: manyAssets(MAX_ASSETS_FREE + 1) }))).toBe("basic")
  })

  it("включённые группы требуют тариф pro", () => {
    expect(computeRequiredTier(makeData({ useGroups: true }))).toBe("pro")
  })

  it("созданные группы требуют тариф pro", () => {
    expect(computeRequiredTier(makeData({ groups: [group] }))).toBe("pro")
  })

  it("актив, привязанный к группе, требует тариф pro", () => {
    expect(computeRequiredTier(makeData({ assets: [asset({ groupId: 1 })] }))).toBe("pro")
  })
})

describe("isTierSufficient", () => {
  it("сравнивает ранги тарифов", () => {
    expect(isTierSufficient("free", "free")).toBe(true)
    expect(isTierSufficient("free", "basic")).toBe(true)
    expect(isTierSufficient("free", "pro")).toBe(true)
    expect(isTierSufficient("basic", "basic")).toBe(true)
    expect(isTierSufficient("pro", "basic")).toBe(false)
    expect(isTierSufficient("pro", "pro")).toBe(true)
  })
})

describe("getTierLabel / buildLockMessage", () => {
  it("возвращает человекочитаемые названия тарифов", () => {
    expect(getTierLabel("free")).toBe("Бесплатный")
    expect(getTierLabel("basic")).toBe("Базовый")
    expect(getTierLabel("pro")).toBe("Про")
  })

  it("формирует текст баннера с точным именем тарифа", () => {
    expect(buildLockMessage("basic")).toBe(
      "Ваш портфель соответствует тарифу «Базовый». Будет доступен после оплаты подписки.",
    )
    expect(buildLockMessage("pro")).toContain("«Про»")
  })
})

describe("decideLockState", () => {
  it("паркует портфель, превышающий тариф, при отсутствии резервной копии", () => {
    const current = makeData({ assets: manyAssets(3) })
    const decision = decideLockState({ tier: "free", current, backup: null })

    expect(decision.action).toBe("park")
    if (decision.action === "park") expect(decision.requiredTier).toBe("basic")
  })

  it("не трогает портфель, соответствующий тарифу", () => {
    const current = makeData({ assets: manyAssets(MAX_ASSETS_FREE) })
    const decision = decideLockState({ tier: "free", current, backup: null })

    expect(decision.action).toBe("none")
  })

  it("восстанавливает резервную копию при достаточном тарифе", () => {
    const backup = makeData({ assets: manyAssets(3) })
    const decision = decideLockState({ tier: "basic", current: makeData(), backup })

    expect(decision.action).toBe("restore")
    if (decision.action === "restore") expect(decision.backup).toBe(backup)
  })

  it("не перезаписывает резервную копию, если рабочий портфель снова превышает тариф", () => {
    const backup = makeData({ assets: manyAssets(3) })
    const current = makeData({ assets: manyAssets(4) })
    const decision = decideLockState({ tier: "free", current, backup })

    expect(decision.action).toBe("reset-excess")
    if (decision.action === "reset-excess") expect(decision.requiredTier).toBe("basic")
  })

  it("оставляет резервную копию нетронутой, пока рабочий портфель умещается (none)", () => {
    const backup = makeData({ assets: manyAssets(3) })
    const current = makeData({ assets: manyAssets(2) })
    const decision = decideLockState({ tier: "free", current, backup })

    expect(decision.action).toBe("none")
  })

  it("паркует портфель с группами на тарифе ниже pro", () => {
    const current = makeData({ useGroups: true })
    const decision = decideLockState({ tier: "basic", current, backup: null })

    expect(decision.action).toBe("park")
    if (decision.action === "park") expect(decision.requiredTier).toBe("pro")
  })
})

describe("maxPortfoliosForTier", () => {
  it("задаёт лимиты по тарифам: free/basic — по одному портфелю, pro — пять", () => {
    expect(maxPortfoliosForTier("free")).toBe(1)
    expect(maxPortfoliosForTier("basic")).toBe(1)
    expect(MAX_PORTFOLIOS_PRO).toBe(5)
    expect(maxPortfoliosForTier("pro")).toBe(5)
  })
})

describe("computeRequiredTier (число портфелей)", () => {
  it("один портфель — решение по контенту (обратная совместимость с дефолтом)", () => {
    expect(computeRequiredTier(makeData({ assets: [] }))).toBe("free")
    expect(computeRequiredTier(makeData({ assets: manyAssets(MAX_ASSETS_FREE + 1) }))).toBe("basic")
    expect(computeRequiredTier(makeData({ useGroups: true }))).toBe("pro")
  })

  it("два и более портфелей требуют тариф «Про»", () => {
    expect(computeRequiredTier(makeData({ assets: [] }), 2)).toBe("pro")
    expect(computeRequiredTier(makeData({ assets: [] }), 5)).toBe("pro")
    expect(computeRequiredTier(makeData({ assets: manyAssets(MAX_ASSETS_FREE) }), 5)).toBe("pro")
    expect(computeRequiredTier(makeData({ useGroups: true }), 5)).toBe("pro")
  })
})

describe("decidePortfolioCountLock", () => {
  const meta = (id: number, day: number): PortfolioMeta => ({
    id,
    name: `Портфель ${id}`,
    createdAt: `2026-01-${String(day).padStart(2, "0")}T00:00:00.000Z`,
  })
  const entry = (id: number, day: number): LockedPortfolioEntry => ({
    meta: meta(id, day),
    data: makeData(),
  })
  const fivePortfolios = Array.from({ length: 5 }, (_, index) => meta(index + 1, index + 1))

  it("тариф «Про» и число портфелей в лимите — none", () => {
    expect(
      decidePortfolioCountLock({ tier: "pro", portfolios: fivePortfolios, activeId: 3, locked: null }),
    ).toEqual({ action: "none" })
  })

  it("на бесплатном тарифе с 5 портфелями паркует все, кроме активного", () => {
    const decision = decidePortfolioCountLock({ tier: "free", portfolios: fivePortfolios, activeId: 3, locked: null })

    expect(decision.action).toBe("park-extra")
    if (decision.action === "park-extra") {
      expect(decision.activeId).toBe(3)
      expect(decision.extraIds).toHaveLength(4)
      expect(decision.extraIds).not.toContain(3)
    }
  })

  it("при парковке остаётся активный портфель (даже если он — не самый старый)", () => {
    const decision = decidePortfolioCountLock({ tier: "free", portfolios: fivePortfolios, activeId: 5, locked: null })

    expect(decision.action).toBe("park-extra")
    if (decision.action === "park-extra") expect(decision.extraIds).toEqual([1, 2, 3, 4])
  })

  it("восстанавливает припаркованную коллекцию, когда тариф покрывает полное множество", () => {
    const decision = decidePortfolioCountLock({
      tier: "pro",
      portfolios: [meta(1, 1)],
      activeId: 1,
      locked: [entry(2, 2), entry(3, 3)],
    })

    expect(decision).toEqual({ action: "restore", restoreAll: true })
  })

  it("не восстанавливает и не паркует, пока тариф не покрывает полное множество", () => {
    const decision = decidePortfolioCountLock({
      tier: "free",
      portfolios: [meta(1, 1)],
      activeId: 1,
      locked: [entry(2, 2), entry(3, 3)],
    })

    expect(decision.action).toBe("none")
  })
})