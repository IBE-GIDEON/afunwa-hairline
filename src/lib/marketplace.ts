"use client"

import { createId } from "@/lib/utils"
import {
  createOrderDemo,
  deleteProductDemo,
  getBuyerOrdersDemo,
  getDemoUserByEmail,
  getDemoUserById,
  getMarketplaceSearchResults,
  getProductFeed,
  getOrderByIdDemo,
  getSellerOrdersDemo,
  getSellerProductsDemo,
  getStoreAnalyticsDemo,
  getVendorByUserId,
  getVendorDetailDemo,
  getVendorSnapshots,
  saveProductDemo,
  saveReviewDemo,
  saveSellerProfileDemo,
  updateOrderStatusDemo,
  upsertDemoUser
} from "@/lib/demo-store"
import { canUseDemoMode, hasSupabase } from "@/lib/env"
import { fetchWithRetry } from "@/lib/fetch-utils"
import { normalizeCompareAtPrice } from "@/lib/pricing"
import { normalizeProductCategory } from "@/lib/product-categories"
import { parseShippingRates } from "@/lib/shipping"
import { parseZoneRates } from "@/lib/shipping-zones"
import {
  normalizeProductPhotoUrls,
  serializeLegacyPhotoUrl
} from "@/lib/product-images"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import {
  normalizeOrderItems,
  normalizeOrderStatus,
  normalizePaymentMethod,
  normalizePaymentStatus
} from "@/lib/constants"
import {
  type CheckoutPayload,
  type OrderArchiveActor,
  type MarketplaceSearchResults,
  type OrderDetail,
  type OrderUpdatePayload,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
  type PlaceOrderResponse,
  type ProductInput,
   type ProductSearchResult,
  type ReviewWithBuyer,
  type SellerProfileInput,
  type SignUpFormValues,
  type StoreAnalytics,
  type UserProfile,
  type VendorDetail,
  type VendorProfile,
  type VendorSnapshot
} from "@/lib/types"

type SupabaseBrowserClient = NonNullable<ReturnType<typeof getSupabaseBrowserClient>>

function mapUser(row: Record<string, unknown>): UserProfile {
  return {
    id: String(row.id),
    email: String(row.email ?? row.recovery_email ?? ""),
    phone: String(row.phone ?? ""),
    fullName: String(row.full_name ?? ""),
    profilePhotoUrl: row.profile_photo_url ? String(row.profile_photo_url) : undefined,
    accountType: String(row.account_type ?? "buyer") as UserProfile["accountType"],
    createdAt: String(row.created_at ?? new Date().toISOString())
  }
}

function mapVendor(row: Record<string, unknown>): VendorProfile {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    storeName: String(row.store_name),
    storePhotoUrl: row.store_photo_url ? String(row.store_photo_url) : undefined,
    bio: row.bio ? String(row.bio) : undefined,
    category: String(row.category) as VendorProfile["category"],
    city: String(row.city),
    whatsappNumber: String(row.whatsapp_number),
    bankName: row.bank_name ? String(row.bank_name) : undefined,
    accountName: row.account_name ? String(row.account_name) : undefined,
    accountNumber: row.account_number ? String(row.account_number) : undefined,
    paymentNote: row.payment_note ? String(row.payment_note) : undefined,
    // Absent until supabase/delivery-and-saved-address.sql has been run, which
    // reads as "no delivery charge" rather than as an error.
    deliveryFee: row.delivery_fee != null ? Number(row.delivery_fee) : undefined,
    freeDeliveryOver:
      row.free_delivery_over != null ? Number(row.free_delivery_over) : undefined,
    deliveryNote: row.delivery_note ? String(row.delivery_note) : undefined,
    shippingRates: parseShippingRates(row.shipping_rates),
    shippingZones: parseZoneRates(row.shipping_zones),
    originAddress: row.origin_address ? String(row.origin_address) : undefined,
    originCity: row.origin_city ? String(row.origin_city) : undefined,
    originState: row.origin_state ? String(row.origin_state) : undefined,
    defaultItemWeightKg:
      row.default_item_weight_kg != null
        ? Number(row.default_item_weight_kg)
        : undefined,
    isActive: Boolean(row.is_active),
    totalSales: Number(row.total_sales ?? 0),
    rating: Number(row.rating ?? 0),
    createdAt: String(row.created_at ?? new Date().toISOString())
  }
}

function mapProduct(row: Record<string, unknown>) {
  const photoUrls = normalizeProductPhotoUrls(
    Array.isArray(row.photo_urls)
      ? row.photo_urls.map((value) => String(value))
      : Array.isArray(row.photoUrls)
        ? row.photoUrls.map((value) => String(value))
      : undefined,
    row.photo_url
      ? String(row.photo_url)
      : row.photoUrl
        ? String(row.photoUrl)
        : undefined
  )

  return {
    id: String(row.id),
    vendorId: String(row.vendor_id ?? row.vendorId ?? ""),
    name: String(row.name),
    category: normalizeProductCategory(row.category),
    description: String(row.description ?? ""),
    compareAtPrice: normalizeCompareAtPrice(
      row.compare_at_price ?? row.compareAtPrice,
      Number(row.price ?? 0)
    ),
    price: Number(row.price ?? 0),
    weightKg: row.weight_kg != null ? Number(row.weight_kg) : undefined,
    photoUrl: photoUrls[0],
    photoUrls,
    inStock: normalizeBoolean(row.in_stock ?? row.inStock, true),
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString())
  }
}

function normalizeBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") {
    return value
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (["true", "t", "1", "yes", "y"].includes(normalized)) {
      return true
    }
    if (["false", "f", "0", "no", "n"].includes(normalized)) {
      return false
    }
  }

  if (typeof value === "number") {
    return value !== 0
  }

  return fallback
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function normalizeCachedUser(value: unknown): UserProfile | null {
  const row = asRecord(value)
  if (!row?.id) {
    return null
  }

  return {
    id: String(row.id),
    email: String(row.email ?? row.recovery_email ?? ""),
    phone: String(row.phone ?? ""),
    fullName: String(row.fullName ?? row.full_name ?? ""),
    profilePhotoUrl: row.profilePhotoUrl
      ? String(row.profilePhotoUrl)
      : row.profile_photo_url
        ? String(row.profile_photo_url)
        : undefined,
    accountType: String(
      row.accountType ?? row.account_type ?? "buyer"
    ) as UserProfile["accountType"],
    createdAt: String(row.createdAt ?? row.created_at ?? new Date().toISOString())
  }
}

function normalizeCachedVendor(value: unknown): VendorProfile | null {
  const row = asRecord(value)
  if (!row?.id || !(row.userId ?? row.user_id)) {
    return null
  }

  return {
    id: String(row.id),
    userId: String(row.userId ?? row.user_id),
    storeName: String(row.storeName ?? row.store_name ?? "Vendor"),
    storePhotoUrl: row.storePhotoUrl
      ? String(row.storePhotoUrl)
      : row.store_photo_url
        ? String(row.store_photo_url)
        : undefined,
    bio: row.bio ? String(row.bio) : undefined,
    category: String(
      row.category ?? "other"
    ) as VendorProfile["category"],
    city: String(row.city ?? ""),
    whatsappNumber: String(row.whatsappNumber ?? row.whatsapp_number ?? ""),
    bankName: row.bankName
      ? String(row.bankName)
      : row.bank_name
        ? String(row.bank_name)
        : undefined,
    accountName: row.accountName
      ? String(row.accountName)
      : row.account_name
        ? String(row.account_name)
        : undefined,
    accountNumber: row.accountNumber
      ? String(row.accountNumber)
      : row.account_number
        ? String(row.account_number)
        : undefined,
    paymentNote: row.paymentNote
      ? String(row.paymentNote)
      : row.payment_note
        ? String(row.payment_note)
        : undefined,
    isActive: Boolean(row.isActive ?? row.is_active ?? true),
    totalSales: Number(row.totalSales ?? row.total_sales ?? 0),
    rating: Number(row.rating ?? 0),
    createdAt: String(row.createdAt ?? row.created_at ?? new Date().toISOString())
  }
}

function normalizeCachedReview(value: unknown): ReviewWithBuyer | null {
  const row = asRecord(value)
  if (!row?.id) {
    return null
  }

  return {
    id: String(row.id),
    orderId: String(row.orderId ?? row.order_id ?? ""),
    buyerId: String(row.buyerId ?? row.buyer_id ?? ""),
    vendorId: String(row.vendorId ?? row.vendor_id ?? ""),
    rating: Math.max(1, Number(row.rating ?? 0)),
    comment: String(row.comment ?? ""),
    createdAt: String(row.createdAt ?? row.created_at ?? new Date().toISOString()),
    buyerName: getReviewerDisplayName(
      row.buyerName
        ? String(row.buyerName)
        : row.buyer_name
          ? String(row.buyer_name)
          : undefined
    )
  }
}

function normalizeCachedOrder(value: unknown): OrderDetail | null {
  const row = asRecord(value)
  if (!row?.id || !(row.buyerId ?? row.buyer_id) || !(row.vendorId ?? row.vendor_id)) {
    return null
  }

  const paymentMethod = normalizePaymentMethod(
    row.paymentMethod ?? row.payment_method
  )

  return {
    id: String(row.id),
    buyerId: String(row.buyerId ?? row.buyer_id),
    vendorId: String(row.vendorId ?? row.vendor_id),
    items: normalizeOrderItems(row.items),
    totalAmount: Number(row.totalAmount ?? row.total_amount ?? 0),
    status: normalizeOrderStatus(row.status),
    paymentMethod,
    paymentStatus: normalizePaymentStatus(
      row.paymentStatus ?? row.payment_status,
      paymentMethod
    ),
    paymentReference:
      row.paymentReference || row.payment_reference || row.paystack_reference
        ? String(
            row.paymentReference ?? row.payment_reference ?? row.paystack_reference
          )
        : undefined,
    buyerPaymentNote: row.buyerPaymentNote
      ? String(row.buyerPaymentNote)
      : row.buyer_payment_note
        ? String(row.buyer_payment_note)
        : undefined,
    deliveryAddress: String(
      row.deliveryAddress ?? row.delivery_address ?? ""
    ),
    createdAt: String(row.createdAt ?? row.created_at ?? new Date().toISOString()),
    vendor: normalizeCachedVendor(row.vendor ?? row.vendor_profiles) ?? undefined,
    buyer: normalizeCachedUser(row.buyer) ?? undefined
  }
}

function normalizeCachedOrderList(value: unknown): OrderDetail[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((order) => normalizeCachedOrder(order))
    .filter((order): order is OrderDetail => Boolean(order))
}

function readPersistedOrderList(key: string): OrderDetail[] | null {
  const rawValue = readPersistedCache<unknown>(key)
  if (rawValue === null) {
    return null
  }

  const orders = normalizeCachedOrderList(rawValue)
  return orders.length > 0 ? orders : null
}

