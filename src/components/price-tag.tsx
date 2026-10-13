"use client"

import { useLocale } from "@/components/providers/locale-provider"
import { getDiscountPercent } from "@/lib/pricing"
import { cn } from "@/lib/utils"

/**
 * Current price, with the old one struck through beside it when there is a
 * genuine discount.
 *
 * One component for the feed, search, storefront and product sheet, so a
 * discount can never render four slightly different ways, and so the rule for
 * what counts as a discount lives in exactly one place.
 *
 * Listings show the product price. Delivery is handled at checkout.
 */
export function PriceTag({
  price,
  compareAtPrice,
  className,
  size = "sm",
  showBadge = false
}: {
  price: number
  compareAtPrice?: number
  className?: string
  size?: "sm" | "lg"
  showBadge?: boolean
}) {
  const { money } = useLocale()

  // Worked out on the original pair, so the percentage is the real saving.
  const discount = getDiscountPercent(price, compareAtPrice)

  return (
    <span className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-1", className)}>
      <span
        className={cn(
          "font-bold text-brand",
          size === "lg" ? "text-2xl" : "text-base"
        )}
      >
        {money(price).text}
      </span>
      {discount ? (
        <>
          <s
            className={cn(
              "text-muted decoration-muted/60",
              size === "lg" ? "text-base" : "text-xs"
            )}
          >
            {money(compareAtPrice as number).text}
          </s>
          {showBadge ? (
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand">
              -{discount}%
            </span>
          ) : null}
        </>
      ) : null}
    </span>
  )
}
