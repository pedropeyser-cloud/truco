// Compartir el resultado (docs/crecer.md, tanda 3): al terminar la partida, una imagen de 1080×1350 con la servilleta,
// el resultado, tu cara y las cartas, para mandar por WhatsApp o subir a historias. Lee solo lo que muestra la vista
// (nombres y puntos), así sigue andando cuando la partida la arbitre el servidor.
// En la hoja de fin de partida: botonCompartir({ gane, mios, suyos, pm, ps, meta }) → botón; el clic lo atiende este módulo.
import { frente, dorso } from "./cartas.js";
import * as Perfil from "./perfil.js";
import { caraCon } from "./caras.js";
import { formaDe, tieneMarco } from "./catalogo.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LINK = () => location.origin + location.pathname;

/** El botón para la hoja de fin de partida. mios/suyos: nombres de cada lado («vos» va primero en mios). */
export function botonCompartir(d) {
  if (!document.createElement("canvas").getContext) return "";
  return `<button class="b fuerte" data-compartir="${esc(JSON.stringify(d))}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v6h14v-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Compartir el resultado</span></button>`;
}

document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-compartir]");
  if (!b) return;
  let d; try { d = JSON.parse(b.dataset.compartir); } catch { return; }
  const txt = b.querySelector("span"), antes = txt?.textContent;
  if (txt) txt.textContent = "Armando la imagen…";
  try { await compartir(d); } catch (x) { if (x?.name !== "AbortError") console.error(x); }
  finally { if (txt) txt.textContent = antes; }
});

async function compartir(d) {
  const blob = await imagen(d);
  const archivo = new File([blob], `truco-${d.pm}-a-${d.ps}.png`, { type: "image/png" });
  const contra = d.suyos.filter(Boolean).join(", ") || "mi rival";
  const texto = d.gane ? `¡Le gané ${d.pm} a ${d.ps} a ${contra} al truco! ¿Te animás? ${LINK()}` : `Perdí ${d.pm} a ${d.ps} con ${contra} al truco. Se viene la revancha: ${LINK()}`;
  if (navigator.canShare?.({ files: [archivo] })) return navigator.share({ files: [archivo], text: texto });
  // sin compartir nativo (compu): se descarga la imagen y el texto queda copiado
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = archivo.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  try { await navigator.clipboard.writeText(texto); } catch {}
}

const img = (svg, w, h) => new Promise((ok, mal) => {
  let s = svg.includes("xmlns=") ? svg : svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
  s = s.replace("<svg ", `<svg width="${w}" height="${h}" `);
  const i = new Image(); i.onload = () => ok(i); i.onerror = mal;
  i.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
});

