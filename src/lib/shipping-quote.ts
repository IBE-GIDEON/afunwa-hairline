import { type SupabaseClient } from "@supabase/supabase-js"

import {
  resolveShippingFee,
  parseShippingRates,
  type ShippingMethod
} from "@/lib/shipping"
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
    method === "courier" ||
    method === "easyship"
  ) {
    return { fee: flatFee, source: "flat" }
  }

  if (!destination) {
    return { fee: flatFee, source: "flat", reason: "No delivery address yet." }
  }

  const result = await quoteCarrier(method, {
    origin: {
      countryCode: String(vendor?.origin_country ?? "NG"),
      city: String(vendor?.origin_city ?? ""),
      region: vendor?.origin_state ? String(vendor.origin_state) : undefined,
      postalCode: vendor?.origin_postcode ? String(vendor.origin_postcode) : undefined,
      addressLine: vendor?.origin_address ? String(vendor.origin_address) : undefined
    },
    destination,
    weightKg,
    lengthCm: Number(vendor?.package_length_cm ?? 30),
    widthCm: Number(vendor?.package_width_cm ?? 25),
    heightCm: Number(vendor?.package_height_cm ?? 15),
    declaredValue: itemsTotal
  })

  if (!result.ok) {
    return { fee: flatFee, source: "flat", reason: result.reason }
  }

  return {
    fee: result.amount,
    source: "carrier",
    serviceName: result.serviceName
  }
}

/**
 * What the parcel weighs.
 *
 * Each line uses its own weight, falling back to the store's default for
 * anything not yet measured. Zero means nothing has a weight, which is the
 * signal not to call a carrier at all rather than to send them a guess.
 */
export function totalCartWeight(
  rows: Array<{ id: string; weight_kg?: unknown }>,
  quantities: Map<string, number>,
  defaultItemWeightKg: unknown
): number {
  const fallback = Number(defaultItemWeightKg ?? 0)

  let total = 0
  for (const row of rows) {
    const quantity = quantities.get(String(row.id)) ?? 0
    const each = Number(row.weight_kg ?? 0) || fallback
    if (each > 0) total += each * quantity
  }

  return Math.round(total * 1000) / 1000
}
