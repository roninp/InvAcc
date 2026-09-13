"use client"

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react"

interface NumericInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: number | null
  onChange: (value: number) => void
  isInteger?: boolean
  onEmptyChange?: (isEmpty: boolean) => void
  /** Передавать значение onChange сразу при вводе, не дожидаясь потери фокуса. */
  live?: boolean
  /** Отображать значение 0 как пустое поле (по умолчанию показывается «0»). */
  emptyOnZero?: boolean
}

/**
 * Интеллектуальное числовое поле ввода. Логика ввода сохранена из оригинала.
 */
export function NumericInput({ value, onChange, isInteger = false, onEmptyChange, live = false, emptyOnZero = false, ...inputProps }: NumericInputProps) {
  const formatRaw = (v: number | null) => (emptyOnZero && v === 0 ? "" : v != null ? String(v) : "")
  const [rawValue, setRawValue] = useState(formatRaw(value))
  const [isFocused, setIsFocused] = useState(false)
  const onEmptyChangeRef = useRef(onEmptyChange)
  onEmptyChangeRef.current = onEmptyChange

  useEffect(() => {
    // Пока пользователь печатает — не затирать набираемое значение внешними изменениями prop.
    if (!isFocused) {
      setRawValue(formatRaw(value))
    }
    if (value != null && value !== 0) {
      onEmptyChangeRef.current?.(false)
    }
  }, [value, isFocused])

  const parseRaw = (v: string) => {
    if (v === "") return 0
    const parsed = isInteger ? parseInt(v, 10) : parseFloat(v)
    return isNaN(parsed) ? 0 : parsed
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    if (isInteger) {
      if (v === "" || /^\d+$/.test(v)) {
        setRawValue(v)
        if (live) onChange(parseRaw(v))
        onEmptyChange?.(v === "")
      }
    } else {
      if (v === "" || /^\d+\.?\d*$/.test(v) || /^\d*\.?\d+$/.test(v)) {
        setRawValue(v)
        if (live) onChange(parseRaw(v))
        onEmptyChange?.(v === "")
      }
    }
  }

  const handleBlur = () => {
    setIsFocused(false)
    const trimmed = rawValue.trim()
    if (trimmed === "") {
      onChange(0)
      setRawValue("0")
      return
    }
    const num = parseRaw(trimmed)
    onChange(num)
    setRawValue(String(num))
    onEmptyChange?.(false)
  }

  return (
    <input
      type="text"
      inputMode={isInteger ? "numeric" : "decimal"}
      value={rawValue}
      onChange={handleChange}
      onFocus={() => setIsFocused(true)}
      onBlur={handleBlur}
      {...inputProps}
    />
  )
}
