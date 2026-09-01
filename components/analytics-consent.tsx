"use client"

import { useEffect, useState } from "react"
import { Analytics } from "@vercel/analytics/next"
import {
  COOKIE_CONSENT_CHANGE_EVENT,
  COOKIE_CONSENT_KEY,
  readCookieConsent,
  type CookieConsentChoice,
} from "@/lib/cookie-consent"

/**
 * «Воротник» для Vercel Analytics: подключает трекинг только после явного
 * согласия пользователя (выбор «Принять» в баннере cookie-consent).
 *
 * «Глупый» рендерер: решение «включать ли аналитику» принимает слой логики
 * (readCookieConsent) и событие изменения согласия. На сервере и при первом
 * рендере ничего не выводится — гидратация без рассинхрона; в dev-режиме
 * аналитика не загружается вовсе.
 */
export function AnalyticsConsent() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    // Уже принятое ранее согласие подключает аналитику сразу при загрузке.
    setEnabled(readCookieConsent(window.localStorage) === "accepted")

    // Мгновенная реакция на выбор в текущей вкладке (баннер cookie-consent).
    const handleConsentChange = (event: Event) => {
      setEnabled((event as CustomEvent<CookieConsentChoice>).detail === "accepted")
    }
    window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, handleConsentChange)

    // Синхронизация между вкладками: решение, принятое в другой вкладке.
    const handleStorage = (event: StorageEvent) => {
      if (event.key === COOKIE_CONSENT_KEY) {
        setEnabled(event.newValue === "accepted")
      }
    }
    window.addEventListener("storage", handleStorage)

    return () => {
      window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, handleConsentChange)
      window.removeEventListener("storage", handleStorage)
    }
  }, [])

  if (process.env.NODE_ENV !== "production" || !enabled) return null

  return <Analytics />
}