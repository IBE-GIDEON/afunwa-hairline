import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export function createPaymentReference() {
  return `LOL-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Keeps `?next=` redirects inside the app. Anything protocol-relative or
 * absolute falls back to the home feed so the login page can't be used to
 * bounce shoppers to an external site.
 */
export function safeInternalPath(
  value?: string | string[] | null,
  fallback = "/"
) {
  const path = firstParam(value)
  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return fallback
  }

  return path
}

/**
 * The first value of a query parameter. A link that repeats a parameter
 * (?next=a&next=b) hands the page an array, and calling string methods on it
 * crashed the page.
 */
export function firstParam(value?: string | string[] | null) {
  if (Array.isArray(value)) return value[0]
  return value ?? undefined
}
