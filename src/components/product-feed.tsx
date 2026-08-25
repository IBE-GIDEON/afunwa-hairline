"use client"

import Link from "next/link"
import { type ReactNode } from "react"

import { RemoteImage } from "@/components/remote-image"
import { Badge, StarRating } from "@/components/ui"
import { PriceTag } from "@/components/price-tag"
import { getProductCategoryLabel } from "@/lib/product-categories"
import { getPrimaryProductImage } from "@/lib/product-images"
import { type ProductSearchResult } from "@/lib/types"
import { usePageScroll } from "@/lib/use-page-scroll"
import { cn } from "@/lib/utils"

export function ProductFeed({
  products,
  onReachEnd,
  hasMore = false,
  loading = false,
  header,
  stickyHeader,
  emptyState,
  onScrollPositionChange,
  className
}: {
  products: ProductSearchResult[]
  onReachEnd?: () => void
  hasMore?: boolean
  loading?: boolean
  header?: ReactNode
  stickyHeader?: ReactNode
  emptyState?: ReactNode
  onScrollPositionChange?: (scrollTop: number) => void
  className?: string
}) {
  usePageScroll(({ scrollTop, nearBottom }) => {
    onScrollPositionChange?.(scrollTop)
    if (onReachEnd && hasMore && nearBottom) {
      onReachEnd()
    }
  })

  return (
    <div className={cn("bg-canvas", className)}>
      {stickyHeader ? stickyHeader : null}
      {header ? <div>{header}</div> : null}

      {loading ? (
        <div className="mx-auto grid w-full max-w-[1240px] grid-cols-2 gap-3 px-4 pb-5 pt-4 md:grid-cols-3 lg:gap-5 lg:px-6 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="overflow-hidden rounded-[24px] border border-border/70 bg-surface"
            >
              <div className="aspect-square animate-pulse bg-canvas" />
              <div className="space-y-2 p-3">
                <div className="h-3 w-20 animate-pulse rounded-full bg-canvas" />
                <div className="h-4 w-4/5 animate-pulse rounded-full bg-canvas" />
                <div className="h-4 w-2/5 animate-pulse rounded-full bg-canvas" />
              </div>
            </div>
          ))}
        </div>
      ) : products.length > 0 ? (
        <div className="mx-auto grid w-full max-w-[1240px] grid-cols-2 gap-3 px-4 pb-5 pt-4 md:grid-cols-3 lg:gap-5 lg:px-6 xl:grid-cols-4">
          {products.map((product) => (
            <ProductFeedCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="mx-auto w-full max-w-[1240px] px-4 pb-8 pt-6 text-sm leading-6 text-muted lg:px-6">
          {emptyState}
        </div>
      )}

      {hasMore ? (
        <div className="px-4 pb-4 text-center text-xs text-muted">
          Loading more products...
        </div>
      ) : null}
    </div>
  )
}

function ProductFeedCard({ product }: { product: ProductSearchResult }) {
  const primaryImage = getPrimaryProductImage(product)

  return (
    <Link
      href={`/vendor/${product.vendor.id}?product=${product.id}`}
      className="overflow-hidden rounded-[24px] border border-border/70 bg-surface text-left transition hover:bg-surface/90 active:scale-[0.99]"
    >
      <div className="relative aspect-square overflow-hidden bg-canvas">
        {primaryImage ? (
          <RemoteImage
            src={primaryImage}
            alt={product.name}
            sizes="(max-width: 430px) 50vw, (max-width: 1024px) 33vw, 300px"
            className={product.inStock ? undefined : "opacity-40"}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-canvas text-xs font-medium text-muted">
            No photo
          </div>
        )}

        {/* Out of stock — centred overlay */}
        {!product.inStock ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-black/75 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-white">
              Out of Stock
            </span>
          </div>
        ) : (
          /* In stock — small dot badge top-left */
          <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-[10px] font-semibold text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            In Stock
          </span>
        )}

        {/* Photo count — bottom right */}
        {product.photoUrls.length > 1 ? (
          <span className="absolute bottom-2.5 right-2.5 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold text-white">
            +{product.photoUrls.length - 1}
          </span>
        ) : null}
      </div>

      <div className="space-y-2 p-3">
        <p className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
          {product.vendor.storeName}
        </p>
        <p className="line-clamp-2 text-sm font-semibold leading-5 text-ink">
          {product.name}
        </p>
        <PriceTag
          price={product.price}
          compareAtPrice={product.compareAtPrice}
          weightKg={product.weightKg}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-canvas text-[11px]">
            {getProductCategoryLabel(product.category)}
          </Badge>
          {/* Keyed on rating, not reviewCount: the feed mappers hardcode
              reviewCount to 0, so a count-based test would say "New" forever.
              rating is maintained by the update_vendor_rating trigger and is
              0 until the first review, which is exactly the test we want —
              and before then a flat 0.0 reads worse than saying nothing. */}
          {product.vendor.rating > 0 ? (
            <StarRating rating={product.vendor.rating} />
          ) : (
            <span className="text-[11px] font-medium text-muted">New</span>
          )}
        </div>
      </div>
    </Link>
  )
}
