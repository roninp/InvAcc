import { describe, expect, it } from "vitest"
import {
  MAX_ASSETS_FREE,
  buildLockMessage,
  computeRequiredTier,
  decideLockState,
  getTierLabel,
  isTierSufficient,
} from "../portfolio-tier"
import type { Asset, Group, PortfolioData } from "../types"

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