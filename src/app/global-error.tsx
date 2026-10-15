"use client"

import { useEffect } from "react"

/**
 * Last line of defence: an error in the root layout or a provider.
 *
 * app/error.tsx cannot catch those, because it renders inside the layout that
 * just failed, so without this file the customer gets a blank white page. This
 * replaces the whole document, which means the site's providers and styles are
 * not available here — hence plain markup with inline styles.
 */
export default function RootError({
  error,
  reset
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Root layout error", error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          background: "rgb(245 247 246)",
          color: "rgb(17 27 33)",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        }}
      >
        <div style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "rgb(102 119 129)", margin: "0 0 20px" }}>
            The page could not load. Try again, or go back to the shop.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                border: 0,
                borderRadius: 999,
                padding: "12px 20px",
                background: "rgb(17 27 33)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                borderRadius: 999,
                padding: "12px 20px",
                border: "1px solid rgb(223 229 224)",
                color: "rgb(17 27 33)",
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none"
              }}
            >
              Go to the shop
            </a>
          </div>
        </div>
      </body>
    </html>
  )
}
