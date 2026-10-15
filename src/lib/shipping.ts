import { isAbroadAddress, isLocalDeliveryCountry } from "@/lib/delivery"

/**
 * How an order can reach the buyer.
 *
 * One list, read by the checkout page and the server that prices the order, so
 * a method can never be offered at a price nobody charges, or charged at a
 * price nobody was shown. Prices live in lib/delivery.ts.
 */
export const SHIPPING_METHODS = [
  {
    id: "pickup",
    label: "Customer pickup",
    helper: "Collect from the store yourself. Nothing to pay for shipping."
  },
  {
    id: "local",
    label: "Local delivery",
    helper: "Delivered within Nigeria at one flat rate."
  },
  {
    id: "courier",
    label: "Shipping after your order",
    helper: "We confirm the delivery cost with you before we dispatch."
  }
] as const

export type ShippingMethod = (typeof SHIPPING_METHODS)[number]["id"]

export const SHIPPING_METHOD_IDS = SHIPPING_METHODS.map((method) => method.id)

export const DEFAULT_SHIPPING_METHOD: ShippingMethod = "local"

/**
 * Whether a method can be offered to an address in this country.
 *
 * Nigeria gets local delivery or pickup. Everywhere else gets shipping that is
 * confirmed after ordering. An unknown country is allowed, since the buyer has
 * not said yet.
 */
export function isMethodAvailableFor(
  method: ShippingMethod,
  countryCode: string | undefined
): boolean {
  if (!countryCode) return true

  const local = isLocalDeliveryCountry(countryCode)
  if (method === "courier") return !local
  return local
}

/** The methods offerable to an address in this country, in order. */
export function shippingMethodsFor(countryCode: string | undefined) {
  return SHIPPING_METHODS.filter((method) =>
    isMethodAvailableFor(method.id, countryCode)
  )
}

export function preferredShippingMethodFor(
  countryCode: string | undefined
): ShippingMethod {
  return isAbroadAddress(countryCode) ? "courier" : DEFAULT_SHIPPING_METHOD
}

export function isShippingMethod(value: unknown): value is ShippingMethod {
  return (
    typeof value === "string" &&
    (SHIPPING_METHOD_IDS as readonly string[]).includes(value)
  )
}

/** Orders written before this change used courier names. All of them are now "courier". */
const LEGACY_COURIER_IDS = ["topship", "gig", "dhl", "easyship"]

export function normalizeShippingMethod(value: unknown): ShippingMethod {
  if (typeof value === "string" && LEGACY_COURIER_IDS.includes(value)) {
    return "courier"
  }
  return isShippingMethod(value) ? value : DEFAULT_SHIPPING_METHOD
}

export function getShippingMethod(id: ShippingMethod) {
  return SHIPPING_METHODS.find((method) => method.id === id) ?? SHIPPING_METHODS[1]
}
