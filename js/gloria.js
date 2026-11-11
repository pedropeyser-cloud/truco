// Lo que se desbloquea con la gloria (tanda 4C) y la clasificatoria (tanda 4D): umbrales, títulos, colores,
// ligas, estilo de juego y los dibujos (gorrita, peluca, mate, insignia). Los umbrales también los controla la
// base (validar_cosmeticos, registrar_partida, confirmar_partida en supabase/esquema.sql): acá solo se muestra.

export const UMBRALES = [
  { p: 10, k: "titulo", nombre: "Título honorable", que: "Un título de la corte bajo tu nombre." },
  { p: 15, k: "mate", nombre: "El mate", que: "Si tomás al menos uno por partida, +1 de gloria (ganes o pierdas)." },
  { p: 20, k: "gorra", nombre: "La gorrita de la Selección", que: "Celeste y blanca, con la 10 y la firma. Se ve en la mesa." },
  { p: 25, k: "peluca", nombre: "Peluca de color", que: "Una vez por partida, irte al mazo una ronda sin perder el punto." },
  { p: 30, k: "estilo", nombre: "Color y tipografía", que: "Tu nombre y tu título con el color y la letra que elijas." },
  { p: 35, k: "libre", nombre: "Título libre", que: "Escribí el título que quieras." },
  { p: 40, k: "clasif", nombre: "Clasificatoria", que: "Partidas por liga, de Bronce 1 a Oro 1." },
  { p: 45, k: "trampa", nombre: "La trampa", que: "Una vez por partida, en tu turno: le cambiás al rival una carta por una al azar del mazo." },
  { p: 50, k: "insignia", nombre: "Insignia de ganador", que: "La insignia junto a tu nombre y tu estilo de juego." },
];
export const tiene = (perfil, k) => !!perfil && perfil.puntos >= (UMBRALES.find((u) => u.k === k)?.p ?? Infinity);
export const proximo = (puntos) => UMBRALES.find((u) => u.p > puntos) || null;

// los mismos que valida la base
export const TITULOS = ["Escudero del Rey Sota", "Caballero del Ancho de Espada", "Barón de los Siete Bravos",
  "Verdugo de la Falta Envido", "Príncipe del Retruco", "Ogro del Mazo Viejo", "Duque de las Treinta y Tres",
  "Bufón de la Corte del Basto", "Guardián del Castillo de Copas", "Rey sin Corona del Vale Cuatro"];
export const COLORES = { ambar: "#f0a93b", celeste: "#7cc4ef", rojo: "#e8604c", verde: "#6fbf73", violeta: "#b48cf0", rosa: "#f08cc0", blanco: "#f4efe4", dorado: "#e8c35a" };
export const FUENTES = { bricolage: "Bricolage, system-ui, sans-serif", caveat: "Caveat, cursive", plex: "Plex, monospace", serif: "Georgia, 'Times New Roman', serif" };
export const NOMBRE_COLOR = { ambar: "ámbar", celeste: "celeste", rojo: "rojo", verde: "verde", violeta: "violeta", rosa: "rosa", blanco: "blanco", dorado: "dorado" };
export const NOMBRE_FUENTE = { bricolage: "de imprenta", caveat: "a mano", plex: "de máquina", serif: "antigua" };

/** Estilo para un nombre (solo valores de la lista: nada de lo que llega se pega crudo en el CSS). */
export function estiloNombre(perfil) {
  const e = perfil?.estilo || {};
  if (!tiene(perfil, "estilo")) return "";
  const c = COLORES[e.color], f = FUENTES[e.fuente];
  return (c ? `color:${c};` : "") + (f ? `font-family:${f};` : "");
}
/** Accesorios que se ven en la mesa. En la clasificatoria, los objetos valen recién desde Oro 4. */
export function accesoriosDe(perfil, enClasif = false) {
  if (!perfil) return {};
  const objetos = !enClasif || (perfil.elo || 0) >= 500;
  const e = perfil.estilo || {};
  return {
    gorra: objetos && tiene(perfil, "gorra") && e.gorra === true,
    peluca: objetos && tiene(perfil, "peluca") && COLORES[e.peluca] ? COLORES[e.peluca] : null,
    insignia: tiene(perfil, "insignia"),
  };
}
/** Poderes de juego (peluca, trampa, mate) según la gloria y, en la clasificatoria, la liga. */
export function poderesDe(perfil, enClasif = false) {
  if (!perfil) return { peluca: 0, trampa: 0, mate: false };
  const objetos = !enClasif || (perfil.elo || 0) >= 500;
  return { peluca: objetos && tiene(perfil, "peluca") ? 1 : 0, trampa: objetos && tiene(perfil, "trampa") ? 1 : 0, mate: objetos && tiene(perfil, "mate") };
}

