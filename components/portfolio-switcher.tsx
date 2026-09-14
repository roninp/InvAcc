"use client"

import { useState } from "react"
import { Check, Pencil, Plus, Trash2, X } from "lucide-react"
import type { Portfolio } from "@/lib/types"

export function PortfolioSwitcher({
  portfolios,
  activePortfolioId,
  canAdd,
  onSelect,
  onAdd,
  onRename,
  onDelete,
}: {
  portfolios: Portfolio[]
  activePortfolioId: number
  canAdd: boolean
  onSelect: (id: number) => void
  onAdd: (name: string) => void
  onRename: (id: number, name: string) => void
  onDelete: (id: number) => void
}) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState("")
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [draftName, setDraftName] = useState("")

  const single = portfolios.length <= 1

  const startAdd = () => {
    setAdding(true)
    setDraftName(`Портфель ${portfolios.length + 1}`)
  }
  const commitAdd = () => {
    const n = draftName.trim()
    if (n) onAdd(n)
    setAdding(false)
    setDraftName("")
  }
  const startRename = (p: Portfolio) => {
    setEditingId(p.id)
    setDraft(p.name)
    setConfirmDeleteId(null)
  }
  const commitRename = (id: number) => {
    const n = draft.trim()
    if (n) onRename(id, n)
    setEditingId(null)
    setDraft("")
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {portfolios.map((p) => {
          const active = p.id === activePortfolioId
          return (
            <div
              key={p.id}
              className={`group inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40"
              }`}
            >
              {editingId === p.id ? (
                <>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(p.id)
                      if (e.key === "Escape") setEditingId(null)
                    }}
                    autoFocus
                    className="w-28 rounded border border-input bg-background px-1 py-0.5 text-sm outline-none"
                  />
                  <button onClick={() => commitRename(p.id)} className="text-primary" aria-label="Сохранить имя">
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-muted-foreground" aria-label="Отменить">
                    <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </button>
                </>
              ) : confirmDeleteId === p.id ? (
                <>
                  <span className="text-xs">Удалить?</span>
                  <button onClick={() => onDelete(p.id)} className="text-negative" aria-label="Подтвердить удаление">
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </button>
                  <button onClick={() => setConfirmDeleteId(null)} className="text-muted-foreground" aria-label="Отменить">
                    <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => onSelect(p.id)} className="max-w-[10rem] truncate font-medium">
                    {p.name}
                  </button>
                  <button
                    onClick={() => startRename(p)}
                    className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Переименовать"
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => (single ? undefined : setConfirmDeleteId(p.id))}
                    disabled={single}
                    className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Удалить портфель"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                </>
              )}
            </div>
          )
        })}

        {adding ? (
          <div className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-card px-3 py-1.5 text-sm">
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitAdd()
                if (e.key === "Escape") setAdding(false)
              }}
              autoFocus
              className="w-28 rounded border border-input bg-background px-1 py-0.5 text-sm outline-none"
            />
            <button onClick={commitAdd} className="text-primary" aria-label="Создать">
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
            <button onClick={() => setAdding(false)} className="text-muted-foreground" aria-label="Отменить">
              <X className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
          </div>
        ) : (
          <button
            onClick={startAdd}
            disabled={!canAdd}
            title={canAdd ? "Добавить портфель" : "Только на тарифе Про"}
            className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Добавить портфель
          </button>
        )}
      </div>
      {!canAdd && (
        <p className="text-xs font-normal text-muted-foreground">Новые портфели доступны на тарифе «Про» (до 7).</p>
      )}
    </div>
  )
}