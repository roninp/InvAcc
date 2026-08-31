# Implementation Plan

## Overview

Добавить контроль соответствия портфеля тарифу: если сохранённый портфель (localStorage) превышает лимиты текущего тарифа (больше активов, чем разрешает free/basic, или портфель использует группы — фича тарифа «Про»), приложение паркует портфель в резервную копию (отдельный ключ localStorage), обнуляет рабочий стол и показывает сообщение «Ваш портфель соответствует тарифу «…». Будет доступен после оплаты подписки» с заглушкой-кнопкой «Оплатить подписку». После повышения тарифа (смена tier в БД вручную) резервная копия автоматически восстанавливается и затирает текущий портфель. Восстановление срабатывает при перезагрузке страницы, повторном входе и на auth-событиях SIGNED_IN / USER_UPDATED (тариф перечитывается из БД). Фоновая авто-проверка тарифа по таймеру НЕ добавляется — по решению заказчика она появится вместе с системой оплаты.

Базис (уже реализован и не меняется): Supabase Auth (email+пароль, подтверждение email), таблица `profiles` с колонкой `tier`, SSR-чтение сессии и тарифа в `app/page.tsx`, клиент-синхронизация тарифа на auth-событиях. Лимиты: `free` — до 2 активов, `basic` — до 100, `pro` — группы активов + мгновенные цены. Портфель по-прежнему хранится в localStorage (ключ `portfolioRebalancerData`).

Ключевое решение UX (согласовано): после обнуления приложение остаётся полностью рабочим в рамках текущего тарифа (на free — до 2 активов); резервная копия «прошлого портфеля» не затрагивается и восстанавливается после поднятия тарифа (перезаписывая текущий рабочий портфель).

## Types

**`lib/portfolio-tier.ts` (новый модуль чистой логики, без UI-зависимостей):**

```ts
/** Ранг тарифа: чем больше, тем «лучше». */
export const TIER_RANK: Record<Tier, number> = { free: 0, basic: 1, pro: 2 }

/** Максимум активов на бесплатном тарифе. */
export const MAX_ASSETS_FREE = 2
/** Максимум активов на платных тарифах. */
export const MAX_ASSETS_PAID = 100

/** Информация о заблокированном (припаркованном) портфеле для UI-баннера. */
export interface LockedPortfolioInfo {
  requiredTier: Tier
}

/** Решение guard-эффекта за один проход. */
export type LockDecision =
  | { action: "none" }
  | { action: "park"; requiredTier: Tier }        // бэкапа нет, текущий портфель не влезает — паркуем
  | { action: "reset-excess"; requiredTier: Tier } // бэкап уже есть, а текущий портфель снова не влезает — только сброс
  | { action: "restore"; backup: PortfolioData }   // тариф позволяет — восстанавливаем бэкап
```

- `Tier`, `Asset`, `Group`, `PortfolioData`, `AuthUser` — из `lib/types.ts` (без изменений).
- Новый ключ localStorage резервной копии: `portfolioRebalancerLockedData` (структура идентична `PortfolioData`, плюс поля `version` и `lockedAt`).

## Files

**Новые:**

| Файл | Назначение |
|---|---|
| `lib/portfolio-tier.ts` | Чистая логика guard: вычисление требуемого тарифа, сравнение рангов, тексты, решение (park / reset-excess / restore / none) |
| `lib/__tests__/portfolio-tier.test.ts` | Vitest: юнит-тесты чистой логики |

**Изменяемые:**

| Файл | Изменения |
|---|---|
| `lib/storage.ts` | Новые статические методы резервной копии: `LOCKED_STORAGE_KEY = "portfolioRebalancerLockedData"`, `LOCKED_DATA_VERSION = 1`, `saveLocked(data)`, `loadLocked(): PortfolioData \| null`, `clearLocked()`. Валидация — через существующий `validate` (структура идентична `PortfolioData`) |
| `lib/__tests__/storage.test.ts` | Тесты save/load/clear резервной копии + отбраковка невалидного payload |
| `components/portfolio-rebalancer.tsx` | Состояние `lock: LockedPortfolioInfo \| null`; guard-эффект; баннер с сообщением и кнопкой «Оплатить подписку»; хелперы `applyPortfolioData(data)` и `resetWorkspace()` |
| `README.md` | Описание поведения, ключи localStorage, сценарии ручной проверки |

