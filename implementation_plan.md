# Implementation Plan

**Цель:** математически выровнять типографику инвестиционного приложения по строгой модульной шкале «Малая терция» (×1.200) от базы `1rem` (16px), переопределив дизайн-токены шрифтов в Tailwind CSS v4 (`@theme inline` в `app/globals.css`), заменив все произвольные размеры (`text-[11px]`, `text-[15px]`, `text-[0.8rem]`, `text-3xl`) семантическими токенами (`text-xs … text-2xl`) и гарантировав табличное выравнивание цифр (`.tabular-nums`) в таблицах данных.

**Контекст:** Next.js 16 (App Router), Tailwind CSS v4, shadcn/base-nova. Шрифты задаются в `app/layout.tsx` (`--font-geist-sans/--font-geist-mono`). Токены темы живут в `@theme inline` (`app/globals.css:7-63`) по конвенции `--color-*`/`--radius-*`; шрифтовая шкала добавляется как `--font-size-*` и `--tracking-tight`. `body` уже имеет `font-feature-settings: "cv01","cv03","ss01"` — пункт «Аудит» выполнен.

**Масштаб:** только CSS-токены и строки классов; структура, логика, API и состояние компонентов не меняются. Правки затронули 6 компонентов + CSS.

## Types
Новых типов нет. Шкала (base 1rem × 1.200):
- `xs` = 0.75rem (12px) · `sm` = 0.875rem (14px) · `base` = 1rem (16px) · `lg` = 1.2rem (19.2px) · `xl` = 1.44rem (23px) · `2xl` = 1.728rem (27.6px)

## Files
- **Изменён `app/globals.css`** — в `@theme inline` после `--font-mono` добавлены `--font-size-xs/sm/base/lg/xl/2xl` и `--tracking-tight: -0.01em`.
- **Изменён `components/app-header.tsx`** — `text-[15px]` → `text-base` (заголовок бренда).
- **Изменён `components/asset-row.tsx`** — `text-[11px]` → `text-xs` (сумма корректировки); добавлен `tabular-nums` для цены лота `/ {lotPrice}`.
- **Изменён `components/asset-table.tsx`** — `text-[11px]` → `text-xs` (кнопка «Ко всем»).
- **Изменён `components/ui/button.tsx`** — variant `sm`: `text-[0.8rem]` → `text-xs`.
- **Изменён `components/home-page.tsx`** — снят `sm:text-3xl` (hero, теперь `text-2xl`); цена тарифа `text-3xl` → `text-2xl`.
- **Изменён `components/settings-page.tsx`** — `tabular-nums` для полей комиссий (покупка/продажа).

## Functions
Изменений функций/логики нет — правятся только className и CSS-токены.

## Classes
Изменений структуры/наследования компонентов нет.

## Dependencies
Новых пакетов нет; используются токены `--font-size-*`/`--tracking-*`, соответствующие конвенции `@theme` Tailwind v4.

## Testing
Автотесты (`lib/__tests__/`) не затрагиваются. Валидация: `tsc --noEmit` / `pnpm build`, затем ручная проверка шапки, главной (hero+тарифы), таблицы ассетов, сводки, групп и настроек (иерархия размеров + вертикальное выравнивание цифр).

## Implementation Order
1. `app/globals.css` — токены шкалы.
2. `components/ui/button.tsx` — `sm` → `text-xs`.
3. `components/app-header.tsx` — `text-base`.
4. `components/asset-table.tsx` — `text-xs`.
5. `components/asset-row.tsx` — `text-xs` + `tabular-nums`.
6. `components/home-page.tsx` — снять `text-3xl`.
7. `components/settings-page.tsx` — `tabular-nums`.
8. Сборка и валидация.