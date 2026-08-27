"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { Card, SectionHeading } from "@/components/ui"
import {
  getOrderStatusMeta,
  getPaymentMethodMeta,
  getPaymentStatusMeta
} from "@/lib/constants"
import { formatCurrency } from "@/lib/format"
import { loadOrderDetail } from "@/lib/marketplace"
import { type OrderDetail } from "@/lib/types"

export default function OrderConfirmationPage({
  params
}: {
  params: { id: string }
}) {
  const [order, setOrder] = useState<OrderDetail | null>(null)

  useEffect(() => {
    loadOrderDetail(params.id, { fresh: true }).then(setOrder)
  }, [params.id])

  const orderStatusMeta = order ? getOrderStatusMeta(order.status) : null
  const paymentMethodMeta = order ? getPaymentMethodMeta(order.paymentMethod) : null
  const paymentStatusMeta = order
    ? getPaymentStatusMeta(order.paymentStatus, order.paymentMethod)
    : null

  return (
    <div className="space-y-4 p-4 pb-safe-nav">
      <SectionHeading title="Order confirmation" />
      <Card className="p-6 text-center">
        <p className="text-2xl font-bold text-ink">Your order is in</p>
        <p className="mt-2 text-sm leading-6 text-muted">
          Your seller will receive this order right away and confirm the next step
          from their store dashboard.
        </p>
        {order ? (
          <div className="mt-5 space-y-3 rounded-[24px] bg-canvas p-4 text-left">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Order ID</span>
              <span className="font-semibold text-ink">{order.id}</span>
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
              {/* Card and PayPal fall through to the last branch, so every
                  card payer was being told to pay the rider on arrival. */}
              {order.paymentMethod === "vendor_transfer"
                ? "Wait for the seller to confirm the order first. Once they do, you will see their direct payment details inside the order."
                : order.paymentMethod === "pay_on_delivery"
                  ? "This order is set to pay on delivery. Inspect it first, then pay when it arrives."
                  : order.paymentStatus === "paid_by_card"
                    ? "Payment received. The seller has been notified and will get your order ready to ship."
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
