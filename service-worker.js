const CACHE_NAME = "sahmt-pwa-v54";
const APP_SHELL = [
  "./",
  "./index.html",
  "./atualizar.html",
  "./atualizar-v2.html",
  "./atualizar-v3.html",
  "./atualizar-v4.html",
  "./atualizar-v5.html",
  "./atualizar-v6.html",
  "./escala-ferias.html",
  "./escala-ferias-v2.html",
  "./escala-ferias-imagens.html",
  "./escala-ferias-imagens.css",
  "./styles.css",
  "./app.js",
  "./sync-config.js",
  "./notices.js",
  "./data.js",
  "./contacts.js",
  "./manifest.webmanifest",
  "./escala-ferias-2026.pdf",
  "./escala-ferias-2026-v2.pdf",
  "./escala-ferias-2026-v3.pdf",
  "./escala-imagens/segunda-2026.jpg",
  "./escala-imagens/terca-2026.jpg",
  "./escala-imagens/quarta-2026.jpg",
  "./escala-imagens/quinta-2026.jpg",
  "./escala-imagens/sexta-2026.jpg",
  "./escala-imagens/sabado-2026.jpg",
  "./escala-imagens/ferias-2026.jpg",
  "./sahmt_option1_clean.png",
  "./gestao_operacional.png",
  "./eventos/index.html",
  "./eventos/styles.css",
  "./eventos/app.js",
  "./eventos/config.js",
  "./eventos/sw.js",
  "./eventos/manifest.webmanifest",
  "./eventos/assets/hero-icon.png",
  "./eventos/assets/icon-192.png",
  "./eventos/assets/icon-512.png",
  "./logo_administrativo.png",
  "./logo_gestao.png",
  "./logo_equipe.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  // The live schedule and published interface must never be held back by an
  // old service-worker response. External data is already fetched no-store.
  if (new URL(event.request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        return cached || caches.match("./index.html");
      })
  );
});
