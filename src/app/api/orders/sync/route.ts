import { NextResponse } from "next/server"

import { hasSupabaseAdmin } from "@/lib/env"
import { priceCart, toDeliveryDestination } from "@/lib/order-pricing"
import { paymentMethodsFor } from "@/lib/payment-methods"
import { verifyAuthToken } from "@/lib/supabase/auth-guard"
import { getSupabaseAdminClient } from "@/lib/supabase/server"
import { type CheckoutPayload } from "@/lib/types"

export async function POST(request: Request) {
  // Require a valid Supabase session for offline order sync
  const user = await verifyAuthToken(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const payload = (await request.json().catch(() => null)) as CheckoutPayload | null
  if (!payload) {
    return NextResponse.json({ error: "Invalid order." }, { status: 400 })
  }

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
    payload.deliveryOptionId,
    toDeliveryDestination(payload.shippingDestination)
  )
  if (!priced.ok) {
    // Keep the real status. The offline queue drops an order only on a 4xx, so
    // a 503 (pricing briefly down) must stay a 503 and be retried, not lost.
    return NextResponse.json({ error: priced.error }, { status: priced.status })
  }

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

  // Only what checkout actually offers here. Anything else used to be stored
  // as pay-on-delivery, so a hand-made request could place an order the seller
  // might ship with no money taken. Card goes through /api/paystack/initialize.
  const offered: string[] = paymentMethodsFor(destinationCountry || "NG").filter(
    (method) => method !== "paystack"
  )
  if (!payload.paymentMethod || !offered.includes(payload.paymentMethod)) {
    return NextResponse.json(
      { error: "That payment method is not available. Choose another one." },
      { status: 400 }
    )
  }
  const paymentMethod = payload.paymentMethod as "vendor_transfer" | "pay_on_delivery"

  const { error } = await supabase.from("orders").insert({
    buyer_id: user.id,
    vendor_id: priced.vendorId,
    items: priced.items,
    total_amount: priced.totalAmount,
    delivery_fee: priced.deliveryFee,
    shipping_method: priced.shippingMethod,
    delivery_option_label: priced.deliveryOptionLabel,
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
    console.error("Offline order insert failed", error.message)
    return NextResponse.json(
      { error: "We could not place this order. It will be retried." },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
