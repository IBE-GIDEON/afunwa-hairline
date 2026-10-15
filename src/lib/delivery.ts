/**
 * What delivery costs, decided in one place.
 *
 * Inside Nigeria the buyer picks one named option from the admin list: pickup,
 * or a delivery option with a fixed fee. Outside Nigeria there is one
 * "International delivery" line, priced per country by the admin. A blank
 * country fee means the cost is confirmed with the buyer after ordering.
 *
 * The checkout page and the server both call resolveDelivery with the same
 * options and prices, so the figure on screen is the figure charged.
 */

/** Naira per country, keyed by ISO alpha-2. Missing keys are "to be confirmed". */
export type DeliveryPrices = Record<string, number>

export interface DeliveryOption {
  /** Stable id, e.g. "lagos_island". "pickup" is the collect-yourself option. */
  id: string
  label: string
  /** Shown under the label. For pickup, the store address. */
  detail: string
  fee: number
  active: boolean
  sortOrder: number
}

/** The order shipping method each option is stored as. */
export type StoredShippingMethod = "pickup" | "local" | "courier"

export interface DeliveryChoice {
  shippingMethod: StoredShippingMethod
  fee: number
  /** True when the buyer is told the cost after ordering. */
  confirmLater: boolean
  /** The name shown to the buyer and stored on the order. */
  label: string
}

export const PICKUP_OPTION_ID = "pickup"
export const INTERNATIONAL_LABEL = "International delivery"

/** Nigeria is the default when no country is given yet. */
export function isNigeria(countryCode: string | undefined) {
  const normalized = countryCode?.trim().toUpperCase()
  return !normalized || normalized === "NG"
}

/** An address outside Nigeria. */
export function isAbroadAddress(countryCode: string | undefined) {
  return !isNigeria(countryCode)
}

/** Only options that are switched on, in the order the admin set. */
export function activeOptions(options: DeliveryOption[]) {
  return options
    .filter((option) => option.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * The delivery the buyer gets for this choice.
 *
 * Returns null when a Nigerian buyer's option does not exist or is switched off,
 * so the caller can refuse the order rather than charge a guess.
 */
export function resolveDelivery({
  optionId,
  countryCode,
  options,
  prices
}: {
  optionId: string | undefined
  countryCode: string | undefined
  options: DeliveryOption[]
  prices: DeliveryPrices
}): DeliveryChoice | null {
  if (isAbroadAddress(countryCode)) {
    const code = countryCode!.trim().toUpperCase()
    const price = prices[code]
    if (price === undefined || !Number.isFinite(price) || price < 0) {
      return {
        shippingMethod: "courier",
        fee: 0,
        confirmLater: true,
        label: INTERNATIONAL_LABEL
      }
    }
    return {
      shippingMethod: "courier",
      fee: price,
      confirmLater: false,
      label: INTERNATIONAL_LABEL
    }
  }

  const option = activeOptions(options).find((entry) => entry.id === optionId)
  if (!option) return null

  const isPickup = option.id === PICKUP_OPTION_ID
  return {
    shippingMethod: isPickup ? "pickup" : "local",
    fee: isPickup ? 0 : option.fee,
    confirmLater: false,
    label: option.label
  }
}

/** Keeps only valid per-country rows from the database or the API. */
export function normalizeDeliveryPrices(value: unknown): DeliveryPrices {
  if (!value || typeof value !== "object") return {}

  const out: DeliveryPrices = {}
  for (const [code, raw] of Object.entries(value as Record<string, unknown>)) {
    const fee = Number(raw)
    if (/^[A-Z]{2}$/.test(code) && Number.isFinite(fee) && fee >= 0) {
      out[code] = Math.round(fee * 100) / 100
    }
  }
  return out
}

/** Keeps only well formed options from the database or the API. */
export function normalizeDeliveryOptions(value: unknown): DeliveryOption[] {
  if (!Array.isArray(value)) return []

  return value
    .map((raw) => raw as Record<string, unknown>)
    .filter((raw) => typeof raw.id === "string" && typeof raw.label === "string")
    .map((raw) => {
      const fee = Number(raw.fee ?? 0)
      return {
        id: String(raw.id),
        label: String(raw.label),
        detail: String(raw.detail ?? ""),
        fee: Number.isFinite(fee) && fee >= 0 ? Math.round(fee * 100) / 100 : 0,
        active: Boolean(raw.active),
        sortOrder: Number(raw.sortOrder ?? raw.sort_order ?? 0) || 0
      }
    })
}
