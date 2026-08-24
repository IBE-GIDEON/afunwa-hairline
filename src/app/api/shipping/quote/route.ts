import { NextResponse } from "next/server"

import { isCountryCode } from "@/lib/countries"
import { hasSupabaseAdmin } from "@/lib/env"
import { normalizeShippingMethod } from "@/lib/shipping"
import { quoteShipping, totalCartWeight } from "@/lib/shipping-quote"
import { getSupabaseAdminClient } from "@/lib/supabase/server"

// A price that depends on where the buyer is going cannot be cached.
export const dynamic = "force-dynamic"

/** Same ceiling priceCart uses, so a quote cannot be asked for a silly cart. */
const MAX_QUANTITY = 99

/**
 * What shipping will cost, for the checkout page to display.
 *
 * Advisory only. The figure that gets charged is decided again inside
 * priceCart when the order is written, so a stale or tampered quote here
 * cannot become the price. This exists so the buyer sees a number before they
 * commit, not so the browser can name one.
 *
 * Products and the store are read server-side; the request supplies only ids,
 * quantities and where it is going.
 */
export async function POST(request: Request) {
  const supabase = getSupabaseAdminClient()
  if (!hasSupabaseAdmin || !supabase) {
    return NextResponse.json({ fee: 0, source: "flat" })
  }

  let payload: {
    items?: Array<{ productId?: unknown; quantity?: unknown }>
    shippingMethod?: unknown
    destination?: {
      countryCode?: unknown
      city?: unknown
      region?: unknown
      postalCode?: unknown
      addressLine?: unknown
      name?: unknown
      email?: unknown
      phone?: unknown
    }
  }

  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }

  const quantities = new Map<string, number>()
  for (const item of Array.isArray(payload.items) ? payload.items : []) {
    const productId = String(item?.productId ?? "").trim()
    const quantity = Math.floor(Number(item?.quantity ?? 0))
    if (!productId || quantity < 1 || quantity > MAX_QUANTITY) continue
    quantities.set(productId, (quantities.get(productId) ?? 0) + quantity)
  }

  if (quantities.size === 0) {
    return NextResponse.json({ fee: 0, source: "flat" })
  }

  const method = normalizeShippingMethod(payload.shippingMethod)

  const { data: rows, error } = await supabase
    .from("products")
    .select(
      "id, price, weight_kg, vendor_profiles!inner(user_id, store_name, city, whatsapp_number, delivery_fee, free_delivery_over, shipping_rates, origin_address, origin_city, origin_state, origin_postcode, origin_country, default_item_weight_kg, package_length_cm, package_width_cm, package_height_cm)"
    )
    .in("id", [...quantities.keys()])

  if (error || !rows?.length) {
    return NextResponse.json({ fee: 0, source: "flat" })
  }

  const vendor = (rows[0] as Record<string, unknown>).vendor_profiles as
    | Record<string, unknown>
    | undefined

  const itemsTotal = rows.reduce((sum, row) => {
    const quantity = quantities.get(String(row.id)) ?? 0
    return sum + Number(row.price ?? 0) * quantity
  }, 0)

  const countryCode = String(payload.destination?.countryCode ?? "").toUpperCase()
  const city = String(payload.destination?.city ?? "").trim()

  const destination =
    isCountryCode(countryCode) && city
      ? {
          countryCode,
          city,
          region: payload.destination?.region
            ? String(payload.destination.region)
            : undefined,
          postalCode: payload.destination?.postalCode
            ? String(payload.destination.postalCode)
            : undefined,
          addressLine: payload.destination?.addressLine
            ? String(payload.destination.addressLine)
            : undefined,
          name: payload.destination?.name
            ? String(payload.destination.name)
            : undefined,
          email: payload.destination?.email
            ? String(payload.destination.email)
            : undefined,
          phone: payload.destination?.phone
            ? String(payload.destination.phone)
            : undefined
        }
      : null

  const quote = await quoteShipping({
    supabase,
    vendor,
    method,
    itemsTotal,
    weightKg: totalCartWeight(
      rows as Array<{ id: string; weight_kg?: unknown }>,
      quantities,
      vendor?.default_item_weight_kg
    ),
    destination
  })

  // The reason a carrier was skipped is for the seller's logs, not the
  // buyer's screen — "DHL replied 401" is not a shopper's problem.
  return NextResponse.json({
    fee: quote.fee,
    source: quote.source,
    serviceName: quote.serviceName ?? null
  })
}
