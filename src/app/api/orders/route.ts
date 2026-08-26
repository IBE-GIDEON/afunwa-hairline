import { NextResponse } from "next/server"

import { hasSupabaseAdmin } from "@/lib/env"
import { priceCart, toRateAddress } from "@/lib/order-pricing"
import { sendPushNotification } from "@/lib/push"
import { verifyAuthToken } from "@/lib/supabase/auth-guard"
import { getSupabaseAdminClient } from "@/lib/supabase/server"
import { type CheckoutPayload } from "@/lib/types"

export async function POST(request: Request) {
  // Require a valid Supabase session
  const user = await verifyAuthToken(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const payload = (await request.json()) as CheckoutPayload

  // Prevent a user from placing orders on behalf of someone else
  if (payload.buyerId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const supabase = getSupabaseAdminClient()

  if (!hasSupabaseAdmin || !supabase) {
    return NextResponse.json(
      { error: "Supabase admin configuration is missing for order creation." },
      { status: 503 }
    )
  }

  const deliveryAddress = String(payload.deliveryAddress ?? "").trim()
  if (!deliveryAddress) {
    return NextResponse.json(
      { error: "A delivery address is required." },
      { status: 400 }
    )
  }

  const paymentMethod =
    payload.paymentMethod === "vendor_transfer"
      ? "vendor_transfer"
      : "pay_on_delivery"

  /*
   * This route creates the orders where no money has moved yet — a transfer to
   * be confirmed, or cash on delivery. Neither is acceptable abroad: an
   * international parcel costs tens of thousands of naira to send and cannot
   * be recovered if the buyer goes quiet. Checkout already hides the option,
   * and hiding a button is not a rule.
   */
  const destinationCountry = String(
    payload.shippingDestination?.countryCode ?? ""
  ).toUpperCase()

  if (destinationCountry && destinationCountry !== "NG") {
    return NextResponse.json(
      {
        error:
          "Orders outside Nigeria must be paid by card. Choose card payment to continue."
      },
      { status: 400 }
    )
  }

  const priced = await priceCart(
    supabase,
    payload.items,
    payload.shippingMethod,
    toRateAddress(payload.shippingDestination)
  )
  if (!priced.ok) {
    return NextResponse.json({ error: priced.error }, { status: priced.status })
  }

  const { vendorId, items, totalAmount, deliveryFee, shippingMethod } = priced

  const { data, error } = await supabase
    .from("orders")
    .insert({
      buyer_id: user.id,
      vendor_id: vendorId,
      items,
      total_amount: totalAmount,
      delivery_fee: deliveryFee,
      shipping_method: shippingMethod,
      shipping_quote_source: priced.shippingQuoteSource,
      delivery_address: deliveryAddress,
      payment_method: paymentMethod,
      payment_status:
        paymentMethod === "vendor_transfer"
          ? "awaiting_seller_confirmation"
          : "pay_on_delivery",
      buyer_payment_note: payload.buyerPaymentNote ?? null,
      status: "pending",
    })
    .select()
    .single()

  if (error) {
    const message = error.message.toLowerCase()
    if (
      message.includes("payment_method") ||
      message.includes("payment_status") ||
      message.includes("buyer_payment_note")
    ) {
      return NextResponse.json(
        { error: "Run the latest Supabase order-payment SQL patch, then place the order again." },
        { status: 500 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: vendor } = await supabase
    .from("vendor_profiles")
    .select("user_id, store_name")
    .eq("id", vendorId)
    .maybeSingle()

  const { data: buyer } = await supabase
    .from("users")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle()

  if (vendor?.user_id) {
    const buyerName = getDisplayName(buyer?.full_name)
    const orderRef = getOrderRef(String(data.id))

    void sendPushNotification({
      userId: String(vendor.user_id),
      title: "New Order on Afunwa",
      body: `${buyerName} placed Order ${orderRef} in your store.`,
      url: `/orders/${data.id}`
    }).catch(() => null)
  }

  return NextResponse.json({
    ok: true,
    orderId: data.id
  })
}

function getDisplayName(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : ""
  if (!normalized) {
    return "A buyer"
  }

  const firstName = normalized.split(/\s+/)[0] ?? normalized
  return firstName.length > 18 ? `${firstName.slice(0, 18)}…` : firstName
}

function getOrderRef(orderId: string) {
  return `#${orderId.slice(0, 6).toUpperCase()}`
}
