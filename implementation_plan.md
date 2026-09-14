# Implementation Plan

**Цель:** добавить возможность ведения **до 7 портфелей на тарифе «Про»** (Бесплатный и Базовый — по 1 портфелю), сохранив существующую логику тарифов, блокировок и персистентности в `localStorage`.

**Контекст.** Сейчас приложение хранит ровно один портфель: корневой компонент `PortfolioRebalancer` держит все состояния плоско (`assets`, `cashBalance`, `useGroups`, `groups`, `nextId`, `nextGroupId`, `lockedSnapshot`, `tier`…) и сериализует их в один объект `PortfolioData` в `localStorage` (ключ `portfolioRebalancerData`, версия `3`). Изменение добавляет **слой портфелей поверх этого содержимого**: несколько независимых портфелей, каждый со своим набором активов, деньгами, группами и собственным `lockedSnapshot`.

**Подход.** Вводится новая структура данных «список портфелей» и рефакторинг состояния в `portfolio-rebalancer.tsx` с плоского на вложенное по активному портфелю. UI получает переключатель портфелей. Тарифная логика дополняется лимитом числа портфелей, который блокирует только **создание** новых (кнопка «+ портфель» неактивна), но НЕ вводит авто-блокировку по количеству и не трогает существующие портфели. Авто-блокировка по активам/группам остаётся, но теперь действует **на уровне отдельного (активного) портфеля**, а не всего приложения.

## Types

Все новые/изменённые типы — в `lib/types.ts`.

```ts
/** Содержимое одного портфеля (всё, что относится к его расчёту). */
export interface PortfolioContent {
  assets: Asset[]
  nextId: number
  cashBalance: number
  useGroups: boolean
  groups: Group[]
  nextGroupId: number
}

/** Портфель = содержимое + идентификация + снапшот блокировки. */
export interface Portfolio extends PortfolioContent {
  id: number
  name: string
  /** Снапшот содержимого, заблокированного из-за несоответствия тарифу (для восстановления). */
  lockedSnapshot?: PortfolioContent | null
}

/** Корневое состояние приложения, сохраняемое в localStorage. */
export interface PortfoliosState {
  version: number
  tier: Tier
  nextPortfolioId: number
  activePortfolioId: number
  portfolios: Portfolio[]
}

/** Создание портфеля в пустом состоянии. */
export function createEmptyPortfolio(id: number, name: string): Portfolio
```

- `PortfolioData` (старый тип) **удаляется**; вместо него для подкомпонентов используется `PortfolioContent`/`Portfolio`. Сигнатуры подкомпонентов, которые получают `assets`/`groups`/`cashBalance` отдельными пропсами (`PortfolioSummary`, `AssetTable`, `GroupAllocations`), не меняются.
- Лимит числа портфелей — в `lib/tariff.ts` (`TIER_MAX_PORTFOLIOS` и `canAddPortfolio`).

## Files

### Изменение: `lib/tariff.ts`
- Добавить `export const TIER_MAX_PORTFOLIOS: Record<Tier, number> = { free: 1, basic: 1, pro: 7 }`.
- Добавить `export function canAddPortfolio(tier: Tier, count: number): boolean` → `count < TIER_MAX_PORTFOLIOS[tier]`.
- `getRequiredTier(assets, useGroups, groups)` и `tierCovers` — **без изменений** (действуют на содержимое одного портфеля).

### Изменение: `lib/storage.ts`
- Класс `PortfolioStorage`: ключ `portfolioRebalancerData` прежний, `DATA_VERSION` → `4`.
- `save(data: PortfoliosState)` — сериализует новую структуру.
- `load(): PortfoliosState | null` — с миграцией:
  - payload версии `4` (есть `portfolios`) → вернуть как есть;
  - payload старого формата `PortfolioData` (нет `portfolios`, есть `assets`) → **миграция**: обернуть в `{ version: 4, tier, nextPortfolioId: 2, activePortfolioId: 1, portfolios: [{ id: 1, name: "Основной", assets, nextId, cashBalance, useGroups, groups, nextGroupId, lockedSnapshot }] }`;
  - иначе/некорректно → `null`.
- `validate` — принимать новую структуру (массив `portfolios`, у каждого валидные `assets`, числовые `id`/`nextId`/`cashBalance`/`nextGroupId`, `name: string`, опциональный `lockedSnapshot`). Обратная совместимость со старым форматом сохраняется на уровне `load` (миграция перед валидацией).
- `exportToFile` / `importFromFile` — работать с содержимым **активного** портфеля.

### Новый файл: `components/portfolio-switcher.tsx`
- Компонент `PortfolioSwitcher` (см. Functions): переключатель + создание/переименование/удаление портфелей. Рендерится наверху страницы «Портфель».

### Изменение: `components/portfolio-rebalancer.tsx`
- Заменить плоское состояние вложенным:
  - `const [portfolios, setPortfolios] = useState<Portfolio[]>([])`
  - `const [activePortfolioId, setActivePortfolioId] = useState<number | null>(null)`
  - `const [nextPortfolioId, setNextPortfolioId] = useState(1)`
  - `tier` остаётся глобальным.
