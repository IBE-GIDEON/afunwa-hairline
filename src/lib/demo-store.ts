import { safeLocalStorage } from "@/lib/safe-storage"
import {
  DEMO_STATE_KEY,
  OFFLINE_ORDER_STORE,
  OFFLINE_DB_NAME
} from "@/lib/constants"
import { createInitialDemoState } from "@/lib/mock-data"
import {
  type DemoState,
  type MarketplaceSearchResults,
  type Order,
  type OrderDetail,
  type OrderUpdatePayload,
  type Product,
  type ProductInput,
  type ProductSearchResult,
  type Review,
  type ReviewWithBuyer,
  type SellerProfileInput,
  type StoreAnalytics,
  type UserProfile,
  type VendorDetail,
  type VendorProfile,
  type VendorSnapshot
} from "@/lib/types"
import { createId } from "@/lib/utils"

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

export function getDemoState(): DemoState {
  if (typeof window === "undefined") {
    return createInitialDemoState()
  }

  const existing = safeLocalStorage.getItem(DEMO_STATE_KEY)
  if (existing) {
    return JSON.parse(existing) as DemoState
  }

  const seeded = createInitialDemoState()
  safeLocalStorage.setItem(DEMO_STATE_KEY, JSON.stringify(seeded))
  return seeded
}

export function saveDemoState(state: DemoState) {
  if (typeof window === "undefined") {
    return
  }

  safeLocalStorage.setItem(DEMO_STATE_KEY, JSON.stringify(state))
}

function withState<T>(updater: (draft: DemoState) => T): T {
  const state = cloneState(getDemoState())
  const result = updater(state)
  saveDemoState(state)
  return result
}

function buildVendorSnapshot(
  vendor: VendorProfile,
  state: DemoState
): VendorSnapshot {
  const products = state.products.filter((product) => product.vendorId === vendor.id)
  const reviews = state.reviews.filter((review) => review.vendorId === vendor.id)
  const recentOrder = state.orders
    .filter((order) => order.vendorId === vendor.id)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0]

  const rating =
    reviews.length > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : vendor.rating

  return {
    ...vendor,
    rating,
    reviewCount: reviews.length,
    productCount: products.length,
    lastOrderAt: recentOrder?.createdAt
  }
}