**Без изменений:** `app/page.tsx`, `lib/auth-service.ts`, `components/app-header.tsx`, `components/settings-page.tsx`, `components/tariffs-page.tsx` (переключатель групп уже заблокирован для тарифов ниже pro, страница тарифов уже сообщает о ручном назначении).

## Functions

**Новые (`lib/portfolio-tier.ts`):**

| Сигнатура | Назначение |
|---|---|
| `computeRequiredTier(portfolio: Pick<PortfolioData, "assets" \| "useGroups" \| "groups">): Tier` | `pro`, если `useGroups === true` \|\| `groups.length > 0` \|\| любой актив имеет `groupId != null`; иначе `basic`, если `assets.length > MAX_ASSETS_FREE`; иначе `free` |
| `isTierSufficient(required: Tier, current: Tier): boolean` | `TIER_RANK[required] <= TIER_RANK[current]` |
| `getTierLabel(tier: Tier): string` | `"Бесплатный"` / `"Базовый"` / `"Про"` |
| `buildLockMessage(requiredTier: Tier): string` | `"Ваш портфель соответствует тарифу «Базовый». Будет доступен после оплаты подписки."` (тариф — через `getTierLabel`) |
| `decideLockState(input: { tier: Tier; current: PortfolioData \| null; backup: PortfolioData \| null }): LockDecision` | Правила ниже |
| `saveLocked(data: PortfolioData): void` | `lib/storage.ts` — парковка портфеля |
| `loadLocked(): PortfolioData \| null` | `lib/storage.ts` — чтение резервной копии |
| `clearLocked(): void` | `lib/storage.ts` — удаление резервной копии |

**Правила `decideLockState`:**
1. Если `backup` существует: `requiredOfBackup = computeRequiredTier(backup)`.
   - `isTierSufficient(requiredOfBackup, tier)` → `{ action: "restore", backup }` (удалить бэкап, применить данные).
   - Иначе если текущий портфель не влезает в тариф → `{ action: "reset-excess", requiredTier: requiredOfBackup }` (существующий бэкап не перезаписывается, только сброс рабочего стола).
   - Иначе → `{ action: "none" }` (баннер по-прежнему виден: бэкап есть, тариф недостаточен).
2. Если `backup` нет, а `current` не влезает в тариф → `{ action: "park", requiredTier: computeRequiredTier(current) }`.
3. Иначе → `{ action: "none" }`.

**Изменяемые (в `components/portfolio-rebalancer.tsx`):**
- Guard-эффект (деп-зависимости: `tier, assets, nextId, cashBalance, useGroups, groups, nextGroupId`; не работает до завершения restore-эффекта — флаг-реф `hydratedRef`):
  - `park` → `PortfolioStorage.saveLocked(current)` → `resetWorkspace()` → `setLock({ requiredTier })`;
  - `reset-excess` → `resetWorkspace()` → `setLock({ requiredTier })`;
  - `restore` → `applyPortfolioData(backup)` → `PortfolioStorage.clearLocked()` → `setLock(null)`;
  - `none` → `setLock` из наличия невосстановленного `backup`: баннер показывается, пока бэкап существует и тариф недостаточен.
- Хелпер `applyPortfolioData(data: PortfolioData)` (вынести из текущего `handleImport`): восстанавливает `assets/nextId/cashBalance/useGroups/groups/nextGroupId`, сбрасывает расчёт/доп. деньги, но НЕ применяет `tier` из сохранённых данных (тариф всегда из сессии/БД).
- Хелпер `resetWorkspace()` (вынести из `handleReset` без `PortfolioStorage.clear()`): все setState-сбросы.
- `handleReset` («Сбросить всё») → `PortfolioStorage.clear()` + `resetWorkspace()`; резервную копию НЕ трогает (бэкап удаляется только при успешном восстановлении или перезаписи при парковке).
- Баннер перед основным контентом при `lock != null`: тон `warning`, текст `buildLockMessage(lock.requiredTier)`; кнопка «Оплатить подписку» (primary-стиль) → `onClick` переключает на страницу «Тарифы» (`setActivePage("tariffs")`). Кнопка — заглушка будущей системы оплаты (комментарий в коде).
- Компонент `Banner` расширяется опциональным пропом `action?: React.ReactNode` (кнопка размещается внутри баннера рядом с текстом).

