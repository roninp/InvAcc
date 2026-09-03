# Implementation Plan

## Overview
Добавить проверку инструментов на принадлежность к **срочному отделу Московской биржи** (движок `futures`: фьючерсы, опционы и прочие производные): такие активы **нельзя использовать** — они подсвечиваются и блокируются сразу при вводе тикера, исключаются из загрузки цен, а на экране показывается информационное сообщение, что система производит расчёт **только для фондового сектора Московской биржи**.

**Контекст и подход.** Активы идентифицируются по `ticker` (`Asset` в `lib/types.ts`), единственная точка сетевого взаимодействия — `handleRefreshPrices` в `components/portfolio-rebalancer.tsx`; флаг производного инструмента никогда не персистится — пересчитывается по требованию. Детекция использует MOEX ISS: `GET /iss/engines/futures/markets/{forts|options}/securities/{TICKER}.json` возвращает **HTTP 200 даже для несуществующего secid, но с пустым `securities.data`** (проверено вживую: `SiZ6` → непустой `data` с `BOARDID=RFUD`, `ZZZZZZZZZ` → пустой). Поэтому критерий «срочный инструмент» = `securities.data.length > 0`, НЕ HTTP-статус. Кэш результатов на сессию (сектор тикера не меняется). UI-слой остаётся «глухим»: решает, как показать, а классификацию выполняет сервис слоя логики (`lib/derivative-service.ts`), блокировка реализуется «не применять цену и не показывать ошибку загрузки для заблокированных тикеров».

## Types
Изменений в `lib/types.ts` **нет** (флаг не персистится, `Asset` не расширяется). В `lib/derivative-service.ts` появляются:
- константа `DERIVATIVE_SECTOR_STATEMENT = "Система производит расчёт только для фондового сектора Московской биржи"` — единый текст для сообщений;
- модульный кэш `const derivativeCache = new Map<string, boolean>()` (ключ — тикер в верхнем регистре);
- сигнатура детектора: `isDerivativeTicker(ticker: string): Promise<boolean>` и `filterDerivativeTickers(tickers: string[]): Promise<string[]>` (возвращает ВЕРХНИЙ регистр; нормализует сама);
- чистая функция `parseHasRows(data: unknown): boolean` — `data.securities.data` — непустой массив;
- чистая функция `buildDerivativeSectorMessage(tickers: string[]): string`.

## Files

**Новые:**
- **`lib/derivative-service.ts`** — слой логики (без UI): `MoexDerivativeService` + `buildDerivativeSectorMessage` + приватный кэш.
- **`lib/__tests__/derivative-service.test.ts`** — unit-тесты (чистые функции + `isDerivativeTicker` с `vi.stubGlobal("fetch")`).

**Изменяемые:**

| Файл | Изменения |
|---|---|
| `components/portfolio-rebalancer.tsx` | Стейт `derivativeTickers: Set<string>`, `sectorNotice: string \| null`; ref `sectorCheckTimersRef` (debounce по `asset.id`); хелперы `scheduleSectorCheck`/`scheduleSectorChecksForAssets`; вызовы в `handleUpdateAsset` (изменение тикера → debounce 600 мс), в `applyPortfolioData` и в hydration-эффекте; `handleRefreshPrices` — не применять цену/лот и скрывать ошибки для заблокированных тикеров, ставить `sectorNotice`; рендер инфо-баннера; текст пустого состояния. |
| `components/asset-table.tsx` | Новый проп `derivativeTickers: ReadonlySet<string>`; для каждой строки `isDerivative={derivativeTickers.has(asset.ticker.trim().toUpperCase())}`. |
| `components/asset-row.tsx` | Новый проп `isDerivative: boolean`; подсветка строки (`bg-negative-muted/40`) и бейдж «Срочный рынок» с иконкой и `title`. |
| `README.md` | Раздел «Фондовый сектор vs срочный рынок»; строка о новом тесте в списке файлов тестов. |

**На удаление:** нет.

## Functions