const DEMO_SEARCH_STOP_WORDS = new Set([
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
const DEMO_SEARCH_ALIASES: Record<string, string[]> = {
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

function getDemoSearchGroups(query: string) {
  return [
    ...new Set(
      query
        .toLocaleLowerCase()
        .match(/[\p{L}\p{N}]+/gu)
        ?.filter((token) => token.length > 1 && !DEMO_SEARCH_STOP_WORDS.has(token)) ??
        []
    )
  ].map((token) => {
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
      for (const alias of DEMO_SEARCH_ALIASES[variant] ?? []) {
        variants.add(alias)
      }
    }

    return [...variants]
  })
}

function demoSearchMatches(values: string[], groups: string[][]) {
  if (groups.length === 0) {
    return true
  }

  const haystack = values.map((value) => value.toLocaleLowerCase()).join(" ")
  return groups.some((group) =>
    group.some((variant) => haystack.includes(variant))
  )
}

function demoSearchScore(values: string[], groups: string[][]) {
  if (groups.length === 0) {
    return 0
  }

  const haystack = values.map((value) => value.toLocaleLowerCase()).join(" ")
  return groups.reduce((score, group) => {
    const matched = group.some((variant) => haystack.includes(variant))
    return matched ? score + 1 : score
  }, 0)
}

function buildMarketplaceProductMatches(state: DemoState, normalized: string) {
  const activeVendors = state.vendors.filter((vendor) => vendor.isActive)
  const vendorSnapshotMap = new Map(
    activeVendors.map((vendor) => [vendor.id, buildVendorSnapshot(vendor, state)])
  )
  const searchGroups = getDemoSearchGroups(normalized)

  // Products are matched purely on their own name and description so any
  // keyword a seller writes in their listing is directly searchable.
  // Vendor metadata (category, city) is used for vendor discovery only.
  const products: ProductSearchResult[] = state.products
    .filter((product) => vendorSnapshotMap.has(product.vendorId))
    .filter((product) => {
      if (!normalized) return true
      return demoSearchMatches([product.name, product.description], searchGroups)
    })
    .map((product) => ({
      ...product,
      vendor: vendorSnapshotMap.get(product.vendorId)!
    }))
    .sort((left, right) => {
      if (normalized) {
        const leftScore =
          demoSearchScore([left.name], searchGroups) * 8 +
          demoSearchScore([left.description], searchGroups) * 5
        const rightScore =
          demoSearchScore([right.name], searchGroups) * 8 +
          demoSearchScore([right.description], searchGroups) * 5

        if (rightScore !== leftScore) {
          return rightScore - leftScore
        }
      }

      return +new Date(right.createdAt) - +new Date(left.createdAt)
    })

  return {
    activeVendors,
    products
  }
}

export function getVendorSnapshots(query?: string): VendorSnapshot[] {
  const state = getDemoState()
  const normalized = query?.trim().toLowerCase()

  return state.vendors
    .filter((vendor) => vendor.isActive)
    .filter((vendor) => {
      if (!normalized) return true
      return (
        vendor.storeName.toLowerCase().includes(normalized) ||
        vendor.category.toLowerCase().includes(normalized) ||
        vendor.city.toLowerCase().includes(normalized)
      )
    })
    .map((vendor) => buildVendorSnapshot(vendor, state))
    .sort((a, b) => {
      const left = a.lastOrderAt ?? a.createdAt
      const right = b.lastOrderAt ?? b.createdAt
      return +new Date(right) - +new Date(left)
    })
}

export function getProductFeed(query = ""): ProductSearchResult[] {
  const state = getDemoState()
  const normalized = query.trim().toLowerCase()

  return buildMarketplaceProductMatches(state, normalized).products
}

export function getVendorDetailDemo(vendorId: string): VendorDetail | null {
  const state = getDemoState()
  const vendor = state.vendors.find((item) => item.id === vendorId)
  if (!vendor) return null

  const owner = state.users.find((user) => user.id === vendor.userId)
  const products = state.products
    .filter((product) => product.vendorId === vendorId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
  const reviews: ReviewWithBuyer[] = state.reviews
    .filter((review) => review.vendorId === vendorId)
    .map((review) => ({
      ...review,
      buyerName:
        state.users.find((user) => user.id === review.buyerId)?.fullName ?? "Buyer"
    }))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))

  const averageRating =
    reviews.length > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : vendor.rating

  return {
    vendor: { ...vendor, rating: averageRating },
    owner,
    products,
    reviews,
    averageRating,
    reviewCount: reviews.length
  }
}

export function getMarketplaceSearchResults(query = ""): MarketplaceSearchResults {
  const state = getDemoState()
  const normalized = query.trim().toLowerCase()
  const { activeVendors, products } = buildMarketplaceProductMatches(state, normalized)

  const directVendorMatches = activeVendors
    .filter((vendor) => {
      if (!normalized) return true
      return [vendor.storeName, vendor.category, vendor.city, vendor.bio ?? ""].some(
        (value) => value.toLowerCase().includes(normalized)
      )
    })
    .map((vendor) => buildVendorSnapshot(vendor, state))

  const vendors = [...directVendorMatches, ...products.map((product) => product.vendor)]
    .filter(
      (vendor, index, list) =>
        list.findIndex((candidate) => candidate.id === vendor.id) === index
    )
    .sort((a, b) => {
      const left = a.lastOrderAt ?? a.createdAt
      const right = b.lastOrderAt ?? b.createdAt
      return +new Date(right) - +new Date(left)
    })

  return {
    products: products
      .sort((left, right) => {
        if (left.inStock !== right.inStock) {
          return left.inStock ? -1 : 1
        }
        return +new Date(right.createdAt) - +new Date(left.createdAt)
      })
      .slice(0, normalized ? 18 : 10),
    vendors: vendors.slice(0, normalized ? 12 : 6)
  }
}

export function upsertDemoUser(user: UserProfile) {
  return withState((state) => {
    const existingIndex = state.users.findIndex((item) => item.id === user.id)
    if (existingIndex >= 0) {
      state.users[existingIndex] = user
    } else {
      state.users.push(user)
    }
    return user
  })
}

export function getDemoUserByPhone(phone: string) {
  const state = getDemoState()
  return state.users.find((user) => user.phone === phone) ?? null
}

export function getDemoUserByEmail(email: string) {
  const state = getDemoState()
  return (
    state.users.find(
      (user) => user.email.toLowerCase() === email.trim().toLowerCase()
    ) ?? null
  )
}

export function getDemoUserById(userId: string) {
  const state = getDemoState()
  return state.users.find((user) => user.id === userId) ?? null
}

export function getVendorByUserId(userId: string) {
  const state = getDemoState()
  return state.vendors.find((vendor) => vendor.userId === userId) ?? null
}

export function saveSellerProfileDemo(userId: string, input: SellerProfileInput) {
  return withState((state) => {
    const currentUser = state.users.find((user) => user.id === userId)
    if (!currentUser) {
      throw new Error("User not found")
    }

    currentUser.accountType =
      currentUser.accountType === "buyer" ? "both" : currentUser.accountType

    const existing = state.vendors.find((vendor) => vendor.userId === userId)
    if (existing) {
      existing.storeName = input.storeName
      existing.category = input.category
      existing.storePhotoUrl = input.storePhotoUrl
      existing.bio = input.bio
      existing.city = input.city
      existing.whatsappNumber = input.whatsappNumber
      existing.bankName = input.bankName
      existing.accountName = input.accountName
      existing.accountNumber = input.accountNumber
      existing.paymentNote = input.paymentNote
      existing.isActive = true
      return existing
    }

    const vendor: VendorProfile = {
      id: createId("vendor"),
      userId,
      storeName: input.storeName,
      storePhotoUrl: input.storePhotoUrl,
      bio: input.bio,
      category: input.category,
      city: input.city,
      whatsappNumber: input.whatsappNumber,
      bankName: input.bankName,
      accountName: input.accountName,
      accountNumber: input.accountNumber,
      paymentNote: input.paymentNote,
      isActive: true,
      totalSales: 0,
      rating: 0,
      createdAt: new Date().toISOString()
    }

    state.vendors.unshift(vendor)
    return vendor
  })
}

export function saveProductDemo(input: ProductInput) {
  return withState((state) => {
    const existing = state.products.find((product) => product.id === input.id)
    if (existing) {
      existing.name = input.name
      existing.category = input.category
      existing.description = input.description
      existing.price = input.price
      existing.photoUrl = input.photoUrls[0] ?? input.photoUrl
      existing.photoUrls = input.photoUrls
      existing.inStock = input.inStock
      return existing
    }

    const product: Product = {
      id: createId("prod"),
      vendorId: input.vendorId,
      name: input.name,
      category: input.category,
      description: input.description,
      price: input.price,
      photoUrl: input.photoUrls[0] ?? input.photoUrl,
      photoUrls: input.photoUrls,
      inStock: input.inStock,
      createdAt: new Date().toISOString()
    }

    state.products.unshift(product)
    return product
  })
}

export function deleteProductDemo(productId: string) {
  return withState((state) => {
    state.products = state.products.filter((product) => product.id !== productId)
    return true
  })
}

export function getSellerProductsDemo(userId: string) {
  const state = getDemoState()
  const vendor = state.vendors.find((item) => item.userId === userId)
  if (!vendor) return []
  return state.products.filter((product) => product.vendorId === vendor.id)
}

export function getBuyerOrdersDemo(userId: string): OrderDetail[] {
  const state = getDemoState()
  return state.orders
    .filter((order) => order.buyerId === userId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .map((order) => ({
      ...order,
      vendor: state.vendors.find((vendor) => vendor.id === order.vendorId),
      buyer: state.users.find((buyer) => buyer.id === order.buyerId)
    }))
}

export function getSellerOrdersDemo(userId: string): OrderDetail[] {
  const state = getDemoState()
  const vendorIds = state.vendors
    .filter((vendor) => vendor.userId === userId)
    .map((vendor) => vendor.id)

  return state.orders
    .filter((order) => vendorIds.includes(order.vendorId))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .map((order) => ({
      ...order,
      vendor: state.vendors.find((vendor) => vendor.id === order.vendorId),
      buyer: state.users.find((buyer) => buyer.id === order.buyerId)
    }))
}

export function getOrderByIdDemo(orderId: string): OrderDetail | null {
  const state = getDemoState()
  const order = state.orders.find((item) => item.id === orderId)
  if (!order) return null

  return {
    ...order,
    vendor: state.vendors.find((vendor) => vendor.id === order.vendorId),
    buyer: state.users.find((buyer) => buyer.id === order.buyerId)
  }
}

export function createOrderDemo(order: Omit<Order, "id" | "createdAt">): Order {
  return withState((state) => {
    const nextOrder: Order = {
      ...order,
      id: createId("order"),
      createdAt: new Date().toISOString()
    }
    state.orders.unshift(nextOrder)
    return nextOrder
  })
}

export function updateOrderStatusDemo(
  orderId: string,
  updates: OrderUpdatePayload
) {
  return withState((state) => {
    const order = state.orders.find((item) => item.id === orderId)
    if (!order) {
      throw new Error("Order not found")
    }

    if (updates.status) {
      order.status = updates.status
    }

    if (updates.paymentStatus) {
      order.paymentStatus = updates.paymentStatus
    }

    if (updates.deliveryAddress) {
      order.deliveryAddress = updates.deliveryAddress
    }

    if (updates.status === "delivered") {
      const vendor = state.vendors.find((item) => item.id === order.vendorId)
      if (vendor) {
        vendor.totalSales += order.totalAmount
      }
    }

    return order
  })
}

export function saveReviewDemo(review: Omit<Review, "id" | "createdAt">) {
  return withState((state) => {
    const nextReview: Review = {
      ...review,
      id: createId("review"),
      createdAt: new Date().toISOString()
    }
    state.reviews.unshift(nextReview)
    return nextReview
  })
}

export function getStoreAnalyticsDemo(userId: string): StoreAnalytics {
  const orders = getSellerOrdersDemo(userId)
  const reviews = getDemoState().reviews.filter((review) =>
    orders.some((order) => order.vendorId === review.vendorId)
  )

  return {
    totalOrders: orders.length,
    totalRevenue: orders
      .filter((order) => order.status !== "cancelled")
      .reduce((sum, order) => sum + order.totalAmount, 0),
    averageRating:
      reviews.length > 0
        ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
        : 0
  }
}
