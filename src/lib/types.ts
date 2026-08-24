import { type ProductCategory } from "@/lib/product-categories"

export type AccountType = "buyer" | "seller" | "both"

/**
 * Must stay in step with the `public.vendor_category` enum in
 * supabase/schema.sql. Postgres rejects any value outside the enum, and the
 * failure lands as a raw database error at the end of seller onboarding — so a
 * value listed here but missing from the enum is a broken store, not a typo.
 * Adding a category means an `alter type ... add value` first, then this list.
 */
export type VendorCategory =
  | "wigs"
  | "cosmetics"
  | "fashion"
  | "jewellery"
  | "watches"
  | "other"

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "dispatched"
  | "delivered"
  | "cancelled"

export type OrderArchiveActor = "buyer" | "seller"
export type PaymentMethod =
  | "pay_on_delivery"
  | "vendor_transfer"
  | "flutterwave"
  | "paypal"
export type PaymentStatus =
  | "awaiting_seller_confirmation"
  | "pay_on_delivery"
  | "awaiting_vendor_payment"
  | "paid_to_vendor"
  /** Card paid and confirmed by the payment webhook. */
  | "paid_by_card"
  /** Card checkout started, webhook not in yet. */
  | "awaiting_card_payment"

export interface UserProfile {
  id: string
  email: string
  phone: string
  fullName: string
  profilePhotoUrl?: string
  accountType: AccountType
  createdAt: string
}

export interface VendorProfile {
  id: string
  userId: string
  storeName: string
  storePhotoUrl?: string
  bio?: string
  category: VendorCategory
  city: string
  whatsappNumber: string
  bankName?: string
  accountName?: string
  accountNumber?: string
  paymentNote?: string
  /** Flat delivery charge in naira. See lib/delivery. */
  deliveryFee?: number
  /** Items over this and delivery is free. */
  freeDeliveryOver?: number
  /** The seller's promise, e.g. "2 to 4 working days, nationwide". */
  deliveryNote?: string
  /** Per-courier prices, keyed by shipping method id. See lib/shipping. */
  shippingRates?: Record<string, number>
  /** Where couriers collect from, and quote against. */
  originAddress?: string
  originCity?: string
  originState?: string
  /** Used for any product with no weight of its own. */
  defaultItemWeightKg?: number
  isActive: boolean
  totalSales: number
  rating: number
  createdAt: string
}

export interface Product {
  id: string
  vendorId: string
  name: string
  /** Which shelf it sits on. See lib/product-categories. */
  category: ProductCategory
  description: string
  price: number
  /** Struck-through "was" price. Display only — never used to charge. */
  compareAtPrice?: number
  /** Kilograms. What a carrier needs before it can price a parcel. */
  weightKg?: number
  photoUrl?: string
  photoUrls: string[]
  inStock: boolean
  createdAt: string
}

export interface OrderItem {
  productId: string
  name: string
  price: number
  quantity: number
}

export interface Order {
  id: string
  buyerId: string
  vendorId: string
  items: OrderItem[]
  totalAmount: number
  status: OrderStatus
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  paymentReference?: string
  buyerPaymentNote?: string
  /** Courier tracking, filled in by the seller when they dispatch. */
  trackingNumber?: string
  trackingCarrier?: string
  trackingUrl?: string
  deliveryAddress: string
  createdAt: string
}

export interface OrderUpdatePayload {
  status?: OrderStatus
  paymentStatus?: PaymentStatus
  deliveryAddress?: string
  trackingNumber?: string
  trackingCarrier?: string
  trackingUrl?: string
}

export interface Review {
  id: string
  orderId: string
  buyerId: string
  vendorId: string
  rating: number
  comment: string
  createdAt: string
}

export interface PushSubscriptionRecord {
  id: string
  userId: string
  endpoint: string
  p256dh: string
  auth: string
  createdAt: string
}

export interface VendorSnapshot extends VendorProfile {
  reviewCount: number
  productCount: number
  lastOrderAt?: string
}

export interface ProductSearchResult extends Product {
  vendor: VendorSnapshot
}

export interface MarketplaceSearchResults {
  products: ProductSearchResult[]
  vendors: VendorSnapshot[]
}

export interface VendorDetail {
  vendor: VendorProfile
  owner?: UserProfile
  products: Product[]
  reviews: ReviewWithBuyer[]
  reviewCount: number
  averageRating: number
}

export interface ReviewWithBuyer extends Review {
  buyerName: string
}

export interface OrderDetail extends Order {
  vendor?: VendorProfile
  buyer?: UserProfile
}

export interface StoreAnalytics {
  totalOrders: number
  totalRevenue: number
  averageRating: number
}

export interface DemoState {
  users: UserProfile[]
  vendors: VendorProfile[]
  products: Product[]
  orders: Order[]
  reviews: Review[]
}

export interface SignUpFormValues {
  email: string
  password: string
  /** Optional at signup — defaults to the email handle, editable in Profile. */
  fullName?: string
  /** Collected later (checkout / seller onboarding), never blocks account creation. */
  phone?: string
  /** Everyone starts as a buyer; sellers upgrade from Profile. */
  accountType?: AccountType
}

export interface SignInFormValues {
  email: string
  password: string
}

export interface SellerProfileInput {
  storeName: string
  category: VendorCategory
  storePhotoUrl?: string
  bio: string
  city: string
  whatsappNumber: string
  bankName?: string
  accountName?: string
  accountNumber?: string
  paymentNote?: string
  deliveryFee?: number
  freeDeliveryOver?: number
  deliveryNote?: string
  shippingRates?: Record<string, number>
  originAddress?: string
  originCity?: string
  originState?: string
  defaultItemWeightKg?: number
}

export interface ProductInput {
  id?: string
  vendorId: string
  weightKg?: number
  name: string
  category: ProductCategory
  description: string
  price: number
  compareAtPrice?: number
  photoUrl?: string
  photoUrls: string[]
  inStock: boolean
}

export interface CheckoutPayload {
  /** Which shipping method the buyer picked. Priced on the server. */
  shippingMethod?: string
  /**
   * Where it is going, in parts, so the carrier can be re-asked at order time.
   * deliveryAddress stays the human-readable line the seller reads.
   */
  shippingDestination?: {
    countryCode?: string
    city?: string
    region?: string
    postalCode?: string
    addressLine?: string
  }
  buyerId: string
  vendorId: string
  items: OrderItem[]
  totalAmount: number
  deliveryAddress: string
  paymentMethod: PaymentMethod
  buyerPaymentNote?: string
}

export interface PlaceOrderResponse {
  orderId: string
}

export interface AuthSessionState {
  sessionUserId: string | null
  profile: UserProfile | null
  vendorProfile: VendorProfile | null
  loading: boolean
  isDemoMode: boolean
}