// ---------- clasificatoria ----------
export const LIGAS = ["Bronce 1", "Plata 4", "Plata 3", "Plata 2", "Plata 1", "Oro 4", "Oro 3", "Oro 2", "Oro 1"];
export function ligaDe(elo = 0) {
  const i = Math.min(LIGAS.length - 1, Math.floor(Math.max(0, elo) / 100));
  return { i, nombre: LIGAS[i], progreso: i === LIGAS.length - 1 ? 100 : Math.max(0, elo) % 100, metal: LIGAS[i].split(" ")[0].toLowerCase() };
}
/** Lo mismo que calcula confirmar_partida: cuánto ganás o perdés contra ese nivel. */
export function previa(miElo, suElo) {
  const f = Math.max(0.5, Math.min(1.6, 1 + (suElo - miElo) / 300));
  return { gana: Math.round(34 * f), pierde: Math.round(20 / f) };
}

// ---------- estilo de juego (con la insignia) ----------
/** Suma las cuentas de cada partida: { manos, cantos, faroles, mentiras, mazos, quiero, noquiero }. */
export function sumarEstilos(lista) {
  const t = { manos: 0, cantos: 0, faroles: 0, mentiras: 0, mazos: 0, quiero: 0, noquiero: 0, partidas: 0 };
  for (const e of lista) { if (!e || !e.manos) continue; t.partidas++; for (const k in t) if (k !== "partidas") t[k] += +e[k] || 0; }
  return t;
}
export function estiloDeJuego(t) {
  if (!t || t.partidas < 3 || t.manos < 10) return { nombre: "Todavía no se sabe", que: "Jugá unas partidas más anotadas y la mesa te va a calar.", tipo: "" };
  const canta = t.cantos / t.manos, mienteRate = (t.faroles + t.mentiras) / Math.max(1, t.cantos);
  const quiere = t.quiero / Math.max(1, t.quiero + t.noquiero), rajaRate = t.mazos / t.manos;
  if (mienteRate >= 0.35 && canta >= 0.25) return { nombre: "Mentiroso de ley", que: "Cantás sin tener y te sale bien. Agresivo: la mesa nunca sabe si vas en serio.", tipo: "agresivo" };
  if (canta >= 0.4 || quiere >= 0.72) return { nombre: "Gallo cantor", que: "Cantás todo y querés todo. Agresivo: vas al frente con lo que tengas.", tipo: "agresivo" };
  if (canta <= 0.18 && (rajaRate >= 0.15 || quiere <= 0.45)) return { nombre: "Pescador", que: "Esperás callado a que te toque la buena. Conservador: no regalás nada.", tipo: "conservador" };
  return { nombre: "Baqueano", que: "Sabés cuándo apretar y cuándo pasar. Equilibrado: leés la mesa.", tipo: "equilibrado" };
}

// ---------- dibujos ----------
/** Gorrita celeste y blanca con la 10 y una firma garabateada (sin escudos ni marcas). Encima de la cabeza. */
let nGorra = 0;
export const gorra = () => { const id = "cg" + ++nGorra; return `<g class="acc acc-gorra"><defs><clipPath id="${id}"><path d="M40 62Q42 10 100 8Q158 10 160 62Z"/></clipPath></defs>
  <g clip-path="url(#${id})"><rect x="30" y="0" width="140" height="70" fill="#f4f6fb"/>
  <rect x="52" y="0" width="22" height="70" fill="#7cc4ef"/><rect x="89" y="0" width="22" height="70" fill="#7cc4ef"/><rect x="126" y="0" width="22" height="70" fill="#7cc4ef"/></g>
  <path d="M40 62Q42 10 100 8Q158 10 160 62Z" fill="none" stroke="#14171c" stroke-width="5"/>
  <path d="M30 60Q100 50 176 60L182 72Q100 62 24 72Z" fill="#1d3a6b" stroke="#14171c" stroke-width="4" stroke-linejoin="round"/>
  <text x="100" y="47" text-anchor="middle" font-family="Bricolage, sans-serif" font-weight="800" font-size="22" fill="#1d3a6b" stroke="#f4f6fb" stroke-width="1">10</text>
  <path d="M112 52c4-6 7 2 10-3s5 1 8-2 4 2 7-1" fill="none" stroke="#14171c" stroke-width="1.8" stroke-linecap="round"/></g>`; };