function normalizeCachedVendorDetail(value: unknown): VendorDetail | null {
  const row = asRecord(value)
  if (!row) {
    return null
  }

  const vendor = normalizeCachedVendor(row.vendor)
  if (!vendor) {
    return null
  }

  const products = Array.isArray(row.products)
    ? row.products
        .map((product) => {
          const productRow = asRecord(product)
          return productRow ? mapProduct(productRow) : null
        })
        .filter(
          (product): product is ReturnType<typeof mapProduct> => Boolean(product)
        )
    : []

  const reviews = Array.isArray(row.reviews)
    ? row.reviews
        .map((review) => normalizeCachedReview(review))
        .filter((review): review is ReviewWithBuyer => Boolean(review))
    : []

  return {
    vendor,
    owner: normalizeCachedUser(row.owner) ?? undefined,
    products,
    reviews,
    reviewCount: Number(row.reviewCount ?? row.review_count ?? reviews.length),
    averageRating: Number(row.averageRating ?? row.average_rating ?? vendor.rating)
  }
}

function getReviewerDisplayName(rawName?: string | null) {
  const normalized = rawName?.trim()
  if (!normalized) {
    return "Buyer"
  }

  const firstName = normalized.split(/\s+/)[0] ?? normalized
  return firstName.length > 18 ? `${firstName.slice(0, 18)}…` : firstName
}

function getLaunchConfigError(feature: string) {
  return `${feature} needs live Supabase configuration before launch.`
}

function getOrderPlacementError() {
  return "Order placement needs live Supabase configuration before launch."
}

const CACHE_TTL_MS = 120_000

type CacheEntry<T> = {
  value: T
  expiresAt: number
}

const vendorListCache = new Map<string, CacheEntry<VendorSnapshot[]>>()
const marketplaceSearchCache = new Map<string, CacheEntry<MarketplaceSearchResults>>()
const productFeedCache = new Map<string, CacheEntry<ProductSearchResult[]>>()
const vendorDetailCache = new Map<string, CacheEntry<VendorDetail | null>>()
const buyerOrdersCache = new Map<string, CacheEntry<OrderDetail[]>>()
const sellerOrdersCache = new Map<string, CacheEntry<OrderDetail[]>>()
const orderDetailCache = new Map<string, CacheEntry<OrderDetail | null>>()
const sellerProductsCache = new Map<string, CacheEntry<ReturnType<typeof mapProduct>[]>>()
const storeAnalyticsCache = new Map<string, CacheEntry<StoreAnalytics>>()
const vendorProfileCache = new Map<string, CacheEntry<VendorProfile | null>>()
const userProfileCache = new Map<string, CacheEntry<UserProfile | null>>()

// Prevents duplicate in-flight requests for the same key
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const inFlight = new Map<string, Promise<any>>()
const HIDDEN_ORDERS_KEY = "glowgram-hidden-orders"
const PERSISTED_CACHE_KEY = "glowgram-persisted-cache-v3"
const PERSISTED_CACHE_TTL_MS = 10 * 60 * 1000
const MAX_SEARCH_TOKEN_GROUPS = 12
const MAX_SEARCH_FILTER_VARIANTS = 60
const SEARCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with"
])
const SEARCH_ALIASES: Record<string, string[]> = {
  // bags
  back: ["bag", "bags", "handbag", "handbags"],
  backs: ["bag", "bags", "handbag", "handbags"],
  bag: ["bags", "handbag", "handbags", "purse", "purses", "backpack", "tote"],
  bags: ["bag", "handbag", "handbags", "purse", "purses", "backpack", "tote"],
  handbag: ["handbags", "bag", "bags", "purse"],
  purse: ["purses", "bag", "bags", "handbag"],
  backpack: ["backpacks", "bag", "bags"],
  // dresses / fashion
  dress: ["dresses", "gown", "gowns", "outfit", "outfits"],
  dresses: ["dress", "gown", "gowns"],
  gown: ["gowns", "dress", "dresses"],
  // clothing
  cloth: ["clothes", "clothing", "fabric", "wear", "outfit"],
  clothes: ["cloth", "clothing", "fabric", "wear", "outfit", "outfits"],
  clothing: ["clothes", "cloth", "fabric", "wear", "outfit"],
  shirt: ["shirts", "top", "tops", "blouse", "blouses"],
  trouser: ["trousers", "pant", "pants", "jean", "jeans", "legging", "leggings"],
  trousers: ["trouser", "pant", "pants", "jean", "jeans"],
  jean: ["jeans", "trouser", "trousers", "pant", "pants", "denim"],
  jeans: ["jean", "trouser", "trousers", "pant", "pants", "denim"],
  skirt: ["skirts"],
  blouse: ["blouses", "shirt", "shirts", "top", "tops"],
  // fabric / ankara
  fabric: ["fabrics", "cloth", "clothes", "material", "materials", "ankara", "lace"],
  fabrics: ["fabric", "cloth", "clothes", "material", "ankara", "lace"],
  ankara: ["fabric", "fabrics", "print", "prints", "cloth", "clothes"],
  lace: ["laces", "fabric", "fabrics", "material"],
  // hair / wigs
  hair: ["wig", "wigs", "weave", "weaves", "extension", "extensions"],
  wig: ["wigs", "hair", "weave", "weaves"],
  wigs: ["wig", "hair", "weave", "weaves"],
  weave: ["weaves", "wig", "wigs", "hair"],
  // jewellery
  jewellery: ["jewelry", "necklace", "necklaces", "bracelet", "bracelets", "earring", "earrings", "ring", "rings"],
  jewelry: ["jewellery", "necklace", "necklaces", "bracelet", "bracelets", "earring", "earrings", "ring", "rings"],
  necklace: ["necklaces", "chain", "chains", "jewellery", "jewelry", "pendant"],
  bracelet: ["bracelets", "bangle", "bangles", "jewellery", "jewelry"],
  earring: ["earrings", "jewellery", "jewelry"],
  ring: ["rings", "jewellery", "jewelry", "band"],
  chain: ["chains", "necklace", "necklaces", "jewellery"],
  // watches
  watch: ["watches"],
  watches: ["watch"],
  // shoes / footwear
  shoe: ["shoes", "sandal", "sandals", "heel", "heels", "sneaker", "sneakers", "slipper", "slippers"],
  shoes: ["shoe", "sandal", "sandals", "heel", "heels", "sneaker", "sneakers"],
  sandal: ["sandals", "shoe", "shoes", "slipper", "slippers"],
  sandals: ["sandal", "shoe", "shoes", "slipper", "slippers"],
  sneaker: ["sneakers", "shoe", "shoes", "trainer", "trainers"],
  sneakers: ["sneaker", "shoe", "shoes", "trainer", "trainers"],
  slipper: ["slippers", "sandal", "sandals", "flip", "shoe"],
  boot: ["boots", "shoe", "shoes"],
  boots: ["boot", "shoe", "shoes"],
  heel: ["heels", "shoe", "shoes", "pump", "pumps"],
  heels: ["heel", "shoe", "shoes", "pump", "pumps"],
  // cosmetics / lip
  lipstick: ["lipsticks", "lip", "lips", "gloss", "liner"],
  lipsticks: ["lipstick", "lip", "lips"],
  makeup: ["cosmetic", "cosmetics", "foundation", "concealer", "blush", "mascara"],
  foundation: ["foundations", "makeup", "cosmetics", "concealer"],
  // beauty / skincare
  cream: ["creams", "lotion", "lotions", "moisturizer", "body cream", "skincare", "serum"],
  creams: ["cream", "lotion", "lotions", "moisturizer", "skincare"],
  lotion: ["lotions", "cream", "creams", "moisturizer", "oil", "body lotion", "skincare"],
  lotions: ["lotion", "cream", "creams", "moisturizer", "skincare"],
  serum: ["serums", "cream", "creams", "treatment", "skincare", "glow"],
  skincare: ["skin", "cream", "creams", "lotion", "lotions", "serum", "serums", "glow", "face"],
  glow: ["glowing", "skincare", "cream", "serum", "lotion"],
  oil: ["oils", "cream", "serum", "hair", "body oil"],
  // perfume / fragrance
  perfume: ["perfumes", "fragrance", "fragrances", "cologne", "colognes", "scent", "scents", "spray"],
  perfumes: ["perfume", "fragrance", "fragrances", "cologne", "scent", "scents"],
  fragrance: ["fragrances", "perfume", "perfumes", "cologne", "scent", "scents", "spray"],
  fragrances: ["fragrance", "perfume", "perfumes", "cologne", "scent"],
  cologne: ["colognes", "perfume", "perfumes", "fragrance", "fragrances"],
  colognes: ["cologne", "perfume", "perfumes", "fragrance"],
  scent: ["scents", "perfume", "perfumes", "fragrance", "fragrances", "spray"],
  spray: ["sprays", "perfume", "perfumes", "fragrance", "cologne", "body spray"],
  // phones / electronics
  phone: ["phones", "smartphone", "smartphones", "mobile", "mobiles", "handset"],
  phones: ["phone", "smartphone", "smartphones", "mobile", "mobiles"],
  smartphone: ["smartphones", "phone", "phones", "mobile", "mobiles"],
  smartphones: ["smartphone", "phone", "phones", "mobile"],
  mobile: ["mobiles", "phone", "phones", "smartphone", "smartphones"],
  laptop: ["laptops", "computer", "computers", "notebook"],
  laptops: ["laptop", "computer", "computers", "notebook"],
  computer: ["computers", "laptop", "laptops", "pc", "desktop"],
  tablet: ["tablets", "ipad"],
  headphone: ["headphones", "earphone", "earphones", "earbuds", "headset"],
  headphones: ["headphone", "earphone", "earphones", "earbuds"],
  earphone: ["earphones", "headphone", "headphones", "earbuds"],
  earphones: ["earphone", "headphone", "headphones", "earbuds"],
  charger: ["chargers", "cable", "cables"],
  speaker: ["speakers", "sound", "audio"],
  // food / drinks
  food: ["foods", "meal", "meals", "snack", "snacks", "dish", "dishes", "eat", "chop"],
  foods: ["food", "meal", "meals", "snack", "snacks"],
  snack: ["snacks", "food", "foods", "chop", "bite"],
  snacks: ["snack", "food", "foods"],
  meal: ["meals", "food", "foods", "dish", "dishes"],
  cake: ["cakes", "pastry", "pastries", "bread", "bake"],
  drink: ["drinks", "juice", "juices", "beverage", "beverages", "soda", "water"],
  drinks: ["drink", "juice", "juices", "beverage", "beverages"],
  juice: ["juices", "drink", "drinks", "beverage"],
}

type PersistedCacheEntry = {
  value: unknown
  expiresAt: number
}

type PersistedCacheStore = Record<string, PersistedCacheEntry>

