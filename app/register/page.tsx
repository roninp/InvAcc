import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { AuthCard } from "@/components/auth/auth-card"
import { AuthForm } from "@/components/auth/auth-form"

/** Страница регистрации. Авторизованные пользователи перенаправляются на главную. */
export default async function RegisterPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect("/")

  return (
    <AuthCard title="Создание аккаунта" subtitle="Зарегистрируйтесь, чтобы сохранить тариф и синхронизировать настройки.">
      <AuthForm mode="register" />
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="font-medium text-primary transition-colors hover:opacity-80">
          Войти
        </Link>
      </p>
    </AuthCard>
  )
}