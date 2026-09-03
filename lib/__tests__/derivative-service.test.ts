import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  MoexDerivativeService,
  buildDerivativeSectorMessage,
  parseHasRows,
} from "../derivative-service"

/**
 * Unit-тесты детекции инструментов срочного рынка Московской биржи
 * (lib/derivative-service.ts). Чистая бизнес-логика без UI-зависимостей:
 * критерий «инструмент существует» = непустой securities.data (квир ISS:
 * HTTP 200 с пустым data для несуществующих secid).
 */

const okJson = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response

describe("parseHasRows", () => {
  it("признаёт непустой securities.data признаком существующего инструмента", () => {
    expect(parseHasRows({ securities: { data: [["SiZ6", "RFUD"]] } })).toBe(true)
  })

  it("возвращает false на пустой securities.data (квир ISS: HTTP 200 с пустым data)", () => {
    expect(parseHasRows({ securities: { data: [] } })).toBe(false)
    expect(parseHasRows({ securities: {} })).toBe(false)
  })

  it("возвращает false на мусорные структуры вместо данных", () => {
    expect(parseHasRows(null)).toBe(false)
    expect(parseHasRows(undefined)).toBe(false)
    expect(parseHasRows("data")).toBe(false)
    expect(parseHasRows({})).toBe(false)
    expect(parseHasRows({ securities: { data: "не массив" } })).toBe(false)
  })
})

describe("buildDerivativeSectorMessage", () => {
  it("формирует сообщение для одного тикера и нормализует регистр", () => {
    expect(buildDerivativeSectorMessage(["siz6"])).toBe(
      "Актив «SIZ6» относится к срочному рынку Московской биржи (фьючерсы, опционы). Система производит расчёт только для фондового сектора Московской биржи — инструмент исключён из расчёта.",
    )
  })

  it("формирует сообщение для нескольких тикеров и дедуплицирует", () => {
    expect(buildDerivativeSectorMessage(["SiZ6", "srz6", "siz6"])).toBe(
      "Активы «SIZ6», «SRZ6» относятся к срочному рынку Московской биржи (фьючерсы, опционы). Система производит расчёт только для фондового сектора Московской биржи — инструменты исключены из расчёта.",
    )
  })

  it("возвращает базовое утверждение для пустого списка", () => {
    expect(buildDerivativeSectorMessage([])).toBe(
      "Система производит расчёт только для фондового сектора Московской биржи",
    )
  })
})

describe("MoexDerivativeService.buildSecurityUrl", () => {
  it("строит URL рынка срочного отдела для тикера (регистр нормализуется)", () => {
    expect(MoexDerivativeService.buildSecurityUrl("SiZ6", "forts")).toContain(
      "/engines/futures/markets/forts/securities/SIZ6.json",
    )
  })

  it("кодирует опционные secid с пробелом", () => {
    expect(MoexDerivativeService.buildSecurityUrl("SiZ6 90000BA", "options")).toContain(
      "/engines/futures/markets/options/securities/SIZ6%2090000BA.json",
    )
  })
})

describe("MoexDerivativeService.isDerivativeTicker", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    MoexDerivativeService.clearCache()
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    MoexDerivativeService.clearCache()
    vi.unstubAllGlobals()
  })

  it("считает фьючерс срочным инструментом (forts возвращает данные)", async () => {
    fetchMock.mockResolvedValueOnce(okJson({ securities: { data: [["SiZ6", "RFUD"]] } }))

    await expect(MoexDerivativeService.isDerivativeTicker("SiZ6")).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("считает опцион срочным инструментом (проверка forts пуста — options находим)", async () => {
    fetchMock
      .mockResolvedValueOnce(okJson({ securities: { data: [] } })) // forts: пусто
      .mockResolvedValueOnce(okJson({ securities: { data: [["SiZ6 90000BA", "ROPT"]] } })) // options: найдено

    await expect(MoexDerivativeService.isDerivativeTicker("SiZ6 90000BA")).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("НЕ считает срочным неизвестный secid даже при HTTP 200 с пустым data", async () => {
    fetchMock.mockResolvedValue(okJson({ securities: { data: [] } }))

    await expect(MoexDerivativeService.isDerivativeTicker("ZZZZZZZZZ")).resolves.toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2) // оба рынка проверили, оба пусты
  })

  it("не бросает при сетевой ошибке — возвращает false", async () => {
    fetchMock.mockRejectedValue(new Error("Network error"))

    await expect(MoexDerivativeService.isDerivativeTicker("SBER")).resolves.toBe(false)
  })

  it("кэширует результат: повторный вызов того же тикера не делает лишний fetch", async () => {
    fetchMock.mockResolvedValue(okJson({ securities: { data: [["SiZ6", "RFUD"]] } }))

    await MoexDerivativeService.isDerivativeTicker("siz6")
    await MoexDerivativeService.isDerivativeTicker("SiZ6")

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("filterDerivativeTickers дедуплицирует и возвращает только срочные инструменты", async () => {
    fetchMock.mockImplementation(async (url: unknown) => {
      const u = String(url)
      if (u.includes("/securities/SIZ6.json")) return okJson({ securities: { data: [["SiZ6", "RFUD"]] } })
      return okJson({ securities: { data: [] } })
    })

    const result = await MoexDerivativeService.filterDerivativeTickers(["siz6", "SBER", "SIZ6", "  "])

    expect(result).toEqual(["SIZ6"])
  })
})