const persistedCacheKeys = {
  vendors: (query: string) => `vendors:${query}`,
  marketplaceSearch: (query: string) => `marketplace-search:${query}`,
  productFeed: (query: string) => `product-feed:${query}`,
  vendorDetail: (vendorId: string) => `vendor-detail:${vendorId}`,
  buyerOrders: (userId: string) => `buyer-orders:${userId}`,
  sellerOrders: (userId: string) => `seller-orders:${userId}`,
  orderDetail: (orderId: string) => `order-detail:${orderId}`,
  sellerProducts: (userId: string) => `seller-products:${userId}`,
  storeAnalytics: (userId: string) => `store-analytics:${userId}`,
  vendorProfile: (userId: string) => `vendor-profile:${userId}`,
  userProfile: (userId: string) => `user-profile:${userId}`
} as const

function readCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key)
    return null
  }

  return entry.value
}

function writeCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): T {
  cache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS
  })
  return value
}

function getPersistedCacheStore(): PersistedCacheStore {
  if (typeof window === "undefined") {
    return {}
  }

  const raw = window.localStorage.getItem(PERSISTED_CACHE_KEY)
  if (!raw) {
    return {}
  }

  try {
    return JSON.parse(raw) as PersistedCacheStore
  } catch {
    return {}
  }
}

function savePersistedCacheStore(store: PersistedCacheStore) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(PERSISTED_CACHE_KEY, JSON.stringify(store))
}

function readPersistedCache<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null
  }

  const store = getPersistedCacheStore()
  const entry = store[key]
  if (!entry) {
    return null
  }

  if (entry.expiresAt <= Date.now()) {
    delete store[key]
    savePersistedCacheStore(store)
    return null
  }

  return entry.value as T
}

function writePersistedCache<T>(
  key: string,
  value: T,
  ttlMs = PERSISTED_CACHE_TTL_MS
): T {
  if (typeof window === "undefined") {
    return value
  }

  const store = getPersistedCacheStore()
  store[key] = {
    value,
    expiresAt: Date.now() + ttlMs
  }
  savePersistedCacheStore(store)
  return value
}

function deletePersistedCache(key: string) {
  if (typeof window === "undefined") {
    return
  }

  const store = getPersistedCacheStore()
  if (!(key in store)) {
    return
  }

  delete store[key]
  savePersistedCacheStore(store)
}

function clearPersistedCacheByPrefix(prefix: string) {
  if (typeof window === "undefined") {
    return
  }

  const store = getPersistedCacheStore()
  let changed = false

  for (const key of Object.keys(store)) {
    if (!key.startsWith(prefix)) {
      continue
    }

    delete store[key]
    changed = true
  }

  if (changed) {
    savePersistedCacheStore(store)
  }
}

function readHybridCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  persistedKey: string
): T | null {
  const memoryValue = readCache(cache, key)
  if (memoryValue !== null) {
    return memoryValue
  }

  const persistedValue = readPersistedCache<T>(persistedKey)
  if (persistedValue === null) {
    return null
  }

  return writeCache(cache, key, persistedValue)
}

function writeHybridCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  persistedKey: string,
  value: T,
  ttlMs = PERSISTED_CACHE_TTL_MS
): T {
  writeCache(cache, key, value)
  return writePersistedCache(persistedKey, value, ttlMs)
}

function deduplicatedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key)
  if (existing) return existing as Promise<T>
  const promise = fetcher().finally(() => inFlight.delete(key))
  inFlight.set(key, promise)
  return promise
}

/**
 * Serve-then-refresh, and tell the screen when the answer changed.
 *
 * A buyer's browser keeps a copy of the catalogue so pages paint instantly,
 * but that copy has no way of knowing the seller just edited a product. Every
 * cached read therefore also refreshes behind itself, and a refresh that comes
 * back different wakes each mounted view. Without this a buyer who visited in
 * the last few minutes saw the old catalogue and made no request at all.
 */
type MarketplaceListener = () => void

const marketplaceListeners = new Set<MarketplaceListener>()

export function subscribeToMarketplaceUpdates(listener: MarketplaceListener) {
  marketplaceListeners.add(listener)
  return () => {
    marketplaceListeners.delete(listener)
  }
}

function announceMarketplaceUpdate() {
  for (const listener of marketplaceListeners) {
    try {
      listener()
    } catch {
      // One broken listener must not stop the rest being told.
    }
  }
}

/** JSON with object keys sorted, so two equal values always serialise alike. */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return Object.fromEntries(
        Object.entries(val as Record<string, unknown>).sort(([a], [b]) =>
          a < b ? -1 : a > b ? 1 : 0
        )
      )
    }
    return val
  })
}

/** A floor on refresh traffic: at most one network check per key per window. */
const REVALIDATE_INTERVAL_MS = 10_000
const lastRevalidatedAt = new Map<string, number>()

function revalidateInBackground<T>(
  key: string,
  refetch: () => Promise<T>,
  cached: T
) {
  if (typeof window === "undefined") return

  const last = lastRevalidatedAt.get(key) ?? 0
  if (Date.now() - last < REVALIDATE_INTERVAL_MS) return
  lastRevalidatedAt.set(key, Date.now())

  refetch()
    .then((fresh) => {
      // Only repaint on a real difference, so an unchanged catalogue does not
      // churn every view. Keys are sorted first: a value rehydrated from
      // localStorage carries its own key order, so a plain JSON.stringify
      // called every refresh a change even when nothing had moved.
      if (stableStringify(fresh) !== stableStringify(cached)) {
        announceMarketplaceUpdate()
      }
    })
    .catch(() => {
      // Offline or the request failed — the cached copy stays on screen.
    })
}

/**
 * Coming back to the tab, or back onto the network, is the moment a buyer is
 * most likely to be looking at something stale. Dropping the floor and asking
 * the mounted views to re-read sends each of them through the refresh path
 * above; the cached copy stays up meanwhile, so nothing flashes.
 */
if (typeof window !== "undefined") {
  const refreshOnReturn = () => {
    if (document.visibilityState !== "visible") return
    lastRevalidatedAt.clear()
    announceMarketplaceUpdate()
  }

  document.addEventListener("visibilitychange", refreshOnReturn)
  window.addEventListener("online", refreshOnReturn)
  window.addEventListener("pageshow", refreshOnReturn)
}

type SearchTokenGroup = {
  raw: string
  variants: string[]
}

function getSearchTokenGroups(query: string): SearchTokenGroup[] {
  const tokens = query
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((token) => token.length > 1 && !SEARCH_STOP_WORDS.has(token))

  if (!tokens?.length) {
    return []
  }

  return [...new Set(tokens)]
    .slice(0, MAX_SEARCH_TOKEN_GROUPS)
    .map((token) => ({
      raw: token,
      variants: getSearchTokenVariants(token)
    }))
}

function getSearchTokenVariants(token: string): string[] {
  const variants = new Set([token])

  if (token.endsWith("ies") && token.length > 4) {
    variants.add(`${token.slice(0, -3)}y`)
  }

  if (/(ches|shes|sses|xes|zes)$/u.test(token) && token.length > 4) {
    variants.add(token.slice(0, -2))
  }

  if (token.endsWith("s") && token.length > 3) {
    variants.add(token.slice(0, -1))
  }

  for (const variant of [...variants]) {
    for (const alias of SEARCH_ALIASES[variant] ?? []) {
      variants.add(alias)
    }
  }

  return [...variants]
}

// Builds a Supabase OR filter for vendor/store search using alias-expanded variants.
// Used only for vendor discovery (store_name, category, city, bio).
function buildSearchFilter(groups: SearchTokenGroup[], fields: string[]) {
  const variants = [
    ...new Set(groups.flatMap((group) => group.variants))
  ].slice(0, MAX_SEARCH_FILTER_VARIANTS)

  return variants
    .flatMap((variant) => fields.map((field) => `${field}.ilike.%${variant}%`))
    .join(",")
}

// Builds a Supabase OR filter for product search using ONLY the raw query tokens
// (plus basic singular/plural forms) against name and description.
// No alias expansion — any keyword a seller puts in their product name or description
// is directly searchable. No predefined list needed.
function buildProductKeywordFilter(groups: SearchTokenGroup[]): string {
  const rawVariants = [
    ...new Set(
      groups.flatMap((g) => {
        const forms = new Set([g.raw])
        if (g.raw.endsWith("ies") && g.raw.length > 4) {
          forms.add(`${g.raw.slice(0, -3)}y`)
        }
        if (/(ches|shes|sses|xes|zes)$/u.test(g.raw) && g.raw.length > 4) {
          forms.add(g.raw.slice(0, -2))
        }
        if (g.raw.endsWith("s") && g.raw.length > 3) {
          forms.add(g.raw.slice(0, -1))
        }
        return [...forms]
      })
    )
  ]

  return rawVariants
    .flatMap((v) => [`name.ilike.%${v}%`, `description.ilike.%${v}%`])
    .join(",")
}

function matchesSearchGroups(values: unknown[], groups: SearchTokenGroup[]) {
  if (groups.length === 0) {
    return true
  }

  return getSearchMatchScore(values, groups) > 0
}

function getSearchMatchScore(values: unknown[], groups: SearchTokenGroup[]) {
  const haystack = values
    .map((value) => String(value ?? "").toLocaleLowerCase())
    .join(" ")

  if (!haystack) {
    return 0
  }

  return groups.reduce((score, group) => {
    const matched = group.variants.some((variant) => haystack.includes(variant))
    return matched ? score + 1 : score
  }, 0)
}

// Score is based only on product name and description so any product
// is findable purely through its own content — no category or vendor
// metadata required to surface it.
function getProductSearchScore(
  product: ProductSearchResult,
  groups: SearchTokenGroup[]
) {
  if (groups.length === 0) {
    return 0
  }

  return (
    getSearchMatchScore([product.name], groups) * 8 +
    getSearchMatchScore([product.description], groups) * 5
  )
}

type HiddenOrdersStore = {
  buyer: Record<string, string[]>
  seller: Record<string, string[]>
}

function getHiddenOrdersStore(): HiddenOrdersStore {
  if (typeof window === "undefined") {
    return { buyer: {}, seller: {} }
  }

  const raw = window.localStorage.getItem(HIDDEN_ORDERS_KEY)
  if (!raw) {
    return { buyer: {}, seller: {} }
  }

  try {
    const parsed = JSON.parse(raw) as HiddenOrdersStore
    return {
      buyer: parsed.buyer ?? {},
      seller: parsed.seller ?? {}
    }
  } catch {
    return { buyer: {}, seller: {} }
  }
}

function saveHiddenOrdersStore(store: HiddenOrdersStore) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(HIDDEN_ORDERS_KEY, JSON.stringify(store))
}

function getHiddenOrderIds(actor: OrderArchiveActor, userId: string) {
  return new Set(getHiddenOrdersStore()[actor][userId] ?? [])
}

function hideOrderLocally(actor: OrderArchiveActor, userId: string, orderId: string) {
  const store = getHiddenOrdersStore()
  const current = new Set(store[actor][userId] ?? [])
  current.add(orderId)
  store[actor][userId] = [...current]
  saveHiddenOrdersStore(store)
}