/** Peluca de rulos del color elegido: detrás de la cabeza, asoma arriba y a los costados. */
export function peluca(color) {
  const c = /^#[0-9a-f]{6}$/i.test(color) ? color : "#f08cc0";
  const rulos = [[52, 46, 24], [76, 32, 24], [100, 27, 25], [124, 32, 24], [148, 46, 24], [34, 72, 20], [166, 72, 20], [30, 98, 18], [170, 98, 18], [34, 122, 16], [166, 122, 16]];
  return `<g class="acc acc-peluca">${rulos.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="#14171c" stroke-width="4"/>`).join("")}</g>`;
}

/** Ícono chico de mate (para el botón y el perfil). */
export const MATE = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 9h11c0 6-2 11-5.5 11S6 15 6 9z" fill="#b8621b" stroke="#14171c" stroke-width="1.4"/><path d="M7 9.5c1.5-1.5 7.5-1.5 9 0" fill="#6fae4a" stroke="#14171c" stroke-width="1.2"/><path d="M13 9l3.5-6.5" stroke="#d9d4c7" stroke-width="1.8" stroke-linecap="round"/><path d="M16 2.6l1.6.8" stroke="#d9d4c7" stroke-width="1.8" stroke-linecap="round"/></svg>`;

// Insignia de ganador: 16 × 16, un nene pícaro de pelo negro, remera roja y short amarillo, mostrando la medalla.
const PIX = ["....kkkkkk......", "...kkkkkkkk.....", "..kkkkkkkkkk....", ".kkssssssssk....", ".kskkssskkss....", ".ksskssskss.....",
  "sspsssssspss..b.", ".ssskkkksss..b..", "..sssssssss.bb..", "...rrrrrrr..ggg.", "..rrrrrrrrrsgyg.", "..rrrrrrrr..ggg.",
  "...rrrrrrr......", "...yyyyyyy......", "...yyy..yyy.....", "...ss....ss....."];
const COL = { k: "#14171c", s: "#f3c9a1", p: "#ef9a9a", r: "#d6332a", y: "#f2c230", g: "#e8b730", b: "#3b6fd6" };
export function insignia(px = 18) {
  let r = "";
  PIX.forEach((fila, y) => [...fila].forEach((c, x) => { if (COL[c]) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${COL[c]}"/>`; }));
  return `<svg class="insignia" viewBox="0 0 16 16" width="${px}" height="${px}" shape-rendering="crispEdges" role="img" aria-label="Insignia de ganador">${r}</svg>`;
}
export const gorraMini = () => `<svg viewBox="0 0 200 80" width="22" height="9" role="img" aria-label="gorrita">${gorra()}</svg>`;

// ---------- cuentas de cómo jugó cada uno (las arma el anfitrión con los eventos; van a la base al anotar) ----------
import { tantoDe, jerarquia } from "./motor.js";
const ENV = ["envido", "real_envido", "falta_envido"], TRU = ["truco", "retruco", "vale_cuatro"];
export const estiloVacio = () => ({ manos: 0, cantos: 0, faroles: 0, mentiras: 0, mazos: 0, quiero: 0, noquiero: 0 });
/** Suma a cuentas[asiento] lo que pasó en estos eventos. estado: el de después (para ver las manos). */
export function contarEventos(cuentas, eventos, estado) {
  const de = (j) => (cuentas[j] ||= estiloVacio());
  for (const e of eventos) {
    try {
      if (e.t === "reparto") { for (let j = 0; j < (estado.n || 2); j++) de(j).manos++; continue; }
      const j = e.jugador;
      if (!Number.isInteger(j)) continue;
      const mano = estado.manos?.[j] || [];
      if (e.t === "canto") {
        de(j).cantos++;
        if (ENV.includes(e.c) && mano.length === 3 && tantoDe(mano) < 25) de(j).faroles++;           // envido sin tanto
        if (TRU.includes(e.c) && mano.length && Math.max(...mano.map(jerarquia)) < 10) de(j).faroles++; // truco sin cartas
      } else if (e.t === "tanto" && estado.envido?.tantos?.[j] === e.n && mano.length === 3 && e.n > tantoDe(mano)) de(j).mentiras++;
      else if (e.t === "mazo") de(j).mazos++;
      else if (e.t === "respuesta" && e.r === "quiero") de(j).quiero++;
      else if (e.t === "respuesta" && e.r === "no_quiero") de(j).noquiero++;
    } catch { /* una cuenta menos no rompe la partida */ }
  }
  return cuentas;
}

/**
 * Lo que cuenta cada jugador de sí mismo (con sus propias cartas), para mandarlo al confirmar.
 * mano: sus 3 cartas de esta mano (las que tiene más las que jugó). tantos: los tantos dichos en el envido.
 */
export function contarMio(cuentas, eventos, yo, mano, tantos) {
  const solo = eventos.filter((e) => e.t === "reparto" || e.jugador === yo);
  const fingido = { n: yo + 1, manos: [], envido: { tantos: tantos || [] } };
  fingido.manos[yo] = mano;
  contarEventos(cuentas, solo, fingido);
  for (const k of Object.keys(cuentas)) if (+k !== yo) delete cuentas[k];
  return cuentas;
}