**Удаляемые:** функциональной смены тарифа на клиенте нет и раньше, доп. удаления не требуются. Существующий эффект «выключить useGroups при tier != pro» остаётся как защитный fallback.

## Classes

**Изменяемые:**
- `PortfolioStorage` (`lib/storage.ts`) — добавляются статические методы `saveLocked` / `loadLocked` / `clearLocked` и константы ключа/версии.
- `PortfolioRebalancer` (`components/portfolio-rebalancer.tsx`) — состояние `lock`, guard-эффект, баннер, хелперы `applyPortfolioData` / `resetWorkspace`.

**Новые / удаляемые:** классов не требуется (логика — чистые функции модуля `lib/portfolio-tier.ts`).

## Dependencies

Новых зависимостей нет (используются уже установленные `@supabase/supabase-js`, `@supabase/ssr`, Vitest).

## Testing

**`lib/__tests__/portfolio-tier.test.ts` (новый):**
- `computeRequiredTier`: 0/1/2 активов без групп → `free`; 3 актива → `basic`; `useGroups=true` → `pro`; `groups.length > 0` → `pro`; актив с `groupId != null` → `pro`; пустой массив → `free`.
- `isTierSufficient`: free≤free, free<basic, basic<pro.
- `buildLockMessage` / `getTierLabel`: точные тексты.
- `decideLockState`: парковка при несоответствии без бэкапа; `reset-excess` при существующем бэкапе; `restore` при достаточном тарифе; `none` в корректных случаях; `none` + сохранение баннера при припаркованном бэкапе и недостаточном тарифе.

**`lib/__tests__/storage.test.ts` (расширение):** roundtrip `saveLocked`/`loadLocked`, `clearLocked`, невалидный payload → `null`.

**Валидация вручную:** `pnpm test`, `pnpm build`; затем сценарии:
1. Гость (free) с сохранённым портфелем > 2 активов → перезагрузка: баннер «…тарифу «Базовый»…», рабочий стол пуст, копия в `portfolioRebalancerLockedData`.
2. `update public.profiles set tier='basic' where email=...;` → пользователь перезагружает страницу → портфель восстановлен, баннер исчез, ключ бэкапа очищен.
3. Тариф pro → free при портфеле с группами → баннер «…тарифу «Про»…».
4. Импорт файла с 5 активами на free → немедленная парковка/сброс + баннер.
5. Вход (SIGNED_IN) с поднятым тарифом → восстановление без перезагрузки; выход (SIGNED_OUT, free) с большим портфелем → повторная парковка.

## Implementation Order

1. **Ядро:** создать `lib/portfolio-tier.ts` (константы, `computeRequiredTier`, `isTierSufficient`, `getTierLabel`, `buildLockMessage`, `LockDecision`, `decideLockState`).
2. **Хранилище:** добавить в `lib/storage.ts` `LOCKED_STORAGE_KEY` / `LOCKED_DATA_VERSION` / `saveLocked` / `loadLocked` / `clearLocked`.
3. **Тесты ядра:** `lib/__tests__/portfolio-tier.test.ts` + расширение `storage.test.ts`; прогнать `pnpm test`.
4. **UI-интеграция:** `components/portfolio-rebalancer.tsx` — хелперы, guard-эффект, состояние `lock`, расширение `Banner` (проп `action`), баннер с кнопкой «Оплатить подписку».
5. **Документация:** `README.md` — описание поведения, ключи localStorage, порядок ручной проверки.
6. **Финальная проверка:** `pnpm test`, `pnpm build`, ручные сценарии из раздела Testing.
