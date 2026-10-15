"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { useCart } from "@/components/providers/cart-provider"
import { Card, SectionHeading } from "@/components/ui"
import {
  getOrderStatusMeta,
  getPaymentMethodMeta,
  getPaymentStatusMeta
} from "@/lib/constants"
import { formatCurrency } from "@/lib/format"
import { loadOrderDetail } from "@/lib/marketplace"
import { type OrderDetail } from "@/lib/types"

/** How often, and for how long, to check whether a card payment has cleared. */
const POLL_EVERY_MS = 4000
const POLL_FOR_MS = 3 * 60 * 1000

type LoadState = "loading" | "ready" | "missing" | "failed"

export default function OrderConfirmationPage({
  params
}: {
  params: { id: string }
}) {
  const { clearCart, items: cartItems } = useCart()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loadState, setLoadState] = useState<LoadState>("loading")
  // Stopped checking without seeing the payment clear.
  const [pollTimedOut, setPollTimedOut] = useState(false)

  const awaitingCard = order?.paymentStatus === "awaiting_card_payment"
  const paidByCard = order?.paymentStatus === "paid_by_card"

  // First load.
  useEffect(() => {
    let ignore = false
    loadOrderDetail(params.id, { fresh: true })
      .then((next) => {
        if (ignore) return
        setOrder(next)
        setLoadState(next ? "ready" : "missing")
      })
      .catch(() => {
        if (!ignore) setLoadState("failed")
      })
    return () => {
      ignore = true
    }
  }, [params.id])

  // The buyer lands here straight from Paystack, usually before the webhook
  // has marked the order paid. Check again until it clears, then stop.
  useEffect(() => {
    if (!awaitingCard) return

    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      if (Date.now() - startedAt > POLL_FOR_MS) {
        window.clearInterval(timer)
        setPollTimedOut(true)
        return
      }
      loadOrderDetail(params.id, { fresh: true })
        .then((next) => {
          if (next) setOrder(next)
        })
        .catch(() => {
          // A missed check is fine; the next one tries again.
        })
    }, POLL_EVERY_MS)

    return () => window.clearInterval(timer)
  }, [awaitingCard, params.id])

  // The cart is kept while the buyer is on Paystack, so an abandoned payment
  // does not cost them their basket. Once the money is in, it goes, so the
  // same basket cannot be paid for twice.
  //
  // Only when the cart still holds exactly this order. Opening an old paid
  // order later must not wipe a new basket the buyer has started since.
  const cartMatchesOrder = Boolean(
    order &&
      cartItems.length > 0 &&
      cartItems.length === order.items.length &&
      order.items.every((item) =>
        cartItems.some(
          (cartItem) =>
            cartItem.productId === item.productId && cartItem.quantity === item.quantity
        )
      )
  )

  useEffect(() => {
    if (paidByCard && cartMatchesOrder) clearCart()
  }, [paidByCard, cartMatchesOrder, clearCart])

  const orderStatusMeta = order ? getOrderStatusMeta(order.status) : null
  const paymentMethodMeta = order ? getPaymentMethodMeta(order.paymentMethod) : null
  const paymentStatusMeta = order
    ? getPaymentStatusMeta(order.paymentStatus, order.paymentMethod)
    : null

  return (
    <div className="space-y-4 p-4 pb-safe-nav">
      <SectionHeading title="Order confirmation" />
      <Card className="p-6 text-center">
        <p className="text-2xl font-bold text-ink">
          {awaitingCard ? "Waiting for your payment" : "Your order is in"}
        </p>
        <p className="mt-2 text-sm leading-6 text-muted">
          {awaitingCard
            ? pollTimedOut
              ? "This is taking longer than usual. If you were charged, your order will show as paid in All orders shortly. Do not pay again."
              : "Keep this page open. It updates by itself as soon as your payment clears."
            : "Your seller will receive this order right away and confirm the next step from their store dashboard."}
        </p>

        {loadState === "loading" ? (
          <p className="mt-5 text-sm text-muted">Loading your order...</p>
        ) : null}

        {loadState === "missing" ? (
          <p className="mt-5 rounded-2xl bg-canvas px-4 py-3 text-sm leading-6 text-muted">
            We could not find this order on your account. Sign in with the account
            you ordered with, then open All orders.
          </p>
        ) : null}

        {loadState === "failed" ? (
          <p className="mt-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            Your order could not be loaded just now. Check your connection and
            refresh this page. Your order is safe either way.
          </p>
        ) : null}

        {order ? (
          <div className="mt-5 space-y-3 rounded-[24px] bg-canvas p-4 text-left">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted">Order ID</span>
              <span className="truncate font-semibold text-ink">{order.id}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Status</span>
              <span className="font-semibold text-brand">
                {orderStatusMeta?.label}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Total</span>
              <span className="font-semibold text-ink">
                {formatCurrency(order.totalAmount)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Payment method</span>
              <span className="font-semibold text-ink">
                {paymentMethodMeta?.label}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Payment status</span>
              <span className="font-semibold text-ink">
                {paymentStatusMeta?.label}
              </span>
            </div>
            <p className="rounded-2xl bg-surface px-4 py-3 text-sm leading-6 text-muted">
              {order.paymentMethod === "vendor_transfer"
                ? "Wait for the seller to confirm the order first. Once they do, you will see their direct payment details inside the order."
                : order.paymentMethod === "pay_on_delivery"
                  ? "This order is set to pay on delivery. Inspect it first, then pay when it arrives."
                  : paidByCard
                    ? "Payment received. The seller has been notified and will get your order ready to ship."
                    : pollTimedOut
                      ? "We have not seen your payment clear yet. Check All orders in a few minutes before paying again."
                      : "We are waiting for your payment to confirm. This page updates itself once it clears."}
            </p>
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Link
            href={order ? `/orders/${order.id}` : "/orders"}
            className="inline-flex items-center justify-center rounded-full bg-chrome px-4 py-3 text-sm font-semibold text-white"
          >
            Open order
          </Link>
          <Link
            href="/orders"
            className="inline-flex items-center justify-center rounded-full border border-border bg-surface px-4 py-3 text-sm font-semibold text-ink"
          >
            All orders
          </Link>
        </div>
      </Card>
    </div>
  )
}
