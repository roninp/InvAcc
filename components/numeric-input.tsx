"use client"

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react"

interface NumericInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: number | null
  onChange: (value: number) => void
  isInteger?: boolean
  onEmptyChange?: (isEmpty: boolean) => void
  /** Срабатывает на каждый валидный ввод ещё до blur. Позволяет родителю реагировать на ввод в реальном времени. */
  onLiveChange?: (value: number) => void
}

/**
 * Интеллектуальное числовое поле ввода. Логика ввода сохранена из оригинала.
 */
export function NumericInput({ value, onChange, isInteger = false, onEmptyChange, onLiveChange, ...inputProps }: NumericInputProps) {
  const [rawValue, setRawValue] = useState(value != null ? String(value) : "")
  const onEmptyChangeRef = useRef(onEmptyChange)
  onEmptyChangeRef.current = onEmptyChange
  const onLiveChangeRef = useRef(onLiveChange)
  onLiveChangeRef.current = onLiveChange

  useEffect(() => {
    setRawValue(value != null ? String(value) : "")
    if (value != null && value !== 0) {
      onEmptyChangeRef.current?.(false)
    }
    onLiveChangeRef.current?.(value ?? 0)
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    if (isInteger) {
      if (v === "" || /^\d+$/.test(v)) {
        setRawValue(v)
        onEmptyChange?.(v === "")
        onLiveChangeRef.current?.(v === "" ? 0 : Number.parseInt(v, 10))
      }
    } else {
      if (v === "" || /^\d+\.?\d*$/.test(v) || /^\d*\.?\d+$/.test(v)) {
        setRawValue(v)
        onEmptyChange?.(v === "")
        onLiveChangeRef.current?.(v === "" ? 0 : Number.parseFloat(v))
      }
    }
  }

  const handleBlur = () => {
    const trimmed = rawValue.trim()
    if (trimmed === "") {
      onChange(0)
      setRawValue("0")
      onLiveChangeRef.current?.(0)
      return
    }
    const parsed = isInteger ? Number.parseInt(trimmed, 10) : Number.parseFloat(trimmed)
    const num = isNaN(parsed) ? 0 : parsed
    onChange(num)
    setRawValue(String(num))
    onEmptyChange?.(false)
    onLiveChangeRef.current?.(num)
  }

  return (
    <input
      type="text"
      inputMode={isInteger ? "numeric" : "decimal"}
      value={rawValue}
      onChange={handleChange}
      onBlur={handleBlur}
      {...inputProps}
    />
  )
}
