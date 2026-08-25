"use client"

import { useLocale } from "@/components/providers/locale-provider"
import { getDiscountPercent } from "@/lib/pricing"
import { useZonePricing } from "@/lib/use-zone-pricing"
import { cn } from "@/lib/utils"

/**
 * Current price, with the old one struck through beside it when there is a
 * genuine discount.
 *
 * One component for the feed, search, storefront and product sheet, so a
 * discount can never render four slightly different ways — and so the rule for
 * what counts as a discount lives in exactly one place.
 *
 * Outside Nigeria the price shown already contains the shipping, which is why
 * the weight matters here: a heavier parcel costs more to send, so it carries
 * a larger uplift. Checkout then shows no postage line at all. Every price in
 * the shop passes through this component, which is the only reason a change
 * this sweeping is safe to make in one place.
 */
export function PriceTag({
  price,
  compareAtPrice,
  weightKg,
  className,
  size = "sm",
  showBadge = false
}: {
  price: number
  compareAtPrice?: number
  /** Drives the shipping already folded into the price outside Nigeria. */
  weightKg?: number
  className?: string
  size?: "sm" | "lg"
  showBadge?: boolean
}) {
  const { money } = useLocale()
  const { upliftFor, shippingIncluded } = useZonePricing()

  const uplift = upliftFor(weightKg)
  const delivered = price + uplift
  // The old price is lifted by the same amount, or the discount would appear
  // to shrink the moment a shopper switches to a country with shipping in it.
  const deliveredCompareAt = compareAtPrice ? compareAtPrice + uplift : undefined

  // Worked out on the original pair: adding the same figure to both would
  // otherwise quietly reduce the percentage shown.
  const discount = getDiscountPercent(price, compareAtPrice)

  return (
    <span className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-1", className)}>
      <span
        className={cn(
          "font-bold text-brand",
          size === "lg" ? "text-2xl" : "text-base"
        )}
      >
        {money(delivered).text}
      </span>

      {discount ? (
        <>
          <s
            className={cn(
              "text-muted decoration-muted/60",
              size === "lg" ? "text-base" : "text-xs"
            )}
          >
            {money(deliveredCompareAt as number).text}
          </s>
          {showBadge ? (
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand">
              -{discount}%
            </span>
          ) : null}
        </>
      ) : null}

      {shippingIncluded && uplift > 0 ? (
        <span className="text-[11px] font-medium text-success">
          Shipping included
        </span>
      ) : null}
    </span>
  )
}
