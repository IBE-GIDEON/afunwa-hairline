import { type SupabaseClient } from "@supabase/supabase-js"

import {
  isMethodAvailableFor,
  resolveShippingFee,
  parseShippingRates,
  type ShippingMethod
} from "@/lib/shipping"
import { env } from "@/lib/env"
import { quoteCarrier, type RateAddress } from "@/lib/shipping-rates"

export interface QuotedShipping {
  fee: number
  /** 'carrier' when a courier priced it, 'flat' when the seller's rate stood. */
  source: "flat" | "carrier"
  /** Why the carrier was not used, when it was not. Shown to the seller only. */
  reason?: string
  serviceName?: string
}

interface VendorShippingRow {
  user_id?: unknown
  store_name?: unknown
  city?: unknown
  whatsapp_number?: unknown
  delivery_fee?: unknown
  free_delivery_over?: unknown
  shipping_rates?: unknown
  origin_address?: unknown
  origin_city?: unknown
  origin_state?: unknown
  origin_postcode?: unknown
  origin_country?: unknown
  default_item_weight_kg?: unknown
  package_length_cm?: unknown
  package_width_cm?: unknown
  package_height_cm?: unknown
}

/**
 * What this order costs to ship, decided in one place.
 *
 * Asks the carrier when there is a carrier to ask, and falls back to the
 * seller's own rate for every reason a quote might not arrive — no keys, no
 * weights, carrier down, route unserved. A courier outage must cost a sale at
 * worst a wrong-ish price, never the checkout itself.
 *
 * Used by /api/shipping/quote so the page can show a figure, and again inside
 * priceCart when the order is actually written, so the price charged is the
 * carrier's answer and not whatever the browser last saw.
 */
export async function quoteShipping({
  supabase,
  vendor,
  method,
  itemsTotal,
  weightKg,
  destination
}: {
  supabase: SupabaseClient
  vendor: VendorShippingRow | null | undefined
  method: ShippingMethod
  itemsTotal: number
  weightKg: number
  destination: RateAddress | null
}): Promise<QuotedShipping> {
  const flatFee = resolveShippingFee(
    method,
    itemsTotal,
    {
      fee: Number(vendor?.delivery_fee ?? 0),
      freeOver: Number(vendor?.free_delivery_over ?? 0)
    },
    parseShippingRates(vendor?.shipping_rates)
  )

  // Pickup and local shipping are the seller's own arrangement — there is no
  // carrier to ask, and asking one would be nonsense.
  if (
    method === "pickup" ||
    method === "local" ||
    method === "easyship"
  ) {
    return { fee: flatFee, source: "flat" }
  }

  if (!destination) {
    return { fee: flatFee, source: "flat", reason: "No delivery address yet." }
  }

  if (!isMethodAvailableFor(method, destination.countryCode)) {
    return {
      fee: flatFee,
      source: "flat",
      reason: "That shipping method is not offered for this country."
    }
  }

  const ownerEmail = await getVendorOwnerEmail(supabase, vendor)
  const originCountry = cleanString(vendor?.origin_country) || "NG"
  const originCity =
    cleanString(vendor?.origin_city) || cleanString(vendor?.city)
  const originAddress =
    cleanString(vendor?.origin_address) || originCity

  const result = await quoteCarrier(method, {
    origin: {
      countryCode: originCountry,
      city: originCity,
      region: cleanString(vendor?.origin_state) || undefined,
      postalCode: vendor?.origin_postcode ? String(vendor.origin_postcode) : undefined,
      addressLine: originAddress || undefined,
      name: cleanString(vendor?.store_name) || undefined,
      email: ownerEmail,
      phone: vendor?.whatsapp_number
        ? String(vendor.whatsapp_number)
        : env.shipbubbleSenderPhone || undefined
    },
    destination,
    weightKg,
    lengthCm: Number(vendor?.package_length_cm ?? 30),
    widthCm: Number(vendor?.package_width_cm ?? 25),
    heightCm: Number(vendor?.package_height_cm ?? 15),
    declaredValue: itemsTotal
  })

  if (!result.ok) {
    console.warn("Shipping quote fell back", {
      method,
      reason: result.reason
    })
    return { fee: flatFee, source: "flat", reason: result.reason }
  }

  return {
    fee: result.amount,
    source: "carrier",
    serviceName: result.serviceName
  }
}

async function getVendorOwnerEmail(
  supabase: SupabaseClient,
  vendor: VendorShippingRow | null | undefined
) {
  if (env.shipbubbleSenderEmail) return env.shipbubbleSenderEmail

  const userId = typeof vendor?.user_id === "string" ? vendor.user_id.trim() : ""
  if (!userId) return undefined

  const { data } = await supabase
    .from("users")
    .select("email")
    .eq("id", userId)
    .maybeSingle()

  const email = data?.email
  return typeof email === "string" && email.trim() ? email.trim() : undefined
}

/**
 * What the parcel weighs.
 *
 * Each line uses its own weight, then the store's default, then a conservative
 * launch fallback. A slightly high estimate is better than silently disabling
 * live courier rates for old products.
 */
export function totalCartWeight(
  rows: Array<{ id: string; weight_kg?: unknown }>,
  quantities: Map<string, number>,
  defaultItemWeightKg: unknown
): number {
  const configuredFallback = Number(defaultItemWeightKg ?? 0)
  const fallback =
    Number.isFinite(configuredFallback) && configuredFallback > 0
      ? configuredFallback
      : getDefaultItemWeightKg()

  let total = 0
  for (const row of rows) {
    const quantity = quantities.get(String(row.id)) ?? 0
    const each = Number(row.weight_kg ?? 0) || fallback
    if (each > 0) total += each * quantity
  }

  return Math.round(total * 1000) / 1000
}

function getDefaultItemWeightKg() {
  const value = Number(env.shippingDefaultItemWeightKg)
  return Number.isFinite(value) && value > 0 ? value : 1
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}
