"use client"

import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { FiShare2, FiTrash2 } from "react-icons/fi"

import { useAuth } from "@/components/providers/auth-provider"
import { PriceTag } from "@/components/price-tag"
import { RemoteImage } from "@/components/remote-image"
import { SellerClosedNotice } from "@/components/seller-closed-notice"
import {
  BottomSheet,
  Button,
  Card,
  Input,
  PAGE_WIDTH,
  SectionHeading,
  Textarea
} from "@/components/ui"
import { canOpenStore } from "@/lib/feature-flags"
import {
  DEFAULT_PRODUCT_CATEGORY,
  normalizeProductCategory,
  PRODUCT_CATEGORIES,
  type ProductCategory
} from "@/lib/product-categories"
import { formatCurrency } from "@/lib/format"
import { uploadImages } from "@/lib/image"
import { deleteProduct, loadSellerProducts, saveProduct } from "@/lib/marketplace"
import { getPrimaryProductImage } from "@/lib/product-images"
import { buildProductUrl, shareLink } from "@/lib/share"
import { type Product } from "@/lib/types"

const MAX_PRODUCT_IMAGES = 6

const emptyForm = {
  name: "",
  category: DEFAULT_PRODUCT_CATEGORY as ProductCategory,
  price: "",
  compareAtPrice: "",
  weightKg: "",
  description: "",
  photoUrls: [] as string[],
  inStock: true
}

