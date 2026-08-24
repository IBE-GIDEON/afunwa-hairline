"use client"

import Link from "next/link"
import { useState } from "react"
import toast from "react-hot-toast"
import { FiTrash2 } from "react-icons/fi"

import { useAuth } from "@/components/providers/auth-provider"
import { SellerClosedNotice } from "@/components/seller-closed-notice"
import {
  Button,
  Card,
  Input,
  PAGE_WIDTH,
  SectionHeading,
  Textarea
} from "@/components/ui"
import { CATEGORY_OPTIONS } from "@/lib/constants"
import { canOpenStore } from "@/lib/feature-flags"
import {
  DEFAULT_PRODUCT_CATEGORY,
  PRODUCT_CATEGORIES,
  type ProductCategory
} from "@/lib/product-categories"
import { uploadImage, uploadImages } from "@/lib/image"
import { saveProduct, saveSellerProfile } from "@/lib/marketplace"
import { type VendorCategory } from "@/lib/types"

const MAX_PRODUCT_IMAGES = 6

export function SellerOnboardingClient() {
  const { profile, vendorProfile, refreshProfile, upgradeAccountType } = useAuth()
  // Profile → Edit Store lands on this same wizard. A store that already
  // exists is editing, not onboarding, and must be able to save a detail
  // change without inventing another product to go with it.
  const isEditingStore = Boolean(vendorProfile)
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [uploadingProductImages, setUploadingProductImages] = useState(false)
  const [storeName, setStoreName] = useState(vendorProfile?.storeName ?? "")
  const [category, setCategory] = useState<VendorCategory>(
    vendorProfile?.category ?? "wigs"
  )
  const [storePhotoUrl, setStorePhotoUrl] = useState(vendorProfile?.storePhotoUrl ?? "")
  const [bio, setBio] = useState(vendorProfile?.bio ?? "")
  const [city, setCity] = useState(vendorProfile?.city ?? "")
  const [whatsappNumber, setWhatsappNumber] = useState(
    // `||` not `??`: profiles created through the two-field signup carry an
    // empty phone string, which should still fall through to the +234 prefix.
    vendorProfile?.whatsappNumber || profile?.phone || "+234"
  )
  const [bankName, setBankName] = useState(vendorProfile?.bankName ?? "")
  const [accountName, setAccountName] = useState(vendorProfile?.accountName ?? "")
  const [accountNumber, setAccountNumber] = useState(vendorProfile?.accountNumber ?? "")
  const [paymentNote, setPaymentNote] = useState(vendorProfile?.paymentNote ?? "")
  const [deliveryFee, setDeliveryFee] = useState(
    vendorProfile?.deliveryFee ? String(vendorProfile.deliveryFee) : ""
  )
  const [freeDeliveryOver, setFreeDeliveryOver] = useState(
    vendorProfile?.freeDeliveryOver ? String(vendorProfile.freeDeliveryOver) : ""
  )
  const [deliveryNote, setDeliveryNote] = useState(vendorProfile?.deliveryNote ?? "")
  const [originCity, setOriginCity] = useState(vendorProfile?.originCity ?? "")
  const [originState, setOriginState] = useState(vendorProfile?.originState ?? "")
  const [originAddress, setOriginAddress] = useState(vendorProfile?.originAddress ?? "")
  const [defaultItemWeight, setDefaultItemWeight] = useState(
    vendorProfile?.defaultItemWeightKg ? String(vendorProfile.defaultItemWeightKg) : ""
  )
  const [productName, setProductName] = useState("")
  const [productCategory, setProductCategory] = useState<ProductCategory>(
    DEFAULT_PRODUCT_CATEGORY
  )
  const [productPrice, setProductPrice] = useState("")
  const [productComparePrice, setProductComparePrice] = useState("")
  const [productDescription, setProductDescription] = useState("")
  const [productPhotoUrls, setProductPhotoUrls] = useState<string[]>([])

  const handleProductImageUpload = async (fileList: FileList | null) => {
    if (!fileList?.length) return

    const remainingSlots = MAX_PRODUCT_IMAGES - productPhotoUrls.length
    if (remainingSlots <= 0) {
      toast.error(`You can upload up to ${MAX_PRODUCT_IMAGES} product photos.`)
      return
    }

    const selectedFiles = Array.from(fileList).slice(0, remainingSlots)
    setUploadingProductImages(true)

    try {
      const nextUrls = await uploadImages(selectedFiles, "product-photos")
      setProductPhotoUrls((current) => [...current, ...nextUrls])

      if (fileList.length > remainingSlots) {
        toast.error(`Only the first ${remainingSlots} photo(s) were added.`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload product photos.")
    } finally {
      setUploadingProductImages(false)
    }
  }

  if (!profile) {
    return (
      <div className={`${PAGE_WIDTH.form} space-y-4 p-4 pb-safe-nav lg:py-8`}>
        <SectionHeading title="Seller onboarding" />
        <Card className="p-5">
          <p className="text-lg font-semibold text-ink">Sign in first</p>
          <p className="mt-2 text-sm text-muted">
            Your seller onboarding is tied to the same Afunwa account you use as
            a buyer.
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

  // Typing the URL is not a way around a closed signup.
  if (!canOpenStore({ email: profile.email, hasStore: Boolean(vendorProfile) })) {
    return <SellerClosedNotice />
  }

  return (
    <div className={`${PAGE_WIDTH.form} space-y-4 p-4 pb-safe-nav lg:py-8`}>
      <SectionHeading title={isEditingStore ? "Edit store" : "Seller onboarding"} />
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">Step {step} of 4</p>
          <p className="text-sm text-muted">Under 5 minutes</p>
        </div>
        <div className="mt-4 h-2 rounded-full bg-canvas">
          <div
            className="h-full rounded-full bg-brand transition-all"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>
      </Card>

      {step === 1 ? (
        <Card className="space-y-4 p-5">
          <Input
            placeholder="Store name"
            value={storeName}
            onChange={(event) => setStoreName(event.target.value)}
          />
          <select
            className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none"
            value={category}
            onChange={(event) => setCategory(event.target.value as VendorCategory)}
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button className="w-full" onClick={() => setStep(2)}>
            Continue
          </Button>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card className="space-y-4 p-5">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed border-border bg-canvas px-4 py-8 text-center">
            <input
              className="hidden"
              type="file"
              accept="image/*"
              onChange={async (event) => {
                const file = event.target.files?.[0]
                if (!file) return
                try {
                  setStorePhotoUrl(await uploadImage(file, "store-photos"))
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : "Could not upload store photo."
                  )
                }
                event.target.value = ""
              }}
            />
            <p className="text-sm font-semibold text-ink">
              {storePhotoUrl ? "Store photo uploaded" : "Upload store photo"}
            </p>
            <p className="mt-1 text-xs text-muted">Camera or gallery</p>
          </label>
          <Textarea
            placeholder="Tell buyers what you sell"
            value={bio}
            onChange={(event) => setBio(event.target.value)}
          />
          <Input placeholder="City" value={city} onChange={(event) => setCity(event.target.value)} />
          <Input
            placeholder="WhatsApp number"
            value={whatsappNumber}
            onChange={(event) => setWhatsappNumber(event.target.value)}
          />
          <div className="rounded-[24px] bg-canvas p-4">
            <p className="text-sm font-semibold text-ink">Direct payment details</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              Optional for launch. Add these if you want buyers to pay you directly
              after you confirm their order.
            </p>
            <div className="mt-3 space-y-3">
              <Input
                placeholder="Bank name"
                value={bankName}
                onChange={(event) => setBankName(event.target.value)}
              />
              <Input
                placeholder="Account name"
                value={accountName}
                onChange={(event) => setAccountName(event.target.value)}
              />
              <Input
                placeholder="Account number"
                value={accountNumber}
                onChange={(event) => setAccountNumber(event.target.value)}
              />
              <Textarea
                placeholder="Optional payment note for buyers"
                value={paymentNote}
                onChange={(event) => setPaymentNote(event.target.value)}
              />
            </div>

            {/* Whatever is set here is what checkout quotes AND what the buyer
                is charged — the server prices delivery from these same
                numbers, so the two can never disagree. */}
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-ink">Shipping</p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  Set your local delivery fallback. Easyship checks courier
                  delivery when pickup details and item weights are available.
                </p>
              </div>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                placeholder="Shipping fee (₦)"
                value={deliveryFee}
                onChange={(event) => setDeliveryFee(event.target.value)}
              />
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                placeholder="Free shipping on orders over (₦) — optional"
                value={freeDeliveryOver}
                onChange={(event) => setFreeDeliveryOver(event.target.value)}
              />
              <Input
                placeholder="Shipping promise, e.g. 2 to 4 working days nationwide"
                value={deliveryNote}
                onChange={(event) => setDeliveryNote(event.target.value)}
              />

              {/* A courier cannot price a parcel without knowing where it
                  leaves from and what it weighs. Missing either and checkout
                  quietly uses the flat rate below instead. */}
              <div className="space-y-3 border-t border-border pt-3">
                <div>
                  <p className="text-sm font-semibold text-ink">Pickup address</p>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    Where Easyship couriers collect from.
                  </p>
                </div>
                <Input
                  placeholder="Street address"
                  value={originAddress}
                  onChange={(event) => setOriginAddress(event.target.value)}
                />
                <Input
                  placeholder="City"
                  value={originCity}
                  onChange={(event) => setOriginCity(event.target.value)}
                />
                <Input
                  placeholder="State"
                  value={originState}
                  onChange={(event) => setOriginState(event.target.value)}
                />
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  placeholder="Default item weight in kg — used for Easyship quotes"
                  value={defaultItemWeight}
                  onChange={(event) => setDefaultItemWeight(event.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={() => setStep(3)}>Continue</Button>
          </div>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card className="space-y-4 p-5">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed border-border bg-canvas px-4 py-8 text-center">
            <input
              className="hidden"
              type="file"
              accept="image/*"
              multiple
              onChange={async (event) => {
                await handleProductImageUpload(event.target.files)
                event.target.value = ""
              }}
            />
            <p className="text-sm font-semibold text-ink">
              {uploadingProductImages
                ? "Uploading product photos..."
                : productPhotoUrls.length > 0
                  ? `Add more photos (${productPhotoUrls.length}/${MAX_PRODUCT_IMAGES})`
                  : isEditingStore
                    ? "Upload photos for another product"
                    : "Upload first product photos"}
            </p>
            <p className="mt-1 text-xs text-muted">
              {isEditingStore
                ? `Optional — leave this step empty to save your store details on their own. Up to ${MAX_PRODUCT_IMAGES} images per product.`
                : `Add up to ${MAX_PRODUCT_IMAGES} images for your first listing.`}
            </p>
          </label>

          {productPhotoUrls.length > 0 ? (
            <div className="grid grid-cols-3 gap-3">
              {productPhotoUrls.map((photoUrl, index) => (
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
                      setProductPhotoUrls((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index)
                      )
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
            value={productName}
            onChange={(event) => setProductName(event.target.value)}
          />
          <label className="block">
            <span className="text-[12px] font-semibold text-muted">Category</span>
            <select
              className="mt-1.5 w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-brand/40"
              value={productCategory}
              onChange={(event) =>
                setProductCategory(event.target.value as ProductCategory)
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
              <span className="text-[12px] font-semibold text-muted">Price (₦)</span>
              <Input
                className="mt-1.5"
                inputMode="decimal"
                placeholder="120000"
                value={productPrice}
                onChange={(event) => setProductPrice(event.target.value)}
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
                value={productComparePrice}
                onChange={(event) => setProductComparePrice(event.target.value)}
              />
            </label>
          </div>
          <Textarea
            placeholder="Short product description"
            value={productDescription}
            onChange={(event) => setProductDescription(event.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (!storeName.trim()) {
                  toast.error("Add your store name first.")
                  return
                }

                // city and whatsapp_number are NOT NULL in the schema, and an
                // empty WhatsApp number silently breaks the wa.me button that
                // is the only way a buyer can reach the store.
                if (!city.trim()) {
                  toast.error("Add the city you deliver from (step 2).")
                  return
                }

                if (whatsappNumber.replace(/\D/g, "").length < 10) {
                  toast.error("Add a valid WhatsApp number (step 2).")
                  return
                }

                // A new store must ship with its first product. An existing one
                // only validates the product fields if it actually started
                // filling them in.
                const hasProductDraft = Boolean(
                  productName.trim() ||
                    productPrice.trim() ||
                    productDescription.trim() ||
                    productPhotoUrls.length > 0
                )
                const savingProduct = !isEditingStore || hasProductDraft

                if (savingProduct) {
                  if (!productName.trim()) {
                    toast.error(
                      isEditingStore
                        ? "Add the product name, or clear this step to save just your store."
                        : "Add your first product name."
                    )
                    return
                  }

                  if (!Number(productPrice)) {
                    toast.error("Enter a valid product price.")
                    return
                  }

                  if (productPhotoUrls.length === 0) {
                    toast.error("Upload at least one product photo.")
                    return
                  }
                }

                setBusy(true)
                try {
                  const vendor = await saveSellerProfile(profile.id, {
                    storeName: storeName.trim(),
                    category,
                    storePhotoUrl,
                    bio: bio.trim(),
                    city: city.trim(),
                    whatsappNumber: whatsappNumber.trim(),
                    bankName: bankName.trim() || undefined,
                    accountName: accountName.trim() || undefined,
                    accountNumber: accountNumber.trim() || undefined,
                    paymentNote: paymentNote.trim() || undefined,
                    deliveryFee: Number(deliveryFee) > 0 ? Number(deliveryFee) : 0,
                    freeDeliveryOver:
                      Number(freeDeliveryOver) > 0 ? Number(freeDeliveryOver) : undefined,
                    deliveryNote: deliveryNote.trim() || undefined,
                    originAddress: originAddress.trim() || undefined,
                    originCity: originCity.trim() || undefined,
                    originState: originState.trim() || undefined,
                    defaultItemWeightKg:
                      Number(defaultItemWeight) > 0 ? Number(defaultItemWeight) : undefined,
                    shippingRates: {}
                  })

                  if (savingProduct) {
                    await saveProduct({
                      vendorId: vendor.id,
                      name: productName.trim(),
                      category: productCategory,
                      description: productDescription.trim(),
                      price: Number(productPrice || 0),
                      compareAtPrice: productComparePrice
                        ? Number(productComparePrice)
                        : undefined,
                      photoUrl: productPhotoUrls[0],
                      photoUrls: productPhotoUrls,
                      inStock: true
                    })
                  }

                  // Past this line the store, and its first product, exist.
                  // What follows is tidy-up. Leaving it inside the same try
                  // reported a completed launch as a failure whenever it
                  // hiccuped, and the seller's retry added the product again,
                  // since a new product carries no id and so inserts.
                  setStep(4)

                  try {
                    if (profile.accountType === "buyer") {
                      await upgradeAccountType("both")
                    }

                    await refreshProfile(profile.id)
                  } catch {
                    toast.error(
                      "Your store is live, but we could not finish switching your account to a seller one. Reload the page and check your seller view."
                    )
                  }
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : isEditingStore
                        ? "Could not save your store."
                        : "Could not launch store."
                  )
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy
                ? isEditingStore
                  ? "Saving store..."
                  : "Launching store..."
                : isEditingStore
                  ? "Save store"
                  : "Launch store"}
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card className="p-6 text-center">
          <p className="text-2xl font-bold text-ink">
            {isEditingStore
              ? "Store updated"
              : "Your store is live on Afunwa"}
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            You can now manage products, track store orders, and share your store
            link with buyers.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Link
              href="/seller/products"
              className="inline-flex items-center justify-center rounded-full bg-chrome px-4 py-3 text-sm font-semibold text-white"
            >
              Manage products
            </Link>
            <Link
              href="/profile"
              className="inline-flex items-center justify-center rounded-full border border-border bg-surface px-4 py-3 text-sm font-semibold text-ink"
            >
              Back to profile
            </Link>
          </div>
        </Card>
      ) : null}
    </div>
  )
}
