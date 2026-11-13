// Bot para la mesa de 4 y de 6. Mira solo su vista y elige entre vista.acciones.
// En punta y hacha juega su duelo con el bot de 1 contra 1. En la mano redonda tiene en cuenta
// lo que ya tiró su compañero: si la baza ya es del equipo, tira la más baja.
// `senas` (opcional): lo que le mostraron los compañeros, { cartas: ["ancho_espada", "tres", …], tanto: n,
// ordenes: [{ k, baza, vamos }] } — lo usa el pie para decidir los cantos y todos para elegir carta: obedece lo que
// dijo el pie en esa baza («matala si podés», «pasá que voy yo», «¡vamos a…!») y abre bajo si el compañero señó una brava
// (las claves son las de las señas en docs/reglas.md).

import { jerarquia, tantoDe, tantoFlor, esFlor } from "./motor.js";
import * as Bot from "./bot.js";

const ENVIDOS = ["envido", "real_envido", "falta_envido"];
const TRUCOS = ["truco", "retruco", "vale_cuatro"];
export const FUERZA_SENA = { ancho_espada: 14, ancho_basto: 13, siete_espada: 12, siete_oro: 11, tres: 10, dos: 9, falso: 8 };

/**
 * Qué le ordena el bot pie a su compañero (persona) cuando le toca tirar. Pura, para poder probarla.
 * senas: claves de las señas de cartas que hizo el compañero; jugadas: claves de seña de las cartas que ya tiró
 * (se descuentan: no le dice «matala» con una brava que ya no tiene); rivales: jerarquía de las cartas rivales en la
 * baza; mias: jerarquía de las cartas que le quedan al pie; compa: su asiento (para «¡vamos a…!»).
 * Devuelve la clave de la pregunta (p_mata, p_pasa, p_vamos_<asiento>) o null.
 */
export function ordenDelPie({ senas, jugadas = [], rivales, mias, compa }) {
  const quedan = [...senas];
  for (const k of jugadas) { const i = quedan.indexOf(k); if (i >= 0) quedan.splice(i, 1); }
  const suya = Math.max(0, ...quedan.map((k) => FUERZA_SENA[k] || 0));
  const mia = Math.max(0, ...mias);
  if (rivales.length) {
    const mejorRival = Math.max(...rivales);
    if (suya > mejorRival && suya >= 10) return "p_mata";
    if (mia > mejorRival && suya < mejorRival) return "p_pasa";
    return null;
  }
  return suya >= 12 ? `p_vamos_${compa}` : null;
}