function clearMarketplaceDiscoveryCaches() {
  vendorListCache.clear()
  marketplaceSearchCache.clear()
  productFeedCache.clear()
  clearPersistedCacheByPrefix("vendors:")
  clearPersistedCacheByPrefix("marketplace-search:")
  clearPersistedCacheByPrefix("product-feed:")
  // The seller usually has the storefront open in another tab while editing.
  // Dropping the caches alone would leave it showing the old copy until
  // something happened to re-read; this repaints it straight away.
  lastRevalidatedAt.clear()
  announceMarketplaceUpdate()
}

function clearOrderCaches() {
  buyerOrdersCache.clear()
  sellerOrdersCache.clear()
  orderDetailCache.clear()
  storeAnalyticsCache.clear()
  clearPersistedCacheByPrefix("buyer-orders:")
  clearPersistedCacheByPrefix("seller-orders:")
  clearPersistedCacheByPrefix("order-detail:")
  clearPersistedCacheByPrefix("store-analytics:")
}

function logMarketplaceError(scope: string, error: unknown) {
  if (process.env.NODE_ENV === "production") {
    console.error(`[glowgram:${scope}]`, error)
    return
  }

  console.warn(`[glowgram:${scope}]`, error)
}

function mapOrder(row: Record<string, unknown>, vendor?: VendorProfile): OrderDetail {
  const nestedVendor =
    vendor ??
    (row.vendor_profiles &&
    typeof row.vendor_profiles === "object" &&
    !Array.isArray(row.vendor_profiles)
      ? mapVendor(row.vendor_profiles as Record<string, unknown>)
      : undefined)

  const paymentMethod = normalizePaymentMethod(row.payment_method)
  const paymentStatus = normalizePaymentStatus(row.payment_status, paymentMethod)

  return {
    id: String(row.id),
    buyerId: String(row.buyer_id),
    vendorId: String(row.vendor_id),
    items: normalizeOrderItems(row.items),
    totalAmount: Number(row.total_amount ?? 0),
    status: normalizeOrderStatus(row.status),
    paymentMethod,
    paymentStatus,
    paymentReference: (row.payment_reference ?? row.paystack_reference)
      ? String(row.payment_reference ?? row.paystack_reference)
      : undefined,
    buyerPaymentNote: row.buyer_payment_note
      ? String(row.buyer_payment_note)
      : undefined,
    trackingNumber: row.tracking_number ? String(row.tracking_number) : undefined,
    trackingCarrier: row.tracking_carrier ? String(row.tracking_carrier) : undefined,
    trackingUrl: row.tracking_url ? String(row.tracking_url) : undefined,
    deliveryAddress: String(row.delivery_address ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    vendor: nestedVendor
  }
}

async function fetchVendorProfileById(
  supabase: SupabaseBrowserClient,
  vendorId: string
) {
  const { data, error } = await supabase
    .from("vendor_profiles")
    .select("*")
    .eq("id", vendorId)
    .maybeSingle()

  if (error || !data) {
    if (error) {
      logMarketplaceError("fetch-vendor-for-order", error)
    }
    return undefined
  }

  return mapVendor(data)
}

async function mapOrderWithVendorFallback(
  supabase: SupabaseBrowserClient,
  row: Record<string, unknown>,
  vendor?: VendorProfile
) {
  const mappedOrder = mapOrder(row, vendor)

  if (mappedOrder.vendor) {
    return mappedOrder
  }

  const fallbackVendor = await fetchVendorProfileById(supabase, mappedOrder.vendorId)
  return fallbackVendor ? { ...mappedOrder, vendor: fallbackVendor } : mappedOrder
}

function refreshVendorReferences(vendor: VendorProfile) {
  const cachedDetail = readCache(vendorDetailCache, vendor.id)
  if (cachedDetail) {
    writeHybridCache(
      vendorDetailCache,
      vendor.id,
      persistedCacheKeys.vendorDetail(vendor.id),
      {
      ...cachedDetail,
      vendor
      }
    )
  }

  for (const [key, entry] of buyerOrdersCache) {
    if (entry.expiresAt <= Date.now()) {
      buyerOrdersCache.delete(key)
      continue
    }

    if (!entry.value.some((order) => order.vendorId === vendor.id)) {
      continue
    }

    writeHybridCache(
      buyerOrdersCache,
      key,
      persistedCacheKeys.buyerOrders(key),
      entry.value.map((order) =>
        order.vendorId === vendor.id ? { ...order, vendor } : order
      )
    )
  }

  for (const [key, entry] of sellerOrdersCache) {
    if (entry.expiresAt <= Date.now()) {
      sellerOrdersCache.delete(key)
      continue
    }

    if (!entry.value.some((order) => order.vendorId === vendor.id)) {
      continue
    }

    writeHybridCache(
      sellerOrdersCache,
      key,
      persistedCacheKeys.sellerOrders(key),
      entry.value.map((order) =>
        order.vendorId === vendor.id ? { ...order, vendor } : order
      )
    )
  }

  for (const [key, entry] of orderDetailCache) {
    if (entry.expiresAt <= Date.now()) {
      orderDetailCache.delete(key)
      continue
    }

    if (entry.value?.vendorId !== vendor.id) {
      continue
    }

    writeHybridCache(orderDetailCache, key, persistedCacheKeys.orderDetail(key), {
      ...entry.value,
      vendor
    })
  }
}

function cacheVendorProfile(vendor: VendorProfile | null, userId: string) {
  writeCache(vendorProfileCache, userId, vendor)
  if (vendor) {
    writePersistedCache(persistedCacheKeys.vendorProfile(userId), vendor)
  } else {
    deletePersistedCache(persistedCacheKeys.vendorProfile(userId))
  }
  if (vendor) {
    refreshVendorReferences(vendor)
  }
  return vendor
}

function cacheUserProfile(user: UserProfile | null, userId: string) {
  writeCache(userProfileCache, userId, user)
  if (user) {
    writePersistedCache(persistedCacheKeys.userProfile(userId), user)
  } else {
    deletePersistedCache(persistedCacheKeys.userProfile(userId))
  }
  return user
}

function updateCachedOrderCollections(
  orderId: string,
  updater: (order: OrderDetail) => OrderDetail
) {
  const cachedOrder = readCache(orderDetailCache, orderId)
  if (cachedOrder) {
    writeHybridCache(
      orderDetailCache,
      orderId,
      persistedCacheKeys.orderDetail(orderId),
      updater(cachedOrder)
    )
  }

  for (const [key, entry] of buyerOrdersCache) {
    if (entry.expiresAt <= Date.now()) {
      buyerOrdersCache.delete(key)
      continue
    }

    if (!entry.value.some((order) => order.id === orderId)) {
      continue
    }

    writeHybridCache(
      buyerOrdersCache,
      key,
      persistedCacheKeys.buyerOrders(key),
      entry.value.map((order) => (order.id === orderId ? updater(order) : order))
    )
  }

  for (const [key, entry] of sellerOrdersCache) {
    if (entry.expiresAt <= Date.now()) {
      sellerOrdersCache.delete(key)
      continue
    }

    if (!entry.value.some((order) => order.id === orderId)) {
      continue
    }

    writeHybridCache(
      sellerOrdersCache,
      key,
      persistedCacheKeys.sellerOrders(key),
      entry.value.map((order) => (order.id === orderId ? updater(order) : order))
    )
  }
}

function removeOrderFromVisibleCaches(orderId: string, actor: OrderArchiveActor) {
  orderDetailCache.delete(orderId)
  deletePersistedCache(persistedCacheKeys.orderDetail(orderId))

  if (actor === "buyer") {
    for (const [key, entry] of buyerOrdersCache) {
      if (entry.expiresAt <= Date.now()) {
        buyerOrdersCache.delete(key)
        continue
      }

      if (!entry.value.some((order) => order.id === orderId)) {
        continue
      }

      writeHybridCache(
        buyerOrdersCache,
        key,
        persistedCacheKeys.buyerOrders(key),
        entry.value.filter((order) => order.id !== orderId)
      )
    }
  } else {
    for (const [key, entry] of sellerOrdersCache) {
      if (entry.expiresAt <= Date.now()) {
        sellerOrdersCache.delete(key)
        continue
      }

      if (!entry.value.some((order) => order.id === orderId)) {
        continue
      }

      writeHybridCache(
        sellerOrdersCache,
        key,
        persistedCacheKeys.sellerOrders(key),
        entry.value.filter((order) => order.id !== orderId)
      )
    }
  }
}

export function peekCachedVendors(query = ""): VendorSnapshot[] {
  return (
    readPersistedCache<VendorSnapshot[]>(
      persistedCacheKeys.vendors(query.trim().toLowerCase())
    ) ?? []
  )
}

export function peekCachedMarketplaceSearch(
  query = ""
): MarketplaceSearchResults {
  return (
    readPersistedCache<MarketplaceSearchResults>(
      persistedCacheKeys.marketplaceSearch(query.trim().toLowerCase())
    ) ?? { products: [], vendors: [] }
  )
}

export function peekCachedProductFeed(query = ""): ProductSearchResult[] {
  return (
    readPersistedCache<ProductSearchResult[]>(
      persistedCacheKeys.productFeed(query.trim().toLowerCase())
    ) ?? []
  )
}

export function peekCachedBuyerOrders(userId: string): OrderDetail[] {
  return normalizeCachedOrderList(
    readPersistedCache<OrderDetail[]>(persistedCacheKeys.buyerOrders(userId))
  )
}

export function peekCachedSellerOrders(userId: string): OrderDetail[] {
  return normalizeCachedOrderList(
    readPersistedCache<OrderDetail[]>(persistedCacheKeys.sellerOrders(userId))
  )
}

export function peekCachedVendorDetail(vendorId: string): VendorDetail | null {
  return normalizeCachedVendorDetail(
    readPersistedCache<VendorDetail>(persistedCacheKeys.vendorDetail(vendorId))
  )
}

export async function loadVendors(
  query = "",
  /** Internal: set by the background refresh so it reaches the network. */
  skipCache = false
): Promise<VendorSnapshot[]> {
  if (!hasSupabase) {
    return canUseDemoMode ? getVendorSnapshots(query) : []
  }

  const cacheKey = query.trim().toLowerCase()
  if (!skipCache) {
    const cached = readHybridCache(
      vendorListCache,
      cacheKey,
      persistedCacheKeys.vendors(cacheKey)
    )
    if (cached) {
      revalidateInBackground(
        `vendors:${cacheKey}`,
        () => loadVendors(query, true),
        cached
      )
      return cached
    }
  }

  return deduplicatedFetch(`vendors:${cacheKey}`, async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return canUseDemoMode ? getVendorSnapshots(query) : []

    let request = supabase
      .from("vendor_profiles")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })

    if (query.trim()) {
      request = request.textSearch("search_text", query.trim(), {
        type: "websearch"
      })
    }

    const { data, error } = await request.limit(60)
    if (error || !data) {
      return canUseDemoMode ? getVendorSnapshots(query) : []
    }

    return writeHybridCache(
      vendorListCache,
      cacheKey,
      persistedCacheKeys.vendors(cacheKey),
      data.map((row) => ({
        ...mapVendor(row),
        reviewCount: 0,
        productCount: 0
      }))
    )
  })
}

