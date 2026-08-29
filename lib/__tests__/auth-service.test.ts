import type { SupabaseClient } from "@supabase/supabase-js"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AuthService } from "../auth-service"
import type { Database } from "../supabase/database.types"

/**
 * Unit-тесты AuthService с мок-клиентом Supabase (Dependency Inversion).
 * Проверяются Result-контракт, маппинг ошибок на русский язык и fallback
 * тарифа 'free' — поведение, зависящее только от бизнес-логики.
 */

type MockClient = {
  auth: {
    signUp: ReturnType<typeof vi.fn>
    signInWithPassword: ReturnType<typeof vi.fn>
    signOut: ReturnType<typeof vi.fn>
    getUser: ReturnType<typeof vi.fn>
  }
  from: ReturnType<typeof vi.fn>
}

function makeClient(): MockClient {
  return {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getUser: vi.fn(),
    },
    from: vi.fn(),
  }
}

function asSupabase(client: MockClient): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>
}

/** Мок цепочки from('profiles').select().eq().maybeSingle(). */
function mockProfileQuery(client: MockClient, result: { data: { tier?: string } | null; error?: Error | null }) {
  const maybeSingle = vi.fn().mockResolvedValue(result)
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  client.from.mockReturnValue({ select })
  return { maybeSingle, eq, select }
}

describe("AuthService.validateRegistrationEmail", () => {
  it("принимает корректный email", () => {
    expect(AuthService.validateRegistrationEmail("user@example.com")).toBeNull()
  })

  it("возвращает ошибку для пустого email", () => {
    expect(AuthService.validateRegistrationEmail("")).toBe("Введите email")
  })

  it("возвращает ошибку для невалидного формата", () => {
    expect(AuthService.validateRegistrationEmail("not-an-email")).toBe(
      "Введите корректный email (например name@example.com)",
    )
  })
})

describe("AuthService.signUp", () => {
  let client: MockClient

  beforeEach(() => {
    client = makeClient()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("регистрирует пользователя и возвращает сессию без confirmation", async () => {
    client.auth.signUp.mockResolvedValue({
      data: { user: { id: "u1", email: "user@example.com" }, session: { access_token: "t" } },
      error: null,
    })

    const result = await AuthService.signUp(asSupabase(client), {
      email: "user@example.com",
      password: "passw0rd!",
    })

    expect(result).toEqual({ success: true, user: { id: "u1", email: "user@example.com" } })
    expect(client.auth.signUp).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "passw0rd!",
      options: { emailRedirectTo: undefined },
    })
  })

  it("возвращает needsEmailConfirmation при отсутствии сессии", async () => {
    client.auth.signUp.mockResolvedValue({
      data: { user: { id: "u2", email: "user@example.com" }, session: null },
      error: null,
    })

    const result = await AuthService.signUp(asSupabase(client), {
      email: "user@example.com",
      password: "passw0rd!",
    })

    expect(result).toEqual({
      success: true,
      user: { id: "u2", email: "user@example.com" },
      needsEmailConfirmation: true,
    })
  })

  it("не вызывает клиент при коротком пароле", async () => {
    const result = await AuthService.signUp(asSupabase(client), {
      email: "user@example.com",
      password: "short",
    })

    expect(result.success).toBe(false)
    expect(result).toMatchObject({ error: "Пароль должен быть не короче 8 символов" })
    expect(client.auth.signUp).not.toHaveBeenCalled()
  })

  it("маппит ошибку email_taken на русское сообщение", async () => {
    client.auth.signUp.mockResolvedValue({
      data: { user: null },
      error: { message: "User already registered", code: "email_taken" },
    })

    const result = await AuthService.signUp(asSupabase(client), {
      email: "user@example.com",
      password: "passw0rd!",
    })

    expect(result).toEqual({ success: false, error: "Пользователь с таким email уже зарегистрирован" })
  })
})

describe("AuthService.signIn", () => {
  let client: MockClient

  beforeEach(() => {
    client = makeClient()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("входит с корректными данными", async () => {
    client.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: "u1", email: "user@example.com" }, session: { access_token: "t" } },
      error: null,
    })

    const result = await AuthService.signIn(asSupabase(client), {
      email: "user@example.com",
      password: "passw0rd!",
    })

    expect(result).toEqual({ success: true, user: { id: "u1", email: "user@example.com" } })
  })

  it("маппит email_not_confirmed на понятное сообщение", async () => {
    client.auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: "Email not confirmed", code: "email_not_confirmed" },
    })

    const result = await AuthService.signIn(asSupabase(client), {
      email: "user@example.com",
      password: "passw0rd!",
    })

    expect(result).toEqual({ success: false, error: "Подтвердите email по ссылке из письма" })
  })

  it("маппит invalid_credentials на сообщение о неверных данных", async () => {
    client.auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid login credentials", code: "invalid_credentials" },
    })

    const result = await AuthService.signIn(asSupabase(client), {
      email: "user@example.com",
      password: "wrong",
    })

    expect(result).toEqual({ success: false, error: "Неверный email или пароль" })
  })
})

describe("AuthService.signOut", () => {
  it("возвращает success без ошибок", async () => {
    const client = makeClient()
    client.auth.signOut.mockResolvedValue({ error: null })

    const result = await AuthService.signOut(asSupabase(client))
    expect(result).toEqual({ success: true })
  })
})

describe("AuthService.getTier", () => {
  let client: MockClient

  beforeEach(() => {
    client = makeClient()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("возвращает 'free' для гостя (нет пользователя)", async () => {
    client.auth.getUser.mockResolvedValue({ data: { user: null } })

    expect(await AuthService.getTier(asSupabase(client))).toBe("free")
    expect(client.from).not.toHaveBeenCalled()
  })

  it("читает тариф из profiles", async () => {
    client.auth.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.co" } } })
    mockProfileQuery(client, { data: { tier: "pro" } })

    expect(await AuthService.getTier(asSupabase(client))).toBe("pro")
    expect(client.from).toHaveBeenCalledWith("profiles")
  })

  it("возвращает 'free' при отсутствии строки профиля", async () => {
    client.auth.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.co" } } })
    mockProfileQuery(client, { data: null })

    expect(await AuthService.getTier(asSupabase(client))).toBe("free")
  })

  it("возвращает 'free' при ошибке запроса профиля", async () => {
    client.auth.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.co" } } })
    mockProfileQuery(client, { data: null, error: new Error("RLS denied") })

    expect(await AuthService.getTier(asSupabase(client))).toBe("free")
  })
})