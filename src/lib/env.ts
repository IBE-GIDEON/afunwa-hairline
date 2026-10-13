export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  // Public key only decides whether the option is offered. The browser cannot
  // see server-only variables, so this is the one the checkout page can read.
  paystackPublicKey: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? "",
  // Server-side only. Also used to verify webhook signatures.
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY ?? "",
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  enableDemoMode: process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE === "true",
  enableVendorDiscovery:
    process.env.NEXT_PUBLIC_ENABLE_VENDOR_DISCOVERY === "true",
  enableSellerSignup: process.env.NEXT_PUBLIC_ENABLE_SELLER_SIGNUP === "true",
  sellerEmails: process.env.NEXT_PUBLIC_SELLER_EMAILS ?? "",
  // Optional: overrides the store's own number for the floating chat button.
  supportWhatsapp: process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "",
  enablePayOnDelivery: process.env.NEXT_PUBLIC_ENABLE_PAY_ON_DELIVERY === "true",

}

export const hasSupabase =
  Boolean(env.supabaseUrl) && Boolean(env.supabaseAnonKey)

export const hasSupabaseAdmin =
  hasSupabase && Boolean(env.supabaseServiceRoleKey)

/** Server-side: the secret is required to actually take a payment. */
export const hasPaystack = Boolean(env.paystackSecretKey)

/**
 * Client-readable: whether the card option is offered at checkout. Only the
 * public key can be checked here, so set PAYSTACK_SECRET_KEY in production too,
 * or the option shows and every checkout fails.
 */
export const hasPaystackCheckout = Boolean(env.paystackPublicKey)

export const hasWebPush =
  Boolean(env.vapidPublicKey) && Boolean(env.vapidPrivateKey)

export const isProductionRuntime = process.env.NODE_ENV === "production"

export const canUseDemoMode =
  env.enableDemoMode || (!isProductionRuntime && !hasSupabase)
