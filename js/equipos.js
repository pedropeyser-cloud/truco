// Motor del truco por equipos: mesa de 4 (2 contra 2) y de 6 (3 contra 3), con punta y hacha opcional.
// Módulo ES sin DOM ni red, como motor.js. Estado plano serializable a JSON.
//
// Asientos 0..n-1 alrededor de la mesa; los pares son el equipo 0 y los impares el equipo 1.
// Se juega en orden de asiento a partir de la mano. Los cantos los contesta el pie de cada equipo
// (el último en jugar); el resto del equipo le pasa información con señas.
// Punta y hacha: manos de a uno contra uno (en la de 6, contra el de enfrente; en la de 4, contra el
// de al lado). Cada duelo es una mano de motor.js y lo que gana suma para su equipo.

import * as M from "./motor.js";

const { jerarquia, tantoDe, tantoFlor, esFlor, cartasDelTanto, subidasEnvido, envidoNoQuerido,
  florNoQuerida, ganadorPorBazas, PALOS, NUMEROS } = M;

const NIVEL_TRUCO = { truco: 2, retruco: 3, vale_cuatro: 4 };
const CANTO_DE_NIVEL = { 2: "truco", 3: "retruco", 4: "vale_cuatro" };
const NOMBRE_NIVEL = { 1: "mano", 2: "truco", 3: "retruco", 4: "vale cuatro" };
const ENVIDOS = ["envido", "real_envido", "falta_envido"];
const VALOR_ENVIDO = { envido: 2, real_envido: 3 };

export const equipoDe = (j) => j % 2;
const rival = (eq) => 1 - eq;
const canto = (c) => ({ t: "canto", c });

/** Parejas de punta y hacha. */
export function parejas(n) {
  return n === 4 ? [[0, 1], [2, 3]] : [[0, 3], [1, 4], [2, 5]];
}

/** Tramo en que se alternan las manos de punta y hacha: 5 a 25 (a 30) o 3 a 12 (a 15). */
export function tramoPunta(meta) {
  return meta === 30 ? [5, 25] : [3, 12];
}

// ---------- Azar con semilla (mulberry32, igual que motor.js) ----------

