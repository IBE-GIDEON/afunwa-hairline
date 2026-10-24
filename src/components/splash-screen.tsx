"use client"

import { safeSessionStorage } from "@/lib/safe-storage"
import { useEffect, useState } from "react"

const SESSION_KEY = "glowgram-splash"

/**
 * Splash screen shown only on a genuine cold start (fresh page load).
 *
 * Why a client component?
 * The root layout in Next.js App Router is a *persistent shell* — it does
 * NOT re-render on client-side navigation. Once this component's state
 * becomes `visible = false` it stays false for the entire session, so the
 * splash can never bleed into product clicks, tab changes, or any other
 * in-app navigation.
 *
 * The `sessionStorage` guard is an extra safety net: if the layout ever
 * does re-mount (e.g. hard-refresh mid-session), it ensures the splash
 * only shows once per browser session.
 */
export function SplashScreen() {
  // Default true so the SSR HTML includes the visible splash immediately —
  // no flash on cold start before JS runs.
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    // Already shown this browser session — hide instantly (no flash because
    // the layout shell doesn't re-render on client-side navigation).
    if (safeSessionStorage.getItem(SESSION_KEY)) {
      setVisible(false)
      return
    }
    safeSessionStorage.setItem(SESSION_KEY, "1")

    // First real load — fade out after the page finishes loading.
    function hide() {
      setVisible(false)
    }

    // Never longer than this, however slow the page. Waiting for the load
    // event alone kept the splash up while one slow image trickled in over
    // mobile data, and the shopper saw only the logo.
    const hardStop = setTimeout(hide, 1500)

    if (document.readyState === "complete") {
      const t = setTimeout(hide, 300)
      return () => {
        clearTimeout(t)
        clearTimeout(hardStop)
      }
    }

    let afterLoad: ReturnType<typeof setTimeout> | undefined
    function onLoad() {
      afterLoad = setTimeout(hide, 300)
    }
    window.addEventListener("load", onLoad, { once: true })

    return () => {
      window.removeEventListener("load", onLoad)
      if (afterLoad) clearTimeout(afterLoad)
      clearTimeout(hardStop)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        // If the page's JavaScript never runs (a failed download, an old
        // browser), nothing above can hide this. CSS can: it fades itself out.
        animation: "afunwa-splash-out 0.4s ease 2.5s forwards"
      }}
      // Tailwind dark-mode classes — html[class=dark] is set by themeScript
      // before this element paints, so the correct colour shows on first frame.
      className="bg-[#EAEFEB] dark:bg-[#08131A]"
    >
      {/* Icon */}
      <div
        style={{
          width: 112,
          height: 112,
          borderRadius: 28,
          background: "#FFFFFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 22,
          boxShadow: "0 14px 36px rgba(0,0,0,0.14)"
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/pwa/icon-192.png"
          alt=""
          width={96}
          height={96}
          style={{ borderRadius: 22, display: "block" }}
        />
      </div>

      {/* App name */}
      <p
        className="text-[#111B21] dark:text-[#E8EDF0]"
        style={{
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: "0.1em",
          margin: 0,
          lineHeight: 1
        }}
      >
        Afunwa
      </p>

      {/* Tagline */}
      <p
        style={{
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          fontSize: 13,
          color: "#8696A0",
          margin: "10px 0 0",
          letterSpacing: "0.02em"
        }}
      >
        Hairline Global
      </p>
    </div>
  )
}
