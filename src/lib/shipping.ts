import { computeDeliveryFee, type DeliveryTerms } from "@/lib/delivery"

/**
 * How an order can reach the buyer.
 *
 * One list, read by the checkout page, diagnostics and the server that prices
 * the order — so a method can never be offered at a price nobody charges, or
 * charged at a price nobody was shown.
 */
export const SHIPPING_METHODS = [
  {
    id: "pickup",
    label: "Customer pickup",
    helper: "Collect from the store yourself. Nothing to pay for shipping.",
    /** Couriers get their own colours; the plain options do not. */
    brand: null
  },
  {
    id: "local",
    label: "Local shipping",
    helper: "One price anywhere in Nigeria.",
    brand: null
  },
  {
    id: "courier",
    label: "Courier delivery",
    helper: "Courier delivery arranged by the store.",
    brand: null
  },
  {
    id: "easyship",
    label: "Courier delivery",
    helper: "Legacy courier method.",
    brand: null
  },
  {
    id: "topship",
    label: "Topship",
    helper: "Courier, tracked.",
    brand: { background: "#1B2A4E", foreground: "#FFFFFF" }
  },
  {
    id: "gig",
    label: "GIG Logistics",
    helper: "Courier, tracked.",
    brand: { background: "#E8112D", foreground: "#FFFFFF" }
  },
  {
    id: "dhl",
    label: "DHL",
    helper: "Courier, tracked. International.",
    // DHL's own pair, the one case here that is documented rather than matched
    // by eye: yellow ground, red wordmark.
    brand: { background: "#FFCC00", foreground: "#D40511" }
  }
] as const

export type ShippingMethod = (typeof SHIPPING_METHODS)[number]["id"]

export const SHIPPING_METHOD_IDS = SHIPPING_METHODS.map((method) => method.id)

export const DEFAULT_SHIPPING_METHOD: ShippingMethod = "local"

/**
 * Countries local shipping actually covers, as ISO alpha-2.
 *
 * One flat price for the whole of each. Add a country here and it appears in
 * the list beside Nigeria the moment a buyer with that address is checking
 * out — no other change needed.
 */
export const LOCAL_SHIPPING_COUNTRIES = ["NG"] as const

/**
 * Whether a method can be offered to an address in this country.
 *
 * Local shipping is the only one that is fussy: quoting a Nigerian flat rate
 * against a Ghanaian address would both read as nonsense and undercharge. An
 * unknown country is treated as allowed, since the buyer has not said yet.
 */
export function isMethodAvailableFor(
  method: ShippingMethod,
  countryCode: string | undefined
): boolean {
  if (method !== "local") return true
  if (!countryCode) return true
  return (LOCAL_SHIPPING_COUNTRIES as readonly string[]).includes(countryCode)
}

/** The methods offerable to an address in this country, in order. */
export function shippingMethodsFor(countryCode: string | undefined) {
  return SHIPPING_METHODS.filter(
    (method) => isOffered(method.id) && isMethodAvailableFor(method.id, countryCode)
  )
}

/**
 * Couriers offered on their own account, beside the aggregator.
 *
 * Empty on purpose. Manual courier delivery is the one courier option buyers
 * see, so listing direct couriers beside it would add choices that still need
 * separate contracts to mean anything.
 *
 * Put "dhl" back here the day a direct DHL rate is ready. Nothing else needs
 * changing: the buttons and diagnostics both read this list, and the DHL rate
 * call is still written.
 */
const DIRECT_COURIERS_OFFERED: ShippingMethod[] = []

function isOffered(method: ShippingMethod) {
  // The aggregator and the two plain options are always offered; a direct
  // courier only when it has been turned on above.
  if (method === "pickup" || method === "local" || method === "courier") {
    return true
  }
  return DIRECT_COURIERS_OFFERED.includes(method)
}

/** The live courier options shown to buyers and checked by diagnostics. */
export const COURIER_METHODS = SHIPPING_METHODS.filter(
  (method) => method.brand && isOffered(method.id)
)

export function isShippingMethod(value: unknown): value is ShippingMethod {
  return (
    typeof value === "string" &&
    (SHIPPING_METHOD_IDS as readonly string[]).includes(value)
  )
}

export function normalizeShippingMethod(value: unknown): ShippingMethod {
  if (value === "easyship") return "courier"
  return isShippingMethod(value) ? value : DEFAULT_SHIPPING_METHOD
}

export function getShippingMethod(id: ShippingMethod) {
  return SHIPPING_METHODS.find((method) => method.id === id) ?? SHIPPING_METHODS[1]
}

/** Legacy per-courier fallback prices. Keyed by method id. */
export type ShippingRates = Partial<Record<ShippingMethod, number>>

/**
 * What a given method costs this order.
 *
 * Pickup is always nothing — the buyer collects it. Local is the store's flat
 * fee and the only one the free-over threshold waives, because a courier costs
 * the seller real money however large the basket. A courier with no rate set
 * comes back as zero rather than as a guess.
 */
export function resolveShippingFee(
  method: ShippingMethod,
  itemsTotal: number,
  terms: DeliveryTerms,
  rates: ShippingRates | undefined
): number {
  if (method === "pickup") return 0
  if (method === "local" || method === "courier" || method === "easyship") {
    return computeDeliveryFee(itemsTotal, terms)
  }

  const rate = Number(rates?.[method] ?? 0)
  if (!Number.isFinite(rate) || rate <= 0) return 0
  return Math.round(rate * 100) / 100
}

/** Reads whatever is in the vendor_profiles.shipping_rates column safely. */
export function parseShippingRates(value: unknown): ShippingRates {
  if (!value || typeof value !== "object") return {}

  const out: ShippingRates = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isShippingMethod(key)) continue
    const amount = Number(raw)
    if (Number.isFinite(amount) && amount > 0) out[key] = amount
  }
  return out
}
