const CACHE_NAME = "garage-log-v1.1.0";

const FILES_TO_CACHE = [
    "./",
    "./index.html",
    "./manifest.json",
    "./css/style.css",
    "./js/app.js",
    "./js/db.js",
    "./data/GarageLog.json",
    "./app-icons/app-icon-192.png",
    "./app-icons/app-icon-512.png",
    "./fonts/Comfortaa-Light.ttf",
    "./js/github-api.js",
	"./js/github-sync.js"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(FILES_TO_CACHE))
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        )
    );
});

self.addEventListener("fetch", event => {

    const isSameOrigin = event.request.url.startsWith(self.location.origin);

    if (!isSameOrigin) {
        // Let GitHub API calls (and anything else cross-origin) pass
        // straight through — don't cache them.
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then(response => {

                const responseClone = response.clone();

                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseClone);
                });

                return response;
            })
            .catch(() => caches.match(event.request))
    );
});