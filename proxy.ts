import { createServerClient, parseCookieHeader } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import type { Database } from "@/lib/supabase/database.types"

/**
 * Next.js 16 proxy (бывш. middleware): обновляет Supabase-сессию (refresh-ротация
 * JWT) и защищает страницы аутентификации от повторного входа.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.cookies.toString())
        },
        setAll(cookiesToSet, headersToSet) {
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
          for (const [key, value] of Object.entries(headersToSet)) {
            response.headers.set(key, value)
          }
        },
      },
    },
  )

  // Проверка сессии: если access-токен протух, @supabase/ssr перевыпустит его
  // и запишет обновлённые cookies в response.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAuthPage = request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/register"
  if (user && isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    url.search = ""
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|json)$).*)"],
}