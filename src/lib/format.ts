export function formatCurrency(amount: number) {
  const value = Number.isFinite(amount) ? amount : 0
  try {
    // minimumFractionDigits must be set alongside maximumFractionDigits: older
    // browsers (iOS 14-era Safari) throw a RangeError when the maximum is below
    // the currency's default minimum of 2, which crashed the page after payment.
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  } catch {
    return `₦${Math.round(value).toLocaleString()}`
  }
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-NG", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value)
}

export function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "Today"
  }

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium"
  }).format(date)
}

export function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "Today"
  }

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date)
}

export function formatCategory(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
