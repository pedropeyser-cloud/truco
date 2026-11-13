// Vigía de errores (apertura, 2026-11-12): junta los errores del juego y los manda a la tabla «errores» de Supabase.
// Los lee Pedro en la Torre de control, y una tarea de GitHub avisa al celular si aparecen. Anda también sin cuenta.
// Frenos: el mismo mensaje se manda una sola vez por sesión, hasta 15 por sesión, y la base tiene su propio tope.
import { reportarError } from "./nube.js";

export const VERSION = "2026-11-12";
const vistos = new Set();
let enviados = 0;
const cola = [];

// ruido que no es del juego: extensiones del navegador, avisos del propio navegador, cortes de red esperables
const RUIDO = /ResizeObserver loop|chrome-extension:|moz-extension:|safari-extension:|Script error\.?$|Load failed|NetworkError|Failed to fetch|AbortError|The play\(\) request was interrupted/i;

function avisar(donde, mensaje, detalle = "") {
  mensaje = String(mensaje || "").trim().slice(0, 500);
  if (!mensaje || RUIDO.test(mensaje) || RUIDO.test(detalle)) return;
  const clave = donde + "|" + mensaje;
  if (vistos.has(clave) || enviados >= 15) return;
  vistos.add(clave); enviados++;
  cola.push({
    donde: String(donde).slice(0, 120), mensaje, detalle: String(detalle || "").slice(0, 1000), version: VERSION,
    navegador: `${navigator.userAgent} · ${innerWidth}x${innerHeight}`.slice(0, 200),
  });
  vaciar();
}

// la nube arranca después (iniciar crea el cliente): se reintenta un rato hasta que esté
let reintentos = 0;
async function vaciar() {
  while (cola.length) {
    const e = cola[0];
    const ok = await reportarError(e).catch(() => true);
    if (!ok) break;
    cola.shift();
  }
}
setInterval(() => { if (cola.length && reintentos++ < 20) vaciar(); }, 5000);

addEventListener("error", (ev) => {
  if (ev.filename && !ev.filename.startsWith(location.origin)) return; // scripts ajenos
  avisar(`${(ev.filename || "").replace(location.origin, "")}:${ev.lineno || 0}`, ev.message, ev.error?.stack || "");
});
addEventListener("unhandledrejection", (ev) => {
  const r = ev.reason;
  avisar("promesa", r?.message || String(r), r?.stack || "");
});

// los console.error del juego (bots, red, mesa) también cuentan
const errorOriginal = console.error.bind(console);
console.error = (...args) => {
  errorOriginal(...args);
  const err = args.find((a) => a instanceof Error);
  avisar("consola", err?.message || args.map((a) => (typeof a === "string" ? a : "")).join(" "), err?.stack || "");
};

/** Para avisar a mano desde otra parte del juego. */
export const avisarError = avisar;
