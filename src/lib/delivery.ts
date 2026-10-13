/**
 * What delivery costs, decided in one place.
 *
 * The platform sets the delivery price, not each seller, so every order is
 * priced the same way. The checkout page shows this figure and the server
 * charges it, and both call deliveryQuote, so the two cannot drift apart.
 *
 * Nigeria: one flat fee, waived once the basket reaches the free-delivery
 * amount. Both numbers come from NEXT_PUBLIC_DELIVERY_FEE_NGN and
 * NEXT_PUBLIC_DELIVERY_FREE_OVER_NGN. If the fee is not set yet, the delivery
 * cost is confirmed with the buyer after ordering rather than guessed.
 *
 * Outside Nigeria: the cost is confirmed with the buyer after ordering and is
 * not part of the total.
 */

/** Countries delivered at the flat Nigerian rate, as ISO alpha-2. */
export const LOCAL_DELIVERY_COUNTRIES = ["NG"] as const

export function isLocalDeliveryCountry(countryCode: string | undefined) {
  const normalized = countryCode?.trim().toUpperCase()
  if (!normalized) return false
  return (LOCAL_DELIVERY_COUNTRIES as readonly string[]).includes(normalized)
}

/** An address outside the countries we deliver to at the flat rate. */
export function isAbroadAddress(countryCode: string | undefined) {
  return Boolean(countryCode) && !isLocalDeliveryCountry(countryCode)
}

function parseNaira(value: string | undefined) {
  if (value === undefined || value.trim() === "") return null
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) return null
  return Math.round(amount * 100) / 100
}

// Literal process.env reads, so Next.js inlines them into the browser bundle.
const LOCAL_FEE = parseNaira(process.env.NEXT_PUBLIC_DELIVERY_FEE_NGN)
const LOCAL_FREE_OVER = parseNaira(process.env.NEXT_PUBLIC_DELIVERY_FREE_OVER_NGN)

export interface DeliveryQuote {
  /** Naira charged at checkout. Zero when confirmed later. */
  fee: number
  /** True when the buyer is told the cost after ordering. */
  confirmLater: boolean
  /** How the figure was reached, stored on the order. */
  source: "pickup" | "free" | "flat" | "confirm"
}

/**
 * What a delivery method costs this basket going to this country.
 *
 * method is one of "pickup", "local" or "courier". Kept as a plain string so
 * this module does not depend on the shipping method list.
 */
export function deliveryQuote(
  method: string,
  itemsTotal: number,
  countryCode: string | undefined
): DeliveryQuote {
  if (method === "pickup") {
    return { fee: 0, confirmLater: false, source: "pickup" }
  }

  if (method === "courier" || isAbroadAddress(countryCode)) {
    return { fee: 0, confirmLater: true, source: "confirm" }
  }

  if (LOCAL_FEE === null) {
    return { fee: 0, confirmLater: true, source: "confirm" }
  }

  if (LOCAL_FREE_OVER !== null && itemsTotal >= LOCAL_FREE_OVER) {
    return { fee: 0, confirmLater: false, source: "free" }
  }

  return { fee: LOCAL_FEE, confirmLater: false, source: "flat" }
}

/** How much more is needed before Nigerian delivery is free, if ever. */
export function amountToFreeDelivery(itemsTotal: number) {
  if (LOCAL_FREE_OVER === null) return 0
  if (itemsTotal >= LOCAL_FREE_OVER) return 0
  return Math.round((LOCAL_FREE_OVER - itemsTotal) * 100) / 100
}