function semillaDe(v) {
  const txt = JSON.stringify([v.yo, v.numeroMano, v.miMano, v.bazas, v.puntos, v.cantoPendiente,
    v.envido && v.envido.cantos, v.acciones.length]);
  let h = 2166136261;
  for (let i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function generador(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mismaAccion(a, b) {
  return a.t === b.t && (a.c ?? null) === (b.c ?? null) && (a.carta ?? null) === (b.carta ?? null);
}

const eq = (j) => j % 2;

/** Quién va ganando la baza en curso: { jugador, f } o null. */
function mejorDeLaBaza(v) {
  const b = v.bazas[v.bazas.length - 1];
  let mejor = null;
  for (let i = 0; i < v.n; i++) {
    const x = (b.abre + i) % v.n;
    const c = b.cartas[x];
    if (!c) continue;
    const f = jerarquia(c);
    if (!mejor || f > mejor.f) mejor = { jugador: x, f };
    else if (f === mejor.f && eq(x) !== eq(mejor.jugador)) mejor = { jugador: null, f }; // parda por ahora
  }
  return mejor;
}

/** Fuerza del equipo para el truco: mis cartas, lo que señaron los compañeros y las bazas. */
function fuerzaTruco(v, senas) {
  const mias = v.miMano.map(jerarquia);
  const deCompas = (senas && senas.cartas || []).map((k) => FUERZA_SENA[k] || 0);
  const todas = [...mias, ...deCompas].sort((a, b) => b - a).slice(0, 3);
  let puntaje = todas.reduce((t, f) => t + Math.max(0, f - 5), 0);
  // el difícil también mira las señas de los rivales: cada brava que mostraron le resta
  for (const k of (senas && senas.rivales) || []) puntaje -= Math.max(0, (FUERZA_SENA[k] || 0) - 8);
  for (const b of v.bazas) {
    if (b.gana === v.equipo) puntaje += 5;
    else if (b.gana !== null && b.gana !== "parda") puntaje -= 5;
  }
  return { puntaje, buenas: todas.filter((f) => f >= 9).length };
}

/** La última orden que dio el pie en la baza en curso (o null). */
function ordenDeLaBaza(v, senas) {
  const baza = v.bazas.length - 1;
  const o = ((senas && senas.ordenes) || []).filter((x) => x.baza === baza);
  return o.length ? o[o.length - 1] : null;
}

/** Lectura del rival al cantarle truco: si lo canta habiendo perdido la primera baza, probablemente va de farol (+2); si ya ganó la primera, va con respaldo (-1). */
function leerRival(v, p) {
  const b0 = v.bazas[0];
  if (!b0 || b0.gana == null || b0.gana === "parda" || eq(p.de) === v.equipo) return 0;
  return b0.gana === v.equipo ? 2 : -1;
}

function elegirCarta(v, jugar, senas) {
  const mias = jugar.map((a) => ({ a, f: jerarquia(a.carta) })).sort((x, y) => x.f - y.f);
  const b = v.bazas[v.bazas.length - 1];
  const yaJugaron = b.cartas.filter(Boolean).length;
  const quedanRivales = Array.from({ length: v.n }, (_, x) => x)
    .filter((x) => eq(x) !== v.equipo && b.cartas[x] === null).length;
  const mejor = mejorDeLaBaza(v);
  // lo que dijo el pie vale más que mi criterio: una persona lo obedece
  const orden = ordenDeLaBaza(v, senas);
  if (orden) {
    const bajaNomas = mejor && mejor.jugador !== null && eq(mejor.jugador) === v.equipo && !quedanRivales;
    if (orden.k === "p_pasa") return mias[0].a;                         // «pasá, que voy yo»: tiro la más baja
    if (orden.k === "p_mata" && mejor) {                                // «matala si podés»: la más baja que la gana
      if (bajaNomas) return mias[0].a;
      const ganan = mias.filter((x) => x.f > mejor.f);
      return (ganan.length ? ganan[0] : mias[0]).a;
    }
    if (orden.vamos !== undefined) {                                    // «¡vamos a…!»: si es mi carta, la mejor; si no, no compito
      if (orden.vamos !== v.yo || bajaNomas) return mias[0].a;
      return mias[mias.length - 1].a;
    }
  }
  if (!yaJugaron) {
    if (v.bazas.length === 1) {
      // si un compañero señó una brava, abro bajo y que la juegue él (salvo que yo también tenga una)
      const bravaDeCompa = ((senas && senas.cartas) || []).some((k) => (FUERZA_SENA[k] || 0) >= 12);
      if (bravaDeCompa && mias[mias.length - 1].f < 12) return mias[0].a;
      return mias[Math.floor(mias.length / 2)].a;
    }
    return mias[mias.length - 1].f >= 10 ? mias[mias.length - 1].a : mias[0].a;
  }
  if (mejor && mejor.jugador !== null && eq(mejor.jugador) === v.equipo) {
    // la baza es nuestra: si ya no quedan rivales o la carta del compañero es brava, tiro la más baja
    if (!quedanRivales || mejor.f >= 11) return mias[0].a;
  }
  const ganan = mias.filter((x) => x.f > mejor.f);
  if (ganan.length) return (quedanRivales ? ganan[ganan.length - 1] : ganan[0]).a;
  const empata = mias.find((x) => x.f === mejor.f);
  if (empata && v.bazas.length === 1) return empata.a;
  return mias[0].a;
}

function decidir(v, acc, rnd, senas, base) {
  const farol = (prob) => base() < prob;   // el farol no depende de la dificultad: un buen jugador miente siempre igual
  const hay = (t, c) => acc.find((a) => a.t === t && (c === undefined || a.c === c));
  if (acc.length === 1) return acc[0];
  if (hay("mostrar")) return hay("mostrar");
  if (hay("seguir")) return hay("seguir");
  if (hay("en_mesa") && rnd() < 0.6) return hay("en_mesa");

  const propias = [...v.miMano, ...v.bazas.map((b) => b.cartas[v.yo]).filter(Boolean)];
  const tanto = tantoDe(propias);
  if (hay("son_mejores") && hay("son_buenas")) { // el bot no miente con el número: dice la verdad
    const lider = Math.max(-1, ...(v.envido?.tantos || []).filter((x) => x != null));
    return tanto > lider ? hay("son_mejores") : hay("son_buenas");
  }
  const flor = v.flor && esFlor(propias) ? tantoFlor(propias) : null;
  const p = v.cantoPendiente;
  const atras = v.puntos[1 - v.equipo] - v.puntos[v.equipo];
  // el pie decide por el equipo: suma lo que le señaron
  const tantoEquipo = Math.max(tanto, (senas && senas.tanto) || 0);

  if (hay("canto", "flor")) return hay("canto", "flor");

  if (p && ["flor", "contraflor", "contraflor_al_resto"].includes(p.c)) {
    if (p.c === "flor") {
      if (flor >= 34) return hay("canto", "contraflor_al_resto");
      if (flor >= 29) return hay("canto", "contraflor");
      return hay("con_flor_me_achico");
    }
    if (p.c === "contraflor" && flor >= 35 && hay("canto", "contraflor_al_resto")) return hay("canto", "contraflor_al_resto");
    return flor >= (p.c === "contraflor" ? 31 : 33) ? hay("quiero") : hay("no_quiero");
  }

  if (p && ENVIDOS.includes(p.c)) {
    // lo que dijo el compañero cuenta como un tanto de equipo: con «tengo envido» (28) se quiere el envido y el real
    const umbral = { envido: 27, real_envido: 28, falta_envido: 30 }[p.c] - (atras >= 6 ? 1 : 0);
    const subida = hay("canto", "real_envido") || hay("canto", "falta_envido");
    if (tantoEquipo >= umbral + 4 && subida) return subida;
    if (tantoEquipo >= umbral) return hay("quiero");
    if (subida && rnd() < 0.05) return subida;
    return hay("no_quiero");
  }

  if (p && p.c === "truco" && hay("canto", "envido") && (tanto >= 28 || farol(0.04))) {
    return tanto >= 31 ? hay("canto", "real_envido") : hay("canto", "envido");
  }

  if (p && TRUCOS.includes(p.c)) {
    const { puntaje: base0, buenas } = fuerzaTruco(v, senas);
    const puntaje = base0 + leerRival(v, p);
    const umbral = { truco: 6, retruco: 10, vale_cuatro: 13 }[p.c] - (atras >= 5 ? 2 : 0);   // atrás en el tanteador se arriesga más
    const subir = acc.find((a) => a.t === "canto" && TRUCOS.includes(a.c));
    if (subir && (puntaje >= umbral + 6 || farol(0.04))) return subir;
    if (puntaje >= umbral || (p.c === "truco" && buenas >= 2) || rnd() < 0.08) return hay("quiero");
    return hay("no_quiero");
  }

  if (hay("canto", "envido")) {
    if (tanto >= 31) return atras >= 8 && hay("canto", "falta_envido") ? hay("canto", "falta_envido") : hay("canto", "real_envido");
    if (tanto >= 28) return hay("canto", "envido");
    if (tanto <= 24 && v.bazas.length === 1 && farol(0.08)) return hay("canto", "envido");   // farol de envido
  }

  const subirTruco = acc.find((a) => a.t === "canto" && TRUCOS.includes(a.c));
  if (subirTruco) {
    const { puntaje, buenas } = fuerzaTruco(v, senas);
    const umbral = { truco: 12, retruco: 15, vale_cuatro: 18 }[subirTruco.c];
    const faroleable = v.bazas.length === 1 || v.bazas.every((b) => b.gana !== (1 - v.equipo));   // no se miente habiendo perdido bazas
    if ((subirTruco.c === "truco" && buenas >= 2) || puntaje >= umbral || (faroleable && farol(subirTruco.c === "truco" ? 0.1 : 0.03))) return subirTruco;
  }

  // si un compañero ya se fue al mazo y la mano es floja con el truco en juego, lo sigue
  const seFueUnCompa = (v.alMazo || []).some((m, x) => m && x !== v.yo && eq(x) === v.equipo);
  if (seFueUnCompa && hay("mazo") && v.truco.nivel >= 2 && fuerzaTruco(v, senas).puntaje < 5 && rnd() < 0.7) return hay("mazo");

  const jugar = acc.filter((a) => a.t === "jugar");
  if (jugar.length) return elegirCarta(v, jugar, senas);
  return acc.find((a) => a.t !== "mazo") || acc[0];
}

/**
 * Dificultad: cambia el azar con que el bot comete errores y miente.
 * fácil = números bajos (acepta y miente al tuntún, a veces tira cualquier carta);
 * difícil = números altos (casi no se equivoca). Sirve también para el bot de 1 contra 1.
 */
export function azarDe(nivel, base = Math.random) {
  if (nivel === "facil") return () => base() * 0.55;
  if (nivel === "dificil") return () => 0.45 + base() * 0.55;
  return base;
}

/** Elige una acción para la vista de equipos. `azar`, `senas` y `nivel` son opcionales. */
export function elegir(vista, { azar, senas, nivel = "normal" } = {}) {
  const acc = vista.acciones || [];
  if (!acc.length) return null;
  const base = azar || generador(semillaDe(vista));
  const rnd = azarDe(nivel, base);
  let decision;
  const jugar = acc.filter((a) => a.t === "jugar");
  if (nivel === "facil" && vista.fase === "jugando" && jugar.length && base() < 0.4) {
    decision = jugar[Math.floor(base() * jugar.length)]; // el fácil a veces tira cualquiera
  } else if (vista.tipoMano === "punta" && vista.miDuelo && vista.fase === "jugando") {
    decision = Bot.elegir({ ...vista.miDuelo.vista, acciones: acc }, rnd);
  } else if (vista.fase !== "jugando") {
    decision = acc.find((a) => a.t === "mostrar") || acc.find((a) => a.t === "seguir") || acc[0];
  } else {
    decision = decidir(vista, acc, rnd, senas, base);
  }
  return (decision && acc.find((a) => mismaAccion(a, decision))) || acc[0];
}