- Производные: `activePortfolio` (по `activePortfolioId`, fallback — первый портфель), его `assets`/`nextId`/`cashBalance`/`useGroups`/`groups`/`nextGroupId` и `isLocked`/`lockedRequiredTier` **на уровне активного портфеля**.
- Вспомогательный `updateActiveContent(...)` — атомарная правка содержимого активного портфеля через `setPortfolios(prev => prev.map(...))`. Все существующие обработчики (`setAssets`, `setNextId`, `setCashBalance`, `setUseGroups`, `setGroups`, `setNextGroupId`) переписываются на него.
- Эффект автоблокировки: по `tier` + содержимому активного портфеля; при несоответствии — сохранить `lockedSnapshot` в активный портфель и очистить его содержимое (остальные портфели не затрагиваются).
- `handleTierChange`: при «оплате» тарифа, покрывающего `lockedRequiredTier`, восстановить снапшот **активного** портфеля.
- Авто-save и restore из `localStorage` — через новую структуру `PortfoliosState`.
- В JSX ветки `activePage === "portfolio"`: сверху — `<PortfolioSwitcher />`, заголовок использует имя активного портфеля; `PortfolioSummary` / `AssetTable` / `GroupAllocations` / `SettingsPage` получают данные активного портфеля.
- `maxAssets` и кнопка «Добавить актив» — без изменений (лимит активов остаётся per-портфель).

### Изменение: `components/settings-page.tsx`
- Пропсы групп (`groups`, `onAddGroup`, `onRemoveGroup`) — передаются для **активного** портфеля (в `portfolio-rebalancer.tsx`). Тело менять не нужно, кроме уточнения подписи тарифа Pro про «До 7 портфелей».

### Изменение: `components/home-page.tsx`
- В `PLANS`: в фиче-список тарифа `pro` добавить `"До 7 портфелей"`; в `free`/`basic` — уточнить количество портфелей.

### Изменение: README.md (желательно)
- Обновить раздел «Соответствие портфеля тарифу»: лимит числа портфелей (1/1/7) и что превышение блокирует только создание.

## Functions

### Новые
- `createEmptyPortfolio(id: number, name: string): Portfolio` — `lib/types.ts`. Возвращает `{ id, name, assets: [], nextId: 1, cashBalance: 0, useGroups: false, groups: [], nextGroupId: 1, lockedSnapshot: null }`.
- `canAddPortfolio(tier: Tier, count: number): boolean` — `lib/tariff.ts`. `count < TIER_MAX_PORTFOLIOS[tier]`.
- `PortfolioSwitcher` — `components/portfolio-switcher.tsx`. Пропсы:
  ```ts
  {
    portfolios: Portfolio[]
    activePortfolioId: number | null
    canAdd: boolean
    onSelect: (id: number) => void
    onAdd: (name: string) => void
    onRename: (id: number, name: string) => void
    onDelete: (id: number) => void
  }
  ```
  UI: ряд «чипов» портфелей по имени + подсветка активного; кнопка «+ портфель» (неактивна с подсказкой «Только на тарифе Про», когда `!canAdd`); переименование (инлайн-инпут) и удаление с подтверждением (кнопка неактивна, если портфель единственный).
- `updateActiveContent` (внутренний, в `portfolio-rebalancer.tsx`) — хелпер правки содержимого активного портфеля.

### Изменённые
- `PortfolioStorage.save/load/exportToFile/importFromFile/validate` — переход на `PortfoliosState` + миграция из v3 (см. Files).
- `handleTierChange`, эффект автоблокировки, авто-save/restore, `handleExport`/`handleImport` в `portfolio-rebalancer.tsx` — переписаны под активный портфель и новую структуру.

### Удалённые
- Тип `PortfolioData` — вытесняется `PortfolioContent`/`Portfolio`/`PortfoliosState`.

## Classes

Изменение только класса `PortfolioStorage` (см. Functions/Files). Новых классов нет; `PortfolioCalculator`/`AssetValidator`/сервисы цен не меняются.

## Dependencies

Новых пакетов нет. Версии не меняются.

## Testing

- `lib/__tests__/tariff.test.ts`: добавить проверки `TIER_MAX_PORTFOLIOS` (`free=1`, `basic=1`, `pro=7`) и `canAddPortfolio` (6 портфелей на Pro → да; 7 на Pro → нет; 2-й на Базовом/Бесплатном → нет).
- `lib/__tests__/storage.test.ts`: обновить `makeData` на `PortfoliosState`; добавить тест **миграции** из старого `PortfolioData` (v3) в новую структуру (один портфель «Основной», поля перенесены, `activePortfolioId=1`); roundtrip новой структуры; `validate` для новой структуры.
- Проверка: `pnpm test`, `pnpm build`. Ручная UX-проверка: три маршрута, переключение/создание/переименование/удаление портфелей, лимит на тарифе, авто-блокировка активного портфеля, экспорт/импорт.

## Implementation Order

1. `lib/types.ts` — типы `PortfolioContent`/`Portfolio`/`PortfoliosState` + `createEmptyPortfolio`.
2. `lib/tariff.ts` — `TIER_MAX_PORTFOLIOS`, `canAddPortfolio`.
3. `lib/storage.ts` — новая структура + миграция из v3.
4. `components/portfolio-switcher.tsx` — новый компонент.
5. `components/portfolio-rebalancer.tsx` — рефакторинг состояния на вложенную модель, активный портфель, авто-блокировка per-портфель, подключение переключателя, экспорт/импорт.
6. `components/settings-page.tsx` + `components/home-page.tsx` — передача данных активного портфеля, фиче-списки тарифов.
7. Тесты + сборка/валидация.
