/**
 * What delivery costs, decided in one place.
 *
 * The admin sets a delivery price for each country (see /admin/delivery). A
 * country with a price is charged that price at checkout. A country with no
 * price is "to be confirmed": the buyer is told the cost after ordering, and it
 * is not part of the total.
 *
 * The checkout page and the server both call deliveryQuote with the same price
 * list, so the figure on screen is the figure charged.
 */

/** Naira per country, keyed by ISO alpha-2. Missing keys are "to be confirmed". */
export type DeliveryPrices = Record<string, number>

/** Countries that get the Nigerian local method, as ISO alpha-2. */
export const LOCAL_DELIVERY_COUNTRIES = ["NG"] as const

export function isLocalDeliveryCountry(countryCode: string | undefined) {
  const normalized = countryCode?.trim().toUpperCase()
  if (!normalized) return false
  return (LOCAL_DELIVERY_COUNTRIES as readonly string[]).includes(normalized)
}

/** An address outside Nigeria. */
export function isAbroadAddress(countryCode: string | undefined) {
  return Boolean(countryCode) && !isLocalDeliveryCountry(countryCode)
}

export interface DeliveryQuote {
  /** Naira charged at checkout. Zero when confirmed later. */
  fee: number
  /** True when the buyer is told the cost after ordering. */
  confirmLater: boolean
}

/**
 * What a delivery method costs this order going to this country.
 *
 * method is "pickup", "local" or "courier". Kept as a plain string so this
 * module does not depend on the shipping method list.
 */
export function deliveryQuote(
  method: string,
  countryCode: string | undefined,
  prices: DeliveryPrices
): DeliveryQuote {
  if (method === "pickup") {
    return { fee: 0, confirmLater: false }
  }

  const code = countryCode?.trim().toUpperCase() ?? "NG"
  const price = prices[code]

  if (price === undefined || !Number.isFinite(price) || price < 0) {
    return { fee: 0, confirmLater: true }
  }

  return { fee: price, confirmLater: false }
}

/** Keeps only valid rows from the database or the API. */
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
