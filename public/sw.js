const CACHE_VERSION = "ker-v2";
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const AUDIO_CACHE = `audio-${CACHE_VERSION}`;
const IMAGE_CACHE = `image-${CACHE_VERSION}`;

const STATIC_ASSETS = ["/", "/books", "/library", "/manifest.webmanifest", "/icon.svg"];

function isCacheableResponse(response) {
  return Boolean(response) && (response.ok || response.type === "opaque");
}

function isBookAudioPath(pathname) {
  return pathname.includes("/book-audio/") || pathname.includes("/storage/v1/object/sign/book-audio/");
}

function isBookImagePath(pathname) {
  return pathname.includes("/book-pages/") || pathname.includes("/storage/v1/object/sign/book-pages/");
}

function getCacheNameForUrl(url) {
  if (isBookAudioPath(url.pathname)) {
    return AUDIO_CACHE;
  }
  if (isBookImagePath(url.pathname)) {
    return IMAGE_CACHE;
  }
  return STATIC_CACHE;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  if (isCacheableResponse(response)) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function precacheUrls(urls) {
  const uniqueUrls = [...new Set(urls)].filter((url) => typeof url === "string" && url.length > 0);
  await Promise.all(
    uniqueUrls.map(async (urlString) => {
      try {
        const url = new URL(urlString, self.location.origin);
        const request = new Request(url.toString(), { mode: "no-cors" });
        const response = await fetch(request);
        if (!isCacheableResponse(response)) {
          return;
        }
        const cache = await caches.open(getCacheNameForUrl(url));
        await cache.put(request, response.clone());
      } catch {
        // Ignore pre-cache failures. Runtime fetch strategy remains active.
      }
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![STATIC_CACHE, AUDIO_CACHE, IMAGE_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "PRECACHE_URLS" || !Array.isArray(data.payload)) {
    return;
  }
  event.waitUntil(precacheUrls(data.payload));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);
  const isAudioRequest =
    event.request.destination === "audio" || isBookAudioPath(url.pathname);
  const isImageRequest =
    event.request.destination === "image" || isBookImagePath(url.pathname);
  const isAssessmentRequest = url.pathname.includes("/assessment");

  if (isAudioRequest) {
    event.respondWith(cacheFirst(event.request, AUDIO_CACHE));
    return;
  }

  if (isImageRequest) {
    event.respondWith(cacheFirst(event.request, IMAGE_CACHE));
    return;
  }

  if (isAssessmentRequest) {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cached = await caches.match(event.request);
        return (
          cached ||
          new Response(JSON.stringify({ message: "offline" }), {
            status: 503,
            headers: { "Content-Type": "application/json" }
          })
        );
      })
    );
  }
});
