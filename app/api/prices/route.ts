import { NextRequest, NextResponse } from "next/server"
import { fetchFinamPrices } from "@/lib/finam-proxy"

/**
 * Получение цен и лотов по списку тикеров (single-origin аналог express-роута).
 * GET /api/prices?tickers=SBER,GAZP,...
 * Ответ: { prices: (number|null)[], lotSizes: (number|null)[], errors: string[] }.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("tickers")
  if (!raw) {
    return NextResponse.json({ error: "Параметр tickers обязателен" }, { status: 400 })
  }

  const tickers = raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean)

  // Ядро Finam-прокси возвращает стабильный Result-контракт (никогда не бросает исключений)
  const result = await fetchFinamPrices(tickers)
  return NextResponse.json(result)
}