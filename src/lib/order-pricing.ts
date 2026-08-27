import { type SupabaseClient } from "@supabase/supabase-js"

import {
  isMethodAvailableFor,
  normalizeShippingMethod,
  type ShippingMethod
} from "@/lib/shipping"
import { quoteShipping, totalCartWeight } from "@/lib/shipping-quote"
import {
  computeZoneUplift,
  HOME_ZONE,
  parseZoneRates,
  zoneForCountry
} from "@/lib/shipping-zones"
import { type RateAddress } from "@/lib/shipping-rates"
import { type OrderItem } from "@/lib/types"

export type PricedCart =
  | {
      ok: true
      vendorId: string
      items: OrderItem[]
      /** The goods alone. */
      itemsTotal: number
      /** How the buyer chose to receive it. */
      shippingMethod: ShippingMethod
      /** What that choice costs, priced here rather than taken on trust. */
      deliveryFee: number
      /** Whether a courier quoted it or the seller's flat rate stood. */
      shippingQuoteSource: "flat" | "carrier"
      /** itemsTotal + deliveryFee — what the buyer is actually charged. */
      totalAmount: number
    }
  | { ok: false; status: number; error: string }

/**
 * Resolves a cart against the database and prices it there.
 *
 * The browser only gets to say which product and how many. Price, name and the
 * owning vendor all come from the products table, because a total taken from
 * the request means a buyer can pay one naira for a 155,000 naira unit — and
 * both checkout routes run with the service role key, so nothing else would
 * catch it.
 *
 * Shared by /api/orders and /api/flutterwave/initialize so card and transfer
 * checkout can never disagree about what an order is worth.
 */
