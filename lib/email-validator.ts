/**
 * Валидация email-адресов — чистая бизнес-логика без UI-зависимостей.
 * Формат приближается к RFC 5322, но остаётся прагматичным: строго локальная
 * часть + домен, домен не может заканчиваться точкой, TLD минимум 2 символа.
 */

export const EMAIL_MAX_LENGTH = 254

/**
 * Проверить, что строка является корректным email-адресом.
 * - нет пробелов и запятых;
 * - ровно один разделитель "@";
 * - длина не превышает 254 символа;
 * - домен содержит точку, TLD — минимум 2 буквы;
 * - локальная часть не пустая.
 */
export function isValidEmail(value: string): boolean {
  if (typeof value !== "string") return false
  const email = value.trim()
  if (!email || email.length > EMAIL_MAX_LENGTH) return false
  // Адрес не должен содержать пробелов и запятых (защита от маскировки).
  if (/[\s,]/.test(email)) return false

  const parts = email.split("@")
  if (parts.length !== 2) return false

  const [local, domain] = parts
  if (!local || local.length > 64) return false
  if (!domain || domain.length > 253) return false

  // Домен: буквы/цифры/дефисы/точки, без ведущих/замыкающих точек и дефисов.
  const domainPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*$/
  if (!domainPattern.test(domain)) return false

  // TLD должен содержать минимум 2 буквы (домен первого уровня).
  const lastDotIndex = domain.lastIndexOf(".")
  if (lastDotIndex === -1) return false
  const tld = domain.slice(lastDotIndex + 1)
  if (tld.length < 2 || !/^[A-Za-z]{2,}$/.test(tld)) return false

  return true
}