export async function loadMarketplaceSearch(
  query = "",
  /** Internal: set by the background refresh so it reaches the network. */
  skipCache = false
): Promise<MarketplaceSearchResults> {
  if (!hasSupabase) {
    return canUseDemoMode
      ? getMarketplaceSearchResults(query)
      : { products: [], vendors: [] }
  }

  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    return canUseDemoMode
      ? getMarketplaceSearchResults(query)
      : { products: [], vendors: [] }
  }

  const normalized = query.trim()
  const cacheKey = normalized.toLowerCase()
  const searchGroups = getSearchTokenGroups(normalized)
  const shouldCacheSearch = normalized.length === 0

  if (shouldCacheSearch && !skipCache) {
    const cached = readHybridCache(
      marketplaceSearchCache,
      cacheKey,
      persistedCacheKeys.marketplaceSearch(cacheKey)
    )
    if (cached) {
      revalidateInBackground(
        `marketplace-search:${cacheKey}`,
        () => loadMarketplaceSearch(query, true),
        cached
      )
      return cached
    }
  }

  if (normalized && searchGroups.length === 0) {
    return { products: [], vendors: [] }
  }

  return deduplicatedFetch(`marketplace-search:${cacheKey}`, async () => {
    const productKeywordFilter = buildProductKeywordFilter(searchGroups)
    const vendorSearchFilter = buildSearchFilter(searchGroups, [
      "store_name",
      "category",
      "city",
      "bio"
    ])

    if (normalized) {
      // --- SEARCH PATH ---
      // Step 1: products + vendor join in one query (same pattern as loadProductFeed).
      // The inner join means only products from active vendors are returned.
      // The or() filter matches any keyword the buyer typed against name or description.
      let products: ProductSearchResult[] = []

      const { data: joinedRows, error: joinError } = await supabase
        .from("products")
        .select("*, vendor_profiles!inner(*)")
        .eq("vendor_profiles.is_active", true)
        .or(productKeywordFilter)
        .order("created_at", { ascending: false })
        .limit(80)

      if (!joinError && joinedRows) {
        products = joinedRows
          .map((row): ProductSearchResult | null => {
            const vRow = row.vendor_profiles
            if (!vRow || typeof vRow !== "object" || Array.isArray(vRow)) return null
            const vendor: VendorSnapshot = {
              ...mapVendor(vRow as Record<string, unknown>),
              reviewCount: 0,
              productCount: 0
            }
            return { ...mapProduct(row), vendor }
          })
          .filter((item): item is ProductSearchResult => Boolean(item))
      } else {
        // Fallback: two separate queries when the join is unavailable
        const { data: productRows } = await supabase
          .from("products")
          .select("*")
          .or(productKeywordFilter)
          .order("created_at", { ascending: false })
          .limit(80)

        if (productRows && productRows.length > 0) {
          const vendorIds = [...new Set(productRows.map((p) => String(p.vendor_id)))]
          const { data: vendorRows } = await supabase
            .from("vendor_profiles")
            .select("*")
            .in("id", vendorIds)
            .eq("is_active", true)

          const vendorMap = new Map(
            (vendorRows ?? []).map((row) => {
              const v = mapVendor(row)
              return [v.id, { ...v, reviewCount: 0, productCount: 0 } as VendorSnapshot]
            })
          )

          products = productRows
            .map((row): ProductSearchResult | null => {
              const vendor = vendorMap.get(String(row.vendor_id))
              if (!vendor) return null
              return { ...mapProduct(row), vendor }
            })
            .filter((item): item is ProductSearchResult => Boolean(item))
        }
      }

      // Sort: name matches first, then description matches, then by stock + date
      products.sort((a, b) => {
        const sa = getProductSearchScore(a, searchGroups)
        const sb = getProductSearchScore(b, searchGroups)
        if (sb !== sa) return sb - sa
        if (a.inStock !== b.inStock) return a.inStock ? -1 : 1
        return +new Date(b.createdAt) - +new Date(a.createdAt)
      })

      // Step 2: vendors matching the search (for the Stores section)
      const { data: matchingVendorRows } = await supabase
        .from("vendor_profiles")
        .select("*")
        .eq("is_active", true)
        .or(vendorSearchFilter)
        .limit(12)

      const vendorSet = new Map<string, VendorSnapshot>()
      for (const row of matchingVendorRows ?? []) {
        const v = mapVendor(row)
        vendorSet.set(v.id, { ...v, reviewCount: 0, productCount: 0 })
      }
      for (const p of products) {
        if (!vendorSet.has(p.vendor.id)) vendorSet.set(p.vendor.id, p.vendor)
      }

      return { products, vendors: [...vendorSet.values()] }
    }

    // --- EMPTY QUERY PATH (home/trending feed) ---
    // Second look at the cache, in case another caller filled it while this
    // request was queued. The background refresh has to see past it, or it
    // would answer itself from the very copy it was sent to replace.
    if (!skipCache) {
      const cached = readHybridCache(
        marketplaceSearchCache,
        "",
        persistedCacheKeys.marketplaceSearch("")
      )
      if (cached) return cached
    }

    const [{ data: vendorRows, error: vendorError }, { data: productRows, error: productError }] =
      await Promise.all([
        supabase
          .from("vendor_profiles")
          .select("*")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("products")
          .select("*")
          .eq("in_stock", true)
          .order("created_at", { ascending: false })
          .limit(10)
      ])

    if (vendorError || productError || !vendorRows || !productRows) {
      return canUseDemoMode
        ? getMarketplaceSearchResults(query)
        : { products: [], vendors: [] }
    }

    const vendorSnapshotMap = new Map(
      vendorRows.map((row) => {
        const v = mapVendor(row)
        return [v.id, { ...v, reviewCount: 0, productCount: 0 } as VendorSnapshot]
      })
    )

    const products = productRows
      .map((row): ProductSearchResult | null => {
        const vendor = vendorSnapshotMap.get(String(row.vendor_id))
        if (!vendor) return null
        return { ...mapProduct(row), vendor } satisfies ProductSearchResult
      })
      .filter((item): item is ProductSearchResult => Boolean(item))

    const results = { products, vendors: vendorRows.map((row) => ({ ...mapVendor(row), reviewCount: 0, productCount: 0 })) }

    return writeHybridCache(
      marketplaceSearchCache,
      "",
      persistedCacheKeys.marketplaceSearch(""),
      results
    )
  })
}

/**
 * Products on one shelf.
 *
 * Filters on products.category, not on whether the name happens to contain a
 * word: "Body Wave Unit" is a wig whatever it is called, and the old keyword
 * chips missed exactly that kind of listing.
 */
export async function loadProductsByCategory(
  category: string,
  query = "",
  /** Internal: set by the background refresh so it reaches the network. */
  skipCache = false
): Promise<ProductSearchResult[]> {
  const normalized = normalizeProductCategory(category)
  const needle = query.trim().toLowerCase()

  // Both filters apply together: the shelf narrows the set, the words narrow
  // it further, so "closures" + "13x4" lands on exactly that closure.
  const matchesQuery = (product: ProductSearchResult) =>
    !needle ||
    product.name.toLowerCase().includes(needle) ||
    product.description.toLowerCase().includes(needle)

  if (!hasSupabase) {
    if (!canUseDemoMode) return []
    return getProductFeed("")
      .filter((product) => normalizeProductCategory(product.category) === normalized)
      .filter(matchesQuery)
  }

  const cacheKey = `category:${normalized}:${needle}`
  // The typed words belong in the dedupe key as well as the cache key. Keyed
  // on the shelf alone, "13x4" typed while the empty-query request was still
  // in flight was handed that request's answer — the wrong list, silently.
  const dedupeKey = `product-category:${normalized}:${needle}`
  if (!skipCache) {
    const cached = readHybridCache(
      productFeedCache,
      cacheKey,
      persistedCacheKeys.productFeed(cacheKey)
    )
    if (cached) {
      revalidateInBackground(
        dedupeKey,
        () => loadProductsByCategory(category, query, true),
        cached
      )
      return cached
    }
  }

  return deduplicatedFetch(dedupeKey, async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return []

    const { data: rows, error } = await supabase
      .from("products")
      .select("*, vendor_profiles!inner(*)")
      .eq("vendor_profiles.is_active", true)
      .eq("category", normalized)
      .order("created_at", { ascending: false })
      .limit(80)

    if (error || !rows) return []

    const results = rows
      .map((row): ProductSearchResult | null => {
        const vendorRow = (row as Record<string, unknown>).vendor_profiles
        if (!vendorRow || typeof vendorRow !== "object") return null
        const vendor = mapVendor(vendorRow as Record<string, unknown>)
        return {
          ...mapProduct(row as Record<string, unknown>),
          vendor: { ...vendor, reviewCount: 0, productCount: 0 }
        }
      })
      .filter((item): item is ProductSearchResult => Boolean(item))

    return writeHybridCache(
      productFeedCache,
      cacheKey,
      persistedCacheKeys.productFeed(cacheKey),
      results.filter(matchesQuery)
    )
  })
}

export async function loadProductFeed(
  query = "",
  /** Internal: set by the background refresh so it reaches the network. */
  skipCache = false
): Promise<ProductSearchResult[]> {
  const normalized = query.trim()

  if (!hasSupabase) {
    return canUseDemoMode ? getProductFeed(query) : []
  }

  if (normalized) {
    const results = await loadMarketplaceSearch(query, skipCache)
    return results.products
  }

  const cacheKey = normalized.toLowerCase()
  if (!skipCache) {
    const cached = readHybridCache(
      productFeedCache,
      cacheKey,
      persistedCacheKeys.productFeed(cacheKey)
    )
    if (cached) {
      revalidateInBackground(
        `product-feed:${cacheKey}`,
        () => loadProductFeed(query, true),
        cached
      )
      return cached
    }
  }

  return deduplicatedFetch(`product-feed:${cacheKey}`, async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return canUseDemoMode ? getProductFeed(query) : []

    if (normalized) {
      const results = await loadMarketplaceSearch(query)
      return writeHybridCache(
        productFeedCache,
        cacheKey,
        persistedCacheKeys.productFeed(cacheKey),
        results.products
      )
    }

    // Single query with embedded vendor join — one round-trip instead of two
    const { data: rows, error } = await supabase
      .from("products")
      .select("*, vendor_profiles!inner(*)")
      .eq("vendor_profiles.is_active", true)
      .order("created_at", { ascending: false })
      .limit(48)

    if (error || !rows) {
      // Fallback to the two-query approach when the join is unavailable
      const { data: productRows, error: productError } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(48)

      if (productError || !productRows) {
        return canUseDemoMode ? getProductFeed(query) : []
      }

      const vendorIds = [...new Set(productRows.map((product) => String(product.vendor_id)))]

      const { data: vendorRows, error: vendorError } = await supabase
        .from("vendor_profiles")
        .select("*")
        .in("id", vendorIds)
        .eq("is_active", true)

      if (vendorError || !vendorRows) {
        return canUseDemoMode ? getProductFeed(query) : []
      }

      const vendorSnapshotMap = new Map(
        vendorRows.map((row) => {
          const vendor = mapVendor(row)
          return [vendor.id, { ...vendor, reviewCount: 0, productCount: 0 } as VendorSnapshot]
        })
      )

      return writeHybridCache(
        productFeedCache,
        cacheKey,
        persistedCacheKeys.productFeed(cacheKey),
        productRows
          .map((row): ProductSearchResult | null => {
            const vendor = vendorSnapshotMap.get(String(row.vendor_id))
            if (!vendor) return null
            return { ...mapProduct(row), vendor }
          })
          .filter((item): item is ProductSearchResult => Boolean(item))
      )
    }

    const vendorSnapshotMap = new Map(
      rows
        .filter((row) => row.vendor_profiles && typeof row.vendor_profiles === "object" && !Array.isArray(row.vendor_profiles))
        .map((row) => {
          const vendor = mapVendor(row.vendor_profiles as Record<string, unknown>)
          return [vendor.id, { ...vendor, reviewCount: 0, productCount: 0 } as VendorSnapshot]
        })
    )

    return writeHybridCache(
      productFeedCache,
      cacheKey,
      persistedCacheKeys.productFeed(cacheKey),
      rows
        .map((row): ProductSearchResult | null => {
          const vendor = vendorSnapshotMap.get(String(row.vendor_id))
          if (!vendor) return null
          return { ...mapProduct(row), vendor }
        })
        .filter((item): item is ProductSearchResult => Boolean(item))
    )
  })
}

