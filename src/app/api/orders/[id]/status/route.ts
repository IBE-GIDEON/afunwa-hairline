import { NextResponse } from "next/server"

import {
  normalizeOrderStatus,
  normalizePaymentMethod,
  normalizePaymentStatus
} from "@/lib/constants"
import { sendPushNotification } from "@/lib/push"
import { verifyAuthToken } from "@/lib/supabase/auth-guard"
import { getSupabaseAdminClient } from "@/lib/supabase/server"
import {
  type OrderStatus,
  type OrderUpdatePayload,
  type PaymentStatus
} from "@/lib/types"

const ORDER_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "dispatched",
  "delivered",
  "cancelled"
]

const PAYMENT_STATUSES: PaymentStatus[] = [
  "awaiting_seller_confirmation",
  "pay_on_delivery",
  "awaiting_vendor_payment",
  "paid_to_vendor"
]

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await verifyAuthToken(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const payload = (await request.json().catch(() => null)) as
    | OrderUpdatePayload
    | null

  if (!payload) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const hasDeliveryAddressUpdate = Object.prototype.hasOwnProperty.call(
    payload,
    "deliveryAddress"
  )
  const { status, paymentStatus, deliveryAddress } = payload
  const trackingNumber = payload.trackingNumber?.trim()
  const trackingCarrier = payload.trackingCarrier?.trim()
  const trackingUrl = payload.trackingUrl?.trim()

  if (status && !ORDER_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid order status" }, { status: 400 })
  }

  if (paymentStatus && !PAYMENT_STATUSES.includes(paymentStatus)) {
    return NextResponse.json({ error: "Invalid payment status" }, { status: 400 })
  }

  if (hasDeliveryAddressUpdate && typeof deliveryAddress !== "string") {
    return NextResponse.json(
      { error: "Drop-off location must be text" },
      { status: 400 }
    )
  }

  if (!status && !paymentStatus && !hasDeliveryAddressUpdate) {
    return NextResponse.json({ ok: true })
  }

  const supabase = getSupabaseAdminClient()
  if (!supabase) {
    return NextResponse.json({ ok: true, status, paymentStatus, deliveryAddress })
  }

  const { data: existing } = await supabase
    .from("orders")
    .select("buyer_id, vendor_id, status, payment_method, payment_status")
    .eq("id", params.id)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 })
  }

  const isBuyer = existing.buyer_id === user.id

  const { data: vendor } = await supabase
    .from("vendor_profiles")
    .select("user_id, store_name")
    .eq("id", String(existing.vendor_id))
    .maybeSingle()

  const isSeller = vendor?.user_id === user.id

  if (!isBuyer && !isSeller) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const currentStatus = normalizeOrderStatus(existing.status)
  const paymentMethod = normalizePaymentMethod(existing.payment_method)
  const currentPaymentStatus = normalizePaymentStatus(
    existing.payment_status,
    paymentMethod
  )
  const nextPaymentStatus = paymentStatus ?? currentPaymentStatus
  const updates: Record<string, string> = {}

  if (hasDeliveryAddressUpdate) {
    const nextAddress = deliveryAddress?.trim() ?? ""

    if (!isBuyer) {
      return NextResponse.json(
        { error: "Only the buyer can edit the drop-off location" },
        { status: 403 }
      )
    }

    if (currentStatus !== "pending" && currentStatus !== "confirmed") {
      return NextResponse.json(
        { error: "Drop-off location can only be changed before dispatch" },
        { status: 409 }
      )
    }

    if (!nextAddress) {
      return NextResponse.json(
        { error: "Add a drop-off location first" },
        { status: 400 }
      )
    }

    updates.delivery_address = nextAddress
  }

  if (status) {
    const invalidTransition = validateStatusChange({
      status,
      currentStatus,
      paymentMethod,
      nextPaymentStatus,
      isBuyer,
      isSeller
    })

    if (invalidTransition) {
      return invalidTransition
    }

    updates.status = status
  }

  if (paymentStatus) {
    const invalidPaymentChange = validatePaymentChange({
      paymentStatus,
      currentStatus,
      requestedStatus: status,
      paymentMethod,
      isSeller
    })

    if (invalidPaymentChange) {
      return invalidPaymentChange
    }

    updates.payment_status = paymentStatus
  }

  // Tracking belongs to whoever is carrying the parcel, which is the seller's
  // business and nobody else's — a buyer must not be able to write their own
  // tracking number onto an order.
  if (isSeller) {
    if (trackingNumber !== undefined) {
      updates.tracking_number = trackingNumber.slice(0, 120)
    }
    if (trackingCarrier !== undefined) {
      updates.tracking_carrier = trackingCarrier.slice(0, 60)
    }
    if (trackingUrl !== undefined) {
      // Only a real link, so nothing can smuggle javascript: onto a page the
      // buyer is invited to click.
      updates.tracking_url = /^https?:\/\//i.test(trackingUrl)
        ? trackingUrl.slice(0, 500)
        : ""
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true })
  }

  const { data: order, error } = await supabase
    .from("orders")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single()

  if (error || !order) {
    const message = error?.message?.toLowerCase() ?? ""
    if (message.includes("payment_status")) {
      return NextResponse.json(
        {
          error:
            "Run the latest Supabase order-payment SQL patch, then update the order again."
        },
        { status: 500 }
      )
    }
    return NextResponse.json(
      { error: error?.message ?? "Order not found" },
      { status: 500 }
    )
  }

  const { data: buyer } = await supabase
    .from("users")
    .select("full_name")
    .eq("id", String(existing.buyer_id))
    .maybeSingle()

  const storeName = getStoreName(vendor?.store_name)
  const buyerName = getDisplayName(buyer?.full_name)
  const orderRef = getOrderRef(params.id)
  const notification = getNotification({
    status,
    paymentStatus,
    hasDeliveryAddressUpdate,
    isBuyer,
    buyerName,
    storeName,
    orderRef,
    paymentMethod,
    buyerId: String(existing.buyer_id),
    sellerUserId: vendor?.user_id ? String(vendor.user_id) : null
  })

  if (notification) {
    void sendPushNotification({
      userId: notification.userId,
      title: notification.title,
      body: notification.body,
      url: `/orders/${params.id}`
    }).catch(() => null)
  }

  return NextResponse.json({ ok: true, order })
}

