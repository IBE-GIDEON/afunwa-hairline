"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"

import { useAuth } from "@/components/providers/auth-provider"
import { Badge, Button, Card, PAGE_WIDTH, SectionHeading } from "@/components/ui"
import {
  getOrderStatusMeta,
  getPaymentMethodMeta,
  getPaymentStatusMeta
} from "@/lib/constants"
import { formatCurrency, formatDate } from "@/lib/format"
import { archiveCompletedOrder, loadBuyerOrders, loadSellerOrders } from "@/lib/marketplace"
import { subscribeToOrderChanges } from "@/lib/orders-realtime"
import { type OrderDetail } from "@/lib/types"
import { cn } from "@/lib/utils"

type OrderTab = "purchases" | "store"

// ---------------------------------------------------------------------------
// Skeleton card shown while orders are loading
// ---------------------------------------------------------------------------
function OrderSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-28 animate-pulse rounded-[26px] bg-surface shadow-soft"
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function OrdersPageClient() {
  const { loading: authLoading, profile, vendorProfile } = useAuth()
  const [tab, setTab] = useState<OrderTab>("purchases")
  const [orders, setOrders] = useState<OrderDetail[]>([])
  const [fetching, setFetching] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [archivingId, setArchivingId] = useState<string | null>(null)

  // ------------------------------------------------------------------
  // Load orders whenever auth settles, the tab changes, or the user
  // profile becomes available for the first time.
  // ------------------------------------------------------------------
  const fetchOrders = useCallback(
    async (
      signal?: { cancelled: boolean },
      options: { silent?: boolean; fresh?: boolean } = {}
    ) => {
      if (!profile) return

      if (!options.silent) {
        setFetching(true)
        setLoadError(null)
      }

      try {
        const result =
          tab === "store" && vendorProfile
            ? await loadSellerOrders(profile.id, { fresh: options.fresh ?? false })
            : await loadBuyerOrders(profile.id, { fresh: options.fresh ?? false })

        if (signal?.cancelled) return
        setOrders(result)
      } catch (err) {
        if (signal?.cancelled) return
        console.error("[orders-page] load failed", err)
        if (!options.silent) {
          setLoadError(
            err instanceof Error ? err.message : "Could not load orders. Try again."
          )
        }
      } finally {
        if (!signal?.cancelled && !options.silent) setFetching(false)
      }
    },
    [profile, vendorProfile, tab]
  )

  useEffect(() => {
    if (authLoading) return
    if (!profile) {
      setFetching(false)
      return
    }

    const signal = { cancelled: false }
    // The saved copy first, so the list appears at once, then the real list.
    // The saved copy alone could hide a new order for up to ten minutes.
    void fetchOrders(signal).then(() => {
      if (!signal.cancelled) void fetchOrders(signal, { silent: true, fresh: true })
    })
    return () => {
      signal.cancelled = true
    }
  }, [authLoading, fetchOrders, profile])

  useEffect(() => {
    if (authLoading || !profile) return
    if (tab === "store" && !vendorProfile) return

    const signal = { cancelled: false }
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    const filter =
      tab === "store" && vendorProfile
        ? `vendor_id=eq.${vendorProfile.id}`
        : `buyer_id=eq.${profile.id}`

    const scheduleRefresh = () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer)
      }

      refreshTimer = setTimeout(() => {
        if (!signal.cancelled) {
          void fetchOrders(signal, { silent: true, fresh: true })
        }
      }, 250)
    }

    const unsubscribe = subscribeToOrderChanges({
      channelName: `orders:${tab}:${profile.id}:${vendorProfile?.id ?? "buyer"}`,
      filter,
      onChange: scheduleRefresh
    })

    return () => {
      signal.cancelled = true
      if (refreshTimer) {
        clearTimeout(refreshTimer)
      }
      unsubscribe()
    }
  }, [authLoading, fetchOrders, profile, tab, vendorProfile])

  // ------------------------------------------------------------------
  // Auth / loading guards
  // ------------------------------------------------------------------
  if (authLoading) {
    return (
      <div className={`${PAGE_WIDTH.content} space-y-4 p-4 pb-safe-nav lg:py-8`}>
        <SectionHeading title="Orders" />
        <OrderSkeleton />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className={`${PAGE_WIDTH.content} space-y-4 p-4 pb-safe-nav lg:py-8`}>
        <SectionHeading title="Orders" />
        <Card className="p-5">
          <p className="text-lg font-semibold text-ink">Sign in to view your orders</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            Your purchase history, delivery status, and store orders live here.
          </p>
          <Link
            href="/profile"
            className="mt-4 inline-flex rounded-full bg-chrome px-4 py-3 text-sm font-semibold text-white"
          >
            Go to Profile
          </Link>
        </Card>
      </div>
    )
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div className={`${PAGE_WIDTH.content} space-y-4 p-4 pb-safe-nav lg:py-8`}>
      <SectionHeading title="Orders" />

      {/* Tab switcher — only shown to sellers */}
      {vendorProfile ? (
        <div
          role="tablist"
          aria-label="Order view"
          className="grid grid-cols-2 rounded-full border border-border/70 bg-surface p-1 shadow-soft"
        >
          {(["purchases", "store"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              aria-label={t === "purchases" ? "My Purchases" : "My Store Orders"}
              className={cn(
                "rounded-full px-4 py-3 text-sm font-semibold transition",
                tab === t ? "bg-chrome text-white" : "text-muted"
              )}
              onClick={() => setTab(t)}
            >
              {t === "purchases" ? "My Purchases" : "My Store Orders"}
            </button>
          ))}
        </div>
      ) : null}

      {/* Body */}
      {fetching ? (
        <OrderSkeleton />
      ) : loadError ? (
        <Card className="p-5">
          <p className="text-lg font-semibold text-ink">Orders unavailable</p>
          <p className="mt-2 text-sm leading-6 text-muted">{loadError}</p>
          <Button className="mt-4 w-full" onClick={() => void fetchOrders(undefined, { fresh: true })}>
            Retry
          </Button>
        </Card>
      ) : orders.length === 0 ? (
        <Card className="p-5">
          <p className="text-lg font-semibold text-ink">No orders yet</p>
          <p className="mt-2 text-sm text-muted">
            {tab === "store"
              ? "Incoming store orders will appear here as soon as buyers place them."
              : "Your purchases will show up here with payment details and a live status update."}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const statusMeta = getOrderStatusMeta(order.status)
            const paymentMethodMeta = getPaymentMethodMeta(order.paymentMethod)
            const paymentStatusMeta = getPaymentStatusMeta(
              order.paymentStatus,
              order.paymentMethod
            )
            const title =
              tab === "store"
                ? order.buyer?.fullName ?? "Customer order"
                : order.vendor?.storeName ?? "Store order"
            const isCompletedOrder =
              order.status === "delivered" || order.status === "cancelled"

            return (
              <Card key={order.id} className="p-4 transition hover:bg-canvas">
                {/* Tappable header — navigates to detail */}
                <Link href={`/orders/${order.id}`} className="block">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{title}</p>
                      <p className="mt-1 text-sm text-muted">{formatDate(order.createdAt)}</p>
                      <p className="mt-2 text-xs leading-5 text-muted">
                        {paymentMethodMeta.label} · {paymentStatusMeta.label}
                      </p>
                      <p className="mt-2 text-base font-bold text-brand">
                        {formatCurrency(order.totalAmount)}
                      </p>
                    </div>
                    <Badge className={cn("shrink-0", statusMeta.className)}>
                      {statusMeta.label}
                    </Badge>
                  </div>
                </Link>

                {/* Action row */}
                <div className="mt-4 flex gap-2">
                  <Link
                    href={`/orders/${order.id}`}
                    aria-label={`Open order from ${title}`}
                    className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-chrome px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                  >
                    Open order
                  </Link>

                  {isCompletedOrder ? (
                    <Button
                      variant="outline"
                      className="flex-1"
                      aria-label={`Remove order from ${title} from history`}
                      disabled={archivingId === order.id}
                      onClick={async () => {
                        const actor = tab === "store" ? "seller" : "buyer"
                        const confirmed = window.confirm(
                          tab === "store"
                            ? "Remove this order from your store history only?"
                            : "Remove this order from your purchase history only?"
                        )
                        if (!confirmed) return

                        setArchivingId(order.id)
                        try {
                          const result = await archiveCompletedOrder(
                            order.id,
                            actor,
                            profile.id
                          )
                          setOrders((prev) =>
                            prev.filter((o) => o.id !== order.id)
                          )
                          toast.success(
                            result.localOnly
                              ? "Removed from this device."
                              : tab === "store"
                                ? "Removed from store history."
                                : "Removed from purchase history."
                          )
                        } catch (err) {
                          toast.error(
                            err instanceof Error
                              ? err.message
                              : "Could not remove this order."
                          )
                        } finally {
                          setArchivingId(null)
                        }
                      }}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
