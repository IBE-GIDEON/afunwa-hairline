"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { FiMessageCircle, FiShare2, FiStar } from "react-icons/fi"

import { useCart } from "@/components/providers/cart-provider"
import { useLocale } from "@/components/providers/locale-provider"
import { BottomSheet, Button, Card, SectionHeading, StarRating } from "@/components/ui"
import {
  formatCategory,
  formatCompactNumber,
  formatCurrency,
  formatDate
} from "@/lib/format"
import { PriceTag } from "@/components/price-tag"
import { RemoteImage } from "@/components/remote-image"
import { getProductCategoryLabel } from "@/lib/product-categories"
import { getPrimaryProductImage } from "@/lib/product-images"
import { loadVendorDetail, peekCachedVendorDetail } from "@/lib/marketplace"
import { useMarketplaceRefresh } from "@/lib/use-marketplace-refresh"
import { buildProductUrl, shareLink } from "@/lib/share"
import { buildWhatsAppUrl } from "@/lib/whatsapp"
import { type Product, type VendorDetail } from "@/lib/types"

export function VendorStoreClient({
  vendorId,
  initialProductId
}: {
  vendorId: string
  initialProductId?: string
}) {
  const { addItem } = useCart()
  const { money } = useLocale()
  const [data, setData] = useState<VendorDetail | null>(() =>
    peekCachedVendorDetail(vendorId)
  )
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [sharing, setSharing] = useState(false)
  const productRef = useRef<HTMLDivElement | null>(null)
  const refreshToken = useMarketplaceRefresh()

  /**
   * Keeps ?product=<id> in the address bar in step with the open product, so
   * the URL a seller copies always opens straight onto that product.
   * history.replaceState rather than router.replace — no server round trip and
   * no re-render of the store underneath.
   */
  const syncProductParam = (productId: string | null) => {
    if (typeof window === "undefined") return

    const url = new URL(window.location.href)

    if (productId) {
      url.searchParams.set("product", productId)
    } else {
      url.searchParams.delete("product")
    }

    window.history.replaceState(window.history.state, "", url.toString())
  }

  const openProduct = (product: Product) => {
    setSelectedProduct(product)
    syncProductParam(product.id)
  }

  const closeProduct = () => {
    setSelectedProduct(null)
    syncProductParam(null)
  }

  const shareProduct = async (product: Product) => {
    setSharing(true)

    const outcome = await shareLink({
      title: product.name,
      // Naira, not the sharer's currency: whoever opens this link may be
      // anywhere, and naira is the figure that will actually be charged.
      text: `${product.name} — ${formatCurrency(product.price)} on Afunwa`,
      url: buildProductUrl(vendorId, product.id)
    })

    setSharing(false)

    if (outcome === "copied") {
      toast.success("Product link copied.")
    } else if (outcome === "failed") {
      toast.error("Could not share this product. Copy the link from the address bar.")
    }
  }

  useEffect(() => {
    loadVendorDetail(vendorId).then(setData)
    // refreshToken ticks when a background check finds this store changed.
  }, [vendorId, refreshToken])

  // Open the shared ?product= link once and once only. This effect watches
  // `data`, and `data` is now replaced whenever a background refresh finds the
  // store changed — without the guard the sheet reopened itself under a buyer
  // who had just closed it.
  const deepLinkOpened = useRef(false)

  useEffect(() => {
    if (!data || !initialProductId || deepLinkOpened.current) return

    const matchingProduct = data.products.find(
      (product) => product.id === initialProductId
    )

    if (matchingProduct) {
      deepLinkOpened.current = true
      setSelectedProduct(matchingProduct)
    }
  }, [data, initialProductId])

  const reviewPreview = useMemo(
    () => (Array.isArray(data?.reviews) ? data.reviews.slice(0, 5) : []),
    [data?.reviews]
  )
  const selectedProductImages = useMemo(
    () => selectedProduct?.photoUrls ?? [],
    [selectedProduct]
  )

  useEffect(() => {
    setSelectedImageIndex(0)
  }, [selectedProduct?.id])

  if (!data) {
    return <div className="p-4 text-sm text-muted">Loading store...</div>
  }

  return (
    <div className="pb-safe-nav">
      <div className="relative">
        <div className="h-44 overflow-hidden bg-gradient-to-br from-plum via-plum to-rose/60 lg:h-72">
          {data.vendor.storePhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.vendor.storePhotoUrl}
              alt={data.vendor.storeName}
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>
        <div className="relative z-10 mx-auto -mt-12 w-full max-w-[1240px] px-4 lg:-mt-16 lg:px-6">
          <Card className="overflow-hidden">
            <div className="p-4">
              <div className="flex items-start gap-4">
                <div className="h-24 w-24 overflow-hidden rounded-full border-4 border-surface bg-brand/10">
                  {data.vendor.storePhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={data.vendor.storePhotoUrl}
                      alt={data.vendor.storeName}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 pt-2">
                  <p className="text-xl font-bold text-ink">
                    {data.vendor.storeName}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                    <span className="rounded-full bg-canvas px-2.5 py-1">
                      {formatCategory(data.vendor.category)}
                    </span>
                    <span>{data.vendor.city}</span>
                    <StarRating
                      rating={data.averageRating}
                      reviewCount={data.reviewCount}
                    />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted">
                    {data.vendor.bio}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="rounded-full bg-brand/10 px-2.5 py-1 text-brand">
                      {formatCompactNumber(data.vendor.totalSales)} sales
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 lg:max-w-md">
                <Button
                  onClick={() =>
                    productRef.current?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  Order
                </Button>
                <a
                  href={buildWhatsAppUrl(data.vendor.whatsappNumber) ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-whatsapp/25 bg-surface px-4 py-3 text-sm font-semibold text-whatsapp transition hover:bg-whatsapp/5"
                >
                  <FiMessageCircle />
                  Chat Seller on WhatsApp
                </a>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1240px] space-y-6 px-4 py-6 lg:px-6 lg:py-8">
        <div ref={productRef}>
          <SectionHeading title="Products" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:gap-5 xl:grid-cols-4">
            {data.products.map((product) => {
              const primaryImage = getPrimaryProductImage(product)
              return (
                <button
                  key={product.id}
                  className="overflow-hidden rounded-[22px] bg-surface text-left shadow-soft transition active:scale-[0.99]"
                  onClick={() => openProduct(product)}
                >
                  {/* Image + stock overlay */}
                  <div className="relative aspect-square overflow-hidden bg-canvas">
                    <RemoteImage
                      src={primaryImage}
                      alt={product.name}
                      sizes="(max-width: 430px) 50vw, (max-width: 1024px) 33vw, 260px"
                      className={product.inStock ? undefined : "opacity-40"}
                    />

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

                  {/* Card body — name + price only, always same height */}
                  <div className="p-3">
                    <p className="line-clamp-2 text-sm font-semibold leading-5 text-ink">
                      {product.name}
                    </p>
                    <PriceTag
                      className="mt-1.5"
                      price={product.price}
                      compareAtPrice={product.compareAtPrice}
                    />
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <SectionHeading title="Reviews" />
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted">Average rating</p>
                <div className="mt-2 flex items-center gap-2 text-2xl font-bold text-ink">
                  {data.averageRating.toFixed(1)}
                  <FiStar className="fill-brand text-brand" />
                </div>
              </div>
              <StarRating
                rating={data.averageRating}
                reviewCount={data.reviewCount}
              />
            </div>
            <div className="mt-5 space-y-4">
              {reviewPreview.map((review) => (
                <div
                  key={review.id}
                  className="border-t border-border pt-4 first:border-t-0 first:pt-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-ink">{review.buyerName}</p>
                    <div className="flex items-center gap-1 text-brand">
                      {Array.from({ length: review.rating }).map((_, index) => (
                        <FiStar key={index} className="fill-brand text-[13px]" />
                      ))}
                    </div>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {review.comment}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    {formatDate(review.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <BottomSheet
        open={Boolean(selectedProduct)}
        onClose={closeProduct}
        title={selectedProduct?.name}
        // The panel already opens with the product name; the header repeated it.
        titleHidden
        size="lg"
      >
        {selectedProduct ? (
          <div className="md:grid md:grid-cols-2 md:items-start md:gap-7">
            {/* Gallery — capped so a wide dialog never renders a giant image */}
            <div className="mx-auto w-full max-w-[420px] space-y-3 md:max-w-none">
              <div className="relative aspect-square overflow-hidden rounded-[24px] bg-canvas">
                {selectedProductImages[selectedImageIndex] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedProductImages[selectedImageIndex]}
                    alt={selectedProduct.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs font-medium text-muted">
                    No photo
                  </div>
                )}

                {!selectedProduct.inStock ? (
                  <span className="absolute left-3 top-3 rounded-full bg-black/75 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-white">
                    Out of Stock
                  </span>
                ) : null}
              </div>

              {selectedProductImages.length > 1 ? (
                <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
                  {selectedProductImages.map((image, index) => (
                    <button
                      key={`${selectedProduct.id}-${index}`}
                      type="button"
                      aria-label={`View photo ${index + 1}`}
                      aria-current={selectedImageIndex === index}
                      className={`h-16 w-16 shrink-0 overflow-hidden rounded-2xl border-2 transition ${
                        selectedImageIndex === index
                          ? "border-brand"
                          : "border-border hover:border-border/60"
                      }`}
                      onClick={() => setSelectedImageIndex(index)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image}
                        alt={`${selectedProduct.name} ${index + 1}`}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Details — sticky CTA on desktop so it stays reachable */}
            <div className="mt-5 flex flex-col md:mt-0">
              <p className="text-xl font-bold leading-tight text-ink md:text-2xl">
                {selectedProduct.name}
              </p>
              <PriceTag
                className="mt-2"
                size="lg"
                showBadge
                price={selectedProduct.price}
                compareAtPrice={selectedProduct.compareAtPrice}
              />
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="rounded-full bg-canvas px-2.5 py-1 font-medium">
                  {getProductCategoryLabel(selectedProduct.category)}
                </span>
                <span className="rounded-full bg-canvas px-2.5 py-1 font-medium">
                  {data.vendor.city}
                </span>
              </div>
              <p className="mt-4 whitespace-pre-line text-sm leading-6 text-muted">
                {selectedProduct.description}
              </p>

              <div className="mt-6 flex items-center gap-3 md:mt-8">
                <Button
                  className="flex-1"
                  disabled={!selectedProduct.inStock}
                  onClick={() => {
                    addItem(data.vendor.id, selectedProduct)
                    closeProduct()
                    toast.success("Added to cart.")
                  }}
                >
                  {selectedProduct.inStock ? "Add to Cart" : "Out of Stock"}
                </Button>
                <button
                  type="button"
                  aria-label="Share this product"
                  disabled={sharing}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-ink transition hover:border-rose/50 hover:text-rose disabled:opacity-60"
                  onClick={() => shareProduct(selectedProduct)}
                >
                  <FiShare2 aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </BottomSheet>
    </div>
  )
}
