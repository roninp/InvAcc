import { NextResponse } from "next/server"
import { isFinamConfigured } from "@/lib/finam-proxy"

/** Проверка работоспособности API и готовности Finam-провайдера. GET /api/health */
export async function GET() {
  return NextResponse.json({ ok: true, finamConfigured: isFinamConfigured() })
}