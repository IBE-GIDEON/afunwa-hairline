/**
 * Company details shown in the footer.
 *
 * Kept in one place because these are marketing claims about a real business:
 * when a number changes, it changes here and nowhere else.
 */

export const COMPANY_NAME = "Afunwa Hairline Inc"

/** Shop address, shown in the footer and used for the map link. */
export const COMPANY_ADDRESS =
  "No. 10 Alagbade Street, off Breadfruit, Balogun Market, Lagos Island"

/**
 * The trust strip.
 *
 * These are stated as fact to every visitor, so they need to be defensible —
 * Nigeria's FCCPA (and the equivalent elsewhere) treats a false or misleading
 * representation about a business as an offence, not a matter of taste.
 */
export const COMPANY_STATS: Array<{ value: string; label: string }> = [
  { value: "8,000+", label: "units supplied" },
  { value: "No.1", label: "hair factory supplier" }
]

/**
 * Social profiles.
 *
 * >>> REPLACE THESE HANDLES WITH YOUR REAL ONES. <<<
 * Any entry left blank is not rendered at all, so an unfinished link never
 * ships as a dead icon that lands a customer on "page not found".
 */
export const SOCIAL_LINKS: Array<{
  id: "facebook" | "instagram" | "tiktok"
  label: string
  href: string
}> = [
  // All three verified to resolve. Share and referral parameters are stripped
  // throughout — igsh, is_from_website, rdid and the rest identify whoever
  // copied the link, not the profile, and they do not belong on a live page.
  {
    id: "facebook",
    label: "Facebook",
    // The canonical page the /share/1Fu8zsxY2G/ link redirects to, used
    // directly to skip the redirect hop.
    href: "https://www.facebook.com/people/Afunwa-hairline/61565212166174/"
  },
  {
    id: "instagram",
    label: "Instagram",
    href: "https://www.instagram.com/afunwa_hairline"
  },
  { id: "tiktok", label: "TikTok", href: "https://www.tiktok.com/@afunwa_hairline" }
]

/** Only routes that exist — a footer full of 404s costs more trust than it buys. */
export const FOOTER_LINKS: Array<{ label: string; href: string }> = [
  { label: "Shop all", href: "/search" },
  { label: "Wigs", href: "/search?q=wig" },
  { label: "Closures", href: "/search?q=closure" },
  { label: "Bundles", href: "/search?q=bundle" },
  { label: "My orders", href: "/orders" },
  { label: "Account", href: "/profile" }
]

/** Policy pages, shown as a quieter row under the main footer links. */
export const LEGAL_LINKS: Array<{ label: string; href: string }> = [
  { label: "Terms and Conditions", href: "/terms" },
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Delivery Policy", href: "/delivery-policy" },
  { label: "Refund and Return Policy", href: "/refund-policy" }
]
