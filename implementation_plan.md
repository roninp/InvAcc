# Implementation Plan

**Цель:** добиться абсолютно единой типографики во всех трёх маршрутах (Home / Portfolio / Settings), стандартизировав Page Headers, Card/Section-заголовки, описания, подписи полей и кнопки по одной семантической карте, с приведением светлых значений семантических токенов к палитре Slate (900/700/500).

**Подход:** правки только в `className` у текстовых элементов + токены в `app/globals.css`. Логика, структура, API не меняются.

## Types
Новых типов нет. Вводится один семантический цветовой токен `--label` для уровня Slate-700.

## Semantic Mapping (итоговая карта)
| Роль | Классы | Токен (светлая тема) |
|---|---|---|
| Page Title (каждая страница) | `text-2xl font-semibold text-foreground` | foreground = `#0f172a` (slate-900) |
| Page Subtitle | `mt-1 text-sm font-normal text-muted-foreground` | muted-foreground = `#64748b` (slate-500) |
| Card/Section Title | `text-base font-semibold text-foreground` | foreground |
| Card Description / Hint | `text-xs font-normal text-muted-foreground` | muted-foreground |
| Form Label / Standard Row | `text-sm font-normal text-label` | label = `#334155` (slate-700) |
| Button text | `text-sm font-medium` | — |

## Files

### 1. `app/globals.css`
- `:root` (light): `--foreground` → `#0f172a` (slate-900); `--muted-foreground` → `#64748b` (slate-500); added `--label: #334155` (slate-700).
- `.dark`: added `--label: #cbd5e1` (slate-300).
- `@theme inline`: added `--color-label: var(--label)`.

### 2. `components/home-page.tsx`
- Hero H2 → `text-2xl font-semibold text-foreground`; subtitle → `mt-1 text-sm font-normal text-muted-foreground`.
- Section H3 → `text-2xl font-semibold text-foreground`; subtitle → `mt-1 text-sm font-normal text-muted-foreground`.
- Tariff card description → `text-xs font-normal text-muted-foreground`; features → `text-sm font-normal text-label`.

### 3. `components/portfolio-rebalancer.tsx`
- Added Page Header («Портфель» + субтитр); «Как использовать» → `text-base font-semibold text-foreground`.

### 4. `components/portfolio-summary.tsx`
- Metric card titles → `text-base font-semibold text-foreground`; hints → `text-xs font-normal text-muted-foreground`.

### 5. `components/group-allocations.tsx`
- «Доли групп в портфеле» → `text-base font-semibold text-foreground`.

### 6. `components/settings-page.tsx`
- H2 → `text-2xl`; subtitle → `text-sm font-normal`; sections → `text-base font-semibold`; descriptions → `text-xs font-normal`; selector cards → `text-base font-semibold`; form labels → `text-sm font-normal text-label`.

### Не трогаем
- `asset-table.tsx` / `asset-row.tsx` / `app-header.tsx` / `numeric-input.tsx` / `ui/button.tsx`.

## Functions / Classes / Dependencies
Изменений нет — только className и CSS-токены.

## Testing
- `pnpm build` / `tsc --noEmit`; визуальная проверка трёх маршрутов.

## Implementation Order
1. `app/globals.css` — токены Slate. 2. `portfolio-rebalancer.tsx` — Page Header. 3. `home-page.tsx`. 4. `portfolio-summary.tsx`. 5. `group-allocations.tsx`. 6. `settings-page.tsx`. 7. Сборка и валидация.
