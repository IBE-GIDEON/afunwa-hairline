import Link from "next/link"

/**
 * Any address that does not exist: a mistyped link, an old product link, a
 * deleted page. Shown inside the normal site shell, with a way back in.
 */
export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-16 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
        Page not found
      </p>
      <h1 className="mt-3 text-2xl font-bold text-ink">
        We could not find that page
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        The link may be old, or the item may no longer be listed. Everything we
        have in stock is in the shop.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <Link
          href="/search"
          className="inline-flex items-center justify-center rounded-full bg-chrome px-5 py-3 text-sm font-semibold text-white"
        >
          Browse the shop
        </Link>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-full border border-border bg-surface px-5 py-3 text-sm font-semibold text-ink"
        >
          Go home
        </Link>
      </div>
    </div>
  )
}
