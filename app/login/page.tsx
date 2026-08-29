import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { AuthCard } from "@/components/auth/auth-card"
import { AuthForm } from "@/components/auth/auth-form"

/** Страница входа. Авторизованные пользователи перенаправляются на главную. */
export default async function LoginPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect("/")

  return (
    <AuthCard title="Вход в аккаунт" subtitle="Войдите, чтобы восстановить свой тариф и продолжить работу с портфелем.">
      <AuthForm mode="login" />
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Нет аккаунта?{" "}
        <Link href="/register" className="font-medium text-primary transition-colors hover:opacity-80">
          Зарегистрироваться
        </Link>
      </p>
    </AuthCard>
  )
}