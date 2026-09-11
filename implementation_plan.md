# Implementation Plan

**Цель:** добавить главную (домашнюю) страницу сервиса с кратким описанием «для кого и зачем», перенести на неё описание тарифов и убрать страницу «Тарифы»; пункт «Главная» становится первым элементом навигации слева; при загрузке сайта открывается главная. Всё — в стиле существующего дизайна (shadcn/base-nova, Tailwind, токены темы).

**Контекст:** приложение — одностраничный клиент (Next.js 16, React 19, TypeScript, Tailwind CSS 4). Навигация не маршрутизированная, а state-based: компонент `PortfolioRebalancer` (`components/portfolio-rebalancer.tsx`) хранит `activePage: Page` и рендерит страницу условно. Шапка `AppHeader` (`components/app-header.tsx`) содержит строку кнопок-«табов» (`NAV`). Страница тарифов — `components/tariffs-page.tsx` (карточки планов `PLANS` + `onSelectTier`). Тип страниц — `Page` в `lib/types.ts`.

## Types

`lib/types.ts`: тип `Page` изменён с `"portfolio" | "settings" | "tariffs"` на `"home" | "portfolio" | "settings"`. Новых типов не требуется.

## Files

- **Новый** `components/home-page.tsx` — главная страница: hero-блок с описанием + кнопка `onNavigate("portfolio")` + перенесённые карточки тарифов.
- **Удалён** `components/tariffs-page.tsx`.
- **Изменён** `components/app-header.tsx` — «Главная» первым пунктом `NAV`, убран «Тарифы», иконка `Home` вместо `Tag`.
- **Изменён** `components/portfolio-rebalancer.tsx` — импорт `HomePage`, стартовый `"home"`, ветки рендера, кнопка блокировки ведёт на «home».

## Functions

- Новая `HomePage` (`components/home-page.tsx`); удалена `TariffsPage`.

## Classes

Классов нет; `PortfolioStorage`/`PortfolioCalculator` и прочее не затрагиваются.

## Dependencies

Новых пакетов нет; используется `lucide-react` (иконка `Home`).

## Testing

Автотесты (`lib/__tests__/`) не затрагиваются. Ручная проверка сценариев + `tsc --noEmit` / `pnpm build`.

## Implementation Order

1. `lib/types.ts` — тип `Page`.
2. Создать `components/home-page.tsx`.
3. Удалить `components/tariffs-page.tsx`.
4. `components/app-header.tsx` — навигация.
5. `components/portfolio-rebalancer.tsx` — импорт и рендер.
6. Проверка (`tsc`, ручное тестирование).