/** Dibuja la imagen y la devuelve como PNG. */
export async function imagen({ gane, mios = [], suyos = [], pm, ps, meta }) {
  const W = 1080, H = 1350, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  await Promise.all(["600 90px Bricolage", "800 200px Bricolage", "700 100px Caveat", "30px Plex"].map((f) => document.fonts.load(f).catch(() => {})));

  // noche con la lámpara arriba y el grano de siempre
  g.fillStyle = "#14171c"; g.fillRect(0, 0, W, H);
  const luz = g.createRadialGradient(W / 2, -80, 40, W / 2, -80, 900);
  luz.addColorStop(0, "rgba(255,214,150,.38)"); luz.addColorStop(.55, "rgba(255,214,150,.08)"); luz.addColorStop(1, "rgba(255,214,150,0)");
  g.fillStyle = luz; g.fillRect(0, 0, W, H);
  for (let k = 0; k < 2600; k++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }

  // marca
  g.textAlign = "center"; g.fillStyle = "#ebe4d4"; g.font = "600 92px Bricolage, sans-serif"; g.fillText("truco", W / 2, 150);
  g.fillStyle = "#f0a93b"; g.font = "700 46px Caveat, cursive"; g.fillText("el barajador reparte", W / 2, 205);

  // las cartas de fondo, en abanico abajo a la derecha
  const [d1, f1] = await Promise.all([img(dorso(Perfil.miDorso?.() || "clasico"), 600, 860), img(frente(gane ? "1-espada" : "4-copa"), 600, 860)]);
  const carta = (im, x, y, rot) => { g.save(); g.translate(x, y); g.rotate(rot); g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 40; g.shadowOffsetY = 20; g.drawImage(im, -130, -186, 260, 372); g.restore(); };
  carta(d1, 870, 1120, 0.22); carta(f1, 990, 1150, 0.42);

  // tu cara
  const p = Perfil.miPerfil?.();
  try {
    const cara = await img(caraQuieta(caraCon(formaDe(p, 4), p ? Perfil.accDe(p) : {}, Perfil.DIBUJOS)), 200, 240);
    g.save(); g.beginPath(); g.arc(W / 2, 360, 110, 0, Math.PI * 2); g.closePath();
    const fondo = g.createRadialGradient(W / 2, 330, 10, W / 2, 360, 110); fondo.addColorStop(0, "#3d3528"); fondo.addColorStop(1, "#1b1f26");
    g.fillStyle = fondo; g.fill(); g.clip(); g.drawImage(cara, W / 2 - 110, 360 - 110 - 26, 220, 264); g.restore();
    g.lineWidth = p && tieneMarco(p) ? 10 : 5; g.strokeStyle = p && tieneMarco(p) ? "#e8c35a" : "#353b46";
    g.beginPath(); g.arc(W / 2, 360, 110, 0, Math.PI * 2); g.stroke();
  } catch {}

  // el grito
  g.save(); g.translate(W / 2, 600); g.rotate(-0.05);
  g.fillStyle = "#f0a93b"; g.font = "700 150px Caveat, cursive"; g.shadowColor = "rgba(240,169,59,.35)"; g.shadowBlur = 40;
  g.fillText(gane ? "¡Gané!" : "Perdí… por ahora", 0, 0); g.restore();

  // la servilleta con el resultado
  g.save(); g.translate(W / 2, 870); g.rotate(0.025);
  g.shadowColor = "rgba(0,0,0,.55)"; g.shadowBlur = 50; g.shadowOffsetY = 24;
  g.fillStyle = "#ebe4d4"; redondeado(g, -380, -190, 760, 380, 14); g.fill(); g.shadowColor = "transparent";
  g.strokeStyle = "rgba(184,98,27,.5)"; g.setLineDash([10, 10]); g.lineWidth = 3; g.beginPath(); g.moveTo(0, -150); g.lineTo(0, 150); g.stroke(); g.setLineDash([]);
  const lado = (x, quien, pts, gana) => {
    g.fillStyle = "#14171c"; g.font = "700 60px Caveat, cursive"; g.fillText(recortar(g, quien, 330), x, -100);
    g.fillStyle = gana ? "#b8621b" : "#14171c"; g.font = "800 190px Bricolage, sans-serif"; g.fillText(String(pts), x, 90);
  };
  lado(-190, mios.join(" y ") || "vos", pm, gane); lado(190, suyos.join(" y ") || "rival", ps, !gane);
  g.fillStyle = "#6c6759"; g.font = "30px Plex, monospace"; g.fillText(`a ${meta}`, 0, 165);
  g.restore();

  // pie
  g.fillStyle = "#8d919a"; g.font = "32px Plex, monospace"; g.textAlign = "left";
  g.fillText(new Date().toLocaleDateString("es-AR", { day: "numeric", month: "long" }), 70, 1210);
  g.fillStyle = "#c9c3b5"; g.fillText(LINK().replace(/^https?:\/\//, "").replace(/\/$/, ""), 70, 1260);

  return new Promise((ok) => c.toBlob(ok, "image/png"));
}
/** Dentro de una imagen el SVG no ve el CSS de la página: se dejan solo la boca de siempre y los ojos abiertos. */
function caraQuieta(svg) {
  const d = document.createElement("div"); d.innerHTML = svg;
  d.querySelectorAll(".m:not(.m-normal), .ojo-c").forEach((x) => x.remove());
  return d.innerHTML;
}
function redondeado(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function recortar(g, t, max) { t = String(t); if (g.measureText(t).width <= max) return t; while (t.length > 1 && g.measureText(t + "…").width > max) t = t.slice(0, -1); return t + "…"; }