function validateStatusChange({
  status,
  currentStatus,
  paymentMethod,
  nextPaymentStatus,
  isBuyer,
  isSeller
}: {
  status: OrderStatus
  currentStatus: OrderStatus
  paymentMethod: ReturnType<typeof normalizePaymentMethod>
  nextPaymentStatus: PaymentStatus
  isBuyer: boolean
  isSeller: boolean
}) {
  if (status === "pending") {
    return NextResponse.json(
      { error: "Orders cannot be moved back to pending" },
      { status: 400 }
    )
  }

  if (status === "confirmed") {
    if (!isSeller) {
      return NextResponse.json(
        { error: "Only the seller can confirm an order" },
        { status: 403 }
      )
    }
    if (currentStatus !== "pending") {
      return NextResponse.json(
        { error: "Only pending orders can be confirmed" },
        { status: 409 }
      )
    }
  }

  if (status === "dispatched") {
    if (!isSeller) {
      return NextResponse.json(
        { error: "Only the seller can dispatch an order" },
        { status: 403 }
      )
    }
    if (currentStatus !== "confirmed") {
      return NextResponse.json(
        { error: "Confirm the order before dispatching" },
        { status: 409 }
      )
    }
    if (
      paymentMethod === "vendor_transfer" &&
      nextPaymentStatus !== "paid_to_vendor"
    ) {
      return NextResponse.json(
        { error: "Mark direct payment as received before dispatching" },
        { status: 409 }
      )
    }
  }

  if (status === "delivered") {
    if (!isBuyer) {
      return NextResponse.json(
        { error: "Only the buyer can confirm delivery" },
        { status: 403 }
      )
    }
    if (currentStatus !== "dispatched") {
      return NextResponse.json(
        { error: "Delivery can only be confirmed after dispatch" },
        { status: 409 }
      )
    }
  }

  if (status === "cancelled") {
    if (!isBuyer && !isSeller) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (currentStatus !== "pending") {
      return NextResponse.json(
        { error: "Only pending orders can be cancelled" },
        { status: 409 }
      )
    }
  }

  return null
}

