export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  flutterwavePublicKey: process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY ?? "",
  flutterwaveSecretKey: process.env.FLUTTERWAVE_SECRET_KEY ?? "",
  // Set the same value in the Flutterwave dashboard under Webhooks.
  flutterwaveSecretHash: process.env.FLUTTERWAVE_SECRET_HASH ?? "",
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

  // Carrier rate APIs. Server-side only, every one of them — a courier key in
  // the browser bundle is anyone's to spend.
  dhlApiKey: process.env.DHL_API_KEY ?? "",
  dhlApiSecret: process.env.DHL_API_SECRET ?? "",
  dhlAccountNumber: process.env.DHL_ACCOUNT_NUMBER ?? "",
  /** DHL ships a sandbox; point at it while testing credentials. */
  dhlUseTestEnvironment: process.env.DHL_TEST_MODE === "true",
  topshipApiKey: process.env.TOPSHIP_API_KEY ?? "",
  gigApiKey: process.env.GIG_API_KEY ?? "",

  // PayPal. Server-side only; the client id is not secret but there is no
  // reason to ship it when every call is made from here anyway.
  paypalClientId: process.env.PAYPAL_CLIENT_ID ?? "",
  paypalClientSecret: process.env.PAYPAL_CLIENT_SECRET ?? "",
  /** "live" or "sandbox". Anything but sandbox means live. */
  paypalEnvironment: process.env.PAYPAL_ENVIRONMENT ?? "live",
  /** From the webhook you create in the PayPal dashboard. */
  paypalWebhookId: process.env.PAYPAL_WEBHOOK_ID ?? ""
}

export const hasSupabase =
  Boolean(env.supabaseUrl) && Boolean(env.supabaseAnonKey)

export const hasSupabaseAdmin =
  hasSupabase && Boolean(env.supabaseServiceRoleKey)

export const hasFlutterwave =
  Boolean(env.flutterwavePublicKey) && Boolean(env.flutterwaveSecretKey)

export const hasPayPal =
  Boolean(env.paypalClientId) && Boolean(env.paypalClientSecret)

export const hasWebPush =
  Boolean(env.vapidPublicKey) && Boolean(env.vapidPrivateKey)

export const isProductionRuntime = process.env.NODE_ENV === "production"

export const canUseDemoMode =
  env.enableDemoMode || (!isProductionRuntime && !hasSupabase)
