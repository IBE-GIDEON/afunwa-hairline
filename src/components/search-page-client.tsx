"use client"

import Link from "next/link"
import { useDeferredValue, useEffect, useRef, useState } from "react"
import { FiChevronRight, FiMapPin, FiSearch } from "react-icons/fi"

import {
  Avatar,
  Badge,
  Input,
  PAGE_WIDTH,
  SectionHeading,
  StarRating
} from "@/components/ui"
import { CATEGORY_TILES } from "@/lib/banners"
import {
  getProductCategoryLabel,
  isProductCategory
} from "@/lib/product-categories"
import { VENDOR_DISCOVERY_ENABLED } from "@/lib/feature-flags"
import { PriceTag } from "@/components/price-tag"
import { formatCategory } from "@/lib/format"
import {
  loadMarketplaceSearch,
  loadProductsByCategory,
  peekCachedMarketplaceSearch
} from "@/lib/marketplace"
import { getPrimaryProductImage } from "@/lib/product-images"
import { useMarketplaceRefresh } from "@/lib/use-marketplace-refresh"
import { usePageScroll } from "@/lib/use-page-scroll"
import {
  type MarketplaceSearchResults,
  type ProductSearchResult,
  type VendorSnapshot
} from "@/lib/types"
import { cn } from "@/lib/utils"

type SearchMode = "all" | "products" | "stores"

const emptyResults: MarketplaceSearchResults = {
  products: [],
  vendors: []
}

