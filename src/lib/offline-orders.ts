"use client"

import { openDB } from "idb"

import { OFFLINE_DB_NAME, OFFLINE_ORDER_STORE } from "@/lib/constants"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { type CheckoutPayload } from "@/lib/types"

/** Maximum number of offline order intents to keep queued. */
const MAX_QUEUE_SIZE = 50

async function getDb() {
  return openDB(OFFLINE_DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(OFFLINE_ORDER_STORE)) {
        db.createObjectStore(OFFLINE_ORDER_STORE, {
          keyPath: "id",
          autoIncrement: true
        })
      }
    }
  })
}

export async function queueOfflineOrder(payload: CheckoutPayload) {
  const db = await getDb()

  // Guard against unbounded queue growth (e.g. repeated offline attempts).
  const existing = await db.count(OFFLINE_ORDER_STORE)
  if (existing >= MAX_QUEUE_SIZE) {
    throw new Error(
      "You have too many pending orders queued offline. Connect to the internet to sync them first."
    )
  }

  await db.add(OFFLINE_ORDER_STORE, {
    payload,
    createdAt: new Date().toISOString()
  })

  if (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "SyncManager" in window
  ) {
    const registration = await navigator.serviceWorker.ready
    const syncRegistration = registration as ServiceWorkerRegistration & {
      sync?: {
        register: (tag: string) => Promise<void>
      }
    }

    await syncRegistration.sync?.register("glowgram-order-sync")
  }
}

/** The flush running in this tab, if any. */
let flushInProgress: Promise<void> | null = null

/**
 * Sends queued offline orders, one flush at a time.
 *
 * Reconnecting fires both the browser's "online" event and the service
 * worker's sync message, often in several tabs at once. Each used to read the
 * same queue and post every entry, so one offline order arrived two or three
 * times. A Web Lock covers every tab; where the browser has none, a promise
 * covers this tab. A flush that finds one already running steps aside, since
 * that one sends everything.
 */
export async function flushOfflineOrders(): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    await navigator.locks.request(
      "afunwa-offline-order-flush",
      { ifAvailable: true },
      async (lock) => {
        if (lock) await flushQueueOnce()
      }
    )
    return
  }

  if (flushInProgress) return flushInProgress
  flushInProgress = flushQueueOnce().finally(() => {
    flushInProgress = null
  })
  return flushInProgress
}

async function flushQueueOnce() {
  // /api/orders/sync requires a bearer token. Without one every queued order
  // answered 401 and stayed in the queue forever, so an order placed offline
  // never reached the seller and the buyer was never told.
  const supabase = getSupabaseBrowserClient()
  const token = supabase
    ? (await supabase.auth.getSession()).data.session?.access_token
    : undefined

  if (!token) {
    // Signed out, or the session has not rehydrated yet. Leave the queue
    // alone and try again on the next flush rather than dropping orders.
    return
  }

  const db = await getDb()
  const allEntries = await db.getAll(OFFLINE_ORDER_STORE)

  for (const entry of allEntries) {
    const response = await fetch("/api/orders/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(entry.payload)
    })

    // 400 is priceCart refusing the cart outright — stock gone, product
    // deleted. That will never succeed, so drop it rather than retry forever
    // and fill the queue. A 401 or a 5xx may well recover, so those stay.
    // Any 4xx except 401 is a refusal that will never succeed (sold out, no
    // longer available, a method no longer offered), so drop it. A 401 (the
    // session) and any 5xx (a hiccup) may recover, so those stay queued.
    const permanentRefusal =
      response.status >= 400 && response.status < 500 && response.status !== 401
    if (response.ok || permanentRefusal) {
      await db.delete(OFFLINE_ORDER_STORE, entry.id)
    }
  }
}
