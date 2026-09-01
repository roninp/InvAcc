"use client"

import { useEffect, useState } from "react"
import { Cookie } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  COOKIE_CONSENT_CHANGE_EVENT,
  readCookieConsent,
  saveCookieConsent,
  type CookieConsentChoice,
} from "@/lib/cookie-consent"

/**
 * Баннер согласия на использование cookie.
 *
 * «Глупый» рендерер: стратегию показа и сохранение выбора делегирует слою логики
 * (readCookieConsent / saveCookieConsent). На серверном рендере скрыт — значение
 * читается только в useEffect, поэтому при гидратации нет рассинхрона разметки.
 */
export function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Согласие хранится на устройстве; баннер показываем, только если выбор ещё не сделан.
    if (readCookieConsent(window.localStorage) === null) {
      setVisible(true)
    }
  }, [])

  const handleChoice = (choice: CookieConsentChoice) => {
    saveCookieConsent(window.localStorage, choice)
    // Оповещаем остальные компоненты (например, подключение аналитики)
    // о смене выбора в текущей вкладке.
    window.dispatchEvent(
      new CustomEvent<CookieConsentChoice>(COOKIE_CONSENT_CHANGE_EVENT, { detail: choice }),
    )
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label="Использование cookie"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xl"
    >
      <div className="animate-fade-in-up flex items-start gap-3 rounded-2xl border border-border bg-card/95 p-4 shadow-lg shadow-black/5 backdrop-blur sm:items-center sm:gap-4 sm:p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
          <Cookie className="h-5 w-5" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-relaxed text-foreground">
            Мы используем файлы cookie, чтобы сайт работал корректно, а также для аналитики и
            улучшения сервиса. Нажимая «Принять», вы соглашаетесь с их использованием.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => handleChoice("accepted")}>
              Принять
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handleChoice("rejected")}>
              Отклонить
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}