/**
 * After loadVendorDetail resolves with fresh DB data, push the current
 * inStock values back into the product-feed caches (both in-memory and
 * persisted localStorage). This prevents the home feed from showing a
 * stale "In Stock" badge for a product the seller already marked as
 * "Out of Stock".
 *
 * Runs only when values actually changed — zero overhead on a cache hit.
 */
function syncProductStockToFeedCache(
  freshProducts: Array<{ id: string; inStock: boolean }>
): void {
  if (freshProducts.length === 0) return
  const stockById = new Map(freshProducts.map((p) => [p.id, p.inStock]))

  for (const [key, entry] of productFeedCache) {
    if (!entry.value?.length) continue

    let changed = false
    const next = entry.value.map((p) => {
      const freshStock = stockById.get(p.id)
      if (freshStock === undefined || freshStock === p.inStock) return p
      changed = true
      return { ...p, inStock: freshStock }
    })

    if (changed) {
      productFeedCache.set(key, { value: next, expiresAt: entry.expiresAt })
      // Keep persisted (localStorage) cache in sync too so fresh page
      // loads after a vendor visit also show the correct stock status.
      writePersistedCache(persistedCacheKeys.productFeed(key), next)
    }
  }
}

export async function loadVendorDetail(
  vendorId: string,
  /** Internal: set by the background refresh so it reaches the network. */
  skipCache = false
): Promise<VendorDetail | null> {
  if (!hasSupabase) {
    return canUseDemoMode ? getVendorDetailDemo(vendorId) : null
  }

  const cached = skipCache
    ? null
    : readCache(vendorDetailCache, vendorId) ??
      normalizeCachedVendorDetail(
        readPersistedCache<VendorDetail>(persistedCacheKeys.vendorDetail(vendorId))
      )
  if (cached) {
    writeHybridCache(
      vendorDetailCache,
      vendorId,
      persistedCacheKeys.vendorDetail(vendorId),
      cached
    )
    revalidateInBackground(
      `vendor-detail:${vendorId}`,
      () => loadVendorDetail(vendorId, true),
      cached
    )
    return cached
  }

  return deduplicatedFetch(`vendor-detail:${vendorId}`, async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return canUseDemoMode ? getVendorDetailDemo(vendorId) : null

    const [{ data: vendor }, { data: products }, { data: reviews, count: reviewCount }] =
      await Promise.all([
      supabase.from("vendor_profiles").select("*").eq("id", vendorId).maybeSingle(),
      supabase
        .from("products")
        .select("*")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false }),
      supabase
        .from("reviews")
        .select("*", { count: "exact" })
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false })
        .limit(5)
    ])

    if (!vendor) return null

    const mappedVendor = mapVendor(vendor)
    cacheVendorProfile(mappedVendor, mappedVendor.userId)

    const mappedProducts = products?.map((product) => mapProduct(product)) ?? []

    // Propagate fresh stock status back to the product-feed cache so the
    // home page never shows a stale In Stock / Out of Stock badge.
    syncProductStockToFeedCache(mappedProducts)

    return writeHybridCache(
      vendorDetailCache,
      vendorId,
      persistedCacheKeys.vendorDetail(vendorId),
      {
        vendor: mappedVendor,
        products: mappedProducts,
        reviews:
          reviews?.map((review) => ({
            id: String(review.id),
            orderId: String(review.order_id),
            buyerId: String(review.buyer_id),
            vendorId: String(review.vendor_id),
            rating: Number(review.rating),
            comment: String(review.comment ?? ""),
            createdAt: String(review.created_at ?? new Date().toISOString()),
            buyerName: getReviewerDisplayName(
              review.buyer_name ? String(review.buyer_name) : undefined
            )
          })) ?? [],
        averageRating: mappedVendor.rating,
        reviewCount: reviewCount ?? reviews?.length ?? 0
      }
    )
  })
}

// ---------------------------------------------------------------------------
// ORDER LOADING — rebuilt for simplicity and reliability
//
// Design decisions:
//   • No joined queries (vendor_profiles(*)) — avoids PostgREST schema-cache
//     errors that silently return null instead of the order data.
//   • Vendor profiles are fetched in a single batch query (list) or one
//     separate query (detail) after the order rows arrive.
//   • No deduplicatedFetch wrapper — order pages are low-traffic and the
//     added complexity was causing timing issues.
//   • A short in-memory cache (CACHE_TTL_MS) is kept so rapid re-renders
//     don't hammer the DB, but it is always bypassed when fresh:true.
// ---------------------------------------------------------------------------

export async function loadBuyerOrders(
  userId: string,
  options: { fresh?: boolean } = {}
): Promise<OrderDetail[]> {
  if (!hasSupabase) {
    return canUseDemoMode ? getBuyerOrdersDemo(userId) : []
  }

  // Return in-memory or persisted cache when not forcing a refresh.
  if (!options.fresh) {
    const cached =
      readCache(buyerOrdersCache, userId) ??
      readPersistedOrderList(persistedCacheKeys.buyerOrders(userId))
    if (cached !== null) {
      writeCache(buyerOrdersCache, userId, cached)
      return cached
    }
  }

  const supabase = getSupabaseBrowserClient()
  if (!supabase) return canUseDemoMode ? getBuyerOrdersDemo(userId) : []

  // 1. Fetch all visible orders for this buyer (DB filters hidden rows too).
  const { data: rows, error: ordersError } = await supabase
    .from("orders")
    .select("*")
    .eq("buyer_id", userId)
    .is("buyer_hidden_at", null)
    .order("created_at", { ascending: false })
    .limit(50)

  if (ordersError) {
    logMarketplaceError("buyer-orders", ordersError)
    // Return stale cache on network error rather than an empty list.
    return readCache(buyerOrdersCache, userId) ?? []
  }

  if (!rows || rows.length === 0) {
    const empty: OrderDetail[] = []
    writeHybridCache(buyerOrdersCache, userId, persistedCacheKeys.buyerOrders(userId), empty)
    return empty
  }

  // 2. Fetch every unique vendor in one round-trip.
  const vendorIds = [...new Set(rows.map((r) => String(r.vendor_id)))]
  const { data: vendorRows } = await supabase
    .from("vendor_profiles")
    .select("*")
    .in("id", vendorIds)

  const vendorById = new Map<string, VendorProfile>()
  for (const v of vendorRows ?? []) {
    vendorById.set(String(v.id), mapVendor(v))
  }

  // 3. Filter locally-hidden orders and map.
  const hiddenIds = getHiddenOrderIds("buyer", userId)
  const orders = rows
    .filter((r) => !hiddenIds.has(String(r.id)))
    .map((r) => mapOrder(r, vendorById.get(String(r.vendor_id))))

  return writeHybridCache(
    buyerOrdersCache,
    userId,
    persistedCacheKeys.buyerOrders(userId),
    orders
  )
}

export async function loadSellerOrders(
  userId: string,
  options: { fresh?: boolean } = {}
): Promise<OrderDetail[]> {
  if (!hasSupabase) {
    return canUseDemoMode ? getSellerOrdersDemo(userId) : []
  }

  if (!options.fresh) {
    const cached =
      readCache(sellerOrdersCache, userId) ??
      readPersistedOrderList(persistedCacheKeys.sellerOrders(userId))
    if (cached !== null) {
      writeCache(sellerOrdersCache, userId, cached)
      return cached
    }
  }

  const supabase = getSupabaseBrowserClient()
  if (!supabase) return canUseDemoMode ? getSellerOrdersDemo(userId) : []

  // 1. Resolve this user's vendor profile (needed for vendor_id filter).
  const { data: vendorRow, error: vendorError } = await supabase
    .from("vendor_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  if (vendorError) {
    logMarketplaceError("seller-orders-vendor", vendorError)
    return readCache(sellerOrdersCache, userId) ?? []
  }

  if (!vendorRow) return []

  const vendor = mapVendor(vendorRow)

  // 2. Fetch all visible orders for this vendor store.
  const { data: rows, error: ordersError } = await supabase
    .from("orders")
    .select("*")
    .eq("vendor_id", vendorRow.id)
    .is("seller_hidden_at", null)
    .order("created_at", { ascending: false })
    .limit(50)

  if (ordersError) {
    logMarketplaceError("seller-orders", ordersError)
    return readCache(sellerOrdersCache, userId) ?? []
  }

  if (!rows || rows.length === 0) {
    const empty: OrderDetail[] = []
    writeHybridCache(sellerOrdersCache, userId, persistedCacheKeys.sellerOrders(userId), empty)
    return empty
  }

  const hiddenIds = getHiddenOrderIds("seller", userId)
  const orders = rows
    .filter((r) => !hiddenIds.has(String(r.id)))
    .map((r) => mapOrder(r, vendor))

  return writeHybridCache(
    sellerOrdersCache,
    userId,
    persistedCacheKeys.sellerOrders(userId),
    orders
  )
}