export async function priceCart(
  supabase: SupabaseClient,
  rawItems: unknown,
  rawShippingMethod?: unknown,
  destination?: RateAddress | null
): Promise<PricedCart> {
  const requested = new Map<string, number>()

  for (const item of Array.isArray(rawItems) ? rawItems : []) {
    const productId = String(
      (item as { productId?: unknown })?.productId ?? ""
    ).trim()
    const quantity = Math.floor(Number((item as { quantity?: unknown })?.quantity ?? 0))

    if (!productId || !Number.isFinite(quantity) || quantity < 1 || quantity > 99) {
      return {
        ok: false,
        status: 400,
        error: "That cart is not valid. Refresh and try again."
      }
    }

    requested.set(productId, (requested.get(productId) ?? 0) + quantity)
  }

  if (requested.size === 0) {
    return { ok: false, status: 400, error: "Your cart is empty." }
  }

  const { data: rows, error } = await supabase
    .from("products")
    .select(
      "id, name, price, in_stock, weight_kg, vendor_id, vendor_profiles!inner(is_active, user_id, store_name, city, whatsapp_number, delivery_fee, free_delivery_over, shipping_rates, shipping_zones, origin_address, origin_city, origin_state, origin_postcode, origin_country, default_item_weight_kg, package_length_cm, package_width_cm, package_height_cm)"
    )
    .eq("vendor_profiles.is_active", true)
    .in("id", [...requested.keys()])

  if (error) {
    return { ok: false, status: 500, error: error.message }
  }

  if (!rows || rows.length !== requested.size) {
    return {
      ok: false,
      status: 409,
      error: "Something in your cart is no longer available. Refresh and try again."
    }
  }

  const outOfStock = rows.find((row) => !row.in_stock)
  if (outOfStock) {
    return {
      ok: false,
      status: 409,
      error: `${String(outOfStock.name)} just went out of stock.`
    }
  }

  const vendorIds = new Set(rows.map((row) => String(row.vendor_id)))
  if (vendorIds.size !== 1) {
    return {
      ok: false,
      status: 400,
      error: "An order can only contain items from one store."
    }
  }

  // Read off the joined store, through the same function the checkout page
  // uses to display it, so the quoted figure and the charged one cannot drift.
  const vendor = (rows[0] as Record<string, unknown>).vendor_profiles as
    | Record<string, unknown>
    | undefined

  const baseItems: OrderItem[] = rows.map((row) => ({
    productId: String(row.id),
    name: String(row.name),
    price: Number(row.price),
    quantity: requested.get(String(row.id)) as number
  }))

  const baseItemsTotal =
    Math.round(
      baseItems.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100
    ) / 100

  /*
   * Outside Nigeria the price a shopper saw already contained the shipping, so
   * it has to be charged the same way: folded into each line, with no postage
   * added on top. Adding both would bill the shipping twice.
   *
   * The free-over threshold does real work here. A per-unit uplift necessarily
   * over-recovers on a multi-item order — six wigs in one box do not cost six
   * base fees to send — and the threshold is what cancels it, at exactly the
   * basket size where it would start to bite. So the total can come out below
   * the sum of the prices on the cards, never above.
   */
  const zone = zoneForCountry(destination?.countryCode)
  const zoneRates = parseZoneRates(vendor?.shipping_zones)
  const freeOver = Number(vendor?.free_delivery_over ?? 0)
  const zoneShippingIsIncluded = zone !== HOME_ZONE
  const earnedFreeShipping =
    Number.isFinite(freeOver) && freeOver > 0 && baseItemsTotal >= freeOver

  /*
   * A zone whose rate has never been set would otherwise price at zero and,
   * because the postage line is also zeroed abroad, ship for nothing. Refusing
   * the order is the cheaper mistake: the seller loses a sale rather than the
   * courier fee, and finds out immediately rather than at the end of the month.
   */
  if (
    zoneShippingIsIncluded &&
    !earnedFreeShipping &&
    !zoneRates[zone]
  ) {
    return {
      ok: false,
      status: 400,
      error:
        "We cannot ship to that country yet. Message us on WhatsApp and we will sort it out."
    }
  }

  const items: OrderItem[] =
    zoneShippingIsIncluded && !earnedFreeShipping
      ? rows.map((row) => {
          const productId = String(row.id)
          const uplift = computeZoneUplift(
            zone,
            Number((row as { weight_kg?: unknown }).weight_kg ?? 0),
            zoneRates
          )
          return {
            productId,
            name: String(row.name),
            price: Math.round((Number(row.price) + uplift) * 100) / 100,
            quantity: requested.get(productId) as number
          }
        })
      : baseItems

  // numeric(12,2) in Postgres — settle the rounding here rather than let the
  // database truncate a floating point tail.
  const itemsTotal =
    Math.round(
      items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100
    ) / 100

  // The browser says which method; what it costs is decided here. Anything
  // unrecognised falls back to local rather than to free.
  const shippingMethod = normalizeShippingMethod(rawShippingMethod)

  // Checkout hides local shipping for an address outside the countries it
  // covers, but hiding a button is not a rule. Asking for the Nigerian flat
  // rate on a Ghanaian address would undercharge, so refuse it here too.
  if (
    destination?.countryCode &&
    !isMethodAvailableFor(shippingMethod, destination.countryCode)
  ) {
    const message =
      shippingMethod === "local"
        ? "Local shipping does not cover that country. Choose a courier."
        : "Courier delivery is for outside Nigeria. Choose local shipping or pickup."

    return {
      ok: false,
      status: 400,
      error: message
    }
  }

  // Re-quoted at the moment the order is written, rather than trusting the
  // figure the page last showed. If the carrier has moved its price since, the
  // order carries the real one.
  const shipping = await quoteShipping({
    supabase,
    vendor,
    method: shippingMethod,
    itemsTotal,
    weightKg: totalCartWeight(
      rows as Array<{ id: string; weight_kg?: unknown }>,
      requested,
      vendor?.default_item_weight_kg
    ),
    destination: destination ?? null
  })

  // Either the uplift or a postage line, never both.
  const deliveryFee = zoneShippingIsIncluded ? 0 : shipping.fee

  if (
    !zoneShippingIsIncluded &&
    shippingMethod !== "pickup" &&
    shippingMethod !== "local" &&
    deliveryFee <= 0
  ) {
    return {
      ok: false,
      status: 409,
      error: "Courier delivery is not priced yet. Choose another shipping method or try again."
    }
  }

  const totalAmount = Math.round((itemsTotal + deliveryFee) * 100) / 100

  return {
    ok: true,
    vendorId: [...vendorIds][0],
    items,
    itemsTotal,
    shippingMethod,
    deliveryFee,
    shippingQuoteSource: shipping.source,
    totalAmount
  }
}

/** Turns the payload's destination into a carrier address, or null. */
export function toRateAddress(
  value:
    | {
        countryCode?: string
        city?: string
        region?: string
        postalCode?: string
        addressLine?: string
        name?: string
        email?: string
        phone?: string
      }
    | undefined
): RateAddress | null {
  const countryCode = String(value?.countryCode ?? "").trim().toUpperCase()
  const city = String(value?.city ?? "").trim()
  if (!countryCode || !city) return null

  return {
    countryCode,
    city,
    region: value?.region?.trim() || undefined,
    postalCode: value?.postalCode?.trim() || undefined,
    addressLine: value?.addressLine?.trim() || undefined,
    name: value?.name?.trim() || undefined,
    email: value?.email?.trim() || undefined,
    phone: value?.phone?.trim() || undefined
  }
}