function validatePaymentChange({
  paymentStatus,
  currentStatus,
  requestedStatus,
  paymentMethod,
  isSeller
}: {
  paymentStatus: PaymentStatus
  currentStatus: OrderStatus
  requestedStatus?: OrderStatus
  paymentMethod: ReturnType<typeof normalizePaymentMethod>
  isSeller: boolean
}) {
  if (!isSeller) {
    return NextResponse.json(
      { error: "Only the seller can update payment status" },
      { status: 403 }
    )
  }

  const confirmedNow = currentStatus === "confirmed" || requestedStatus === "confirmed"

  if (paymentStatus === "awaiting_seller_confirmation") {
    return NextResponse.json(
      { error: "Payment is already waiting for seller confirmation" },
      { status: 400 }
    )
  }

  if (paymentStatus === "pay_on_delivery") {
    if (paymentMethod !== "pay_on_delivery" || !confirmedNow) {
      return NextResponse.json(
        { error: "Pay on delivery can only be set when confirming this order" },
        { status: 409 }
      )
    }
  }

  if (paymentStatus === "awaiting_vendor_payment") {
    if (paymentMethod !== "vendor_transfer" || !confirmedNow) {
      return NextResponse.json(
        { error: "Direct vendor payment starts after seller confirmation" },
        { status: 409 }
      )
    }
  }

  if (paymentStatus === "paid_to_vendor") {
    if (paymentMethod !== "vendor_transfer" || !confirmedNow) {
      return NextResponse.json(
        { error: "Only confirmed direct-payment orders can be marked paid" },
        { status: 409 }
      )
    }
  }

  return null
}

function getNotification({
  status,
  paymentStatus,
  hasDeliveryAddressUpdate,
  isBuyer,
  buyerName,
  storeName,
  orderRef,
  paymentMethod,
  buyerId,
  sellerUserId
}: {
  status?: OrderStatus
  paymentStatus?: PaymentStatus
  hasDeliveryAddressUpdate: boolean
  isBuyer: boolean
  buyerName: string
  storeName: string
  orderRef: string
  paymentMethod: ReturnType<typeof normalizePaymentMethod>
  buyerId: string
  sellerUserId: string | null
}) {
  if (status === "delivered" && isBuyer && sellerUserId) {
    return {
      userId: sellerUserId,
      title: `${buyerName} confirmed delivery`,
      body: `${buyerName} received ${orderRef}. This order is now closed.`
    }
  }

  if (status === "cancelled" && isBuyer && sellerUserId) {
    return {
      userId: sellerUserId,
      title: `${buyerName} declined ${orderRef}`,
      body: `${buyerName} cancelled this order before confirmation.`
    }
  }

  if (hasDeliveryAddressUpdate && isBuyer && sellerUserId) {
    return {
      userId: sellerUserId,
      title: "Drop-off location updated",
      body: `${buyerName} updated the delivery location for ${orderRef}.`
    }
  }

  if (status === "confirmed") {
    return {
      userId: buyerId,
      title: `${storeName} confirmed ${orderRef}`,
      body:
        paymentMethod === "vendor_transfer"
          ? `Open ${orderRef} to see ${storeName}'s direct payment details.`
          : `${storeName} confirmed your order and will prepare it for delivery.`
    }
  }

  if (status === "dispatched") {
    return {
      userId: buyerId,
      title: `${storeName} dispatched ${orderRef}`,
      body: `${storeName} has dispatched your items. Confirm delivery after you receive them.`
    }
  }

  if (status === "cancelled") {
    return {
      userId: buyerId,
      title: `${storeName} cancelled ${orderRef}`,
      body: `${storeName} cancelled this order.`
    }
  }

  if (paymentStatus === "paid_to_vendor") {
    return {
      userId: buyerId,
      title: `${storeName} confirmed your payment`,
      body: `${storeName} marked your direct payment for ${orderRef} as received.`
    }
  }

  if (paymentStatus === "awaiting_vendor_payment") {
    return {
      userId: buyerId,
      title: `${storeName} is ready for payment`,
      body: `Open ${orderRef} to pay ${storeName} directly.`
    }
  }

  return null
}

function getStoreName(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : ""
  return normalized || "Your seller"
}

function getDisplayName(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : ""
  if (!normalized) return "Buyer"

  const firstName = normalized.split(/\s+/)[0] ?? normalized
  return firstName.length > 18 ? `${firstName.slice(0, 18)}...` : firstName
}

function getOrderRef(orderId: string) {
  return `#${orderId.slice(0, 6).toUpperCase()}`
}
