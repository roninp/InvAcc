/** Форматирование денежной суммы в рублях с разделителями тысяч. */
export function formatRub(value: number, decimals = 2): string {
  return (
    new Intl.NumberFormat("ru-RU", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value) + " ₽"
  )
}

/** Форматирование числа с разделителями тысяч. */
export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}
