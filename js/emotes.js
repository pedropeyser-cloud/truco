// Emotes en la mesa (docs/crecer.md, tanda 5): reacciones rápidas en el 1 contra 1 y en las mesas de 4 y 6.
// Por la red viaja solo la clave ({ t: "emote", k }), nunca texto libre: no hay nada que moderar.
// Van por PeerJS (el mismo canal de la partida), nunca por Realtime. El que recibe valida la clave y pone tope.
const LISTA = [
  { k: "risa", txt: "¡Jajaja!" },
  { k: "suerte", txt: "¡Qué suerte!" },
  { k: "bien", txt: "¡Bien jugado!" },
  { k: "uy", txt: "¡Uy, uy, uy!" },
  { k: "mate", txt: "¿Un mate?" },
  { k: "dale", txt: "Dale, que se enfría" },
  { k: "mentira", txt: "¡Mentiroso!" },
  { k: "hijo", txt: "Me tenés de hijo" },
];
const POR_K = Object.fromEntries(LISTA.map((e) => [e.k, e]));
// en la práctica la máquina a veces contesta
const RESPUESTA = { risa: ["risa"], suerte: ["bien", "risa"], bien: ["bien"], uy: ["risa"], mate: ["mate"], dale: ["dale", "risa"], mentira: ["risa", "mentira"], hijo: ["risa", "suerte"] };

export const valido = (k) => typeof k === "string" && Object.hasOwn(POR_K, k);
export const textoDe = (k) => POR_K[k]?.txt || "";
export const respuestaBot = (k) => { const r = RESPUESTA[k]; return r && Math.random() < 0.4 ? r[Math.floor(Math.random() * r.length)] : null; };

const CLAVE_MUDO = "truco.emotes.mudo";
export function mudo() { try { return localStorage.getItem(CLAVE_MUDO) === "1"; } catch { return false; } }
function ponerMudo(v) { try { localStorage.setItem(CLAVE_MUDO, v ? "1" : "0"); } catch {} }

/** Tope: una por jugador cada 1,5 s (lo usan el que manda y el anfitrión que reenvía). */
export function tope(ms = 1500) {
  const ult = new Map();
  return (quien) => { const t = Date.now(); if (t - (ult.get(quien) || 0) < ms) return false; ult.set(quien, t); return true; };
}

/** El botón en la barra de la mesa (antes del tanteador) y la bandeja. alElegir(k) recibe la clave. */
export function montar(barra, antesDe, alElegir) {
  if (!barra || barra.querySelector(".b-emote")) return;
  const btn = document.createElement("button");
  btn.className = "b-icono b-emote"; btn.type = "button";
  btn.setAttribute("aria-label", "Reacciones"); btn.title = "Reacciones"; btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 5.5h16v10H10l-4 3.5v-3.5H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="9" cy="10.5" r="1.1" fill="currentColor"/><circle cx="15" cy="10.5" r="1.1" fill="currentColor"/></svg>';
  barra.insertBefore(btn, antesDe || null);
  const bandeja = document.createElement("div");
  bandeja.className = "emotes-bandeja"; bandeja.hidden = true; bandeja.setAttribute("role", "menu");
  const pintar = () => {
    bandeja.innerHTML = LISTA.map((e) => `<button type="button" role="menuitem" data-emote="${e.k}">${e.txt}</button>`).join("") +
      `<label class="emotes-mudo"><input type="checkbox" ${mudo() ? "checked" : ""}> no ver las de los demás</label>`;
  };
  barra.parentElement.appendChild(bandeja);
  const cerrar = () => { bandeja.hidden = true; btn.setAttribute("aria-expanded", "false"); };
  btn.onclick = (ev) => { ev.stopPropagation(); if (bandeja.hidden) { pintar(); bandeja.hidden = false; btn.setAttribute("aria-expanded", "true"); } else cerrar(); };
  bandeja.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const b = ev.target.closest("[data-emote]");
    if (b) { cerrar(); alElegir(b.dataset.emote); }
  });
  bandeja.addEventListener("change", (ev) => { if (ev.target.matches("input")) ponerMudo(ev.target.checked); });
  document.addEventListener("pointerdown", (ev) => { if (!bandeja.hidden && !ev.target.closest(".emotes-bandeja, .b-emote")) cerrar(); }, true);
}
