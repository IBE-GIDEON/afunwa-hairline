import { NextResponse } from "next/server"

import { hasSupabaseAdmin } from "@/lib/env"
import { priceCart, toRateAddress } from "@/lib/order-pricing"
import { verifyAuthToken } from "@/lib/supabase/auth-guard"
import { getSupabaseAdminClient } from "@/lib/supabase/server"
import { type CheckoutPayload } from "@/lib/types"

export async function POST(request: Request) {
  // Require a valid Supabase session for offline order sync
  const user = await verifyAuthToken(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const payload = (await request.json()) as CheckoutPayload

  // Prevent replaying another user's offline order
  if (payload.buyerId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const supabase = getSupabaseAdminClient()

  if (!hasSupabaseAdmin || !supabase) {
    return NextResponse.json(
      { error: "Supabase admin configuration is missing for offline order sync." },
      { status: 503 }
    )
  }

  // Price the cart here rather than believing the queued copy. This runs with
  // the service role, so RLS cannot catch a bad total either — and an order
  // that sat in IndexedDB overnight may name a price that has since changed,
  // a product now out of stock, or one the buyer simply edited by hand.
  const priced = await priceCart(
    supabase,
    payload.items,
    payload.shippingMethod,
    toRateAddress(payload.shippingDestination)
  )
  if (!priced.ok) {
    return NextResponse.json({ error: priced.error }, { status: 400 })
  }

  const paymentMethod =
    payload.paymentMethod === "vendor_transfer" ? "vendor_transfer" : "pay_on_delivery"

  /*
   * The same rule /api/orders enforces, and for the same reason: this route
   * also writes an order with no money behind it, and an international parcel
   * costs tens of thousands of naira that cannot be recovered.
   *
   * Nothing legitimate reaches here from abroad — card checkout needs a
   * connection, so it is never queued offline — but this route takes a bearer
   * token and a body, and a rule enforced in one of two places is not a rule.
   */
  const destinationCountry = String(
    payload.shippingDestination?.countryCode ?? ""
  ).toUpperCase()

  if (destinationCountry && destinationCountry !== "NG") {
    return NextResponse.json(
      { error: "Orders outside Nigeria must be paid by card." },
      { status: 400 }
    )
  }

  const { error } = await supabase.from("orders").insert({
    buyer_id: user.id,
    vendor_id: priced.vendorId,
    items: priced.items,
    total_amount: priced.totalAmount,
    delivery_fee: priced.deliveryFee,
    shipping_method: priced.shippingMethod,
    shipping_quote_source: priced.shippingQuoteSource,
    delivery_address: payload.deliveryAddress,
    payment_method: paymentMethod,
    payment_status:
      paymentMethod === "vendor_transfer"
        ? "awaiting_seller_confirmation"
        : "pay_on_delivery",
    buyer_payment_note: payload.buyerPaymentNote ?? null,
    status: "pending",
  })

  if (error) {
    const message = error.message.toLowerCase()
    if (
      message.includes("payment_method") ||
      message.includes("payment_status") ||
      message.includes("buyer_payment_note")
    ) {
      return NextResponse.json(
        { error: "Run the latest Supabase order-payment SQL patch, then sync again." },
        { status: 500 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
