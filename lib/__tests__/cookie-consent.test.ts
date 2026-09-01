import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  COOKIE_CONSENT_KEY,
  isCookieConsentChoice,
  readCookieConsent,
  saveCookieConsent,
  type CookieConsentStorage,
} from "../cookie-consent"

/**
 * Unit-тесты слоя согласия на использование cookie.
 *
 * Хранилище передаётся параметром в функции логики, поэтому тесты не требуют
 * браузерного окружения: localStorage эмулируется обычной Map.
 */

/** Мини-эмуляция localStorage под ключ, который использует приложение. */
const memory = new Map<string, string>()

const makeStorage = (): CookieConsentStorage => ({
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, String(value))
  },
})

beforeEach(() => {
  memory.clear()
})

describe("CookieConsent", () => {
  it("возвращает null, если согласие ещё не дано", () => {
    expect(readCookieConsent(makeStorage())).toBeNull()
  })

  it("возвращает null, если в хранилище лежит некорректное значение", () => {
    memory.set(COOKIE_CONSENT_KEY, "maybe")
    expect(readCookieConsent(makeStorage())).toBeNull()
  })

  it("сохраняет и читает выбор пользователя (roundtrip: accepted)", () => {
    saveCookieConsent(makeStorage(), "accepted")
    expect(readCookieConsent(makeStorage())).toBe("accepted")
  })

  it("сохраняет и читает отказ (roundtrip: rejected)", () => {
    saveCookieConsent(makeStorage(), "rejected")
    expect(readCookieConsent(makeStorage())).toBe("rejected")
  })
})

describe("CookieConsent (отказоустойчивость хранилища)", () => {
  it("readCookieConsent возвращает null, если хранилище недоступно", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const brokenStorage: CookieConsentStorage = {
      getItem: () => {
        throw new Error("localStorage недоступен")
      },
      setItem: () => {
        throw new Error("localStorage недоступен")
      },
    }

    expect(readCookieConsent(brokenStorage)).toBeNull()
    warnSpy.mockRestore()
  })

  it("saveCookieConsent не бросает исключение, если хранилище недоступно", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const brokenStorage: CookieConsentStorage = {
      getItem: () => {
        throw new Error("localStorage недоступен")
      },
      setItem: () => {
        throw new Error("localStorage недоступен")
      },
    }

    expect(() => saveCookieConsent(brokenStorage, "accepted")).not.toThrow()
    warnSpy.mockRestore()
  })
})

describe("isCookieConsentChoice", () => {
  it("принимает только корректные варианты выбора", () => {
    expect(isCookieConsentChoice("accepted")).toBe(true)
    expect(isCookieConsentChoice("rejected")).toBe(true)
  })

  it("отклоняет невалидные значения", () => {
    expect(isCookieConsentChoice("maybe")).toBe(false)
    expect(isCookieConsentChoice("")).toBe(false)
    expect(isCookieConsentChoice(42)).toBe(false)
    expect(isCookieConsentChoice(undefined)).toBe(false)
    expect(isCookieConsentChoice(null)).toBe(false)
  })
})