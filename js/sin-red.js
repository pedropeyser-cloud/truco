// Registra el service worker (sw.js) para practicar sin internet y le pasa lo que ya cargó la página.
// Docs/crecer.md, tanda 4. Si el navegador no tiene service workers, no pasa nada.
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("sw.js");
      const listo = await navigator.serviceWorker.ready;
      // un rato después de cargar (fuentes, cartas y voces ya pedidas): que se guarde todo lo propio
      setTimeout(() => {
        const urls = performance.getEntriesByType("resource").map((r) => r.name).concat(location.href.split("?")[0]);
        listo.active?.postMessage({ t: "guardar", urls });
      }, 4000);
    } catch (e) { console.warn("sin service worker:", e?.message); }
  });
  // sin red: un aviso chico para que se entienda por qué no hay cuenta ni invitaciones
  const marcar = () => document.documentElement.classList.toggle("sin-red", !navigator.onLine);
  addEventListener("online", marcar); addEventListener("offline", marcar); marcar();
}
