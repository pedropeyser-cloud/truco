// Rival simple para practicar solo. Mira solo su vista y elige siempre entre vista.acciones.
// Canta envido con 27 o más, truco con dos cartas buenas, responde según su mano
// y de vez en cuando miente un poco.

import { jerarquia, tantoDe, tantoFlor, esFlor } from "./motor.js";

const ENVIDOS = ["envido", "real_envido", "falta_envido"];
const TRUCOS = ["truco", "retruco", "vale_cuatro"];

// Azar reproducible a partir de la vista: la misma situación da la misma decisión.
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

/** Puntaje de la mano para el truco: cartas que quedan y bazas ya definidas. */
function fuerzaTruco(v) {
  const yo = v.yo;
  const rival = 1 - yo;
  const cartas = v.miMano.map(jerarquia).sort((a, b) => b - a);
  let puntaje = cartas.reduce((t, f) => t + Math.max(0, f - 5), 0);
  for (const b of v.bazas) {
    if (b.gana === yo) puntaje += 5;
    else if (b.gana === rival) puntaje -= 5;
  }
  const actual = v.bazas[v.bazas.length - 1];
  if (actual && actual.gana === null && actual[`c${rival}`] && !actual[`c${yo}`]) {
    puntaje += cartas[0] > jerarquia(actual[`c${rival}`]) ? 3 : -3;
  }
  return { puntaje, buenas: cartas.filter((f) => f >= 9).length };
}

function elegirCarta(v, jugar) {
  const yo = v.yo;
  const rival = 1 - yo;
  const mias = jugar.map((a) => ({ a, f: jerarquia(a.carta) })).sort((x, y) => x.f - y.f);
  const actual = v.bazas[v.bazas.length - 1];
  const suya = actual[`c${rival}`];
  if (suya) {
    const fr = jerarquia(suya);
    const ganan = mias.filter((x) => x.f > fr);
    if (ganan.length) return ganan[0].a;
    const empata = mias.find((x) => x.f === fr);
    const ganePrimera = v.bazas[0].gana === yo;
    if (empata && (ganePrimera || v.bazas.length === 1)) return empata.a;
    return mias[0].a;
  }
  if (v.bazas.length === 1) return mias[Math.floor(mias.length / 2)].a; // abrir con la del medio
  const anterior = v.bazas[v.bazas.length - 2];
  if (anterior.gana === "parda") return mias[mias.length - 1].a;
  return mias[mias.length - 1].f >= 10 ? mias[mias.length - 1].a : mias[0].a;
}

function decidir(v, acc, rnd) {
  const hay = (t, c) => acc.find((a) => a.t === t && (c === undefined || a.c === c));
  if (acc.length === 1) return acc[0];
  if (hay("mostrar")) return hay("mostrar");
  if (hay("seguir")) return hay("seguir");
  if (hay("en_mesa") && rnd() < 0.6) return hay("en_mesa");

  const yo = v.yo;
  const propias = [...v.miMano, ...v.bazas.map((b) => b[`c${yo}`]).filter(Boolean)];
  const tanto = tantoDe(propias);
  const flor = v.flor && esFlor(propias) ? tantoFlor(propias) : null;
  const esMano = v.mano === yo;
  const p = v.cantoPendiente;
  const atras = v.puntos[1 - yo] - v.puntos[yo];

  // Flor: si se puede cantar, se canta.
  if (hay("canto", "flor")) return hay("canto", "flor");

  if (p && ["flor", "contraflor", "contraflor_al_resto"].includes(p.c)) {
    if (p.c === "flor") {
      if (flor >= 34) return hay("canto", "contraflor_al_resto");
      if (flor >= 29) return hay("canto", "contraflor");
      return hay("con_flor_me_achico");
    }
    if (p.c === "contraflor" && flor >= 35 && hay("canto", "contraflor_al_resto")) return hay("canto", "contraflor_al_resto");
    const umbral = p.c === "contraflor" ? 31 : 33;
    return flor >= umbral ? hay("quiero") : hay("no_quiero");
  }

  if (p && ENVIDOS.includes(p.c)) {
    const umbral = { envido: 26, real_envido: 28, falta_envido: 30 }[p.c] - (esMano ? 1 : 0);
    const subida = hay("canto", "real_envido") || hay("canto", "falta_envido");
    if (tanto >= umbral + 4 && subida) return tanto >= 32 && hay("canto", "falta_envido") ? hay("canto", "falta_envido") : subida;
    if (tanto >= umbral) return hay("quiero");
    if (subida && rnd() < 0.06) return subida; // mentira
    return hay("no_quiero");
  }

  // El envido está primero: con buen tanto, contestar el truco con envido.
  if (p && p.c === "truco" && hay("canto", "envido") && (tanto >= 27 || rnd() < 0.05)) {
    return tanto >= 31 ? hay("canto", "real_envido") : hay("canto", "envido");
  }

  if (p && TRUCOS.includes(p.c)) {
    const { puntaje } = fuerzaTruco(v);
    const umbral = { truco: 6, retruco: 9, vale_cuatro: 12 }[p.c];
    const subir = acc.find((a) => a.t === "canto" && TRUCOS.includes(a.c));
    if (subir && (puntaje >= umbral + 6 || rnd() < 0.05)) return subir;
    if (puntaje >= umbral || rnd() < 0.1) return hay("quiero");
    return hay("no_quiero");
  }

  // Turno libre: primero el envido, después el truco, después la carta.
  if (hay("canto", "envido")) {
    if (tanto >= 31) return atras >= 8 && hay("canto", "falta_envido") ? hay("canto", "falta_envido") : hay("canto", "real_envido");
    if (tanto >= 27) return hay("canto", "envido");
    if (tanto <= 21 && rnd() < 0.08) return hay("canto", "envido"); // mentira
  }

  const subirTruco = acc.find((a) => a.t === "canto" && TRUCOS.includes(a.c));
  if (subirTruco) {
    const { puntaje, buenas } = fuerzaTruco(v);
    const umbral = { truco: 11, retruco: 14, vale_cuatro: 17 }[subirTruco.c];
    const conDos = subirTruco.c === "truco" && buenas >= 2;
    if (conDos || puntaje >= umbral || rnd() < 0.06) return subirTruco;
  }

  const jugar = acc.filter((a) => a.t === "jugar");
  if (jugar.length) return elegirCarta(v, jugar);
  return acc.find((a) => a.t !== "mazo") || acc[0];
}

/** Elige una acción para la vista dada. `azar` opcional (función que da números en [0, 1)). */
export function elegir(vista, azar) {
  const acc = vista.acciones || [];
  if (!acc.length) return null;
  const rnd = azar || generador(semillaDe(vista));
  const decision = decidir(vista, acc, rnd);
  return (decision && acc.find((a) => mismaAccion(a, decision))) || acc[0];
}
