# Implementation Plan

## Overview

Реализовать «ведение до 5 портфелей на тарифе «Про»»: приложение переходит с одного рабочего портфеля на коллекцию портфелей (лимиты: free = 1, basic = 1, pro = 5), переключение — через dropdown в шапке `AppHeader`, а создание/переименование/удаление — в панели управления на странице «Портфель». Избыточные портфели при понижении тарифа **автоматически паркуются** в скрытую резервную коллекцию localStorage и восстанавливаются при повышении тарифа (полностью в духе существующего park/restore-механизма для содержимого портфеля).

**Контекст и подход.** Сейчас весь слой персистентности завязан на один ключ `portfolioRebalancerData`, а guard тарифа (`lib/portfolio-tier.ts`) оценивает только *содержимое* одного активного портфеля (кол-во активов, группы). Новая размерность — *число портфелей* — добавляется как отдельный чистый предикат `decidePortfolioCountLock` и отдельный guard-эффект в компоненте; существующий content-guard не трогается. Ключевой инвариант: **портфель №1 («Основной») живёт на прежнем ключе localStorage** → существующие данные пользователей мигрируют неявно (без переноса байтов), тесты `storage.test.ts` и `portfolio-tier.test.ts` остаются зелёными. Портфели №2+ получают ключи `portfolioRebalancerData:<id>`, индекс и активный портфель хранятся в `portfolioRebalancerMeta`.

## Types

**`lib/types.ts`** — добавлены три типа (после `PortfolioData`):

```ts
export interface PortfolioMeta {
  id: number
  name: string
  createdAt: string // ISO-дата создания, используется для «кто остаётся» при парковке
}

export interface PortfolioCollectionMeta {
  version: number
  nextPortfolioId: number // монотонный счётчик id, id не переиспользуются
  activePortfolioId: number
  portfolios: PortfolioMeta[] // порядок = порядок показа в dropdown
}

export interface LockedPortfolioEntry {
  meta: PortfolioMeta
  data: PortfolioData
}
```

**`lib/portfolio-tier.ts`** — новые константы `MAX_PORTFOLIOS_FREE = 1`, `MAX_PORTFOLIOS_BASIC = 1`, `MAX_PORTFOLIOS_PRO = 5`, helper `maxPortfoliosForTier(tier)`, тип `PortfolioCountDecision` и функция `decidePortfolioCountLock`.

## Files

**Новые:**
- **`components/portfolio-manager.tsx`** (`"use client"`, «глупый» рендерер без бизнес-логики): панель с inline-переименованием имени (карандаш, галочка, отмена), счётчиком «N из M», кнопками «Новый портфель» (`+`) и «Удалить» (blocked/disabled по лимиту или последнему портфелю). Родитель перемонтирует панель через `key={activePortfolioId}`.

**Изменяемые:**

| Файл | Изменения |
|---|---|
| `lib/types.ts` | `PortfolioMeta`, `PortfolioCollectionMeta`, `LockedPortfolioEntry`. |
| `lib/storage.ts` | `DATA_VERSION` 3→4; новые методы и ключи (`getPortfolioKey`, `savePortfolioData`, `loadPortfolioData`, `removePortfolioData`, `emptyPortfolio`, `saveMeta`, `loadMeta` с миграцией, `saveLockedCollection`, `loadLockedCollection`, `clearLockedCollection`); `save/load/clear` → делегаты портфеля №1. `saveLocked/loadLocked/clearLocked` (content-lock) без изменений. |
| `lib/portfolio-tier.ts` | `MAX_PORTFOLIOS_*`, `maxPortfoliosForTier`, `computeRequiredTier(portfolio, portfolioCount = 1)`, `PortfolioCountDecision`, `decidePortfolioCountLock`. |
| `components/portfolio-rebalancer.tsx` | Стейт коллекции; hydration через `loadMeta`+`loadPortfolioData(active)`; save-эффект по активному портфелю; count-guard эффект (park-extra/restore); хэндлеры выбора/создания/переименования/удаления; `<PortfolioManager />` + инфо-баннер при парковке; `handleReset` → сброс только активного портфеля. |
| `components/app-header.tsx` | Пропсы `portfolios`, `activePortfolioId`, `onSelectPortfolio`; нативный `<select>` в шапке рядом с тарифом (паттерн `asset-row.tsx`). |
| `components/home-page.tsx` | `PLANS`: free/basic + «Один портфель», pro + «До 5 портфелей». |
| `components/settings-page.tsx` | `TIERS`: описания с количеством портфелей. |
| `README.md` | Таблица ключей localStorage + раздел «Портфели на тарифе „Про"». |
| `lib/__tests__/portfolio-tier.test.ts` | Новые тесты. |
| `lib/__tests__/storage.test.ts` | Новые тесты. |

