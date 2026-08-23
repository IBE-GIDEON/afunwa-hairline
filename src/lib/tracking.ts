/**
 * Turning a tracking number into something a buyer can click.
 *
 * Only carriers whose public tracking URL is actually known are linked. A
 * guessed link that 404s is worse than no link — the buyer assumes the parcel
 * is lost rather than that we got the address wrong — so anything unrecognised
 * shows the number to copy instead.
 */
const TRACKING_URLS: Array<{ match: RegExp; build: (code: string) => string }> = [
  {
    match: /dhl/i,
    build: (code) =>
      `https://www.dhl.com/ng-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(code)}`
  },
  {
    match: /fedex/i,
    build: (code) =>
      `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(code)}`
  },
  {
    match: /ups/i,
    build: (code) =>
      `https://www.ups.com/track?tracknum=${encodeURIComponent(code)}`
  },
  {
    match: /aramex/i,
    build: (code) =>
      `https://www.aramex.com/us/en/track/results?ShipmentNumber=${encodeURIComponent(code)}`
  }
]

/**
 * The link to follow this parcel, or null when there is not a known one.
 *
 * An explicit URL from the seller always wins — they know what the courier
 * actually gave them better than any pattern here does.
 */
export function buildTrackingUrl({
  trackingNumber,
  trackingCarrier,
  trackingUrl
}: {
  trackingNumber?: string
  trackingCarrier?: string
  trackingUrl?: string
}): string | null {
  const explicit = trackingUrl?.trim()
  if (explicit && /^https?:\/\//i.test(explicit)) return explicit

  const code = trackingNumber?.trim()
  const carrier = trackingCarrier?.trim()
  if (!code || !carrier) return null

  const known = TRACKING_URLS.find((entry) => entry.match.test(carrier))
  return known ? known.build(code) : null
}

/** "DHL · 1234567890", or just the number when the carrier is not named. */
export function formatTrackingLabel({
  trackingNumber,
  trackingCarrier
}: {
  trackingNumber?: string
  trackingCarrier?: string
}) {
  const code = trackingNumber?.trim() ?? ""
  const carrier = trackingCarrier?.trim()
  return carrier ? `${carrier} · ${code}` : code
}
