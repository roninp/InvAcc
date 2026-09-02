"use client"

import { useRef, useState } from "react"
import { Check, Pencil, Plus, Trash2, X } from "lucide-react"
import type { PortfolioMeta } from "@/lib/types"

/**
 * Панель управления портфелями на странице «Портфель».
 * «Глупый» рендерер: без бизнес-логики — все действия проброшены наверх.
 * Родитель пересоздаёт компонент через `key={id}` при смене портфеля,
 * поэтому локальное состояние редактирования всегда соответствует текущему.
 */
export function PortfolioManager({
  portfolio,
  count,
  max,
  canCreate,
  canDelete,
  onCreate,
  onRename,
  onDelete,
}: {
  portfolio: PortfolioMeta
  count: number
  max: number
  canCreate: boolean
  canDelete: boolean
  onCreate: () => void
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftName, setDraftName] = useState(portfolio.name)
  const inputRef = useRef<HTMLInputElement>(null)

  const startEditing = () => {
    setDraftName(portfolio.name)
    setIsEditing(true)
    // Фокус и выделение имени в следующем кадре после монтирования инпута.
    requestAnimationFrame(() => inputRef.current?.select())
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setDraftName(portfolio.name)
  }

  const submitRename = (e: React.FormEvent) => {
    e.preventDefault()
    const name = draftName.trim()
    if (!name) return
    onRename(name)
    setIsEditing(false)
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        {isEditing ? (
          <form className="flex items-center gap-2" onSubmit={submitRename}>
            <input
              ref={inputRef}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={40}
              className="w-52 rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm font-medium text-foreground outline-none transition-shadow focus:ring-2 focus:ring-ring/40"
              aria-label="Название портфеля"
            />
            <button
              type="submit"
              disabled={!draftName.trim()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-positive-muted text-positive transition-colors hover:bg-positive/20 disabled:cursor-not-allowed disabled:opacity-40"
              title="Сохранить название"
              aria-label="Сохранить название"
            >
              <Check className="h-4 w-4" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={cancelEditing}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Отменить"
              aria-label="Отменить"
            >
              <X className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </form>
        ) : (
          <>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">{portfolio.name}</h2>
            <button
              type="button"
              onClick={startEditing}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Переименовать портфель"
              aria-label="Переименовать портфель"
            >
              <Pencil className="h-4 w-4" strokeWidth={2} />
            </button>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {count} из {max}
        </span>
        <button
          type="button"
          onClick={onCreate}
          disabled={!canCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3.5 py-2 text-sm font-medium text-background transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          title={canCreate ? "Создать новый портфель" : `На этом тарифе доступно не более ${max} портфелей`}
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Новый портфель
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-negative-muted hover:text-negative disabled:cursor-not-allowed disabled:opacity-40"
          title={canDelete ? "Удалить текущий портфель" : "Нельзя удалить последний портфель"}
        >
          <Trash2 className="h-4 w-4" strokeWidth={2} />
          Удалить
        </button>
      </div>
    </div>
  )
}