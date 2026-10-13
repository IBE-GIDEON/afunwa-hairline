import { NextResponse } from "next/server"

import { sendPushNotification } from "@/lib/push"
import { verifyPaystackSignature, verifyPaystackTransaction } from "@/lib/paystack"
import { getSupabaseAdminClient } from "@/lib/supabase/server"

/**
 * Paystack payment notifications.
 *
 * The only thing that may mark an order paid. A buyer landing on the callback
 * URL proves nothing, since anyone can type that address, so a signed event
 * that Paystack confirms again is the authority.
 */
export async function POST(request: Request) {
  const rawBody = await request.text()

  if (!verifyPaystackSignature(rawBody, request.headers.get("x-paystack-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  const event = JSON.parse(rawBody) as {
    event?: string
    data?: { reference?: string }
  }

  const reference = event.data?.reference
  if (event.event !== "charge.success" || !reference) {
    return NextResponse.json({ ok: true })
  }

  const supabase = getSupabaseAdminClient()
  if (!supabase) {
    // Returning an error makes Paystack retry once the database is reachable.
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 })
  }

  // Find the order by the reference we stored at checkout. The metadata in the
  // body is ignored, because it is only as trustworthy as the event itself.
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*, vendor_profiles(user_id)")
    .eq("payment_reference", reference)
    .maybeSingle()

  if (orderError) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 })
  }

  if (!order) {
    return NextResponse.json({ ok: true })
  }

  // Paystack retries until it gets a 200, so the same success can arrive more
  // than once. Acknowledge and stop rather than notify the seller twice.
  if (order.payment_status === "paid_by_card") {
    return NextResponse.json({ ok: true })
  }

  // Ask Paystack what actually happened rather than believing the body.
  const verified = await verifyPaystackTransaction(reference)

  if (!verified || verified.status !== "success") {
    console.error(`Paystack verify failed for order ${order.id}`)
    return NextResponse.json({ ok: true })
  }

  // Paystack reports the minor unit (kobo). Compare in kobo on both sides.
  const paidKobo = Number(verified.amount ?? 0)
  const owedKobo = Math.round(Number(order.total_amount) * 100)

  if (verified.currency !== "NGN" || !Number.isFinite(paidKobo) || paidKobo < owedKobo) {
    console.error(
      `Paystack amount mismatch on order ${order.id}: paid ${paidKobo} ${verified.currency} kobo, owed ${owedKobo} kobo`
    )
    return NextResponse.json({ ok: true })
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      payment_status: "paid_by_card",
      // Money is in, so the seller is packing rather than deciding.
      status: order.status === "pending" ? "confirmed" : order.status
    })
    .eq("id", order.id)
    .neq("payment_status", "paid_by_card")

  if (updateError) {
    // A failed write must not be acknowledged, or Paystack stops retrying and
    // the buyer stays unpaid on our side.
    console.error(`Paystack order update failed for ${order.id}`, updateError.message)
    return NextResponse.json({ error: "Update failed" }, { status: 500 })
  }

  const vendorUserId =
    order.vendor_profiles && "user_id" in order.vendor_profiles
      ? String(order.vendor_profiles.user_id)
      : null

  if (vendorUserId) {
    await sendPushNotification({
      userId: vendorUserId,
      title: "Paid order on Afunwa",
      body: "A buyer just paid. Get it ready to ship.",
      url: `/orders/${order.id}`
    })
  }

  return NextResponse.json({ ok: true })
}
