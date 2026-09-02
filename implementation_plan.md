# Implementation Plan

## Overview

Добавить главную страницу сайта как новую вкладку `home` в существующем клиентском состоянии `PortfolioRebalancer` (SPA-стиль, URL не меняются), сделав её стартовой при загрузке. На главной разместить краткое описание сервиса — для кого и зачем, — а также перенести блок тарифов со страницы «Тарифы». Страницу «Тарифы» (`components/tariffs-page.tsx`), пункт навигации и ветку рендера полностью удалить. Изменения чисто UI-уровня: слой логики (`lib/*`), хранилище и unit-тесты не затрагиваются.

**Архитектура:** `PortfolioRebalancer` рендерит контент по `activePage`: `home` → `<HomePage />`, `settings` → `<SettingsPage />`, иначе — портфель. Шапка `AppHeader` получает навигацию `[Главная, Портфель, Настройки]` — кнопка «Главная» первая (слева). `HomePage` — «глупый» клиентский компонент: принимает `tier` и колбэк `onNavigate`, без бизнес-логики.

## Types

**`lib/types.ts`** (единственное изменение типов):
```ts
export type Page = "home" | "portfolio" | "settings"   // было: "portfolio" | "settings" | "tariffs"
```

## Files

**Новые:**
- **`components/home-page.tsx`** (`"use client"`, по конвенции как `tariffs-page`):
  - `export function HomePage({ tier, onNavigate }: { tier: Tier; onNavigate: (page: Page) => void })`
  - **Hero-блок** (декларативное описание сервиса):
    - Заголовок «Ребалансировка и учёт инвестиций» (`text-2xl font-semibold tracking-tight text-foreground text-balance`).
    - Подзаголовок: «Инструмент для частных инвесторов Московской биржи: задайте целевые доли портфеля и получайте точные расчёты — что и когда докупить или продать».
    - Блок «Для кого»: частные инвесторы, портфели акций/облигаций Мосбиржи, контроль целевых долей.
    - Блок «Зачем»: авто-расчёт ребалансировки, учёт свободных денег, экспорт/импорт, группы активов.
    - CTA-кнопка «Перейти к портфелю» → `onNavigate("portfolio")` (стиль `bg-primary ... shadow-sm shadow-primary/30`).
  - **Секция «Тарифы»** — переносится из `tariffs-page.tsx` без изменений: заголовок «Выберите подходящий тариф», грид 3 карточек `PLANS` (free/basic/pro), бейджи «Текущий»/«Активен», кнопки-заглушки, примечание «Смена тарифа выполняется администратором вручную…». Дизайн-классы темы (`bg-card`, `border-border`, `rounded-2xl`, токены `positive/negative`) — как в исходнике.

**Изменяемые:**

| Файл | Изменения |
|---|---|
| `lib/types.ts` | Тип `Page` (см. выше). |
| `components/app-header.tsx` | В `NAV`: добавить первым `{ id: "home", label: "Главная", icon: House }`, удалить `{ id: "tariffs", label: "Тарифы", icon: Tag }`. Импорт `lucide-react`: убрать `Tag`, добавить `House` (каноническая иконка «дом» в lucide-react v1.x; проверено по `.d.ts` установленного пакета — `declare const House` присутствует, алиаса `Home` нет). |
| `components/portfolio-rebalancer.tsx` | 1) Импорт: `TariffsPage` → `HomePage` (строка 50). 2) Дефолт: `useState<Page>("home")` (строка 79). 3) Ветка рендера (551–563): `activePage === "home" ? <HomePage tier={tier} onNavigate={setActivePage} /> : activePage === "settings" ? <SettingsPage .../> : портфель`. 4) Кнопка «Оплатить подписку» (строка 574): `setActivePage("home")` + обновить комментарий («кнопка ведёт на главную, где размещено описание тарифов»). |
| `README.md` | Строка ~113: «сейчас кнопка ведёт на страницу „Тарифы"» → «сейчас кнопка ведёт на главную страницу, где размещено описание тарифов». |

**На удаление:**
- `components/tariffs-page.tsx` (весь контент перенесён в `home-page.tsx`).

## Functions

- **Новые:** `HomePage({ tier, onNavigate })` — `components/home-page.tsx`, рендер hero + тарифов, без логики.
- **Изменённые:** нет.
- **Удалённые:** `TariffsPage({ tier })` (из `components/tariffs-page.tsx`) — миграция: контент перенесён в `HomePage`, все вызовы переписаны на `HomePage`.

## Classes

Изменений нет — оба компонента функциональные. `TariffsPage` заменяется новым `HomePage`.

## Dependencies

Новых пакетов не требуется. Иконка `Tag` из `lucide-react` перестаёт использоваться; добавляется `House` (пакет уже в зависимостях). После правок `pnpm build` должен пройти без неиспользуемых импортов.

## Testing

Бизнес-логика не меняется — новые unit-тесты не нужны. Валидация:
1. `pnpm test` — существующие тесты (`storage`, `portfolio-tier`, `email-validator`, `auth-service`, `cookie-consent`) в 0 изменений.
2. `pnpm build` — TS-компиляция, отсутствие битых импортов (`TariffsPage`, `Tag`) и неиспользуемых символов.
3. Ручная проверка (`pnpm dev`):
   - При загрузке `/` сразу главная; вкладка «Главная» активна.
   - Кнопка «Главная» — крайняя слева в навигации.
   - Переходы Главная ↔ Портфель ↔ Настройки работают; вкладки «Тарифы» нет.
   - Баннер блокировки: «Оплатить подписку» ведёт на главную.
   - После login/register (`router.push("/")`) пользователь попадает на главную.

## Implementation Order

1. `lib/types.ts` — обновить тип `Page`.
2. Создать `components/home-page.tsx`: hero + перенос `PLANS`/грида из `tariffs-page.tsx`.
3. `components/app-header.tsx` — NAV и иконки (`House`, без `Tag`).
4. `components/portfolio-rebalancer.tsx` — импорт `HomePage`, дефолт `"home"`, ветка рендера, кнопка баннера.
5. Удалить `components/tariffs-page.tsx`.
6. Обновить `README.md`.
7. Запуск `pnpm test` и `pnpm build`, ручная проверка сценариев.