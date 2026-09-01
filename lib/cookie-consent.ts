/**
 * Слой согласия на использование cookie.
 *
 * Хранит выбор пользователя («принято» / «отклонено») в localStorage.
 * Отсутствие выбора трактуется как «согласие ещё не дано» — в этом случае
 * интерфейс показывает баннер при первом заходе на сайт.
 */

/** Вариант выбора пользователя по использованию cookie. */
export type CookieConsentChoice = "accepted" | "rejected"

/**
 * Минимальный контракт хранилища.
 * Позволяет подменять localStorage в unit-тестах без UI-окружения.
 */
export interface CookieConsentStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Ключ в localStorage, под которым хранится согласие пользователя. */
export const COOKIE_CONSENT_KEY = "cookieConsent"

/**
 * Имя CustomEvent, которое публикует слой UI при изменении выбора согласия.
 * Служит для мгновенной реакции других компонентов (например, подключения
 * аналитики) в текущей вкладке; detail события = CookieConsentChoice.
 */
export const COOKIE_CONSENT_CHANGE_EVENT = "cookie-consent:change"

const VALID_CHOICES: ReadonlySet<string> = new Set(["accepted", "rejected"])

/** Type guard: является ли неизвестное значение корректным выбором согласия. */
export function isCookieConsentChoice(value: unknown): value is CookieConsentChoice {
  return typeof value === "string" && VALID_CHOICES.has(value)
}

/**
 * Прочитать сохранённый выбор пользователя.
 * Возвращает null, если согласие ещё не дано (баннер нужно показать).
 */
export function readCookieConsent(storage: CookieConsentStorage): CookieConsentChoice | null {
  try {
    const raw = storage.getItem(COOKIE_CONSENT_KEY)
    return isCookieConsentChoice(raw) ? raw : null
  } catch (err) {
    console.warn("[v0][CookieConsent] Ошибка чтения согласия:", (err as Error).message)
    return null
  }
}

/**
 * Сохранить выбор пользователя.
 * После сохранения (любого из вариантов) баннер повторно не показывается.
 */
export function saveCookieConsent(storage: CookieConsentStorage, choice: CookieConsentChoice): void {
  try {
    storage.setItem(COOKIE_CONSENT_KEY, choice)
  } catch (err) {
    console.warn("[v0][CookieConsent] Ошибка сохранения согласия:", (err as Error).message)
  }
}