import { type SupabaseClient } from "@supabase/supabase-js"

import {
  resolveDelivery,
  type DeliveryOption,
  type DeliveryPrices,
  type StoredShippingMethod
} from "@/lib/delivery"
import { loadDeliveryOptions, loadDeliveryPrices } from "@/lib/delivery-prices-store"
import { type OrderItem } from "@/lib/types"

/** Where the order is going. Only the country changes the price. */
export interface DeliveryDestination {
  countryCode: string
}

export type PricedCart =
  | {
      ok: true
      vendorId: string
      items: OrderItem[]
      /** The goods alone. */
      itemsTotal: number
      /** How the buyer chose to receive it. */
      shippingMethod: StoredShippingMethod
      /** The option's name, stored on the order for the seller. */
      deliveryOptionLabel: string
      /** What that choice costs, priced here rather than taken on trust. */
      deliveryFee: number
      /** Kept for the orders table. Every order is now at the platform rate. */
      shippingQuoteSource: "flat"
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
 * Shared by /api/orders and /api/paystack/initialize so card and transfer
 * checkout can never disagree about what an order is worth.
 */
export async function priceCart(
  supabase: SupabaseClient,
  rawItems: unknown,
  rawDeliveryOptionId?: unknown,
  destination?: DeliveryDestination | null
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
      "id, name, price, in_stock, vendor_id, vendor_profiles!inner(is_active, user_id, store_name, city, whatsapp_number)"
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
   * Product prices are base prices everywhere. Outside Nigeria the delivery
   * cost is not part of the order total: it is confirmed with the buyer before
   * dispatch, so nothing is charged for it here.
   */
  const items: OrderItem[] = baseItems

  // numeric(12,2) in Postgres — settle the rounding here rather than let the
  // database truncate a floating point tail.
  const itemsTotal =
    Math.round(
      items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100
    ) / 100

  // Prices and options come from the admin tables. If they cannot be read,
  // refuse the order rather than charge a guess.
  let deliveryData: { prices: DeliveryPrices; options: DeliveryOption[] }
  try {
    const [prices, options] = await Promise.all([
      loadDeliveryPrices(supabase),
      loadDeliveryOptions(supabase)
    ])
    deliveryData = { prices, options }
  } catch {
    return {
      ok: false,
      status: 503,
      error: "Delivery pricing is unavailable right now. Try again shortly."
    }
  }

  // What the buyer chose is priced here. An unknown or switched-off option is
  // refused, so nothing is charged at a price nobody was shown.
  const choice = resolveDelivery({
    optionId: typeof rawDeliveryOptionId === "string" ? rawDeliveryOptionId : undefined,
    countryCode: destination?.countryCode,
    options: deliveryData.options,
    prices: deliveryData.prices
  })
  if (!choice) {
    return {
      ok: false,
      status: 400,
      error: "Choose a delivery option."
    }
  }

  const shippingMethod = choice.shippingMethod
  const deliveryFee = choice.fee
  const totalAmount = Math.round((itemsTotal + deliveryFee) * 100) / 100

  return {
    ok: true,
    vendorId: [...vendorIds][0],
    items,
    itemsTotal,
    shippingMethod,
    deliveryFee,
    deliveryOptionLabel: choice.label,
    shippingQuoteSource: "flat",
    totalAmount
  }
}

/** The buyer's delivery country, or null when the payload did not give one. */
export function toDeliveryDestination(
  value: { countryCode?: string } | undefined
): DeliveryDestination | null {
  const countryCode = String(value?.countryCode ?? "").trim().toUpperCase()
  return countryCode ? { countryCode } : null
}
