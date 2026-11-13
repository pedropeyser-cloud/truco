// Service worker del truco (docs/crecer.md, tanda 4): practicar contra el bot sin internet.
// Red primero: con conexión siempre se usa lo último publicado (y se guarda una copia); sin conexión, la copia.
// Solo archivos de este mismo sitio. Supabase, la Edge Function del árbitro y PeerJS van siempre por la red, sin copia.
// nube-config.js nunca se guarda (ni en la caja ni en la caché del navegador, por eso no-store): sin conexión se responde una configuración vacía y el juego arranca sin cuenta.
const CAJA = "truco-v1";
const BASICO = ["./", "index.html", "manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CAJA).then((c) => c.addAll(BASICO)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CAJA).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// la página manda la lista de lo que ya cargó (así no hay que mantener una lista a mano)
self.addEventListener("message", (e) => {
  if (e.data?.t !== "guardar" || !Array.isArray(e.data.urls)) return;
  const propias = e.data.urls.filter((u) => { try { const x = new URL(u); return x.origin === location.origin && !x.pathname.endsWith("nube-config.js") && !x.search; } catch { return false; } });
  e.waitUntil(caches.open(CAJA).then((c) => Promise.all(propias.slice(0, 300).map((u) => c.match(u).then((ya) => ya || c.add(u).catch(() => {}))))));
});

const CONFIG_VACIA = 'export const NUBE = { url: "", clave: "" };\n';

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // supabase.co, la Edge Function, PeerJS: la red y nada más
  if (url.pathname.endsWith("/js/nube-config.js")) {
    e.respondWith(fetch(req, { cache: "no-store" }).catch(() => new Response(CONFIG_VACIA, { headers: { "content-type": "text/javascript" } })));
    return;
  }
  e.respondWith((async () => {
    try {
      // lo que arma la página (portada, módulos, estilos) se revalida siempre: si se publicó algo, llega eso y no la copia del navegador
      const r = await fetch(req, /\.(js|css|json|webmanifest)$/.test(url.pathname) || req.mode === "navigate" ? { cache: "no-cache" } : undefined);
      if (r.ok && r.type === "basic" && !url.search) { const copia = r.clone(); caches.open(CAJA).then((c) => c.put(req, copia)).catch(() => {}); }
      return r;
    } catch {
      const c = await caches.open(CAJA);
      // con ?sala= o ?mesa= (o cualquier navegación) sin red: la portada guardada
      return (await c.match(req, { ignoreSearch: req.mode === "navigate" })) || (req.mode === "navigate" ? await c.match("index.html") : null) || Response.error();
    }
  })());
});
