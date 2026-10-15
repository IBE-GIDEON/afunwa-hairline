"use client"

import imageCompression from "browser-image-compression"

import { canUseDemoMode, hasSupabase } from "@/lib/env"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

/**
 * Product photos are shown full screen, so they keep enough pixels to look
 * sharp there. Store and profile photos are only shown small.
 */
const PRODUCT_PHOTO = { maxWidthOrHeight: 1600, maxSizeMB: 0.6 }
const GENERAL_PHOTO = { maxWidthOrHeight: 800, maxSizeMB: 0.4 }

const UNSUPPORTED_PHOTO =
  "That photo could not be read. Use a JPG or PNG. On an iPhone, set Camera > Formats to Most Compatible."

function sizeFor(folder: string) {
  return folder === "product-photos" ? PRODUCT_PHOTO : GENERAL_PHOTO
}

export async function compressImage(file: File, folder = "") {
  const size = sizeFor(folder)
  try {
    return await imageCompression(file, {
      maxWidthOrHeight: size.maxWidthOrHeight,
      maxSizeMB: size.maxSizeMB,
      initialQuality: 0.85,
      useWebWorker: true
    })
  } catch {
    // Browsers cannot decode HEIC and some other formats. Saying so beats
    // uploading a file that no customer's browser can show.
    throw new Error(UNSUPPORTED_PHOTO)
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
    return fileToDataUrl(compressed as File)
  }

  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    if (!canUseDemoMode) {
      throw new Error("Image uploads need Supabase storage before launch.")
    }
    return fileToDataUrl(compressed as File)
  }

  const extension = compressed.name.split(".").pop() ?? "jpg"
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`

  const { error } = await supabase.storage
    .from("store-assets")
    .upload(path, compressed, {
      // Names are unique per upload, so a browser or CDN may keep them for a year.
      cacheControl: "31536000",
      upsert: true
    })

  if (error) {
    throw new Error(error.message)
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
