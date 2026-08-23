"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { FiMessageCircle, FiRefreshCw } from "react-icons/fi"

import { useAuth } from "@/components/providers/auth-provider"
import { buildTrackingUrl, formatTrackingLabel } from "@/lib/tracking"
import {
  Badge,
  Button,
  Card,
  Input,
  PAGE_WIDTH,
  SectionHeading,
  Textarea
} from "@/components/ui"
import {
  getOrderStatusMeta,
  getPaymentMethodMeta,
  getPaymentStatusMeta
} from "@/lib/constants"
import { formatCurrency, formatDateTime } from "@/lib/format"
import {
  archiveCompletedOrder,
  loadOrderDetail,
  loadVendorDetail,
  saveReview,
  updateOrderStatus
} from "@/lib/marketplace"
import { subscribeToOrderChanges } from "@/lib/orders-realtime"
import {
  type OrderArchiveActor,
  type OrderDetail,
  type OrderStatus,
  type PaymentStatus,
  type VendorDetail
} from "@/lib/types"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STATUS_STEPS: OrderStatus[] = ["pending", "confirmed", "dispatched", "delivered"]

// ---------------------------------------------------------------------------
// Small sub-components
// ---------------------------------------------------------------------------
function LoadingState() {
  return (
    <div className={`${PAGE_WIDTH.content} space-y-4 p-4 pb-safe-nav lg:py-8`}>
      <SectionHeading title="Order detail" />
      <div className="h-48 animate-pulse rounded-[26px] bg-surface shadow-soft" />
      <div className="h-28 animate-pulse rounded-[26px] bg-surface shadow-soft" />
    </div>
  )
}

