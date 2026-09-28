const APP_CACHE = "watchtech-app-v9";
const DOCUMENT_CACHE = "watchtech-files-v1";

const APP_SHELL = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "manifest.webmanifest",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "docs/watchtech-library.json",
];

let refreshPromise = null;

function appUrl(path) {
  return new URL(path, self.registration.scope).href;
}

function isAppShellUrl(url) {
  return APP_SHELL.some((path) => appUrl(path) === url.href);
}

function isDocumentUrl(url) {
  const docsPath = new URL("docs/", self.registration.scope).pathname;
  const libraryPath =
    new URL("docs/watchtech-library.json", self.registration.scope).pathname;

  return (
    url.pathname.startsWith(docsPath) &&
    url.pathname !== libraryPath
  );
}

/*
 * Download the current frontend files from the server.
 *
 * This runs when the app is opened/navigated to.
 * If a file has changed, the new copy replaces the cached copy.
 *
 * The document cache is completely separate and is NOT touched.
 */
async function refreshAppShell() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const cache = await caches.open(APP_CACHE);

    for (const path of APP_SHELL) {
      const url = appUrl(path);

      try {
        const response = await fetch(
          new Request(url, {
            method: "GET",
            cache: "no-store",
            credentials: "same-origin",
          })
        );

        if (response.ok) {
          await cache.put(url, response.clone());
        }
      } catch (error) {
        /*
         * Offline or temporary network failure.
         * Keep the existing cached version.
         */
        console.warn("Frontend update check failed:", path, error);
      }
    }
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}


/*
 * INSTALL
 *
 * A new service worker downloads the complete frontend shell.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_CACHE);

      for (const path of APP_SHELL) {
        try {
          const url = appUrl(path);

          const response = await fetch(
            new Request(url, {
              method: "GET",
              cache: "no-store",
              credentials: "same-origin",
            })
          );

          if (response.ok) {
            await cache.put(url, response.clone());
          }
        } catch (error) {
          console.warn("Initial frontend cache failed:", path, error);
        }
      }

      await self.skipWaiting();
    })()
  );
});


/*
 * ACTIVATE
 *
 * Remove only old APP caches.
 * NEVER remove the document cache.
 */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith("watchtech-app-") &&
              key !== APP_CACHE
          )
          .map((key) => caches.delete(key))
      );

      await self.clients.claim();
    })()
  );
});


/*
 * FETCH
 */
self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;


  /*
   * APP START / NAVIGATION
   *
   * First refresh the frontend shell.
   * Only after that do we return index.html.
   *
   * Therefore, when online:
   *
   *   check/download newest app files
   *                 ↓
   *             serve index
   *                 ↓
   *        browser loads newest app.js
   */
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          await refreshAppShell();

          const cache = await caches.open(APP_CACHE);

          const cachedIndex = await cache.match(
            appUrl("index.html")
          );

          if (cachedIndex) {
            return cachedIndex;
          }
        } catch (error) {
          console.warn("Navigation cache refresh failed:", error);
        }

        /*
         * Online fallback.
         */
        try {
          return await fetch(request);
        } catch (error) {
          /*
           * Offline fallback.
           */
          const cache = await caches.open(APP_CACHE);

          const cachedIndex = await cache.match(
            appUrl("index.html")
          );

          if (cachedIndex) {
            return cachedIndex;
          }

          throw error;
        }
      })()
    );

    return;
  }


  /*
   * DOCUMENTS
   *
   * Cache-first.
   *
   * Once a document has been downloaded into WatchTech,
   * it is opened from the local browser cache.
   */
  if (isDocumentUrl(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(DOCUMENT_CACHE);

        const cached = await cache.match(request);

        if (cached) {
          return cached;
        }

        try {
          const response = await fetch(request);

          if (response.ok) {
            await cache.put(request, response.clone());
          }

          return response;
        } catch (error) {
          throw error;
        }
      })()
    );

    return;
  }


  /*
   * FRONTEND FILES
   *
   * These have already been refreshed during app startup.
   * Serve the newest cached copy.
   */
  if (isAppShellUrl(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(APP_CACHE);

        const cached = await cache.match(request);

        if (cached) {
          return cached;
        }

        try {
          const response = await fetch(request);

          if (response.ok) {
            await cache.put(request, response.clone());
          }

          return response;
        } catch (error) {
          throw error;
        }
      })()
    );

    return;
  }


  /*
   * Everything else.
   */
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);

      if (cached) {
        return cached;
      }

      return fetch(request);
    })()
  );
});