**На удаление:** нет.

## Functions

**Новые (чистая логика):**
- `maxPortfoliosForTier(tier): number` — `lib/portfolio-tier.ts`.
- `decidePortfolioCountLock({ tier, portfolios, activeId, locked }): PortfolioCountDecision` — `lib/portfolio-tier.ts`: `restore` когда `portfolios.length + locked.length <= limit`; `park-extra` когда `portfolios.length > limit` (остаётся активный + старейшие до лимита, `extraIds` — остальные); иначе `none`.
- `computeRequiredTier(portfolio, portfolioCount = 1)` — расширена (2+ портфеля → `pro`).

**Новые (хранилище `PortfolioStorage`):** `getPortfolioKey`, `savePortfolioData`, `loadPortfolioData`, `removePortfolioData`, `emptyPortfolio`, `saveMeta`, `loadMeta` (авто-создание и миграция легаси), `saveLockedCollection`, `loadLockedCollection`, `clearLockedCollection`.

**Новые (компонент):** `handleSelectPortfolio`, `handleCreatePortfolio`, `handleRenamePortfolio`, `handleDeletePortfolio`, count-guard `useEffect`.

**Изменённые:** событие hydration, save-эффект, `handleReset`, рендер; в ветку «portfolio» добавлен `<PortfolioManager />` и инфо-баннер.

## Classes

Классы не добавляются и не удаляются. `PortfolioStorage` расширяется статическими методами; `PortfolioCalculator`, `AuthService`, `AssetValidator` не затрагиваются.

## Dependencies

Новых npm-пакетов не требуется: dropdown — нативный `<select>` (паттерн из `asset-row.tsx`), иконки `Plus`, `Pencil`, `Trash2`, `Layers`, `Info` уже в установленной `lucide-react`.

## Testing

**`portfolio-tier.test.ts`:** `maxPortfoliosForTier` (1/1/5); `computeRequiredTier` с числом портфелей (1 → по контенту; 2 и 5 → pro); `decidePortfolioCountLock` (`none` в лимите; `park-extra` оставляет активный; `restore` при покрытии; `none` пока тариф не покрывает).

**`storage.test.ts`:** `getPortfolioKey`; roundtrip `savePortfolioData`/`loadPortfolioData`/`removePortfolioData` (изоляция ключей); `save/load/clear` = портфель №1; `emptyPortfolio`; `loadMeta` (создание дефолта, миграция легаси); roundtrip резервной коллекции и rejection некорректной структуры.

**Валидация:** `pnpm test`; `npx tsc --noEmit` (важно: в `next.config.mjs` стоит `typescript.ignoreBuildErrors: true`, поэтому `pnpm build` типы не проверяет); `pnpm build`; ручные сценарии (создание 5 портфелей на pro, блок на 6-м; переключение в шапке; переименование/удаление; downgrade free → парковка 4 + баннер; upgrade pro → возврат; сброс активного портфеля).

## Implementation Order

1. `lib/types.ts` — новые типы.
2. `lib/portfolio-tier.ts` — константы, `maxPortfoliosForTier`, `computeRequiredTier(portfolioCount)`, `decidePortfolioCountLock`.
3. `lib/__tests__/portfolio-tier.test.ts` — новые тесты; прогнать.
4. `lib/storage.ts` — ключи, миграция, делегаты, locked-коллекция; `lib/__tests__/storage.test.ts` — новые тесты; прогнать.
5. `components/app-header.tsx` — пропсы + `<select>`.
6. `components/portfolio-manager.tsx` — панель управления.
7. `components/portfolio-rebalancer.tsx` — стейт, hydration/save/count-guard, хэндлеры, рендер.
8. Тексты: `home-page.tsx`, `settings-page.tsx`.
9. `README.md`.
10. `pnpm test`, `npx tsc --noEmit`, `pnpm build`, ручные сценарии.