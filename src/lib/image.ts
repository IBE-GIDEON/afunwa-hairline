"use client"

import { canUseDemoMode, hasSupabase } from "@/lib/env"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

/**
 * Product photos are shown full screen, so they keep enough pixels to look
 * sharp there. Store and profile photos are only shown small.
 */
const PRODUCT_PHOTO = { maxSide: 1600, quality: 0.82 }
const GENERAL_PHOTO = { maxSide: 800, quality: 0.8 }

const UNSUPPORTED_PHOTO =
  "This photo could not be opened. Send a JPG or PNG. On an iPhone, set Settings > Camera > Formats to Most Compatible."

const SHOWABLE_TYPES = ["image/jpeg", "image/png", "image/webp"]
const MAX_ORIGINAL_BYTES = 10 * 1024 * 1024
/** A photo that has not opened by now is not going to. */
const DECODE_TIMEOUT_MS = 20_000

function sizeFor(folder: string) {
  return folder === "product-photos" ? PRODUCT_PHOTO : GENERAL_PHOTO
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    const timer = window.setTimeout(
      () => reject(new Error("Timed out opening the photo")),
      DECODE_TIMEOUT_MS
    )
    image.onload = () => {
      window.clearTimeout(timer)
      resolve(image)
    }
    image.onerror = () => {
      window.clearTimeout(timer)
      reject(new Error("The browser could not open the photo"))
    }
    image.src = url
  })
}

/**
 * Resizes a photo and saves it as a JPEG, with the browser's own image decoder.
 *
 * No library and no web worker: the compression library hung on iPhone Safari
 * before any upload started. Safari opens iPhone HEIC photos itself, so they
 * come out of here as JPEGs that every customer's browser can show. Modern
 * browsers apply the camera's rotation when drawing, so photos stay upright.
 */
async function resizeToJpeg(file: File, maxSide: number, quality: number) {
  const url = URL.createObjectURL(file)
  try {
    const image = await loadImage(url)
    const width = image.naturalWidth
    const height = image.naturalHeight
    if (!width || !height) throw new Error("The photo has no size")

    const scale = Math.min(1, maxSide / Math.max(width, height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))

    const context = canvas.getContext("2d")
    if (!context) throw new Error("This browser cannot resize photos")

    // JPEG has no transparency; a white ground keeps PNG cut-outs from going black.
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    )
    if (!blob) throw new Error("The photo could not be saved as JPEG")

    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo"
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function compressImage(file: File, folder = "") {
  const size = sizeFor(folder)
  try {
    return await resizeToJpeg(file, size.maxSide, size.quality)
  } catch (error) {
    console.error("Photo resize failed", { type: file.type, size: file.size, error })
    // A JPEG, PNG or WebP that could not be resized is still a usable photo,
    // so it goes up as it is. Anything else is refused: no customer's browser
    // could show it.
    if (SHOWABLE_TYPES.includes(file.type) && file.size <= MAX_ORIGINAL_BYTES) {
      return file
    }
    throw new Error(`${UNSUPPORTED_PHOTO} (file type: ${file.type || "unknown"})`)
  }
}

export async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function uploadImage(file: File, folder: string) {
  const compressed = await compressImage(file, folder)

  if (!hasSupabase) {
    if (!canUseDemoMode) {
      throw new Error("Image uploads need Supabase storage before launch.")
    }
    return fileToDataUrl(compressed)
  }

  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    if (!canUseDemoMode) {
      throw new Error("Image uploads need Supabase storage before launch.")
    }
    return fileToDataUrl(compressed)
  }

  const extension = compressed.name.split(".").pop() ?? "jpg"
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`

  const { error } = await supabase.storage
    .from("store-assets")
    .upload(path, compressed, {
      contentType: compressed.type || "image/jpeg",
      // Names are unique per upload, so a browser or CDN may keep them for a year.
      cacheControl: "31536000",
      // A plain insert. Names are unique, and upsert also needs update rights
      // on the bucket, which sellers do not have.
      upsert: false
    })

  if (error) {
    console.error("Photo upload failed", error)
    throw new Error(`Upload failed: ${error.message}`)
  }

  const { data } = supabase.storage.from("store-assets").getPublicUrl(path)
  return data.publicUrl
}

/**
 * Uploads one photo after another. Parallel uploads on a phone stall each
 * other, and one bad file used to throw away the good ones beside it.
 *
 * Returns the photos that worked, and the reason for each one that did not.
 */
export async function uploadImages(files: Iterable<File>, folder: string) {
  const urls: string[] = []
  const failed: Array<{ name: string; message: string }> = []

  for (const file of Array.from(files)) {
    try {
      urls.push(await uploadImage(file, folder))
    } catch (error) {
      failed.push({
        name: file.name,
        message: error instanceof Error ? error.message : "Upload failed."
      })
    }
  }

  return { urls, failed }
}
