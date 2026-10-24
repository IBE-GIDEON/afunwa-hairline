const STATIC_CACHE = "glowgram-static-v7"
const VENDOR_CACHE = "glowgram-vendors-v1"
const IMAGE_CACHE = "glowgram-images-v2"
const ORDER_DB = "glowgram-offline"
const ORDER_STORE = "order-intents"

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll([
        "/",
        "/orders",
        "/profile",
        "/search",
        "/onboarding/seller",
        "/seller/products",
        "/apple-touch-icon.png",
        "/icon-192.png",
        "/icon-512.png",
        "/pwa/icon-192.png",
        "/pwa/icon-512.png",
        "/favicon.ico",
        "/manifest.webmanifest"
      ])
    )
  )
  self.skipWaiting()
})

const CURRENT_CACHES = [STATIC_CACHE, VENDOR_CACHE, IMAGE_CACHE]

self.addEventListener("activate", (event) => {
  // Drop every cache this worker no longer owns.
  //
  // This used to filter on the "glowgram-static-" prefix alone, so bumping the
  // image cache left the old one behind — and images are served cache first,
  // which meant a replaced photo kept serving the previous version forever to
  // anyone who had already visited. Matching on the whole prefix means a
  // version bump on any cache actually clears it.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("glowgram-") && !CURRENT_CACHES.includes(k))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting()
  }
})

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)

  if (event.request.method !== "GET") {
    return
  }

  if (url.pathname.startsWith("/vendor/")) {
    event.respondWith(networkFirst(event.request))
    return
  }

  if (
    event.request.destination === "image" ||
    url.pathname.includes("/storage/") ||
    url.pathname.includes("/_next/image")
  ) {
    event.respondWith(cacheFirst(event.request, IMAGE_CACHE, 30))
    return
  }

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request))
  }
})

self.addEventListener("sync", (event) => {
  if (event.tag === "glowgram-order-sync") {
    event.waitUntil(flushOrders())
  }
})

self.addEventListener("push", (event) => {
  const payload = readPushPayload(event)
  const title = payload.title || "Afunwa"
  const options = {
    body: payload.body || "You have a new update on Afunwa.",
    icon: "/pwa/icon-192.png",
    badge: "/pwa/icon-192.png",
    data: {
      url: payload.url || "/orders"
    }
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  const targetUrl = event.notification.data?.url || "/orders"
  const absoluteTargetUrl = new URL(targetUrl, self.location.origin).href

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client && sameOriginWindow(client.url)) {
          if (client.url !== absoluteTargetUrl && "navigate" in client) {
            return client.navigate(absoluteTargetUrl).then(() => client.focus())
          }

          return client.focus()
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(absoluteTargetUrl)
      }

      return undefined
    })
  )
})

async function cacheFirst(request, cacheName, limit) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) {
    return cached
  }

  try {
    const response = await fetch(request)
    // Only keep a good answer. Caching a 404 or a 500 here pinned the failure
    // permanently, because the next request is served cache-first and never
    // reaches the network again.
    if (response.ok) {
      await cache.put(request, response.clone())
      await trimCache(cacheName, limit)
    }
    return response
  } catch (error) {
    return cached || Response.error()
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request)
    // Keep the offline copy of a saved page current. It was stored once, at
    // install, and never refreshed, so offline visitors got months-old HTML
    // pointing at script files that no longer exist. Only pages already in
    // the cache are refreshed, so the cache does not grow.
    if (response.ok && request.mode === "navigate") {
      const cache = await caches.open(STATIC_CACHE)
      if (await cache.match(request)) {
        // Not awaited: the visitor gets the page without waiting on the write.
        cache.put(request, response.clone()).catch(() => undefined)
      }
    }
    return response
  } catch (error) {
    const cached = await caches.match(request)
    return cached || Response.error()
  }
}

async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  const excess = keys.length - maxItems
  if (excess <= 0) return
  // Delete oldest entries in one pass — avoids recursive call-stack growth
  await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)))
}

function openOrdersDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ORDER_DB, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(ORDER_STORE)) {
        db.createObjectStore(ORDER_STORE, { keyPath: "id", autoIncrement: true })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function getQueuedOrders() {
  const db = await openOrdersDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ORDER_STORE, "readonly")
    const store = transaction.objectStore(ORDER_STORE)
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function deleteQueuedOrder(id) {
  const db = await openOrdersDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ORDER_STORE, "readwrite")
    const store = transaction.objectStore(ORDER_STORE)
    const request = store.delete(id)
    request.onsuccess = () => resolve(true)
    request.onerror = () => reject(request.error)
  })
}

async function flushOrders() {
  // /api/orders/sync needs the buyer's bearer token, and the session lives in
  // localStorage — which a service worker cannot read. Posting from here was
  // always answered 401, so the queue never drained.
  //
  // Hand the job to an open page instead, which does have the session. With no
  // page open there is nothing to do: the app flushes on load and on "online".
  const windows = await clients.matchAll({ type: "window", includeUncontrolled: true })
  for (const client of windows) {
    client.postMessage({ type: "FLUSH_OFFLINE_ORDERS" })
  }
}

function readPushPayload(event) {
  if (!event.data) {
    return {}
  }

  try {
    return event.data.json()
  } catch (error) {
    return {
      body: event.data.text()
    }
  }
}

function sameOriginWindow(url) {
  try {
    return new URL(url).origin === self.location.origin
  } catch (error) {
    return false
  }
}
