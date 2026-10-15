import { NextResponse } from "next/server"

import { getAppUrl } from "@/lib/app-url"
import { hasPaystack, hasSupabaseAdmin } from "@/lib/env"
import { priceCart, toDeliveryDestination } from "@/lib/order-pricing"
import { initializePaystackTransaction } from "@/lib/paystack"
import { verifyAuthToken } from "@/lib/supabase/auth-guard"
import { getSupabaseAdminClient } from "@/lib/supabase/server"
import { type CheckoutPayload } from "@/lib/types"
import { createPaymentReference } from "@/lib/utils"

/**
 * Paystack card and bank transfer checkout.
 *
 * The amount charged is priced from the products table, never from the request,
 * or a buyer could pay one naira for anything in the shop.
 */
export async function POST(request: Request) {
  const user = await verifyAuthToken(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const payload = (await request.json().catch(() => null)) as CheckoutPayload | null

  if (!payload?.buyerId) {
    return NextResponse.json({ error: "Invalid checkout payload." }, { status: 400 })
  }

  // Prevent a user from checking out on behalf of someone else
  if (payload.buyerId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const deliveryAddress = String(payload.deliveryAddress ?? "").trim()
  if (!deliveryAddress) {
    return NextResponse.json(
      { error: "A delivery address is required." },
      { status: 400 }
    )
  }

  const supabase = getSupabaseAdminClient()

  if (!hasSupabaseAdmin || !supabase) {
    return NextResponse.json(
      { error: "Checkout is temporarily unavailable. Please try again shortly." },
      { status: 503 }
    )
  }

  if (!hasPaystack) {
    return NextResponse.json(
      { error: "Card checkout is not available yet." },
      { status: 503 }
    )
  }

  const priced = await priceCart(
    supabase,
    payload.items,
    payload.deliveryOptionId,
    toDeliveryDestination(payload.shippingDestination)
  )
  if (!priced.ok) {
    return NextResponse.json({ error: priced.error }, { status: priced.status })
  }

  const reference = createPaymentReference()

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      buyer_id: user.id,
      vendor_id: priced.vendorId,
      items: priced.items,
      total_amount: priced.totalAmount,
      delivery_fee: priced.deliveryFee,
      shipping_method: priced.shippingMethod,
      delivery_option_label: priced.deliveryOptionLabel,
      shipping_quote_source: priced.shippingQuoteSource,
      delivery_address: deliveryAddress,
      payment_method: "paystack",
      // Not paid until the webhook confirms it against Paystack.
      payment_status: "awaiting_card_payment",
      status: "pending",
      payment_reference: reference
    })
    .select()
    .single()

  if (error || !order) {
    // Never echo database errors back to the buyer.
    console.error("Paystack order insert failed", error?.message)
    return NextResponse.json(
      { error: "We could not start this checkout. Please try again." },
      { status: 500 }
    )
  }

  try {
    const { checkoutUrl } = await initializePaystackTransaction({
      // Naira here. initializePaystackTransaction converts to kobo.
      amount: priced.totalAmount,
      email: user.email ?? `buyer-${user.id.slice(0, 8)}@afunwa.example`,
      reference,
      // getAppUrl, not env.appUrl: resolves from the deployment itself, so a
      // missing NEXT_PUBLIC_APP_URL cannot strand a paying customer.
      callbackUrl: `${getAppUrl()}/order-confirmation/${order.id}`,
      metadata: {
        order_id: order.id,
        vendor_id: priced.vendorId,
        buyer_id: user.id
      }
    })

    return NextResponse.json({ checkoutUrl, orderId: order.id, reference })
  } catch (paystackError) {
    // The order row exists but nothing can pay it. Cancel rather than leave
    // the seller an order no one can settle.
    await supabase.from("orders").update({ status: "cancelled" }).eq("id", order.id)

    console.error("Paystack initialize failed", paystackError)
    return NextResponse.json(
      { error: "Card checkout could not be started. Try again in a moment." },
      { status: 502 }
    )
  }
}
