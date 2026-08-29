import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./supabase/database.types"
import { isValidEmail } from "./email-validator"
import { MIN_PASSWORD_LENGTH, type AuthResult, type AuthUser, type Tier } from "./types"

/**
 * Сервис аутентификации — чистая бизнес-логика поверх Supabase Auth.
 * Клиент передаётся параметром (Dependency Inversion): в тестах подменяется
 * моком, в приложении — createBrowserClient/createServerClient.
 */
export class AuthService {
  private static toAuthUser(user: { id: string; email?: string | null }, fallbackEmail: string): AuthUser {
    return { id: user.id, email: user.email ?? fallbackEmail }
  }

  /** Валидация email перед регистрацией/входом. Возвращает ошибку или null. */
  static validateRegistrationEmail(email: string): string | null {
    const trimmed = email.trim()
    if (!trimmed) return "Введите email"
    if (!isValidEmail(trimmed)) return "Введите корректный email (например name@example.com)"
    return null
  }

  /**
   * Регистрация пользователя.
   * При включённом подтверждении email возвращает needsEmailConfirmation=true
   * (сессия появится после перехода по ссылке из письма).
   */
  static async signUp(
    client: SupabaseClient<Database>,
    input: { email: string; password: string; emailRedirectTo?: string },
  ): Promise<AuthResult> {
    const email = input.email.trim()

    const emailError = AuthService.validateRegistrationEmail(email)
    if (emailError) return { success: false, error: emailError }

    if (!input.password) return { success: false, error: "Введите пароль" }
    if (input.password.length < MIN_PASSWORD_LENGTH) {
      return { success: false, error: `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов` }
    }

    const { data, error } = await client.auth.signUp({
      email,
      password: input.password,
      options: { emailRedirectTo: input.emailRedirectTo },
    })

    if (error) return { success: false, error: toFriendlyAuthError(error) }
    if (!data.user) return { success: false, error: "Не удалось создать аккаунт. Попробуйте ещё раз." }

    const user = AuthService.toAuthUser(data.user, email)
    if (!data.session) {
      return { success: true, user, needsEmailConfirmation: true }
    }
    return { success: true, user }
  }

  /** Вход по email и паролю. */
  static async signIn(
    client: SupabaseClient<Database>,
    input: { email: string; password: string },
  ): Promise<AuthResult> {
    const email = input.email.trim()

    const emailError = AuthService.validateRegistrationEmail(email)
    if (emailError) return { success: false, error: emailError }
    if (!input.password) return { success: false, error: "Введите пароль" }

    const { data, error } = await client.auth.signInWithPassword({ email, password: input.password })
    if (error) return { success: false, error: toFriendlyAuthError(error) }
    if (!data.user) return { success: false, error: "Не удалось войти. Попробуйте ещё раз." }

    return { success: true, user: AuthService.toAuthUser(data.user, email) }
  }

  /** Выход из аккаунта (Result-паттерн). */
  static async signOut(
    client: SupabaseClient<Database>,
  ): Promise<{ success: boolean; error?: string }> {
    const { error } = await client.auth.signOut()
    return error ? { success: false, error: error.message } : { success: true }
  }

  /**
   * Текущий тариф пользователя из БД (profiles.tier).
   * Для гостей и при отсутствии/ошибке строки профиля — всегда 'free'
   * (тариф назначается вручную через БД и не меняется на сайте).
   */
  static async getTier(client: SupabaseClient<Database>): Promise<Tier> {
    try {
      const {
        data: { user },
      } = await client.auth.getUser()
      if (!user) return "free"

      const { data, error } = await client
        .from("profiles")
        .select("tier")
        .eq("id", user.id)
        .maybeSingle()

      if (error || !data) return "free"
      return data.tier === "basic" || data.tier === "pro" ? data.tier : "free"
    } catch {
      return "free"
    }
  }
}

/**
 * Преобразовать ошибку Supabase Auth в понятное пользователю сообщение.
 * Коды ошибок стабильны в supabase-js v2 (AuthApiError.code).
 */
export function toFriendlyAuthError(error: unknown): string {
  if (!error) return "Неизвестная ошибка. Попробуйте ещё раз."
  const err = error as { code?: string; message?: string }
  const code = err.code ?? ""

  switch (code) {
    case "email_taken":
    case "user_already_exists":
      return "Пользователь с таким email уже зарегистрирован"
    case "invalid_credentials":
      return "Неверный email или пароль"
    case "email_not_confirmed":
      return "Подтвердите email по ссылке из письма"
    case "weak_password":
      return "Пароль слишком слабый — минимум 8 символов"
    case "over_email_send_rate_limit":
      return "Слишком много запросов. Подождите минуту и попробуйте снова"
    case "over_request_rate_limit":
      return "Слишком много запросов. Подождите минуту и попробуйте снова"
  }

  const message = err.message ?? ""
  const lower = message.toLowerCase()
  if (lower.includes("email not confirmed")) return "Подтвердите email по ссылке из письма"
  if (lower.includes("already registered") || lower.includes("already been registered")) {
    return "Пользователь с таким email уже зарегистрирован"
  }
  if (lower.includes("invalid login credentials")) return "Неверный email или пароль"
  if (lower.includes("password should be at least")) return `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`
  if (lower.includes("rate limit")) return "Слишком много запросов. Подождите минуту и попробуйте снова"

  return message || "Неизвестная ошибка. Попробуйте ещё раз."
}