export async function loadOrderDetail(
  orderId: string,
  options: { fresh?: boolean } = {}
): Promise<OrderDetail | null> {
  if (!hasSupabase) {
    return canUseDemoMode ? getOrderByIdDemo(orderId) : null
  }

  if (!options.fresh) {
    const cached =
      readCache(orderDetailCache, orderId) ??
      normalizeCachedOrder(
        readPersistedCache<OrderDetail>(persistedCacheKeys.orderDetail(orderId))
      )
    if (cached !== null) {
      writeCache(orderDetailCache, orderId, cached)
      return cached
    }
  }

  const supabase = getSupabaseBrowserClient()
  if (!supabase) return canUseDemoMode ? getOrderByIdDemo(orderId) : null

  // 1. Fetch the order row — simple SELECT, no joins.
  const { data: orderRow, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle()

  if (orderError) {
    logMarketplaceError("order-detail", orderError)
    // Surface the error so the UI can show a retry instead of "not found".
    throw new Error(orderError.message)
  }

  if (!orderRow) {
    // Genuinely not found or RLS blocked — return null (not an exception).
    return null
  }

  // 2. Fetch the vendor profile in a separate query.
  const { data: vendorRow } = await supabase
    .from("vendor_profiles")
    .select("*")
    .eq("id", orderRow.vendor_id)
    .maybeSingle()

  // 3. Fetch the buyer's profile (phone + name) so the seller can chat them.
  const { data: buyerRow } = await supabase
    .from("users")
    .select("id, full_name, phone, profile_photo_url, email, account_type, created_at")
    .eq("id", orderRow.buyer_id)
    .maybeSingle()

  const order = mapOrder(orderRow, vendorRow ? mapVendor(vendorRow) : undefined)
  if (buyerRow) {
    order.buyer = mapUser(buyerRow as Record<string, unknown>)
  }

  return writeHybridCache(
    orderDetailCache,
    orderId,
    persistedCacheKeys.orderDetail(orderId),
    order
  )
}

export async function loadSellerProducts(userId: string) {
  if (!hasSupabase) {
    return canUseDemoMode ? getSellerProductsDemo(userId) : []
  }

  const cached = readHybridCache(
    sellerProductsCache,
    userId,
    persistedCacheKeys.sellerProducts(userId)
  )
  if (cached) {
    return cached
  }

  return deduplicatedFetch(`seller-products:${userId}`, async () => {
    const vendor = await loadVendorProfile(userId)
    if (!vendor) return []

    const supabase = getSupabaseBrowserClient()
    if (!supabase) return canUseDemoMode ? getSellerProductsDemo(userId) : []
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("vendor_id", vendor.id)
      .order("created_at", { ascending: false })

    if (error || !data) return canUseDemoMode ? getSellerProductsDemo(userId) : []

    return writeHybridCache(
      sellerProductsCache,
      userId,
      persistedCacheKeys.sellerProducts(userId),
      data.map((product) => mapProduct(product))
    )
  })
}

export async function loadStoreAnalytics(userId: string): Promise<StoreAnalytics> {
  if (!hasSupabase) {
    return canUseDemoMode
      ? getStoreAnalyticsDemo(userId)
      : { totalOrders: 0, totalRevenue: 0, averageRating: 0 }
  }

  const cached = readHybridCache(
    storeAnalyticsCache,
    userId,
    persistedCacheKeys.storeAnalytics(userId)
  )
  if (cached) {
    return cached
  }

  return deduplicatedFetch(`store-analytics:${userId}`, async () => {
    const vendor = await loadVendorProfile(userId)
    if (!vendor) {
      return { totalOrders: 0, totalRevenue: 0, averageRating: 0 }
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      return canUseDemoMode
        ? getStoreAnalyticsDemo(userId)
        : { totalOrders: 0, totalRevenue: 0, averageRating: 0 }
    }

    const { data, error } = await supabase
      .from("orders")
      .select("id, total_amount, status")
      .eq("vendor_id", vendor.id)

    if (error || !data) {
      return canUseDemoMode
        ? getStoreAnalyticsDemo(userId)
        : { totalOrders: 0, totalRevenue: 0, averageRating: vendor.rating }
    }

    return writeHybridCache(
      storeAnalyticsCache,
      userId,
      persistedCacheKeys.storeAnalytics(userId),
      {
        totalOrders: data.length,
        totalRevenue: data
          .filter((order) => String(order.status) !== "cancelled")
          .reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0),
        averageRating: vendor.rating
      }
    )
  })
}

export async function loadVendorProfile(userId: string) {
  if (!hasSupabase) {
    return canUseDemoMode ? getVendorByUserId(userId) : null
  }

  const cached = readCache(vendorProfileCache, userId)
  if (cached !== null) {
    return cached
  }

  const persisted = normalizeCachedVendor(
    readPersistedCache<VendorProfile>(persistedCacheKeys.vendorProfile(userId))
  )
  if (persisted) {
    return cacheVendorProfile(persisted, userId)
  }

  return deduplicatedFetch(`vendor-profile:${userId}`, async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return canUseDemoMode ? getVendorByUserId(userId) : null
    const { data, error } = await supabase
      .from("vendor_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()

    if (error || !data) {
      return cacheVendorProfile(canUseDemoMode ? getVendorByUserId(userId) : null, userId)
    }
    return cacheVendorProfile(mapVendor(data), userId)
  })
}

/** "ada.obi@mail.com" -> "Ada Obi". Mirrors the signup API's fallback name. */
function deriveNameFromEmail(email: string) {
  const handle = email.split("@")[0]?.replace(/[._-]+/g, " ").trim()
  if (!handle) return "Afunwa Customer"

  return handle
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export async function findOrCreateDemoUser(values: SignUpFormValues) {
  const existing = getDemoUserByEmail(values.email)
  if (existing) {
    return existing
  }

  const user: UserProfile = {
    id: createId("user"),
    email: values.email,
    phone: values.phone ?? "",
    fullName: values.fullName?.trim() || deriveNameFromEmail(values.email),
    accountType: values.accountType ?? "buyer",
    createdAt: new Date().toISOString()
  }

  return upsertDemoUser(user)
}

export async function loadUserProfile(userId: string) {
  if (!hasSupabase) {
    return canUseDemoMode ? getDemoUserById(userId) : null
  }

  const cached = readCache(userProfileCache, userId)
  if (cached !== null) {
    return cached
  }

  const persisted = normalizeCachedUser(
    readPersistedCache<UserProfile>(persistedCacheKeys.userProfile(userId))
  )
  if (persisted) {
    return cacheUserProfile(persisted, userId)
  }

  return deduplicatedFetch(`user-profile:${userId}`, async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return canUseDemoMode ? getDemoUserById(userId) : null
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle()

    if (error || !data) {
      return cacheUserProfile(canUseDemoMode ? getDemoUserById(userId) : null, userId)
    }
    return cacheUserProfile(mapUser(data), userId)
  })
}

export async function saveUserProfile(input: UserProfile) {
  if (!hasSupabase) {
    if (canUseDemoMode) {
      return upsertDemoUser(input)
    }
    throw new Error(getLaunchConfigError("Profile updates"))
  }

  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    if (canUseDemoMode) {
      return upsertDemoUser(input)
    }
    throw new Error(getLaunchConfigError("Profile updates"))
  }

  const { data, error } = await supabase
    .from("users")
    .upsert({
      id: input.id,
      email: input.email,
      // Empty strings would collide on the unique phone index once several
      // buyers sign up without a number — store NULL instead.
      phone: input.phone?.trim() ? input.phone.trim() : null,
      full_name: input.fullName,
      profile_photo_url: input.profilePhotoUrl,
      account_type: input.accountType
    })
    .select()
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to save profile")
  }

  return cacheUserProfile(mapUser(data), input.id)
}

export async function saveSellerProfile(
  userId: string,
  input: SellerProfileInput
): Promise<VendorProfile> {
  if (!hasSupabase) {
    if (canUseDemoMode) {
      return saveSellerProfileDemo(userId, input)
    }
    throw new Error(getLaunchConfigError("Seller onboarding"))
  }

  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    if (canUseDemoMode) {
      return saveSellerProfileDemo(userId, input)
    }
    throw new Error(getLaunchConfigError("Seller onboarding"))
  }

  const { data, error } = await supabase
    .from("vendor_profiles")
    .upsert(
      {
        user_id: userId,
        store_name: input.storeName,
        category: input.category,
        store_photo_url: input.storePhotoUrl,
        bio: input.bio,
        city: input.city,
        whatsapp_number: input.whatsappNumber,
        bank_name: input.bankName,
        account_name: input.accountName,
        account_number: input.accountNumber,
        payment_note: input.paymentNote,
        delivery_fee: input.deliveryFee ?? 0,
        free_delivery_over: input.freeDeliveryOver ?? null,
        delivery_note: input.deliveryNote ?? null,
        shipping_rates: input.shippingRates ?? {},
        shipping_zones: input.shippingZones ?? {},
        origin_address: input.originAddress ?? null,
        origin_city: input.originCity ?? null,
        origin_state: input.originState ?? null,
        default_item_weight_kg: input.defaultItemWeightKg ?? null,
        is_active: true
      },
      // Conflict on user_id, not on the primary key. No id is sent here, so
      // the default made every save an insert — fine the first time, and a
      // "duplicate key value violates vendor_profiles_user_id_key" every time
      // the store was edited afterwards.
      { onConflict: "user_id" }
    )
    .select()
    .single()

  if (error || !data) {
    const message = error?.message?.toLowerCase() ?? ""
    if (
      message.includes("bank_name") ||
      message.includes("account_name") ||
      message.includes("account_number") ||
      message.includes("payment_note")
    ) {
      throw new Error("Run the latest Supabase seller-payment SQL patch, then try again.")
    }
    if (
      message.includes("delivery_fee") ||
      message.includes("free_delivery_over") ||
      message.includes("delivery_note") ||
      message.includes("shipping_rates") ||
      message.includes("shipping_zones")
    ) {
      throw new Error(
        "Run the latest Supabase shipping SQL patches, then save again."
      )
    }
    throw new Error(error?.message ?? "Unable to save seller profile")
  }

  const vendor = mapVendor(data)
  cacheVendorProfile(vendor, userId)
  vendorDetailCache.delete(vendor.id)
  sellerOrdersCache.delete(userId)
  sellerProductsCache.delete(userId)
  storeAnalyticsCache.delete(userId)
  deletePersistedCache(persistedCacheKeys.vendorDetail(vendor.id))
  deletePersistedCache(persistedCacheKeys.sellerOrders(userId))
  deletePersistedCache(persistedCacheKeys.sellerProducts(userId))
  deletePersistedCache(persistedCacheKeys.storeAnalytics(userId))
  clearMarketplaceDiscoveryCaches()
  return vendor
}