function ErrorState({
  message,
  onRetry,
  onBack
}: {
  message: string
  onRetry?: () => void
  onBack: () => void
}) {
  return (
    <div className={`${PAGE_WIDTH.content} space-y-4 p-4 pb-safe-nav lg:py-8`}>
      <SectionHeading title="Order detail" />
      <Card className="space-y-4 p-5">
        <div>
          <p className="text-lg font-semibold text-ink">Order could not open</p>
          <p className="mt-2 text-sm leading-6 text-muted">{message}</p>
        </div>
        <div className="flex flex-col gap-3">
          {onRetry ? (
            <Button className="w-full" onClick={onRetry}>
              <FiRefreshCw className="mr-2 h-4 w-4" />
              Try again
            </Button>
          ) : null}
          <Button variant="outline" className="w-full" onClick={onBack}>
            Back to orders
          </Button>
        </div>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function OrderDetailClient({ orderId }: { orderId: string }) {
  const { loading: authLoading, profile, vendorProfile } = useAuth()
  const router = useRouter()

  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [vendorData, setVendorData] = useState<VendorDetail | null>(null)
  const [fetching, setFetching] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState("")
  const [deliveryDraft, setDeliveryDraft] = useState("")
  const [trackingNumber, setTrackingNumber] = useState("")
  const [trackingCarrier, setTrackingCarrier] = useState("")
  const [trackingUrl, setTrackingUrl] = useState("")

  // ------------------------------------------------------------------
  // Load the order — only fires once auth has settled
  // ------------------------------------------------------------------
  const loadOrder = useCallback(
    async (
      signal?: { cancelled: boolean },
      options: { silent?: boolean } = {}
    ) => {
      if (!profile) return

      if (!options.silent) {
        setFetching(true)
        setLoadError(null)
      }

      try {
        const nextOrder = await loadOrderDetail(orderId, { fresh: true })
        if (signal?.cancelled) return

        if (!nextOrder) {
          setLoadError(
            "This order was not found, or your account does not have access to it."
          )
          if (!options.silent) setFetching(false)
          return
        }

        setOrder(nextOrder)
        // Unblock the loading spinner as soon as the order is ready —
        // vendor detail loads in the background so the page feels instant.
        if (!options.silent) setFetching(false)

        // Fetch vendor detail only when the current user is the buyer
        // (needed to show payment bank details). Non-blocking.
        if (nextOrder.vendorId && profile.id === nextOrder.buyerId) {
          loadVendorDetail(nextOrder.vendorId)
            .then((detail) => { if (!signal?.cancelled) setVendorData(detail) })
            .catch(() => {})
        }
      } catch (err) {
        if (signal?.cancelled) return
        console.error("[order-detail] load failed", err)
        if (!options.silent) {
          setFetching(false)
          setLoadError(
            err instanceof Error
              ? err.message
              : "Something went wrong loading this order."
          )
        }
      }
    },
    [orderId, profile]
  )

  useEffect(() => {
    // Wait for auth bootstrap to complete before touching the DB.
    if (authLoading) return

    const signal = { cancelled: false }
    void loadOrder(signal)
    return () => {
      signal.cancelled = true
    }
  }, [authLoading, loadOrder])

  useEffect(() => {
    if (authLoading || !profile) return

    const signal = { cancelled: false }
    let refreshTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleRefresh = () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer)
      }

      refreshTimer = setTimeout(() => {
        if (!signal.cancelled) {
          void loadOrder(signal, { silent: true })
        }
      }, 250)
    }

    const unsubscribe = subscribeToOrderChanges({
      channelName: `order-detail:${orderId}:${profile.id}`,
      filter: `id=eq.${orderId}`,
      onChange: scheduleRefresh
    })

    return () => {
      signal.cancelled = true
      if (refreshTimer) {
        clearTimeout(refreshTimer)
      }
      unsubscribe()
    }
  }, [authLoading, loadOrder, orderId, profile])

  useEffect(() => {
    setDeliveryDraft(order?.deliveryAddress ?? "")
  }, [order?.deliveryAddress])

  // ------------------------------------------------------------------
  // Derived state
  // ------------------------------------------------------------------
  // Each side is fully independent.
  // If somehow the same user is both the buyer and the seller of this order,
  // the seller view takes priority — sellers manage from their store side.
  const isSeller = Boolean(
    profile && vendorProfile && order?.vendorId === vendorProfile.id
  )
  const isBuyer = Boolean(
    profile && order?.buyerId === profile.id && !isSeller
  )
  const archiveActor: OrderArchiveActor | null = isSeller
    ? "seller"
    : isBuyer
      ? "buyer"
      : null
  const canArchive =
    Boolean(archiveActor) &&
    (order?.status === "delivered" || order?.status === "cancelled")

  const vendorReviews = Array.isArray(vendorData?.reviews) ? vendorData.reviews : []
  const canReview =
    isBuyer &&
    order?.status === "delivered" &&
    !vendorReviews.some((r) => r.orderId === order?.id)

  // ------------------------------------------------------------------
  // Order action helper
  // ------------------------------------------------------------------
  const applyUpdate = async (
    updates: {
      status?: OrderStatus
      paymentStatus?: PaymentStatus
      deliveryAddress?: string
      trackingNumber?: string
      trackingCarrier?: string
      trackingUrl?: string
    },
    successMsg: string
  ) => {
    if (!order) return
    const prev = order
    setBusy(true)
    setOrder((cur) => (cur ? { ...cur, ...updates } : cur))
    try {
      await updateOrderStatus(order.id, updates)
      toast.success(successMsg)
    } catch (err) {
      setOrder(prev)
      toast.error(
        err instanceof Error ? err.message : "Could not update this order."
      )
    } finally {
      setBusy(false)
    }
  }

  // ------------------------------------------------------------------
  // Seller progress hint
  // ------------------------------------------------------------------
  const sellerHint = useMemo(() => {
    if (!isSeller || !order) return null
    if (order.status === "cancelled") return "This order was cancelled."
    if (order.status === "delivered") return "The buyer has confirmed this delivery."
    if (order.paymentMethod === "vendor_transfer" && order.status === "confirmed") {
      return order.paymentStatus === "paid_to_vendor"
        ? "Direct payment confirmed — you can dispatch the order now."
        : "Waiting for the buyer to pay you directly. Mark payment received when done."
    }
    if (order.status === "dispatched") {
      return "Order is on its way. The buyer will confirm delivery after receiving it."
    }
    return "Only your store can move this order forward. Buyers see the updates in real time."
  }, [isSeller, order])

  // ------------------------------------------------------------------
  // Guard states
  // ------------------------------------------------------------------
  if (authLoading || (fetching && !order)) {
    return <LoadingState />
  }

  if (!profile) {
    return (
      <ErrorState
        message="Sign in to view this order."
        onBack={() => router.push("/orders")}
      />
    )
  }

  if (loadError) {
    return (
      <ErrorState
        message={loadError}
        onRetry={() => void loadOrder()}
        onBack={() => router.push("/orders")}
      />
    )
  }

  if (!order) {
    return (
      <ErrorState
        message="This order is not available on this account."
        onRetry={() => void loadOrder()}
        onBack={() => router.push("/orders")}
      />
    )
  }

  // ------------------------------------------------------------------
  // Computed display values (safe — all normalize functions have fallbacks)
  // ------------------------------------------------------------------
  const activeVendor = vendorData?.vendor ?? order.vendor
  const vendorName = activeVendor?.storeName ?? "Vendor"
  const whatsappNumber = activeVendor?.whatsappNumber
  const paymentMethodMeta = getPaymentMethodMeta(order.paymentMethod)
  const paymentStatusMeta = getPaymentStatusMeta(order.paymentStatus, order.paymentMethod)
  const orderStatusMeta = getOrderStatusMeta(order.status)
  const orderItems = Array.isArray(order.items) ? order.items : []
  const vendorTransferReady = Boolean(
    activeVendor?.bankName && activeVendor?.accountName && activeVendor?.accountNumber
  )

  // Seller action gates
  const trackingHref = buildTrackingUrl({
    trackingNumber: order.trackingNumber,
    trackingCarrier: order.trackingCarrier,
    trackingUrl: order.trackingUrl
  })

  const sellerCanConfirm = isSeller && order.status === "pending"
  const sellerCanReject = isSeller && order.status === "pending"
  const sellerCanMarkPaid =
    isSeller &&
    order.paymentMethod === "vendor_transfer" &&
    order.status === "confirmed" &&
    order.paymentStatus !== "paid_to_vendor"
  // Dispatch means the money question is settled: paid on the card, paid into
  // the account and confirmed, or due on delivery. paid_by_card was missing
  // here, so a card order that Flutterwave had already settled showed as Paid
  // with no way to send it.
  const sellerCanDispatch =
    isSeller &&
    order.status === "confirmed" &&
    (order.paymentMethod === "pay_on_delivery" ||
      order.paymentStatus === "paid_to_vendor" ||
      order.paymentStatus === "paid_by_card")
  const buyerCanEditDelivery =
    isBuyer && (order.status === "pending" || order.status === "confirmed")
  const buyerCanConfirmDelivery = isBuyer && order.status === "dispatched"

  // ------------------------------------------------------------------
  // Full render
  // ------------------------------------------------------------------
  return (
    <div className={`${PAGE_WIDTH.content} space-y-4 p-4 pb-safe-nav lg:py-8`}>
      <SectionHeading title="Order detail" />

      {/* ---- Order summary card ---- */}
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-ink">
              {isSeller ? "Store order" : vendorName}
            </p>
            <p className="mt-1 text-sm text-muted">
              {isSeller
                ? "Confirm, collect payment if needed, then dispatch. The buyer closes delivery."
                : "Track seller updates and payment instructions in one place."}
            </p>
            <p className="mt-2 text-xs uppercase tracking-[0.16em] text-muted">
              {formatDateTime(order.createdAt)}
            </p>
          </div>
          <Badge className={orderStatusMeta.className}>{orderStatusMeta.label}</Badge>
        </div>

        {/* Items */}
        <div className="mt-5 space-y-3">
          {orderItems.map((item) => (
            <div
              key={item.productId}
              className="flex items-center justify-between text-sm"
            >
              <div>
                <p className="font-medium text-ink">{item.name}</p>
                <p className="text-muted">Qty {item.quantity}</p>
              </div>
              <p className="font-semibold text-brand">
                {formatCurrency(item.price * item.quantity)}
              </p>
            </div>
          ))}
        </div>

        {/* Drop-off location */}
        {buyerCanEditDelivery || order.deliveryAddress ? (
          <div className="mt-5 rounded-2xl bg-canvas p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">
              Drop-off location
            </p>
            {buyerCanEditDelivery ? (
              <div className="mt-3 space-y-3">
                <Textarea
                  value={deliveryDraft}
                  onChange={(event) => setDeliveryDraft(event.target.value)}
                  placeholder="Where should the seller deliver this order?"
                  className="min-h-[96px] bg-surface"
                />
                <p className="text-xs leading-5 text-muted">
                  You can edit this before the seller dispatches the order.
                </p>
                <Button
                  variant="secondary"
                  className="w-full"
                  disabled={busy || deliveryDraft.trim() === order.deliveryAddress.trim()}
                  onClick={() => {
                    const nextAddress = deliveryDraft.trim()
                    if (!nextAddress) {
                      toast.error("Add a drop-off location first.")
                      return
                    }
                    void applyUpdate(
                      { deliveryAddress: nextAddress },
                      "Drop-off location updated."
                    )
                  }}
                >
                  Save Location
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-sm leading-6 text-ink">
                {order.deliveryAddress || "No drop-off location added."}
              </p>
            )}
          </div>
        ) : null}

        {/* Total */}
        <div className="mt-5 flex items-center justify-between">
          <p className="text-sm text-muted">Total</p>
          <p className="text-xl font-bold text-brand">
            {formatCurrency(order.totalAmount)}
          </p>
        </div>

        {/* WhatsApp: buyer chats seller */}
        {isBuyer && whatsappNumber ? (
          <a
            href={`https://wa.me/${whatsappNumber}`}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full border border-whatsapp/25 bg-surface px-4 py-3 text-sm font-semibold text-whatsapp"
          >
            <FiMessageCircle />
            Chat Seller on WhatsApp
          </a>
        ) : null}

        {/* WhatsApp: seller chats buyer */}
        {isSeller && order.buyer?.phone ? (
          <a
            href={`https://wa.me/${order.buyer.phone}`}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full border border-whatsapp/25 bg-surface px-4 py-3 text-sm font-semibold text-whatsapp"
          >
            <FiMessageCircle />
            Chat Buyer on WhatsApp
          </a>
        ) : null}
      </Card>

      {/* ---- Payment card ---- */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-canvas text-ink">{paymentMethodMeta.label}</Badge>
          <Badge className={paymentStatusMeta.className}>{paymentStatusMeta.label}</Badge>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted">{paymentStatusMeta.helper}</p>

        <div className="mt-4 rounded-2xl bg-canvas p-4">
          {isBuyer ? (
            <>
              {order.paymentMethod === "pay_on_delivery" ? (
                <p className="text-sm leading-6 text-ink">
                  This seller will collect cash or transfer when the order arrives.
                  Inspect it first before paying.
                </p>
              ) : order.paymentStatus === "awaiting_seller_confirmation" ? (
                <p className="text-sm leading-6 text-ink">
                  Wait for the seller to confirm first. Their payment details will
                  appear here once they do.
                </p>
              ) : vendorTransferReady ? (
                <div className="space-y-2 text-sm">
                  {[
                    ["Bank", activeVendor?.bankName],
                    ["Account name", activeVendor?.accountName],
                    ["Account number", activeVendor?.accountNumber]
                  ].map(([label, value]) =>
                    value ? (
                      <div key={label} className="flex items-center justify-between gap-3">
                        <span className="text-muted">{label}</span>
                        <span className="font-semibold text-ink">{value}</span>
                      </div>
                    ) : null
                  )}
                  {activeVendor?.paymentNote ? (
                    <p className="mt-3 rounded-2xl bg-surface px-4 py-3 text-sm leading-6 text-muted">
                      {activeVendor.paymentNote}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm leading-6 text-ink">
                  This seller has not added bank details yet. Use WhatsApp to agree
                  on how to complete direct payment.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm leading-6 text-ink">
              {order.paymentMethod === "pay_on_delivery"
                ? "The buyer will pay when the order arrives."
                : order.paymentStatus === "paid_to_vendor"
                  ? "You already marked the buyer's direct payment as received."
                  : order.status === "pending"
                    ? "Confirm this order first so the buyer can see your direct payment instructions."
                    : "Wait for the buyer's transfer, then mark payment received."}
            </p>
          )}
        </div>
      </Card>

      {/* ---- Courier tracking, once there is any ---- */}
      {order.trackingNumber || order.trackingCarrier ? (
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink">Tracking</p>
          <p className="mt-2 select-all font-mono text-sm text-ink">
            {formatTrackingLabel({
              trackingNumber: order.trackingNumber,
              trackingCarrier: order.trackingCarrier
            })}
          </p>
          {trackingHref ? (
            <a
              href={trackingHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center justify-center rounded-full bg-chrome px-4 py-2.5 text-sm font-semibold text-white"
            >
              Track this parcel
            </a>
          ) : (
            // No link rather than a guessed one: a tracking page that 404s
            // reads as a lost parcel.
            <p className="mt-2 text-xs leading-5 text-muted">
              Copy this number into the courier&apos;s own tracking page.
            </p>
          )}
        </Card>
      ) : null}

      {/* ---- Status timeline (buyers only) ---- */}
      {isBuyer ? (
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink">Status timeline</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            Your seller updates this as the order moves forward.
          </p>
          <div className="mt-4 space-y-3">
            {STATUS_STEPS.map((step, idx) => {
              const currentIdx = STATUS_STEPS.indexOf(order.status)
              const reached = currentIdx >= idx
              return (
                <div key={step} className="flex items-center gap-3">
                  <div
                    className={`h-3 w-3 rounded-full ${reached ? "bg-brand" : "bg-border"}`}
                  />
                  <p className={reached ? "font-medium text-ink" : "text-muted"}>
                    {getOrderStatusMeta(step).label}
                  </p>
                </div>
              )
            })}
          </div>
        </Card>
      ) : null}

      {/* ---- Buyer cancel card (pending orders only) ---- */}
      {isBuyer && order.status === "pending" ? (
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink">Cancel this order</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            The seller has not confirmed yet. You can decline now — they will be notified.
          </p>
          <Button
            variant="outline"
            className="mt-4 w-full border-rose-200 text-rose-700 hover:border-rose-300"
            disabled={busy}
            onClick={() => {
              const ok = window.confirm(
                "Are you sure you want to decline this order?"
              )
              if (!ok) return
              void applyUpdate({ status: "cancelled" }, "Order declined.")
            }}
          >
            Decline Order
          </Button>
        </Card>
      ) : null}

      {/* ---- Buyer delivery confirmation ---- */}
      {buyerCanConfirmDelivery ? (
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink">Confirm delivery</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            Only tap this after you have received the product and the order is okay.
          </p>
          <Button
            className="mt-4 w-full"
            disabled={busy}
            onClick={() => {
              const ok = window.confirm("Confirm that you have received this order?")
              if (!ok) return
              void applyUpdate({ status: "delivered" }, "Delivery confirmed.")
            }}
          >
            I Have Received It
          </Button>
        </Card>
      ) : null}

      {/* ---- Seller action card ---- */}
      {isSeller ? (
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink">Fulfil this order</p>
          {sellerHint ? (
            <p className="mt-2 text-sm leading-6 text-muted">{sellerHint}</p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-3">
            {sellerCanConfirm ? (
              <Button
                disabled={busy}
                onClick={() =>
                  applyUpdate(
                    {
                      status: "confirmed",
                      paymentStatus:
                        order.paymentMethod === "vendor_transfer"
                          ? "awaiting_vendor_payment"
                          : "pay_on_delivery"
                    },
                    order.paymentMethod === "vendor_transfer"
                      ? "Order confirmed. Buyer can now pay you directly."
                      : "Order confirmed."
                  )
                }
              >
                Confirm Order
              </Button>
            ) : null}

            {sellerCanReject ? (
              <Button
                variant="outline"
                className="border-rose-200 text-rose-700 hover:border-rose-300"
                disabled={busy}
                onClick={() => applyUpdate({ status: "cancelled" }, "Order cancelled.")}
              >
                Reject Order
              </Button>
            ) : null}

            {sellerCanMarkPaid ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  applyUpdate(
                    { paymentStatus: "paid_to_vendor" },
                    "Direct payment marked as received."
                  )
                }
              >
                Mark Payment Received
              </Button>
            ) : null}

            {sellerCanDispatch ? (
              <div className="space-y-3">
                {/* Asked for here rather than on a separate screen: the moment
                    you have a tracking number is the moment you dispatch. */}
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    placeholder="Courier, e.g. DHL"
                    value={trackingCarrier}
                    onChange={(event) => setTrackingCarrier(event.target.value)}
                  />
                  <Input
                    placeholder="Tracking number (optional)"
                    value={trackingNumber}
                    onChange={(event) => setTrackingNumber(event.target.value)}
                  />
                </div>
                <Input
                  placeholder="Tracking link, if the courier gave one (optional)"
                  value={trackingUrl}
                  onChange={(event) => setTrackingUrl(event.target.value)}
                />
                <Button
                  className="w-full"
                  disabled={busy}
                  onClick={() =>
                    applyUpdate(
                      {
                        status: "dispatched",
                        trackingNumber: trackingNumber.trim(),
                        trackingCarrier: trackingCarrier.trim(),
                        trackingUrl: trackingUrl.trim()
                      },
                      "Order marked dispatched."
                    )
                  }
                >
                  Mark Dispatched
                </Button>
              </div>
            ) : null}

          </div>
        </Card>
      ) : null}

      {/* ---- Review card (buyers, delivered orders only) ---- */}
      {isBuyer && canReview ? (
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink">Leave a review</p>
          <div className="mt-4 flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
                  reviewRating >= star ? "bg-chrome text-white" : "bg-canvas text-muted"
                }`}
                onClick={() => setReviewRating(star)}
              >
                {star}
              </button>
            ))}
          </div>
          <label
            htmlFor="review-comment"
            className="sr-only"
          >
            Your review
          </label>
          <textarea
            id="review-comment"
            className="mt-4 min-h-[110px] w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-brand/40"
            placeholder="Tell other buyers how it went"
            value={reviewComment}
            onChange={(e) => setReviewComment(e.target.value)}
          />
          <Button
            className="mt-4 w-full"
            disabled={busy}
            onClick={async () => {
              if (!profile) return
              setBusy(true)
              try {
                await saveReview({
                  orderId: order.id,
                  buyerId: profile.id,
                  vendorId: order.vendorId,
                  rating: reviewRating,
                  comment: reviewComment,
                  buyerName: profile.fullName
                })
                toast.success("Thanks for the review!")
                setReviewComment("")
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Could not save review."
                )
              } finally {
                setBusy(false)
              }
            }}
          >
            Submit Review
          </Button>
        </Card>
      ) : null}

      {/* ---- Archive card ---- */}
      {canArchive && profile ? (
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink">History</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            {isSeller
              ? "Remove this order from your store history. The buyer keeps their own copy."
              : "Remove this order from your purchase history. The seller keeps their own copy."}
          </p>
          <Button
            variant="outline"
            className="mt-4 w-full"
            disabled={busy}
            onClick={async () => {
              const ok = window.confirm("Remove this completed order from your history?")
              if (!ok) return
              setBusy(true)
              try {
                const result = await archiveCompletedOrder(
                  order.id,
                  archiveActor!,
                  profile.id
                )
                toast.success(
                  result.localOnly
                    ? "Removed from this device."
                    : "Removed from your history."
                )
                router.push("/orders")
                router.refresh()
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Could not remove this order."
                )
              } finally {
                setBusy(false)
              }
            }}
          >
            Remove from history
          </Button>
        </Card>
      ) : null}
    </div>
  )
}
