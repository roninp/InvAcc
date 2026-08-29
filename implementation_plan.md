# Implementation Plan

## Overview

Подключить авторизацию через Supabase Auth (email + пароль с обязательным подтверждением email по письму) к приложению InvAcc: спроектировать и создать таблицу `profiles` (тарифы пользователей), автоматически создавать профиль со тарифом `free` при регистрации (тариф назначается вручную через БД и не меняется на сайте), добавить страницы `/register` и `/login` в дизайне существующего приложения, считывать тариф зарегистрированного пользователя из БД, а для гостей жёстко использовать `free`. Портфель остаётся в localStorage (синхронизация портфеля в БД — вне рамок задачи).

Подход: корневая страница становится async Server Component — читает сессию и тариф пользователя через `@supabase/ssr` (cookie-сессии с refresh-ротацией), передаёт начальное состояние в существующий клиентский компонент `PortfolioRebalancer`; сессия обновляется в `proxy.ts` (обновлённое в Next.js 16 имя middleware); вход/выход выполняются через изолированный сервис бизнес-логики `AuthService` (Result-паттерн, DI клиента). БД создаётся через Supabase MCP (`apply_migration`).

## Types

**`lib/types.ts` (расширение):**
```ts
/** ДТО пользователя для UI — изолирует UI от типов Supabase. */
export interface AuthUser {
  id: string
  email: string | null
}

/** Пропсы корневого компонента после SSR-чтения сессии/тарифа. */
export interface RebalancerServerProps {
  initialUser: AuthUser | null
  initialTier: Tier
}

/** Результат операций аутентификации (Result-паттерн). */
export type AuthResult =
  | { success: true; user: AuthUser }
  | { success: false; error: string; needsEmailConfirmation?: boolean }
```

- `Tier` остаётся неизменным: `"free" | "basic" | "pro"`.
- Добавляется экспорт `MIN_PASSWORD_LENGTH = 8` и `EMAIL_MAX_LENGTH = 254` (константы валидации).

**`lib/supabase/database.types.ts` (новый):** сгенерированные типы БД (через MCP `generate_typescript_types` после создания таблицы) с интерфейсом `profiles`: `{ id: string; email: string; tier: "free"|"basic"|"pro"; created_at: string; updated_at: string }`.

**Схема БД (`public.profiles`):**
| Колонка | Тип | Ограничения |
|---|---|---|
| `id` | `uuid` | PK, `references auth.users(id) on delete cascade` |
| `email` | `text` | `not null` |
| `tier` | `text` | `not null default 'free'`, check `in ('free','basic','pro')` |
| `created_at` | `timestamptz` | `not null default now()` |
| `updated_at` | `timestamptz` | `not null default now()` |

Индекс: `profiles_email_idx on (email)`. Триггер `handle_new_user()` (security definer) создаёт профиль `free` при INSERT в `auth.users` (`on conflict (id) do nothing`). RLS включён; единственная политика — `SELECT ... using (auth.uid() = id)`. Никаких INSERT/UPDATE/DELETE-политик для пользователей: тариф меняется только вручную (`update public.profiles set tier='pro' where email='...'` через SQL в дашборде/service_role).

## Files

**Новые:**
| Файл | Назначение |
|---|---|
| `lib/supabase/server.ts` | `createClient()` для Server Components/Route Handlers: `createServerClient` из `@supabase/ssr`, `await cookies()`, `getAll()`/`setAll()` |
| `lib/supabase/client.ts` | `createBrowserClient` (браузерная, cookie-сессии, `detectSessionInUrl` по умолчанию) |
| `lib/supabase/database.types.ts` | Сгенерированные типы БД |
| `lib/email-validator.ts` | Чистая функция валидации формата email (без UI-зависимостей) |
| `lib/auth-service.ts` | Класс `AuthService` (статические методы, DI-клиент) — signUp/signIn/signOut/getTier + маппинг ошибок Supabase на русские сообщения |
| `components/auth/auth-card.tsx` | Общая карточка бренда для страниц входа/регистрации (дизайн как у остальных) |
| `components/auth/auth-form.tsx` | Клиентская форма (поле email, пароль с показ/скрытие, кнопка, ошибки, сабмит) — универсальная для логина и регистрации |
| `app/login/page.tsx` | Страница входа: SSR-редирект авторизованных на `/`, рендер `AuthForm` |
| `app/register/page.tsx` | Страница регистрации: SSR-редирект авторизованных на `/`, рендер `AuthForm` |
| `proxy.ts` | Next.js 16 proxy (бывш. middleware): обновление сессии `@supabase/ssr` + редиректы `/login` `/register` → `/` для авторизованных |
| `supabase/migrations/<timestamp>_create_profiles.sql` | Версия миграции в репозитории (документация) |
| `lib/__tests__/email-validator.test.ts` | Vitest: юнит-тесты валидатора |
| `lib/__tests__/auth-service.test.ts` | Vitest: AuthService с мок-клиентом Supabase |

