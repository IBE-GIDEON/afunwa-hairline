"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { FiChevronLeft, FiChevronRight, FiX } from "react-icons/fi"

/**
 * Keeps only real photo URLs, so a missing photo never opens an empty viewer.
 */
export function viewableImages(urls: Array<string | null | undefined>) {
  return urls.filter((url): url is string => Boolean(url))
}

/**
 * Full-screen photo viewer.
 *
 * Shows the whole photo at its own proportions, never cropped, so a buyer sees
 * the product as the seller uploaded it. The square thumbnails elsewhere crop on
 * purpose to keep the grid even; this is the one place the full frame is shown.
 *
 * Mounted only while open, so it always starts on the photo that was tapped.
 * Rendered through a portal so no parent transform or overflow can clip it.
 */
export function ImageViewer({
  images,
  startIndex = 0,
  alt,
  onClose
}: {
  images: string[]
  startIndex?: number
  alt: string
  onClose: () => void
}) {
  const count = images.length
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(startIndex, 0), Math.max(count - 1, 0))
  )

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    // Capture phase, and stopped there, so Escape and the arrow keys act on
    // the viewer alone and never also close the sheet it was opened from.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        onClose()
      } else if (count > 1 && event.key === "ArrowRight") {
        event.stopPropagation()
        setIndex((current) => (current + 1) % count)
      } else if (count > 1 && event.key === "ArrowLeft") {
        event.stopPropagation()
        setIndex((current) => (current - 1 + count) % count)
      }
    }

    window.addEventListener("keydown", onKey, true)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKey, true)
    }
  }, [count, onClose])

  const current = images[index]
  if (!current || typeof document === "undefined") return null

  const step = (delta: number) =>
    setIndex((value) => (value + delta + count) % count)

  // Stops the tap reaching whatever the viewer was opened from, including a
  // sheet's own backdrop, since a portal still bubbles through the React tree.
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation()

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} photos`}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95"
      onClick={(event) => {
        stop(event)
        onClose()
      }}
    >
      <button
        type="button"
        aria-label="Close photo"
        onClick={(event) => {
          stop(event)
          onClose()
        }}
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
      >
        <FiX size={20} aria-hidden="true" />
      </button>

      {count > 1 ? (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={(event) => {
              stop(event)
              step(-1)
            }}
            className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
          >
            <FiChevronLeft size={22} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={(event) => {
              stop(event)
              step(1)
            }}
            className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
          >
            <FiChevronRight size={22} aria-hidden="true" />
          </button>
        </>
      ) : null}

      {/* The full frame, scaled to fit the screen with nothing cropped away.
          100dvh keeps it inside the visible area on phones with browser bars. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={current}
        alt={alt}
        onClick={stop}
        className="max-h-[100dvh] max-w-[100vw] object-contain p-3 sm:p-8"
      />

      {count > 1 ? (
        <span className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">
          {index + 1} / {count}
        </span>
      ) : null}
    </div>,
    document.body
  )
}