**Новые (чистая логика, `lib/derivative-service.ts`):**
- `buildDerivativeSectorMessage(tickers: string[]): string` — ед./мн. число: `Актив «SiZ6» относится к срочному рынку Московской биржи (фьючерсы, опционы). Система производит расчёт только для фондового сектора Московской биржи — инструмент исключён из расчёта.` / аналогично во мн. числе.
- `parseHasRows(data: unknown): boolean` — критерий «инструмент существует на этой площадке» (квир ISS: 200, но пустой `data`).
- `MoexDerivativeService.buildSecurityUrl(ticker, market): string`.
- `MoexDerivativeService.checkTickerRaw(ticker): Promise<boolean>` — без кэша: последовательный обход `DERIVATIVE_MARKETS = ["forts", "options"]`, `AbortSignal.timeout(5000)`, сетевые сбои → `false`.
- `MoexDerivativeService.isDerivativeTicker(ticker): Promise<boolean>` — нормализация, кэш.
- `MoexDerivativeService.filterDerivativeTickers(tickers): Promise<string[]>` — дедупликация, `Promise.all`, никогда не бросает.
- `MoexDerivativeService.clearCache(): void` — для тестов.

**Новые (компонент `portfolio-rebalancer.tsx`):**
- `scheduleSectorCheck(assetId: number, ticker: string)` — отмена старого таймера для `assetId`, debounce 600 мс → `isDerivativeTicker` → атомарное обновление `derivativeTickers`.
- `scheduleSectorChecksForAssets(assetsList: Asset[])` — сброс таймеров и флагов, запуск проверок по списку.

**Изменённые:**
- `handleUpdateAsset` — при смене `ticker` снять флаг старого тикера и вызвать `scheduleSectorCheck`;
- `applyPortfolioData` и hydration `useEffect` — вызов `scheduleSectorChecksForAssets`;
- `handleRemoveAsset` — снять флаг удалённого тикера;
- `handleRefreshPrices` — не применять цену/лот и скрывать ошибки для заблокированных тикеров; `setSectorNotice(...)`;
- рендер — инфо-баннер рядом с `notice`; эффект снятия баннера при пустом `derivativeTickers`.

## Classes
Новый класс: **`MoexDerivativeService`** (только static-методы, паттерн `MoexPriceService`). Существующие классы не модифицируются.

## Dependencies
Новых npm-пакетов не требуется. Иконки `Info`/`AlertTriangle` уже импортируются в `portfolio-rebalancer.tsx`; в `asset-row.tsx` добавится импорт `Info` из установленной `lucide-react`. Всё остальное — нативный `fetch` в браузере.

## Testing

**`lib/__tests__/derivative-service.test.ts`** (мок `fetch` через `vi.stubGlobal`, сброс `clearCache()`):
- `parseHasRows`: пустой `securities.data` → `false`; непустой → `true`;
- `buildSecurityUrl`: корректный URL и кодирование опционных secid с пробелом;
- `buildDerivativeSectorMessage`: единственное/множественное число, дедупликация;
- `isDerivativeTicker`: фьючерс → `true`; опцион → `true`; неизвестный secid (200 с пустым `data`) → `false`; сетевая ошибка → `false`;
- кэш: повторный вызов не делает лишний `fetch`.

**Существующие тесты:** не меняются.

**Валидация:** `pnpm test`; `npx tsc --noEmit` (в `next.config.ts` стоит `typescript.ignoreBuildErrors: true`, поэтому `pnpm build` типы не проверяет); `pnpm build`; ручные сценарии.

## Implementation Order
1. `lib/derivative-service.ts` — новый сервис и чистые функции.
2. `lib/__tests__/derivative-service.test.ts` — тесты; прогнать.
3. `components/asset-row.tsx` (+`isDerivative`) и `components/asset-table.tsx` (+`derivativeTickers`).
4. `components/portfolio-rebalancer.tsx` — стейт/ref, `scheduleSectorCheck`, интеграция, инфо-баннер, текст пустого состояния.
5. `README.md` — документация.
6. `pnpm test` → `npx tsc --noEmit` → `pnpm build` → ручные сценарии.