export function ProductManagementClient() {
  const { profile, vendorProfile } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [open, setOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [uploadingImages, setUploadingImages] = useState(false)
  // Without this a second tap on a slow connection runs saveProduct twice, and
  // an add (no id) inserts rather than updates — two identical listings.
  const [saving, setSaving] = useState(false)

  async function shareProductLink(product: Product) {
    if (!vendorProfile) return

    const outcome = await shareLink({
      title: product.name,
      text: `${product.name} — ${formatCurrency(product.price)} on Afunwa`,
      url: buildProductUrl(vendorProfile.id, product.id)
    })

    if (outcome === "copied") {
      toast.success("Link copied. Paste it in WhatsApp or your status.")
    } else if (outcome === "failed") {
      toast.error("Could not copy the link on this device.")
    }
  }

  async function refreshProducts() {
    if (!profile) return
    const nextProducts = await loadSellerProducts(profile.id)
    setProducts(nextProducts)
  }

  useEffect(() => {
    refreshProducts()
  }, [profile?.id])

  const title = useMemo(
    () => (editingProduct ? "Edit product" : "Add new product"),
    [editingProduct]
  )

  const openProductEditor = (product?: Product | null) => {
    setEditingProduct(product ?? null)
    setForm(
      product
        ? {
            name: product.name,
            category: normalizeProductCategory(product.category),
            price: String(product.price),
            compareAtPrice: product.compareAtPrice
              ? String(product.compareAtPrice)
              : "",
            weightKg: product.weightKg ? String(product.weightKg) : "",
            description: product.description,
            photoUrls:
              product.photoUrls.length > 0
                ? product.photoUrls
                : product.photoUrl
                  ? [product.photoUrl]
                  : [],
            inStock: product.inStock
          }
        : emptyForm
    )
    setOpen(true)
  }

  const handleImageUpload = async (fileList: FileList | null) => {
    if (!fileList?.length) return

    const remainingSlots = MAX_PRODUCT_IMAGES - form.photoUrls.length
    if (remainingSlots <= 0) {
      toast.error(`You can upload up to ${MAX_PRODUCT_IMAGES} photos per product.`)
      return
    }

    const selectedFiles = Array.from(fileList).slice(0, remainingSlots)
    setUploadingImages(true)

    try {
      const nextUrls = await uploadImages(selectedFiles, "product-photos")
      setForm((current) => ({
        ...current,
        photoUrls: [...current.photoUrls, ...nextUrls]
      }))

      if (fileList.length > remainingSlots) {
        toast.error(`Only the first ${remainingSlots} photo(s) were added.`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Image upload failed.")
    } finally {
      setUploadingImages(false)
    }
  }

  if (!profile) {
    return (
      <div className={`${PAGE_WIDTH.wide} space-y-4 p-4 pb-safe-nav lg:py-8`}>
        <SectionHeading title="Manage products" />
        <Card className="p-5">
          <p className="text-lg font-semibold text-ink">Sign in first</p>
          <p className="mt-2 text-sm text-muted">
            Your store is tied to the same Afunwa account you use as a buyer.
          </p>
          <a
            href="/profile"
            className="mt-4 inline-flex rounded-full bg-chrome px-4 py-3 text-sm font-semibold text-white"
          >
            Go to Profile
          </a>
        </Card>
      </div>
    )
  }

  if (!canOpenStore({ email: profile.email, hasStore: Boolean(vendorProfile) })) {
    return <SellerClosedNotice title="Manage products" />
  }

  if (!vendorProfile) {
    return (
      <div className={`${PAGE_WIDTH.wide} space-y-4 p-4 pb-safe-nav lg:py-8`}>
        <SectionHeading title="Manage products" />
        <Card className="p-5">
          <p className="text-lg font-semibold text-ink">Create your store first</p>
          <p className="mt-2 text-sm text-muted">
            Finish the seller onboarding flow to start adding products.
          </p>
          <a
            href="/onboarding/seller"
            className="mt-4 inline-flex rounded-full bg-chrome px-4 py-3 text-sm font-semibold text-white"
          >
            Open onboarding
          </a>
        </Card>
      </div>
    )
  }

  return (
    <div className={`${PAGE_WIDTH.wide} space-y-4 p-4 pb-safe-nav lg:py-8`}>
      <SectionHeading
        title="Manage products"
        action={
          <Button
            className="px-4 py-2 text-xs"
            onClick={() => openProductEditor()}
          >
            Add New Product
          </Button>
        }
      />

      <div className="grid w-full grid-cols-2 gap-3 md:grid-cols-3 lg:gap-5 xl:grid-cols-4">
        {products.map((product) => {
          const primaryImage = getPrimaryProductImage(product)
          return (
          <div
            key={product.id}
            className="relative overflow-hidden rounded-[22px] bg-surface text-left shadow-soft"
          >
            <button
              type="button"
              aria-label={`Share ${product.name}`}
              className="absolute left-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/75"
              onClick={() => shareProductLink(product)}
            >
              <FiShare2 className="text-sm" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="block w-full text-left"
              onClick={() => openProductEditor(product)}
            >
            <div className="relative aspect-square overflow-hidden bg-canvas">
              <RemoteImage
                src={primaryImage}
                alt={product.name}
                sizes="(max-width: 430px) 50vw, (max-width: 1024px) 33vw, 260px"
              />
              {product.photoUrls.length > 1 ? (
                <span className="absolute right-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white">
                  {product.photoUrls.length} photos
                </span>
              ) : null}
            </div>
            <div className="space-y-2 p-3">
              <p className="line-clamp-2 text-sm font-semibold text-ink">
                {product.name}
              </p>
              <p className="font-bold text-brand">{formatCurrency(product.price)}</p>
              <span
                className={`inline-flex rounded-full px-2 py-1 text-[11px] font-medium ${
                  product.inStock
                    ? "bg-emerald-100 text-success"
                    : "bg-rose-100 text-rose-700"
                }`}
              >
                {product.inStock ? "In stock" : "Out of stock"}
              </span>
            </div>
            </button>
          </div>
          )
        })}
      </div>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={title}>
        <div className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed border-border bg-canvas px-4 py-8 text-center">
            <input
              className="hidden"
              type="file"
              accept="image/*"
              multiple
              onChange={async (event) => {
                await handleImageUpload(event.target.files)
                event.target.value = ""
              }}
            />
            <p className="text-sm font-semibold text-ink">
              {uploadingImages
                ? "Uploading product photos..."
                : form.photoUrls.length > 0
                  ? `Add more photos (${form.photoUrls.length}/${MAX_PRODUCT_IMAGES})`
                  : "Upload product photos"}
            </p>
            <p className="mt-1 text-xs text-muted">
              Add up to {MAX_PRODUCT_IMAGES} images. The first one becomes the cover.
            </p>
          </label>

          {form.photoUrls.length > 0 ? (
            <div className="grid grid-cols-3 gap-3">
              {form.photoUrls.map((photoUrl, index) => (
                <div
                  key={`${photoUrl}-${index}`}
                  className="relative overflow-hidden rounded-[20px] bg-canvas"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoUrl}
                    alt={`Product photo ${index + 1}`}
                    className="aspect-square h-full w-full object-cover"
                  />
                  {index === 0 ? (
                    <span className="absolute left-2 top-2 rounded-full bg-brand px-2 py-1 text-[10px] font-semibold text-white">
                      Cover
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="absolute right-2 top-2 rounded-full bg-black/70 p-2 text-white"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        photoUrls: current.photoUrls.filter((_, itemIndex) => itemIndex !== index)
                      }))
                    }
                  >
                    <FiTrash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <Input
            placeholder="Product name"
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
          />
          {/* Which shelf this lands on. Buyers filter by this, so it is not
              optional — a mislabelled product is one nobody browses to. */}
          <label className="block">
            <span className="text-[12px] font-semibold text-muted">Category</span>
            <select
              className="mt-1.5 w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-brand/40"
              value={form.category}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  category: event.target.value as ProductCategory
                }))
              }
            >
              {PRODUCT_CATEGORIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[12px] font-semibold text-muted">
                Price (₦)
              </span>
              <Input
                className="mt-1.5"
                inputMode="decimal"
                placeholder="120000"
                value={form.price}
                onChange={(event) =>
                  setForm((current) => ({ ...current, price: event.target.value }))
                }
              />
            </label>

            <label className="block">
              <span className="text-[12px] font-semibold text-muted">
                Old price (₦)
              </span>
              <Input
                className="mt-1.5"
                inputMode="decimal"
                placeholder="Optional"
                value={form.compareAtPrice}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    compareAtPrice: event.target.value
                  }))
                }
              />
            </label>
          </div>

          {/* Weight is kept for future live courier quotes. Manual delivery
              still uses the store's delivery fee. */}
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">
              Weight in kg — needed for live courier rates
            </span>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder="e.g. 0.4"
              value={form.weightKg}
              onChange={(event) =>
                setForm((current) => ({ ...current, weightKg: event.target.value }))
              }
            />
          </label>

          {/* Live preview of the slash, so a seller sees the saving a buyer
              will see before saving — and sees nothing if it is not a saving. */}
          {form.price ? (
            <div className="rounded-[20px] bg-canvas px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                Buyers will see
              </p>
              <PriceTag
                className="mt-1.5"
                size="lg"
                showBadge
                price={Number(form.price || 0)}
                compareAtPrice={
                  form.compareAtPrice ? Number(form.compareAtPrice) : undefined
                }
              />
              {form.compareAtPrice &&
              Number(form.compareAtPrice) <= Number(form.price || 0) ? (
                <p className="mt-2 text-xs leading-5 text-rose-600">
                  The old price has to be higher than the current one, or there
                  is no discount to show. It will be ignored.
                </p>
              ) : null}
            </div>
          ) : null}

          <Textarea
            placeholder="Description"
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                description: event.target.value
              }))
            }
          />
          <label className="flex items-center justify-between rounded-2xl border border-border px-4 py-3">
            <span className="text-sm font-medium text-ink">In stock</span>
            <input
              type="checkbox"
              checked={form.inStock}
              onChange={(event) =>
                setForm((current) => ({ ...current, inStock: event.target.checked }))
              }
            />
          </label>
          <Button
            className="w-full"
            disabled={saving || uploadingImages}
            onClick={async () => {
              if (saving) return

              if (!form.name.trim()) {
                toast.error("Add a product name first.")
                return
              }

              if (!Number(form.price)) {
                toast.error("Enter a valid product price.")
                return
              }

              if (form.photoUrls.length === 0) {
                toast.error("Upload at least one product photo.")
                return
              }

              setSaving(true)
              try {
                await saveProduct({
                  id: editingProduct?.id,
                  vendorId: vendorProfile.id,
                  name: form.name.trim(),
                  category: form.category,
                  description: form.description.trim(),
                  price: Number(form.price || 0),
                  compareAtPrice: form.compareAtPrice
                    ? Number(form.compareAtPrice)
                    : undefined,
                  weightKg: form.weightKg ? Number(form.weightKg) : undefined,
                  photoUrl: form.photoUrls[0],
                  photoUrls: form.photoUrls,
                  inStock: form.inStock
                }, (dropped) => {
                  toast.error(
                    `Saved, but the ${dropped.join(" and ")} could not be stored — ` +
                      "your database is missing that column. Run the SQL patches in Supabase.",
                    { duration: 8000 }
                  )
                })
                toast.success(editingProduct ? "Product updated." : "Product added.")
                setOpen(false)
                setEditingProduct(null)
                setForm(emptyForm)
                refreshProducts()
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not save product.")
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving
              ? "Saving..."
              : editingProduct
                ? "Save changes"
                : "Add product"}
          </Button>
          {editingProduct ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={async () => {
                try {
                  await deleteProduct(editingProduct.id)
                  toast.success("Product deleted.")
                  setOpen(false)
                  setEditingProduct(null)
                  setForm(emptyForm)
                  refreshProducts()
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : "Could not delete product."
                  )
                }
              }}
            >
              Delete product
            </Button>
          ) : null}
        </div>
      </BottomSheet>
    </div>
  )
}