export async function saveProduct(
  input: ProductInput,
  /** Called when the database had no column for a field, so it was not saved. */
  onFieldsDropped?: (fields: string[]) => void
) {
  if (!hasSupabase) {
    if (canUseDemoMode) {
      return saveProductDemo(input)
    }
    throw new Error(getLaunchConfigError("Product uploads"))
  }

  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    if (canUseDemoMode) {
      return saveProductDemo(input)
    }
    throw new Error(getLaunchConfigError("Product uploads"))
  }

  const payload = {
    vendor_id: input.vendorId,
    name: input.name,
    category: normalizeProductCategory(input.category),
    description: input.description,
    compare_at_price:
      normalizeCompareAtPrice(input.compareAtPrice, input.price) ?? null,
    weight_kg:
      Number(input.weightKg) > 0 ? Number(input.weightKg) : null,
    price: input.price,
    photo_url: input.photoUrls[0] ?? input.photoUrl ?? null,
    photo_urls: input.photoUrls,
    in_stock: input.inStock
  }

  let response = input.id
    ? await supabase.from("products").update(payload).eq("id", input.id).select().single()
    : await supabase.from("products").insert(payload).select().single()

  // PGRST204 means the database has no such column — a migration that has not
  // been run. Drop only the column PostgREST actually names and try again.
  //
  // The old behaviour fell back to a fixed legacy payload, which threw away
  // the category, the compare-at price AND every photo but the first, then
  // reported "Product updated." A seller missing one migration silently lost
  // three fields on every save.
  const retryPayload: Record<string, unknown> = { ...payload }
  const droppedColumns: string[] = []

  while (response.error?.code === "PGRST204") {
    const missing = response.error.message?.match(/'([^']+)' column/)?.[1]
    if (!missing || !(missing in retryPayload)) break

    delete retryPayload[missing]
    droppedColumns.push(missing)

    // photo_urls is the one genuinely legacy shape: fold the extra photos back
    // into the single photo_url column so they are not simply lost.
    if (missing === "photo_urls" && "photo_url" in retryPayload) {
      retryPayload.photo_url =
        serializeLegacyPhotoUrl(input.photoUrls) ?? input.photoUrl ?? null
    }

    response = input.id
      ? await supabase
          .from("products")
          .update(retryPayload)
          .eq("id", input.id)
          .select()
          .single()
      : await supabase.from("products").insert(retryPayload).select().single()
  }

  if (droppedColumns.length) {
    // Tell whoever pressed Save, not just the console. A field that vanishes
    // while the screen says "Product updated" is how someone ends up certain
    // the weight box is broken when the column simply is not there yet.
    onFieldsDropped?.(droppedColumns.map(friendlyColumnName))

    console.warn(
      `Saved without ${droppedColumns.join(", ")} — the database is missing ` +
        `${droppedColumns.length > 1 ? "those columns" : "that column"}. ` +
        "Run the SQL files in supabase/ to stop losing these fields."
    )
  }

  if (response.error || !response.data) {
    throw new Error(response.error?.message ?? "Unable to save product")
  }

  const product = mapProduct(response.data)
  sellerProductsCache.clear()
  vendorDetailCache.delete(input.vendorId)
  clearPersistedCacheByPrefix("seller-products:")
  clearPersistedCacheByPrefix("vendor-detail:")
  clearPersistedCacheByPrefix("store-analytics:")
  clearMarketplaceDiscoveryCaches()
  return product
}

export async function deleteProduct(productId: string) {
  if (!hasSupabase) {
    if (canUseDemoMode) {
      return deleteProductDemo(productId)
    }
    throw new Error(getLaunchConfigError("Product deletion"))
  }

  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    if (canUseDemoMode) {
      return deleteProductDemo(productId)
    }
    throw new Error(getLaunchConfigError("Product deletion"))
  }
  const { error } = await supabase.from("products").delete().eq("id", productId)
  if (error) {
    throw new Error(error.message)
  }
  sellerProductsCache.clear()
  vendorDetailCache.clear()
  clearPersistedCacheByPrefix("seller-products:")
  clearPersistedCacheByPrefix("vendor-detail:")
  clearPersistedCacheByPrefix("store-analytics:")
  clearMarketplaceDiscoveryCaches()
  return true
}

/** Returns the current session's access token, or null if not signed in. */
export async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return null
  const {
    data: { session }
  } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

/**
 * Starts a Flutterwave checkout and returns the URL to send the buyer to.
 *
 * No retry: this creates an order row, and a retried POST would create a second
 * one for the same cart.
 */
export async function startCardCheckout(
  payload: CheckoutPayload,
  /** Which hosted checkout to open. Both return the same shape. */
  provider: "flutterwave" | "paypal" = "flutterwave"
): Promise<{ checkoutUrl: string; orderId: string }> {
  const token = await getAccessToken()
  const response = await fetch(`/api/${provider}/initialize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload)
  })

  const data = (await response.json().catch(() => null)) as
    | { checkoutUrl?: string; orderId?: string; error?: string }
    | null

  if (!response.ok || !data?.checkoutUrl || !data.orderId) {
    throw new Error(data?.error ?? "Could not start card checkout.")
  }

  clearOrderCaches()
  return { checkoutUrl: data.checkoutUrl, orderId: data.orderId }
}

export async function placeOrder(
  payload: CheckoutPayload
): Promise<PlaceOrderResponse> {
  if (!hasSupabase) {
    if (canUseDemoMode) {
      const order = createOrderDemo({
        buyerId: payload.buyerId,
        vendorId: payload.vendorId,
        items: payload.items,
        totalAmount: payload.totalAmount,
        status: "pending",
        paymentMethod: payload.paymentMethod,
        paymentStatus:
          payload.paymentMethod === "vendor_transfer"
            ? "awaiting_seller_confirmation"
            : "pay_on_delivery",
        buyerPaymentNote: payload.buyerPaymentNote,
        deliveryAddress: payload.deliveryAddress
      })

      clearOrderCaches()
      return {
        orderId: order.id
      }
    }

    throw new Error(getOrderPlacementError())
  }

  const token = await getAccessToken()
  // Deliberately not fetchWithRetry: creating an order is not idempotent, and
  // a retry after a slow-but-successful POST bills the buyer for two orders.
  // startCardCheckout takes the same care.
  const response = await fetch("/api/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as
      | { error?: string }
      | null
    throw new Error(data?.error ?? "Unable to place order")
  }

  clearOrderCaches()
  return (await response.json()) as PlaceOrderResponse
}

export async function updateOrderStatus(
  orderId: string,
  updates: OrderUpdatePayload
) {
  if (!hasSupabase) {
    if (canUseDemoMode) {
      return updateOrderStatusDemo(orderId, updates)
    }
    throw new Error(getLaunchConfigError("Order status updates"))
  }

  const token = await getAccessToken()
  const response = await fetchWithRetry(
    `/api/orders/${orderId}/status`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(updates)
    },
    { timeout: 12_000, retries: 1 }
  )

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as
      | { error?: string }
      | null
    throw new Error(data?.error ?? "Unable to update order")
  }

  updateCachedOrderCollections(orderId, (order) => ({
    ...order,
    ...(updates.status ? { status: updates.status } : {}),
    ...(updates.paymentStatus ? { paymentStatus: updates.paymentStatus } : {}),
    ...(updates.deliveryAddress ? { deliveryAddress: updates.deliveryAddress } : {})
  }))

  return response.json()
}

export async function archiveCompletedOrder(
  orderId: string,
  actor: OrderArchiveActor,
  userId: string
) {
  if (!hasSupabase) {
    hideOrderLocally(actor, userId, orderId)
    removeOrderFromVisibleCaches(orderId, actor)
    return { ok: true, localOnly: true }
  }

  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    hideOrderLocally(actor, userId, orderId)
    removeOrderFromVisibleCaches(orderId, actor)
    return { ok: true, localOnly: true }
  }

  const { error } = await supabase.rpc("hide_completed_order", {
    target_order_id: orderId,
    actor
  })

  if (error) {
    const message = error.message.toLowerCase()
    const canFallbackLocally =
      message.includes("function") ||
      message.includes("schema cache") ||
      message.includes("does not exist") ||
      message.includes("buyer_hidden_at") ||
      message.includes("seller_hidden_at")

    if (!canFallbackLocally) {
      throw new Error(error.message)
    }

    hideOrderLocally(actor, userId, orderId)
    removeOrderFromVisibleCaches(orderId, actor)
    return { ok: true, localOnly: true }
  }

  hideOrderLocally(actor, userId, orderId)
  removeOrderFromVisibleCaches(orderId, actor)
  return { ok: true, localOnly: false }
}

export async function saveReview(input: {
  orderId: string
  buyerId: string
  vendorId: string
  rating: number
  comment: string
  buyerName: string
}) {
  if (!hasSupabase) {
    if (canUseDemoMode) {
      return saveReviewDemo(input)
    }
    throw new Error(getLaunchConfigError("Reviews"))
  }

  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    if (canUseDemoMode) {
      return saveReviewDemo(input)
    }
    throw new Error(getLaunchConfigError("Reviews"))
  }
  let response = await supabase
    .from("reviews")
    .insert({
      order_id: input.orderId,
      buyer_id: input.buyerId,
      vendor_id: input.vendorId,
      rating: input.rating,
      comment: input.comment,
      buyer_name: input.buyerName
    })
    .select()
    .single()

  if (
    response.error?.code === "PGRST204" ||
    response.error?.message?.toLowerCase().includes("buyer_name")
  ) {
    response = await supabase
      .from("reviews")
      .insert({
        order_id: input.orderId,
        buyer_id: input.buyerId,
        vendor_id: input.vendorId,
        rating: input.rating,
        comment: input.comment
      })
      .select()
      .single()
  }

  if (response.error || !response.data) {
    throw new Error(response.error?.message ?? "Unable to save review")
  }

  vendorDetailCache.delete(input.vendorId)
  storeAnalyticsCache.clear()
  deletePersistedCache(persistedCacheKeys.vendorDetail(input.vendorId))
  clearPersistedCacheByPrefix("store-analytics:")

  return response.data
}

/**
 * Keeps the buyer's delivery address on their account.
 *
 * It also lives in localStorage, which remembers it on the phone it was typed
 * on and nowhere else. This is what carries it to their next device, so
 * somebody who ordered on a laptop is not made to type it all again.
 *
 * Deliberately quiet on failure: the address is already saved locally and is
 * carried on the order itself, so a missing column or a dropped connection
 * must never be what stops an order going through.
 */
export async function saveBuyerDeliveryAddress(userId: string, address: unknown) {
  if (!hasSupabase) return false

  const supabase = getSupabaseBrowserClient()
  if (!supabase) return false

  const { error } = await supabase
    .from("users")
    .update({ delivery_address: address })
    .eq("id", userId)

  if (error) {
    // Almost certainly delivery-and-saved-address.sql not yet run.
    return false
  }

  deletePersistedCache(persistedCacheKeys.userProfile(userId))
  userProfileCache.delete(userId)
  return true
}

/** The address saved against the account, or null when there is not one. */
export async function loadBuyerDeliveryAddress(userId: string) {
  if (!hasSupabase) return null

  const supabase = getSupabaseBrowserClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from("users")
    .select("delivery_address")
    .eq("id", userId)
    .maybeSingle()

  if (error || !data) return null
  return (data as { delivery_address?: unknown }).delivery_address ?? null
}

/** Column names as a seller would say them. */
function friendlyColumnName(column: string) {
  const names: Record<string, string> = {
    weight_kg: "weight",
    compare_at_price: "old price",
    category: "category",
    photo_urls: "extra photos"
  }
  return names[column] ?? column
}