**Изменяемые:**
| Файл | Изменения |
|---|---|
| `package.json` | + `@supabase/supabase-js`, `@supabase/ssr` |
| `.env.example` | + `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (публикуемый ключ `sb_publishable_...`) с комментариями |
| `.env.local` | Добавить реальные значения (при наличии) |
| `app/page.tsx` | Становится async Server Component: читает `user` + `tier` из БД, рендерит `<PortfolioRebalancer initialUser initialTier />` |
| `components/portfolio-rebalancer.tsx` | Принимает `initialUser`/`initialTier`; состояние `tier` инициализируется с сервера; подписка `onAuthStateChange` (обновление user/tier при входе/выходе); убрать `onTierChange` и передачу колбэков смены тарифа |
| `components/app-header.tsx` | Показывать email пользователя + кнопку «Выйти» (аутентифицирован) или «Войти» (гость); бейдж тарифа остаётся |
| `components/settings-page.tsx` | Карточки выбора тарифа → статичная строка «Тариф назначается администратором», текущий тариф — бейджем; `onTierChange` удаляется |
| `components/tariffs-page.tsx` | Кнопки «Выбрать тариф» → заблокированы/скрыты, подпись «Тариф назначается вручную»; `onSelectTier` удаляется |
| `README.md` | Раздел «Авторизация»: настройка SMTP, как поменять тариф в БД, переменные окружения |
| `lib/types.ts` | Типы из раздела **Types** |
## Functions

**Новые:**
| Сигнатура | Файл | Назначение |
|---|---|---|
| `isValidEmail(value: string): boolean` | `lib/email-validator.ts` | Формат-проверка email (regex + длина ≤ 254 + отсутствие пробелов) |
| `createClient(): Promise<SupabaseClient<Database>>` (export из `lib/supabase/server.ts`) | `lib/supabase/server.ts` | SSR-клиент с cookie-сессией |
| `createClient(): SupabaseClient<Database>` (export из `lib/supabase/client.ts`) | `lib/supabase/client.ts` | Браузерный клиент |
| `AuthService.validateRegistrationEmail(email: string): string \| null` | `lib/auth-service.ts` | Валидация формата email (рус. сообщение или null) |
| `AuthService.signUp(client, { email, password, emailRedirectTo }): Promise<AuthResult>` | `lib/auth-service.ts` | `signUp` + детект «письмо отправлено» (`data.session == null`); маппинг ошибок |
| `AuthService.signIn(client, { email, password }): Promise<AuthResult>` | `lib/auth-service.ts` | `signInWithPassword`; маппинг `email_not_confirmed` |
| `AuthService.signOut(client): Promise<void>` | `lib/auth-service.ts` | `auth.signOut()` |
| `AuthService.getTier(client): Promise<Tier>` | `lib/auth-service.ts` | `select tier from profiles`, fallback `free` |
| `toFriendlyAuthError(error: unknown): string` | `lib/auth-service.ts` | Код Supabase → русский текст |
| `proxy(request: NextRequest): Promise<NextResponse>` | `proxy.ts` | Refresh сессии `@supabase/ssr`, редирект авторизованных с `/login` `/register` |
| `Page(): Promise<JSX.Element>` (async) | `app/page.tsx` | SSR-инициализация user/tier |

**Изменяемые:**
- `PortfolioRebalancer` — сигнатура `({ initialUser, initialTier }: RebalancerServerProps)`; удаляется `handleTierChange`-логика; добавляется `useEffect` на `onAuthStateChange`.
- `SettingsPage`/`TariffsPage` — пропсы лишаются `onTierChange`/`onSelectTier`.

**Удаляемые:** смена тарифа на клиенте (`settings-page.tsx`, `tariffs-page.tsx`); запись `tier` из UI в localStorage прекращается (для гостей тариф всегда `free`).

## Classes

**Новые:**
- `AuthService` (`lib/auth-service.ts`) — статические методы (стиль проекта: `PortfolioStorage`, `MoexPriceService`). Клиент Supabase передаётся параметром (DI → тестируемо моками).

**Изменяемые:**
- `PortfolioRebalancer` (компонент) — расширен пропсами инициализации, убрана смена тарифа.
- `PortfolioStorage` — не изменяется (tier из localStorage больше не используется).

**Удаляемые:** отсутствуют.

## Dependencies

- `pnpm add @supabase/supabase-js @supabase/ssr` — выполнено на этапе реализации.

**Настройка Supabase (вне кода):**
1. **SMTP** (Project Settings → Auth → SMTP): Host/Port/User/Password/Sender (например Yandex 465 SSL), иначе письма не дойдут.
2. **Auth → URL Configuration**: `Site URL` = `http://localhost:3000`; `Redirect URLs` += `http://localhost:3000/**`.
3. Тариф вручную: `update public.profiles set tier = 'pro' where email = 'user@example.com';` (SQL Editor).

## Testing

- **Новые Vitest:**
  - `lib/__tests__/email-validator.test.ts` — валидные/невалидные адреса.
  - `lib/__tests__/auth-service.test.ts` — мок-клиент: успех, `email_taken`, `email_not_confirmed`, слабый пароль, fallback tier `free`.
- **Существующие тесты** (`storage.test.ts`) не затрагиваются.
- **Валидация вручную:** `pnpm test`; `pnpm build`; ручной прогон регистрации → подтверждение → вход → смена tier в БД → выход покажет `free`.

## Implementation Order

1. **БД:** миграция `create_profiles` применена ✅, типы сгенерированы ✅.
2. **Конфигурация:** зависимости установлены ✅; `.env.example` + `.env.local`.
3. **Ядро:** `lib/email-validator.ts` → `lib/auth-service.ts` → `lib/supabase/server.ts` + `lib/supabase/client.ts` + `database.types.ts`.
4. **Типы:** `lib/types.ts` (`AuthUser`, `RebalancerServerProps`, `AuthResult`, константы).
5. **SSR:** `proxy.ts`; async `app/page.tsx`.
6. **UI:** `components/auth/auth-card.tsx`, `auth-form.tsx`, `app/login/page.tsx`, `app/register/page.tsx`.
7. **Интеграция:** `portfolio-rebalancer.tsx`, `app-header.tsx`, `settings-page.tsx`, `tariffs-page.tsx`.
8. **Репозиторий:** `supabase/migrations/<ts>_create_profiles.sql`, README, план.
9. **Тесты:** Vitest; `pnpm test` + `pnpm build`.
10. **E2E:** ручной прогон флоу; инструкции по SMTP.