export function SearchPageClient({
  initialQuery = "",
  initialCategory = ""
}: {
  initialQuery?: string
  initialCategory?: string
}) {
  const initialResults = peekCachedMarketplaceSearch(initialQuery)
  const [query, setQuery] = useState(initialQuery)
  const [category, setCategory] = useState(
    isProductCategory(initialCategory) ? initialCategory : ""
  )
  const [mode, setMode] = useState<SearchMode>("all")
  const [results, setResults] = useState<MarketplaceSearchResults>(
    initialResults.products.length || initialResults.vendors.length
      ? initialResults
      : emptyResults
  )
  const [loading, setLoading] = useState(
    initialResults.products.length === 0 && initialResults.vendors.length === 0
  )
  const stickyRef = useRef<HTMLDivElement | null>(null)
  const compactRef = useRef(false)
  const deferredQuery = useDeferredValue(query)
  const refreshToken = useMarketplaceRefresh()
  const activeQuery = deferredQuery.trim()
  const showProducts = mode === "all" || mode === "products"
  const showVendors =
    VENDOR_DISCOVERY_ENABLED && (mode === "all" || mode === "stores")

  /**
   * Tapping a chip also rewrites ?q= so the view is shareable and Back works,
   * via replaceState rather than the router — no server round trip, and the
   * results are already being fetched client-side.
   */
  const selectCategory = (next: string) => {
    setCategory(next)

    if (typeof window === "undefined") return
    const url = new URL(window.location.href)
    if (next) {
      url.searchParams.set("category", next)
    } else {
      url.searchParams.delete("category")
    }
    window.history.replaceState(window.history.state, "", url.toString())
  }

  // Written to the DOM rather than to state: keeping it in state re-rendered
  // the whole results grid on every scroll frame.
  usePageScroll(({ scrollTop }) => {
    const next = scrollTop > 88
    if (next === compactRef.current) return
    compactRef.current = next
    if (stickyRef.current) {
      stickyRef.current.dataset.compact = next ? "true" : "false"
    }
  })

  useEffect(() => {
    let ignore = false
    setLoading(results.products.length === 0 && results.vendors.length === 0)

    // A shelf narrows by class, the words narrow within it, and the two stack:
    // "Closures and frontals" + "13x4" lands on exactly that closure.
    const request = category
      ? loadProductsByCategory(category, deferredQuery).then((products) => ({
          products,
          vendors: []
        }))
      : loadMarketplaceSearch(deferredQuery)

    request
      .then((data) => {
        if (!ignore) {
          setResults(data)
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false)
        }
      })

    return () => {
      ignore = true
    }
    // refreshToken ticks when a background check finds the catalogue changed.
  }, [category, deferredQuery, refreshToken])

  return (
    <div className="pb-6 pt-0">
      <div className="bg-canvas">
        <div
          ref={stickyRef}
          data-compact="false"
          className="group pointer-events-none sticky top-0 z-20 -mb-12 lg:top-[72px] border-b border-transparent bg-transparent transition-colors duration-200 data-[compact=true]:border-black/5 data-[compact=true]:bg-white/70 data-[compact=true]:backdrop-blur-md dark:data-[compact=true]:border-white/10 dark:data-[compact=true]:bg-black/40"
        >
          <div className="flex h-12 items-center justify-center">
            <span className="translate-y-1 text-sm font-semibold tracking-[-0.01em] text-ink opacity-0 transition duration-200 group-data-[compact=true]:translate-y-0 group-data-[compact=true]:opacity-100 dark:text-white">
              Search
            </span>
          </div>
        </div>

        <div className={`${PAGE_WIDTH.wide} bg-canvas px-4 pb-3 pt-3 lg:px-6`}>
          <h1 className="text-[32px] font-bold tracking-[-0.04em] text-ink">Search</h1>
          <p className="mt-1 text-sm text-muted">
            {VENDOR_DISCOVERY_ENABLED
              ? "Search products, stores, categories, or cities in one place."
              : "Search any product by name, description, or category."}
          </p>

          <div className="relative mt-4">
            <FiSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            <Input
              className="pl-11"
              placeholder="Search any product name, description, or store"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          {/* All / Products / Stores only means something once there are other
              stores to filter down to. */}
          {VENDOR_DISCOVERY_ENABLED ? (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {([
                ["all", "All"],
                ["products", "Products"],
                ["stores", "Stores"]
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={cn(
                    "shrink-0 rounded-full border px-4 py-2.5 text-sm font-semibold transition",
                    mode === value
                      ? "border-transparent bg-chrome text-white dark:bg-brand dark:text-chrome"
                      : "border-border bg-surface text-muted hover:bg-canvas"
                  )}
                  onClick={() => setMode(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}

          {/* The same six as the home rail. Shown even with a query running,
              so a buyer can jump straight from one category to another. */}
          <div className="scrollbar-none mt-3 flex gap-2 overflow-x-auto pb-1">
            {CATEGORY_TILES.map((tile) => {
              const active = category === tile.term
              return (
                <button
                  key={tile.id}
                  type="button"
                  aria-pressed={active}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-2 text-xs font-semibold transition",
                    active
                      ? "border-transparent bg-chrome text-white dark:bg-brand dark:text-chrome"
                      : "border-border bg-surface text-muted hover:bg-canvas"
                  )}
                  onClick={() => selectCategory(active ? "" : tile.term)}
                >
                  {tile.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className={`${PAGE_WIDTH.wide} space-y-6 px-4 py-4 lg:px-6`}>
          {showProducts ? (
            <section>
              <SectionHeading
                title={activeQuery ? "Products" : "Trending products"}
                action={
                  <span className="text-xs font-medium text-muted">
                    {results.products.length} results
                  </span>
                }
              />
              {loading ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:gap-5 xl:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={index}
                      className="aspect-[0.82] animate-pulse rounded-[22px] bg-surface"
                    />
                  ))}
                </div>
              ) : results.products.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:gap-5 xl:grid-cols-4">
                  {results.products.map((product) => (
                    <ProductSearchCard key={product.id} product={product} />
                  ))}
                </div>
              ) : activeQuery ? (
                <p className="text-sm leading-6 text-muted">
                  No product matched "{activeQuery}" yet. Try another word from
                  the seller's product name or description.
                </p>
              ) : null}
            </section>
          ) : null}

          {showVendors ? (
            <section>
              <SectionHeading
                title={activeQuery ? "Stores" : "Popular stores"}
                action={
                  <span className="text-xs font-medium text-muted">
                    {results.vendors.length} results
                  </span>
                }
              />
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-[82px] animate-pulse border-b border-border bg-surface/80"
                    />
                  ))}
                </div>
              ) : results.vendors.length > 0 ? (
                <div className="divide-y divide-border overflow-hidden rounded-[24px] bg-surface">
                  {results.vendors.map((vendor) => (
                    <VendorSearchRow key={vendor.id} vendor={vendor} />
                  ))}
                </div>
              ) : activeQuery ? (
                <p className="text-sm leading-6 text-muted">
                  No store matched "{activeQuery}" directly. Try product words too,
                  not only vendor names.
                </p>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function ProductSearchCard({ product }: { product: ProductSearchResult }) {
  const primaryImage = getPrimaryProductImage(product)

  return (
    <Link
      href={`/vendor/${product.vendor.id}?product=${product.id}`}
      className="overflow-hidden rounded-[22px] border border-border/70 bg-surface text-left transition hover:bg-canvas"
    >
      <div className="relative aspect-square overflow-hidden bg-canvas">
        {primaryImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={primaryImage}
            alt={product.name}
            className="h-full w-full object-cover"
          />
        ) : null}
        {product.photoUrls.length > 1 ? (
          <span className="absolute bottom-3 right-3 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white">
            +{product.photoUrls.length - 1}
          </span>
        ) : null}
      </div>
      <div className="space-y-2 p-3">
        <p className="line-clamp-2 text-sm font-semibold text-ink">{product.name}</p>
        <PriceTag
          price={product.price}
          compareAtPrice={product.compareAtPrice}
          weightKg={product.weightKg}
        />
        <p className="text-xs text-muted">Sold by {product.vendor.storeName}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-canvas text-[11px]">
            {getProductCategoryLabel(product.category)}
          </Badge>
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-1 text-[11px] font-medium",
              product.inStock
                ? "bg-emerald-100 text-success"
                : "bg-rose-100 text-rose-700"
            )}
          >
            {product.inStock ? "In stock" : "Out of stock"}
          </span>
        </div>
      </div>
    </Link>
  )
}

function VendorSearchRow({ vendor }: { vendor: VendorSnapshot }) {
  return (
    <Link
      href={`/vendor/${vendor.id}`}
      className="flex items-center gap-3 bg-surface px-4 py-3 transition hover:bg-canvas"
    >
      <Avatar src={vendor.storePhotoUrl} alt={vendor.storeName} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[16px] font-bold text-ink">
              {vendor.storeName}
            </p>
            <div className="mt-1 flex items-center gap-2 text-[13px] text-muted">
              <Badge className="bg-canvas text-[11px]">
                {formatCategory(vendor.category)}
              </Badge>
              <span className="inline-flex items-center gap-1">
                <FiMapPin className="text-[11px]" />
                {vendor.city}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StarRating rating={vendor.rating} size="sm" />
            <FiChevronRight className="text-muted" />
          </div>
        </div>
      </div>
    </Link>
  )
}
