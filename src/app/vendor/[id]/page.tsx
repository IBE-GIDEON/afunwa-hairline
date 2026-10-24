import type { Metadata } from "next"

import { VendorStoreClient } from "@/components/vendor-store-client"
import { formatCurrency } from "@/lib/format"
import { normalizeProductPhotoUrls } from "@/lib/product-images"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { firstParam } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Dynamic metadata — every vendor store gets its own OG card when shared, and
// a link carrying ?product=<id> previews that product instead of the store.
// This is what a buyer sees in the WhatsApp preview before they even tap.
// ---------------------------------------------------------------------------
export async function generateMetadata({
  params,
  searchParams
}: {
  params: { id: string }
  searchParams?: { product?: string | string[] }
}): Promise<Metadata> {
  const supabase = getSupabaseServerClient()

  if (!supabase) {
    return { title: "Store — Afunwa" }
  }

  const productId = firstParam(searchParams?.product)?.trim()

  const [{ data: vendor }, { data: product }] = await Promise.all([
    supabase
      .from("vendor_profiles")
      .select("store_name, bio, store_photo_url, city, category")
      .eq("id", params.id)
      .maybeSingle(),
    productId
      ? supabase
          .from("products")
          .select("name, description, price, photo_url, photo_urls, in_stock")
          .eq("id", productId)
          .eq("vendor_id", params.id)
          .maybeSingle()
      : Promise.resolve({ data: null })
  ])

  if (!vendor) {
    return { title: "Store — Afunwa" }
  }

  const storeUrl = `/vendor/${params.id}`

  // Shared product link — preview the product itself.
  if (product) {
    const photos = normalizeProductPhotoUrls(
      product.photo_urls as string[] | null,
      product.photo_url as string | null
    )
    const price = formatCurrency(Number(product.price))
    const title = `${product.name} — ${price} | ${vendor.store_name}`
    const description =
      product.description?.trim() ||
      `${product.name} for ${price} from ${vendor.store_name}${
        vendor.city ? ` in ${vendor.city}` : ""
      }. Order on Afunwa.`

    const image = photos[0] ?? vendor.store_photo_url ?? "/pwa/icon-512.png"

    return {
      title,
      description,
      openGraph: {
        type: "website",
        siteName: "Afunwa",
        url: `${storeUrl}?product=${productId}`,
        title,
        description,
        images: [{ url: image, width: 800, height: 800, alt: product.name }]
      },
      twitter: {
        card: photos[0] ? "summary_large_image" : "summary",
        title,
        description,
        images: [image]
      }
    }
  }

  const title = `${vendor.store_name} — Afunwa`
  const description =
    vendor.bio?.trim() ||
    `Shop ${vendor.store_name} on Afunwa${vendor.city ? ` · ${vendor.city}` : ""}.`

  const ogImage = vendor.store_photo_url
    ? [{ url: vendor.store_photo_url, width: 800, height: 800, alt: vendor.store_name }]
    : [{ url: "/pwa/icon-512.png", width: 512, height: 512, alt: "Afunwa" }]

  return {
    title,
    description,
    openGraph: {
      type: "website",
      siteName: "Afunwa",
      url: storeUrl,
      title,
      description,
      images: ogImage
    },
    twitter: {
      card: vendor.store_photo_url ? "summary_large_image" : "summary",
      title,
      description,
      images: vendor.store_photo_url
        ? [vendor.store_photo_url]
        : ["/pwa/icon-512.png"]
    }
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function VendorPage({
  params,
  searchParams
}: {
  params: { id: string }
  searchParams?: { product?: string | string[] }
}) {
  return (
    <VendorStoreClient
      vendorId={params.id}
      initialProductId={firstParam(searchParams?.product)}
    />
  )
}