function azar(s) {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function barajar(s) {
  const mazo = [];
  for (const palo of PALOS) for (const n of NUMEROS) mazo.push(`${n}-${palo}`);
  for (let i = mazo.length - 1; i > 0; i--) {
    const k = Math.floor(azar(s) * (i + 1));
    [mazo[i], mazo[k]] = [mazo[k], mazo[i]];
  }
  return mazo;
}

// ---------- Estado ----------

/** Asientos en orden de juego a partir de la mano. */
function orden(s) {
  return Array.from({ length: s.n }, (_, i) => (s.mano + i) % s.n);
}

/** El pie de un equipo: su último jugador en el orden de la mano. */
export function pieDe(s, eq) {
  const o = orden(s).filter((j) => equipoDe(j) === eq && !(s.alMazo && s.alMazo[j]));
  return o[o.length - 1];
}

function limpiarMano(s) {
  const n = s.n;
  s.tipoMano = "redonda";
  s.manos = Array.from({ length: n }, () => []);
  s.enMano = Array.from({ length: n }, () => []);
  s.bazas = [];
  s.turno = s.mano;
  s.truco = { nivel: 1, quienPuedeSubir: null }; // quienPuedeSubir: equipo
  s.pendiente = null;        // { tipo, c, de: asiento, responde: asiento }
  s.trucoSuspendido = null;
  s.envido = null;
  s.florCantada = null;
  s.ganadorBazas = null;     // equipo
  s.cierreTruco = null;
  s.bonoMazo = null;         // equipo
  s.mazo = null;             // equipo que se fue al mazo entero
  s.alMazo = Array(n).fill(false); // quién se fue al mazo (de a uno: los compañeros pueden seguir)
  s.listos = Array(n).fill(false);
  s.puntosPrevios = null;
  s.duelos = null;           // en punta y hacha: [{ jugadores: [a, b], estado }]
}

export function nuevaPartida({ jugadores = 4, meta = 15, flor = false, puntaYHacha = false, nombres, semilla } = {}) {
  if (jugadores !== 4 && jugadores !== 6) throw new Error("jugadores tiene que ser 4 o 6");
  if (meta !== 15 && meta !== 30) throw new Error("meta tiene que ser 15 o 30");
  const sem = Number.isFinite(semilla) ? semilla >>> 0 : Math.floor(Math.random() * 4294967296);
  const s = {
    modo: "equipos", n: jugadores, meta, flor: !!flor, puntaYHacha: !!puntaYHacha,
    nombres: Array.from({ length: jugadores }, (_, i) => (nombres && nombres[i]) || `Jugador ${i + 1}`),
    semilla: sem, rng: sem,
    puntos: [0, 0], mano: 0, numeroMano: 0, ultimaFuePunta: false,
    fase: "fin_mano", ganador: null, resumenMano: null, ultimo: null,
    poderes: { peluca: Array(jugadores).fill(0), trampa: Array(jugadores).fill(0) },
  };
  limpiarMano(s);
  s.mano = Math.floor(azar(s) * jugadores);
  s.turno = s.mano;
  return s;
}

/** Objetos de la gloria (ver motor.js): { peluca: [0|1 por asiento], trampa: [0|1 por asiento] }. */
export function darPoderes(estado, poderes) {
  const s = structuredClone(estado);
  s.poderes = { peluca: Array(s.n).fill(0), trampa: Array(s.n).fill(0) };
  for (const k of ["peluca", "trampa"]) for (let j = 0; j < s.n; j++) s.poderes[k][j] = poderes?.[k]?.[j] ? 1 : 0;
  return s;
}
const poder = (s, k, j) => (s.poderes?.[k]?.[j] || 0) > 0;
/** Peluca: sirve si sos el último de tu equipo en la mano (el que se va deja al equipo sin la mano). */
const ultimoDeSuEquipo = (s, j) => Array.from({ length: s.n }, (_, x) => x).every((x) => x === j || equipoDe(x) !== equipoDe(j) || s.alMazo[x]);
/** Rivales a los que se les puede hacer la trampa (antes del envido o la flor, con cartas en la mano). */
const blancosTrampa = (s, j) => (!poder(s, "trampa", j) || s.envido || s.florCantada ? [] :
  Array.from({ length: s.n }, (_, x) => x).filter((x) => equipoDe(x) !== equipoDe(j) && !s.alMazo[x] && s.enMano[x].length > 0));

/** ¿La próxima mano es de punta y hacha? */
function tocaPunta(s) {
  if (!s.puntaYHacha || s.ultimaFuePunta) return false;
  const [lo, hi] = tramoPunta(s.meta);
  return s.puntos.every((p) => p >= lo && p <= hi);
}

export function repartir(estado) {
  if (estado.fase === "fin_partida") throw new Error("la partida ya terminó");
  if (estado.fase === "jugando") throw new Error("la mano todavía no terminó");
  const s = structuredClone(estado);
  if (s.numeroMano > 0) s.mano = (s.mano + 1) % s.n;
  s.numeroMano++;
  const punta = tocaPunta(s);
  limpiarMano(s);
  const mazo = barajar(s);
  const n = s.n;
  orden(s).forEach((j, i) => { s.manos[j] = [mazo[i], mazo[i + n], mazo[i + 2 * n]]; });
  s.enMano = s.manos.map((m) => [...m]);
  s.fase = "jugando";
  s.resumenMano = null;
  s.puntosPrevios = [...s.puntos];
  s.ultimaFuePunta = punta;
  if (punta) {
    s.tipoMano = "punta";
    armarDuelos(s);
  } else {
    s.bazas = [{ cartas: Array(n).fill(null), gana: null, abre: s.mano }];
  }
  const eventos = [{ t: "reparto", mano: s.mano, tipo: s.tipoMano }];
  s.ultimo = eventos[0];
  return { estado: s, eventos };
}

function armarDuelos(s) {
  const o = orden(s);
  s.duelos = parejas(s.n).map(([a, b]) => {
    const [x, y] = o.indexOf(a) < o.indexOf(b) ? [a, b] : [b, a]; // es mano el que juega antes
    let d = M.nuevaPartida({ meta: s.meta, flor: s.flor, nombres: [s.nombres[x], s.nombres[y]],
      semilla: Math.floor(azar(s) * 4294967296) });
    d = M.repartir(d).estado;
    d.manos = [[...s.manos[x]], [...s.manos[y]]];
    d.enMano = [[...s.manos[x]], [...s.manos[y]]];
    d.mano = 0;
    d.turno = 0;
    d.bazas[0].abre = 0;
    d.puntos = [s.puntos[equipoDe(x)], s.puntos[equipoDe(y)]];
    return { jugadores: [x, y], estado: d };
  });
}

function dueloDe(s, j) {
  const k = s.duelos.findIndex((d) => d.jugadores.includes(j));
  return { k, local: s.duelos[k].jugadores.indexOf(j) };
}

// ---------- Consultas (mano redonda) ----------

const enPrimera = (s) => s.bazas.length === 1 && s.bazas[0].gana === null;
const jugoEnPrimera = (s, j) => s.bazas[0].cartas[j] !== null;
const tieneFlor = (s, j) => s.flor && esFlor(s.manos[j]);
const jugadasDe = (s, j) => s.bazas.map((b) => b.cartas[j]).filter(Boolean);
const conFlor = (s, eq) => orden(s).filter((j) => equipoDe(j) === eq && !s.alMazo[j] && tieneFlor(s, j));
/** El siguiente que todavía tiene que tirar en la baza en curso (salteando a los que se fueron), o null. */
function siguienteEnBaza(s, desde) {
  const b = s.bazas[s.bazas.length - 1];
  for (let i = 0; i < s.n; i++) {
    const x = (desde + i) % s.n;
    if (!s.alMazo[x] && b.cartas[x] === null) return x;
  }
  return null;
}

function actor(s) {
  if (s.fase !== "jugando" || s.tipoMano !== "redonda") return null;
  if (s.envido && s.envido.estado === "querido") return s.envido.habla;
  if (s.pendiente) return s.pendiente.responde;
  return s.turno;
}

function puedeCantarEnvido(s, j) {
  return !tieneFlor(s, j) && !s.florCantada && !s.envido && enPrimera(s)
    && !jugoEnPrimera(s, j) && s.truco.nivel === 1;
}

function puedeCantarFlor(s, j, respondiendoEnvido = false) {
  if (!tieneFlor(s, j) || s.florCantada || !enPrimera(s) || s.truco.nivel !== 1) return false;
  return respondiendoEnvido || (!s.envido && !jugoEnPrimera(s, j));
}

function faltaPara(s, receptor) {
  const lider = Math.max(...s.puntos);
  if (s.meta === 30 && lider < 15) return s.meta - s.puntos[receptor];
  return s.meta - lider;
}

function envidoQuerido(s, receptor) {
  const cantos = s.envido.cantos;
  if (cantos[cantos.length - 1].c === "falta_envido") return faltaPara(s, receptor);
  return cantos.reduce((t, x) => t + VALOR_ENVIDO[x.c], 0);
}

function tantoALaVista(s) {
  const e = s.envido;
  if (e.mostrado) return true;
  const jugadas = jugadasDe(s, e.ganadorJugador);
  return cartasDelTanto(s.manos[e.ganadorJugador]).every((id) => jugadas.includes(id));
}

/** El ganador del envido dijo más de lo que tenía. */
function mintio(s) {
  const e = s.envido, g = e.ganadorJugador;
  return g != null && e.tantos[g] != null && tantoDe(s.manos[g]) < e.tantos[g];
}

function puedeMostrarAlFinal(s, j) {
  const e = s.envido;
  return !!e && e.estado === "resuelto" && j === e.ganadorJugador && e.enMesaPedido && !tantoALaVista(s)
    && s.mazo !== equipoDe(j) && !s.alMazo[j] && !s.listos[j];
}

/** Quién dice el tanto ahora: el siguiente en el orden cuyo equipo va perdiendo (o la mano, al empezar). */
function siguienteQueHabla(s) {
  const e = s.envido;
  const o = orden(s);
  for (let i = e.idx + 1; i < o.length; i++) {
    if (s.alMazo[o[i]]) continue;
    if (!e.lider || equipoDe(o[i]) !== e.lider.equipo) return o[i];
  }
  return null;
}

// ---------- Acciones ----------

export function acciones(estado, jugador) {
  const s = estado;
  const j = jugador;
  if (!Number.isInteger(j) || j < 0 || j >= s.n) return [];

  if (s.fase !== "jugando") {
    const lista = [];
    if (s.fase === "fin_mano" && !s.listos[j]) lista.push({ t: "seguir" });
    if (!s.listos[j]) {
      if (s.tipoMano === "punta" && s.duelos) {
        const { k, local } = dueloDe(s, j);
        if (M.acciones(s.duelos[k].estado, local).some((a) => a.t === "mostrar")) lista.push({ t: "mostrar" });
      } else if (puedeMostrarAlFinal(s, j)) {
        lista.push({ t: "mostrar" });
      }
    }
    return lista;
  }

  if (s.tipoMano === "punta") {
    const { k, local } = dueloDe(s, j);
    const d = s.duelos[k].estado;
    const acc = M.acciones(d, local);
    return d.fase === "jugando" ? acc : acc.filter((a) => a.t === "mostrar");
  }

  const lista = [];
  if (actor(s) === j) {
    const e = s.envido;
    if (e && e.estado === "querido") {
      if (!e.lider) return [{ t: "tanto" }];
      return [{ t: "son_mejores" }, { t: "son_buenas" }]; // se puede mentir
    }
    const p = s.pendiente;
    if (p) {
      if (p.tipo === "truco") {
        lista.push({ t: "quiero" }, { t: "no_quiero" });
        const nivel = NIVEL_TRUCO[p.c];
        if (nivel < 4) lista.push(canto(CANTO_DE_NIVEL[nivel + 1]));
        if (p.c === "truco") { // el envido está primero
          if (puedeCantarEnvido(s, j)) ENVIDOS.forEach((c) => lista.push(canto(c)));
          if (puedeCantarFlor(s, j)) lista.push(canto("flor"));
        }
      } else if (p.tipo === "envido") {
        if (tieneFlor(s, j)) {
          lista.push(canto("flor"));
        } else {
          lista.push({ t: "quiero" }, { t: "no_quiero" });
          subidasEnvido(e.cantos).forEach((c) => lista.push(canto(c)));
        }
      } else if (p.c === "flor") {
        lista.push(canto("contraflor"), canto("contraflor_al_resto"), { t: "con_flor_me_achico" });
      } else {
        lista.push({ t: "quiero" }, { t: "no_quiero" });
        if (p.c === "contraflor") lista.push(canto("contraflor_al_resto"));
      }
      lista.push({ t: "mazo" });
      if (poder(s, "peluca", j) && ultimoDeSuEquipo(s, j)) lista.push({ t: "mazo_peluca" });
    } else {
      for (const carta of s.enMano[j]) lista.push({ t: "jugar", carta });
      if (puedeCantarEnvido(s, j)) ENVIDOS.forEach((c) => lista.push(canto(c)));
      if (puedeCantarFlor(s, j)) lista.push(canto("flor"));
      if (s.truco.nivel === 1) lista.push(canto("truco"));
      else if (s.truco.nivel < 4 && s.truco.quienPuedeSubir === equipoDe(j)) lista.push(canto(CANTO_DE_NIVEL[s.truco.nivel + 1]));
      lista.push({ t: "mazo" });
      if (poder(s, "peluca", j) && ultimoDeSuEquipo(s, j)) lista.push({ t: "mazo_peluca" });
      for (const a of blancosTrampa(s, j)) lista.push({ t: "trampa", a });
    }
  }

  const e = s.envido;
  if (e && e.estado === "resuelto") {
    const oculto = !tantoALaVista(s);
    if (equipoDe(j) !== e.ganador && !e.enMesaPedido && (oculto || mintio(s))) lista.push({ t: "en_mesa" });
    if (j === e.ganadorJugador && e.enMesaPedido && !s.alMazo[j] && oculto) lista.push({ t: "mostrar" });
  }
  return lista;
}

function mismaAccion(a, b) {
  return a.t === b.t && (a.c ?? null) === (b.c ?? null) && (a.carta ?? null) === (b.carta ?? null) && (a.a ?? null) === (b.a ?? null);
}

// ---------- Aplicar ----------

function cerrarFlor(s, ganador, puntos, motivo) {
  Object.assign(s.florCantada, { estado: "resuelta", ganador, puntos, motivo });
  s.pendiente = s.trucoSuspendido;
  s.trucoSuspendido = null;
}

function rechazarEnvido(s, equipoCantor) {
  Object.assign(s.envido, { estado: "no_querido", ganador: equipoCantor, puntos: envidoNoQuerido(s.envido.cantos) });
}

function resolverEnvido(s) {
  const e = s.envido;
  Object.assign(e, { estado: "resuelto", ganador: e.lider.equipo, ganadorJugador: e.lider.jugador, habla: null });
  e.puntos = envidoQuerido(s, e.ganador);
  s.pendiente = s.trucoSuspendido;
  s.trucoSuspendido = null;
}

function avanzarTanto(s, j) {
  const e = s.envido;
  e.idx = orden(s).indexOf(j);
  e.habla = siguienteQueHabla(s);
  if (e.habla === null) resolverEnvido(s);
}

function terminarMano(s, ev) {
  ev.push(...anotarMano(s));
  s.pendiente = null;
  s.trucoSuspendido = null;
  ev.push({ t: "fin_mano" });
  if (s.ganador !== null) ev.push({ t: "fin_partida", ganador: s.ganador });
}

/** Suma las entradas en orden; el primero que llega a la meta gana y no se anota más. */
function sumar(s, entradas) {
  s.puntos = [...s.puntosPrevios];
  s.ganador = null;
  const ev = [];
  const anotadas = [];
  for (const en of entradas) {
    anotadas.push(en);
    s.puntos[en.quien] = Math.min(s.meta, s.puntos[en.quien] + en.puntos);
    ev.push({ t: "puntos", equipo: en.quien, n: en.puntos, motivo: en.motivo, ...(en.duelo !== undefined ? { duelo: en.duelo } : {}) });
    if (s.puntos[en.quien] >= s.meta) { s.ganador = en.quien; break; }
  }
  s.resumenMano = anotadas;
  s.fase = s.ganador !== null ? "fin_partida" : "fin_mano";
  return ev;
}

function anotarMano(s) {
  const entradas = [];
  const fc = s.florCantada;
  if (fc && fc.estado === "resuelta") entradas.push({ quien: fc.ganador, motivo: fc.motivo, puntos: fc.puntos });
  const e = s.envido;
  if (e && e.estado === "no_querido") entradas.push({ quien: e.ganador, motivo: "envido no querido", puntos: e.puntos });
  if (e && e.estado === "resuelto") {
    const oculto = !tantoALaVista(s);
    if (e.enMesaPedido && (oculto || mintio(s))) {
      const perdedor = rival(e.ganador);
      entradas.push({ quien: perdedor, motivo: oculto ? "envido: no mostró las cartas" : "envido: mintió los puntos", puntos: envidoQuerido(s, perdedor) });
    } else {
      entradas.push({ quien: e.ganador, motivo: "envido", puntos: e.puntos });
    }
  }
  if (s.bonoMazo !== null) entradas.push({ quien: s.bonoMazo, motivo: "mazo antes del envido", puntos: 1 });
  entradas.push(s.cierreTruco ?? { quien: s.ganadorBazas, motivo: NOMBRE_NIVEL[s.truco.nivel], puntos: s.truco.nivel });
  return sumar(s, entradas);
}

/** Punta y hacha: junta lo de cada duelo terminado, en orden de duelo. */
function anotarPunta(s) {
  const entradas = [];
  s.duelos.forEach((du, k) => {
    const d = du.estado;
    if (d.fase === "jugando") return;
    for (const en of d.resumenMano || []) {
      entradas.push({ quien: equipoDe(du.jugadores[en.quien]), motivo: en.motivo, puntos: en.puntos, duelo: k });
    }
  });
  return sumar(s, entradas);
}

/** Traduce un evento de un duelo (jugadores 0/1) a asientos y equipos. */
function traducir(e, du, k) {
  const asiento = (l) => du.jugadores[l];
  if (e.t === "listo" || e.t === "fin_partida" || e.t === "puntos" || e.t === "reparto") return null;
  if (e.t === "fin_mano") return { t: "fin_duelo", duelo: k };
  const out = { ...e, duelo: k };
  if ("jugador" in e) out.jugador = asiento(e.jugador);
  if (e.t === "baza") {
    out.gana = e.gana === "parda" ? "parda" : equipoDe(asiento(e.gana));
    out.jugador = e.gana === "parda" ? null : asiento(e.gana);
  }
  return out;
}

export function aplicar(estado, jugador, accion) {
  if (!accion || typeof accion.t !== "string") throw new Error("acción inválida");
  if (!acciones(estado, jugador).some((a) => mismaAccion(a, accion))) {
    throw new Error(`acción no permitida para el jugador ${jugador}: ${JSON.stringify(accion)}`);
  }
  const s = structuredClone(estado);
  if (accion.t === "seguir") {
    s.listos[jugador] = true;
    const listo = { t: "listo", jugador };
    s.ultimo = listo;
    if (!s.listos.every(Boolean)) return { estado: s, eventos: [listo] };
    const r = repartir(s);
    return { estado: r.estado, eventos: [listo, ...r.eventos] };
  }
  const ev = s.tipoMano === "punta" ? aplicarPunta(s, jugador, accion) : aplicarRedonda(s, jugador, accion);
  if (ev.length) s.ultimo = ev[ev.length - 1];
  return { estado: s, eventos: ev };
}

function aplicarPunta(s, j, accion) {
  const { k, local } = dueloDe(s, j);
  const du = s.duelos[k];
  const r = M.aplicar(du.estado, local, accion);
  du.estado = r.estado;
  const ev = r.eventos.map((e) => traducir(e, du, k)).filter(Boolean);
  const todos = s.duelos.every((d) => d.estado.fase !== "jugando");
  if (!todos) return ev;
  if (s.fase === "jugando") {
    ev.push(...anotarPunta(s), { t: "fin_mano" });
    if (s.ganador !== null) ev.push({ t: "fin_partida", ganador: s.ganador });
  } else if (accion.t === "mostrar") { // mostró con la mano terminada: se vuelve a sumar
    const antes = s.ganador;
    anotarPunta(s);
    const env = s.resumenMano.find((x) => x.motivo.startsWith("envido") && x.motivo !== "envido no querido" && x.duelo === k);
    if (env) ev.push({ t: "puntos", equipo: env.quien, n: env.puntos, motivo: env.motivo, duelo: k });
    if (s.ganador !== null && s.ganador !== antes) ev.push({ t: "fin_partida", ganador: s.ganador });
  }
  return ev;
}

/** Pasa el turno al siguiente que tiene que tirar o, si ya tiraron todos los que quedan, cierra la baza. */
function seguirBaza(s, j, ev) {
  const sig = siguienteEnBaza(s, (j + 1) % s.n);
  if (sig !== null) { s.turno = sig; return; }
  // terminó la baza: gana el equipo de la carta más alta; si la más alta la tienen los dos, parda
  const b = s.bazas[s.bazas.length - 1];
  const desdeAbre = Array.from({ length: s.n }, (_, i) => (b.abre + i) % s.n).filter((x) => b.cartas[x]);
  const max = Math.max(...desdeAbre.map((x) => jerarquia(b.cartas[x])));
  const altos = desdeAbre.filter((x) => jerarquia(b.cartas[x]) === max);
  const equipos = new Set(altos.map(equipoDe));
  b.gana = equipos.size === 1 ? equipoDe(altos[0]) : "parda";
  b.ganoJugador = b.gana === "parda" ? null : altos[0];
  ev.push({ t: "baza", gana: b.gana, jugador: b.ganoJugador });
  const g = ganadorPorBazas(s.bazas, equipoDe(s.mano));
  if (g !== null) { s.ganadorBazas = g; terminarMano(s, ev); return; }
  const abre = b.gana === "parda" ? b.abre : b.ganoJugador; // tras una parda abre el mismo que abrió
  s.bazas.push({ cartas: Array(s.n).fill(null), gana: null, abre });
  s.turno = siguienteEnBaza(s, abre);
}

function aplicarRedonda(s, j, accion) {
  const ev = [];
  const p = s.pendiente;
  const eq = equipoDe(j);

  switch (accion.t) {
    case "jugar": {
      const b = s.bazas[s.bazas.length - 1];
      s.enMano[j] = s.enMano[j].filter((x) => x !== accion.carta);
      b.cartas[j] = accion.carta;
      ev.push({ t: "jugada", jugador: j, carta: accion.carta });
      seguirBaza(s, j, ev);
      break;
    }

    case "canto": {
      const c = accion.c;
      ev.push({ t: "canto", jugador: j, c });
      if (c in NIVEL_TRUCO) {
        if (p && p.tipo === "truco") s.truco.nivel = NIVEL_TRUCO[p.c]; // subir es querer lo anterior
        s.pendiente = { tipo: "truco", c, de: j, responde: pieDe(s, rival(eq)) };
      } else if (ENVIDOS.includes(c)) {
        if (p && p.tipo === "truco") s.trucoSuspendido = p;
        if (!s.envido) {
          s.envido = { cantos: [], estado: "cantado", puntos: null, tantos: Array(s.n).fill(null),
            ganador: null, ganadorJugador: null, habla: null, lider: null, idx: -1,
            enMesaPedido: false, mostrado: false };
        }
        s.envido.cantos.push({ c, de: j });
        s.pendiente = { tipo: "envido", c, de: j, responde: pieDe(s, rival(eq)) };
      } else if (c === "flor") {
        if (p && p.tipo === "truco") s.trucoSuspendido = p;
        if (p && p.tipo === "envido") s.envido.estado = "anulado";
        s.pendiente = null;
        s.florCantada = { cantos: [{ c, de: j }], estado: "cantada", puntos: null, ganador: null,
          tantos: Array(s.n).fill(null), motivo: null };
        const contra = conFlor(s, rival(eq));
        if (contra.length) s.pendiente = { tipo: "flor", c, de: j, responde: contra[0] };
        else cerrarFlor(s, eq, 3 * conFlor(s, eq).length, "flor");
      } else { // contraflor, contraflor_al_resto: contesta el que cantó antes
        s.florCantada.cantos.push({ c, de: j });
        s.pendiente = { tipo: "flor", c, de: j, responde: p.de };
      }
      break;
    }

    case "quiero": {
      s.pendiente = null;
      ev.push({ t: "respuesta", jugador: j, r: "quiero" });
      if (p.tipo === "truco") {
        s.truco.nivel = NIVEL_TRUCO[p.c];
        s.truco.quienPuedeSubir = eq;
      } else if (p.tipo === "envido") {
        s.envido.estado = "querido";
        s.envido.idx = -1;
        s.envido.habla = siguienteQueHabla(s);
      } else {
        // contraflor querida: gana la mejor flor; empate, la más cercana a la mano
        let mejor = null;
        for (const x of orden(s)) {
          if (!tieneFlor(s, x)) continue;
          const n = tantoFlor(s.manos[x]);
          s.florCantada.tantos[x] = n;
          ev.push({ t: "tanto", jugador: x, n });
          if (!mejor || n > mejor.n) mejor = { n, x };
        }
        const g = equipoDe(mejor.x);
        if (p.c === "contraflor") cerrarFlor(s, g, 6, "contraflor");
        else cerrarFlor(s, g, faltaPara(s, g), "contraflor al resto");
      }
      break;
    }

    case "no_quiero": {
      s.pendiente = null;
      ev.push({ t: "respuesta", jugador: j, r: "no_quiero" });
      if (p.tipo === "truco") {
        s.cierreTruco = { quien: equipoDe(p.de), motivo: `${NOMBRE_NIVEL[NIVEL_TRUCO[p.c]]} no querido`, puntos: s.truco.nivel };
        terminarMano(s, ev);
      } else if (p.tipo === "envido") {
        rechazarEnvido(s, equipoDe(p.de));
        s.pendiente = s.trucoSuspendido;
        s.trucoSuspendido = null;
      } else {
        cerrarFlor(s, equipoDe(p.de), florNoQuerida(s.florCantada.cantos), `${p.c.replace(/_/g, " ")} no querida`);
      }
      break;
    }

    case "con_flor_me_achico":
      ev.push({ t: "respuesta", jugador: j, r: "con_flor_me_achico" });
      cerrarFlor(s, equipoDe(p.de), 4, "con flor me achico");
      break;

    case "tanto":
    case "son_mejores": {
      const n = M.numeroDicho(accion, tantoDe(s.manos[j]));
      if (accion.t === "son_mejores" && n <= s.envido.lider.n) throw new Error("para «son mejores» hay que decir más");
      s.envido.tantos[j] = n;
      s.envido.lider = { equipo: eq, n, jugador: j };
      if (accion.t === "son_mejores") ev.push({ t: "respuesta", jugador: j, r: "son_mejores" });
      ev.push({ t: "tanto", jugador: j, n });
      avanzarTanto(s, j);
      break;
    }

    case "son_buenas":
      ev.push({ t: "respuesta", jugador: j, r: "son_buenas" });
      avanzarTanto(s, j);
      break;

    case "en_mesa":
      s.envido.enMesaPedido = true;
      ev.push({ t: "en_mesa", jugador: j });
      break;

    case "mostrar": {
      s.envido.mostrado = true;
      ev.push({ t: "mostrar", jugador: j, cartas: cartasDelTanto(s.manos[j]) });
      if (s.fase !== "jugando") {
        const antes = s.ganador;
        anotarMano(s);
        const env = s.resumenMano.find((x) => x.motivo.startsWith("envido") && x.motivo !== "envido no querido");
        if (env) ev.push({ t: "puntos", equipo: env.quien, n: env.puntos, motivo: env.motivo });
        if (s.ganador !== null && s.ganador !== antes) ev.push({ t: "fin_partida", ganador: s.ganador });
      }
      break;
    }

    case "trampa": { // a la mano del rival elegido: una carta suya por una al azar de las que no se repartieron
      const rival = accion.a;
      s.poderes.trampa[j]--;
      const usadas = new Set(s.manos.flat());
      const resto = [];
      for (const palo of PALOS) for (const n of NUMEROS) if (!usadas.has(`${n}-${palo}`)) resto.push(`${n}-${palo}`);
      const vieja = s.enMano[rival][Math.floor(azar(s) * s.enMano[rival].length)];
      const nueva = resto[Math.floor(azar(s) * resto.length)];
      s.enMano[rival] = s.enMano[rival].map((x) => (x === vieja ? nueva : x));
      s.manos[rival] = s.manos[rival].map((x) => (x === vieja ? nueva : x));
      ev.push({ t: "trampa", jugador: j, a: rival });
      break;
    }

    case "mazo_peluca":
    case "mazo": {
      const peluca = accion.t === "mazo_peluca";
      if (peluca) s.poderes.peluca[j]--;
      ev.push({ t: "mazo", jugador: j, ...(peluca ? { peluca: true } : {}) });
      s.alMazo[j] = true;
      if (pieDe(s, eq) !== undefined) { // quedan compañeros: siguen jugando sin él
        if (p && p.responde === j) { // le tocaba contestar: contesta el compañero
          if (p.tipo !== "flor") p.responde = pieDe(s, eq);
          else if (conFlor(s, eq).length) p.responde = conFlor(s, eq)[0];
          else {
            s.pendiente = null;
            if (p.c === "flor") cerrarFlor(s, equipoDe(p.de), 4, "con flor me achico");
            else cerrarFlor(s, equipoDe(p.de), florNoQuerida(s.florCantada.cantos), `${p.c.replace(/_/g, " ")} no querida`);
          }
        }
        if (s.trucoSuspendido && s.trucoSuspendido.responde === j) s.trucoSuspendido.responde = pieDe(s, eq);
        if (!s.pendiente && s.turno === j) seguirBaza(s, j, ev);
        break;
      }
      // se fue el último del equipo: el equipo pierde la mano
      if (p && p.tipo === "envido") rechazarEnvido(s, equipoDe(p.de));
      if (p && p.tipo === "flor") {
        if (p.c === "flor") cerrarFlor(s, equipoDe(p.de), 4, "con flor me achico");
        else cerrarFlor(s, equipoDe(p.de), florNoQuerida(s.florCantada.cantos), `${p.c.replace(/_/g, " ")} no querida`);
      }
      if (!peluca && !s.envido && !s.florCantada && enPrimera(s) && s.truco.nivel === 1) s.bonoMazo = rival(eq);
      s.mazo = eq;
      s.cierreTruco = { quien: rival(eq), motivo: peluca ? "mazo con peluca" : "mazo", puntos: peluca ? 0 : s.truco.nivel };
      terminarMano(s, ev);
      break;
    }

    default:
      throw new Error(`acción desconocida: ${accion.t}`);
  }
  return ev;
}

// ---------- Vista ----------

function vistaEnvido(s) {
  const e = s.envido;
  if (!e) return null;
  let puntos = e.puntos;
  if (e.estado === "querido") {
    const conFalta = e.cantos[e.cantos.length - 1].c === "falta_envido";
    const enMalas = s.meta === 30 && Math.max(...s.puntos) < 15;
    puntos = conFalta && enMalas ? null : envidoQuerido(s, 0);
  }
  let mostradas = [];
  if (e.estado === "resuelto") {
    const cartas = cartasDelTanto(s.manos[e.ganadorJugador]);
    const jugadas = jugadasDe(s, e.ganadorJugador);
    mostradas = e.mostrado ? cartas : cartas.filter((id) => jugadas.includes(id));
  }
  const pillado = e.estado === "resuelto" && e.enMesaPedido && tantoALaVista(s) && mintio(s);
  return {
    mintio: pillado, real: pillado ? tantoDe(s.manos[e.ganadorJugador]) : null,
    estado: e.estado, cantos: e.cantos.map((x) => x.c), puntos, tantos: [...e.tantos],
    ganador: e.ganador, ganadorJugador: e.ganadorJugador, habla: e.habla, enMesaPedido: e.enMesaPedido, mostradas,
  };
}

function vistaFlor(s) {
  const f = s.florCantada;
  if (!f) return null;
  return { estado: f.estado, cantos: f.cantos.map((x) => x.c), puntos: f.puntos, tantos: [...f.tantos], ganador: f.ganador };
}

/** Lo que se ve de un duelo desde afuera (o desde adentro, sin la mano del rival). */
function vistaDuelo(du, k) {
  const d = du.estado;
  const [x, y] = du.jugadores;
  const asiento = (l) => (l === 0 ? x : y);
  const pend = d.pendiente;
  return {
    duelo: k, jugadores: [x, y], fase: d.fase,
    bazas: d.bazas.map((b) => ({ cartas: { [x]: b.c0, [y]: b.c1 },
      gana: b.gana === null ? null : b.gana === "parda" ? "parda" : equipoDe(asiento(b.gana)) })),
    truco: d.truco.nivel,
    cantoPendiente: pend ? { c: pend.c, de: asiento(pend.de) } : null,
    resumen: d.fase !== "jugando" && d.resumenMano
      ? d.resumenMano.map((en) => ({ equipo: equipoDe(asiento(en.quien)), motivo: en.motivo, puntos: en.puntos }))
      : null,
  };
}

export function vista(estado, jugador) {
  const s = estado;
  const yo = jugador;
  const base = {
    poderes: { peluca: [...(s.poderes?.peluca || [])], trampa: [...(s.poderes?.trampa || [])] },
    modo: "equipos", n: s.n, yo, equipo: equipoDe(yo), meta: s.meta, flor: s.flor, puntaYHacha: s.puntaYHacha,
    nombres: [...s.nombres], puntos: [...s.puntos], mano: s.mano, numeroMano: s.numeroMano,
    tipoMano: s.tipoMano, pies: [pieDe(s, 0) ?? null, pieDe(s, 1) ?? null], fase: s.fase, listos: [...s.listos],
    alMazo: [...s.alMazo],
    resumenMano: s.resumenMano ? s.resumenMano.map((x) => ({ ...x })) : null,
    ganador: s.ganador, ultimo: s.ultimo ? structuredClone(s.ultimo) : null,
    acciones: acciones(s, yo),
  };
  if (s.tipoMano === "punta" && s.duelos) {
    const { k, local } = dueloDe(s, yo);
    const d = s.duelos[k].estado;
    const actorDuelo = M.vista(d, local).turno;
    return {
      ...base,
      miMano: [...d.enMano[local]],
      cartasEnMano: Array.from({ length: s.n }, (_, x) => { const r = dueloDe(s, x); return s.duelos[r.k].estado.enMano[r.local].length; }),
      turno: actorDuelo === null ? null : s.duelos[k].jugadores[actorDuelo],
      duelos: s.duelos.map(vistaDuelo),
      miDuelo: { duelo: k, local, contra: s.duelos[k].jugadores[1 - local], vista: M.vista(d, local) },
    };
  }
  const trucoEnJuego = (s.pendiente && s.pendiente.tipo === "truco") || s.trucoSuspendido;
  return {
    ...base,
    miMano: [...s.enMano[yo]],
    cartasEnMano: s.enMano.map((m) => m.length),
    turno: actor(s),
    bazas: s.bazas.map((b) => ({ cartas: [...b.cartas], gana: b.gana, abre: b.abre })),
    truco: { nivel: s.truco.nivel, quienPuedeSubir: trucoEnJuego ? null : s.truco.quienPuedeSubir },
    cantoPendiente: s.pendiente ? { c: s.pendiente.c, de: s.pendiente.de, responde: s.pendiente.responde } : null,
    trucoEnSuspenso: s.trucoSuspendido ? { c: s.trucoSuspendido.c, de: s.trucoSuspendido.de } : null,
    envido: vistaEnvido(s),
    florCantada: vistaFlor(s),
    duelos: null, miDuelo: null,
  };
}
