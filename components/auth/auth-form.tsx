"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Eye, EyeOff, Loader2, LogIn, Mail, UserPlus } from "lucide-react"
import { AuthService } from "@/lib/auth-service"
import { createClient } from "@/lib/supabase/client"
import { MIN_PASSWORD_LENGTH } from "@/lib/types"

/**
 * Универсальная форма аутентификации (вход / регистрация).
 * Вся логика делегируется AuthService (бизнес-слой); компонент — только
 * рендер состояния, ввода пользователя и событий сабмита.
 */
export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmationSent, setConfirmationSent] = useState(false)

  const isLogin = mode === "login"

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return

    setError(null)
    setSubmitting(true)
    try {
      const client = createClient()
      const emailRedirectTo = `${window.location.origin}/`
      const result = isLogin
        ? await AuthService.signIn(client, { email, password })
        : await AuthService.signUp(client, { email, password, emailRedirectTo })

      if (result.success) {
        if (result.needsEmailConfirmation) {
          setConfirmationSent(true)
          setPassword("")
          return
        }
        router.push("/")
        router.refresh()
        return
      }
      setError(result.error)
    } catch {
      setError("Не удалось связаться с сервером аутентификации. Попробуйте ещё раз.")
    } finally {
      setSubmitting(false)
    }
  }

  const inputError = !isLogin && !!email && password.length > 0 && password.length < MIN_PASSWORD_LENGTH
    ? `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`
    : null

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-negative/25 bg-negative-muted px-4 py-3 text-sm text-negative">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          <p className="text-pretty">{error}</p>
        </div>
      )}

      {confirmationSent && (
        <div className="rounded-xl border border-info/20 bg-info-muted px-4 py-3 text-sm text-info">
          Почти готово! Мы отправили письмо с подтверждением на <strong className="font-medium">{email}</strong>.
          Перейдите по ссылке из письма, чтобы активировать аккаунт.
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="email-input" className="block text-sm font-medium text-foreground">
          Email
        </label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
          <input
            id="email-input"
            type="email"
            autoComplete="email"
            required
            inputMode="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-input bg-muted py-2.5 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="password-input" className="block text-sm font-medium text-foreground">
          Пароль
        </label>
        <div className="relative">
          <input
            id="password-input"
            type={showPassword ? "text" : "password"}
            autoComplete={isLogin ? "current-password" : "new-password"}
            required
            minLength={isLogin ? 1 : MIN_PASSWORD_LENGTH}
            placeholder={isLogin ? "Введите пароль" : `Минимум ${MIN_PASSWORD_LENGTH} символов`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-input bg-muted py-2.5 pl-3 pr-11 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" strokeWidth={2} /> : <Eye className="h-4 w-4" strokeWidth={2} />}
          </button>
        </div>
        {inputError && <p className="text-xs text-negative">{inputError}</p>}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/30 transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin-calc" strokeWidth={2.25} />
        ) : isLogin ? (
          <LogIn className="h-4 w-4" strokeWidth={2.25} />
        ) : (
          <UserPlus className="h-4 w-4" strokeWidth={2.25} />
        )}
        {submitting ? "Подождите…" : isLogin ? "Войти" : "Зарегистрироваться"}
      </button>
    </form>
  )
}