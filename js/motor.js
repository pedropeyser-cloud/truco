// Motor de reglas del truco argentino 1 contra 1.
// Módulo ES sin DOM ni red. El estado es un objeto plano serializable a JSON
// (el anfitrión lo guarda y al invitado le manda solo vistas).

export const PALOS = ["espada", "basto", "oro", "copa"];
export const NUMEROS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

const NIVEL_TRUCO = { truco: 2, retruco: 3, vale_cuatro: 4 };
const CANTO_DE_NIVEL = { 2: "truco", 3: "retruco", 4: "vale_cuatro" };
const NOMBRE_NIVEL = { 1: "mano", 2: "truco", 3: "retruco", 4: "vale cuatro" };
const ENVIDOS = ["envido", "real_envido", "falta_envido"];
const VALOR_ENVIDO = { envido: 2, real_envido: 3 };

// ---------- Cartas ----------

function partir(id) {
  const i = id.indexOf("-");
  return [Number(id.slice(0, i)), id.slice(i + 1)];
}

const FUERZA_POR_NUMERO = { 3: 10, 2: 9, 1: 8, 12: 7, 11: 6, 10: 5, 7: 4, 6: 3, 5: 2, 4: 1 };

/** Fuerza de la carta en el truco: 14 (1 de espada) a 1 (cuatros). */
export function jerarquia(id) {
  const [n, palo] = partir(id);
  if (n === 1 && palo === "espada") return 14;
  if (n === 1 && palo === "basto") return 13;
  if (n === 7 && palo === "espada") return 12;
  if (n === 7 && palo === "oro") return 11;
  const f = FUERZA_POR_NUMERO[n];
  if (!f || !PALOS.includes(palo)) throw new Error(`carta inválida: ${id}`);
  return f;
}

function valorEnvido(id) {
  const n = partir(id)[0];
  return n >= 10 ? 0 : n;
}

/** Cartas que forman el tanto: el mejor par del mismo palo o, si no hay, la de más valor. */
export function cartasDelTanto(ids) {
  let mejor = null;
  let mejorN = -1;
  for (const palo of PALOS) {
    const delPalo = ids.filter((id) => partir(id)[1] === palo)
      .sort((a, b) => valorEnvido(b) - valorEnvido(a));
    if (delPalo.length >= 2) {
      const n = 20 + valorEnvido(delPalo[0]) + valorEnvido(delPalo[1]);
      if (n > mejorN) { mejorN = n; mejor = delPalo.slice(0, 2); }
    }
  }
  if (mejor) return mejor;
  return [[...ids].sort((a, b) => valorEnvido(b) - valorEnvido(a))[0]];
}

/** Tanto de envido de 3 cartas. */
export function tantoDe(ids) {
  const c = cartasDelTanto(ids);
  return c.length === 2 ? 20 + valorEnvido(c[0]) + valorEnvido(c[1]) : valorEnvido(c[0]);
}

export function esFlor(ids) {
  return ids.length === 3 && ids.every((id) => partir(id)[1] === partir(ids[0])[1]);
}

export function tantoFlor(ids) {
  return 20 + ids.reduce((s, id) => s + valorEnvido(id), 0);
}

// ---------- Azar con semilla (mulberry32) ----------

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

function limpiarMano(s) {
  s.manos = [[], []];        // las 3 cartas repartidas (para tanto y flor)
  s.enMano = [[], []];       // las que todavía no jugó
  s.bazas = [];
  s.turno = s.mano;          // a quién le toca tirar carta
  s.truco = { nivel: 1, quienPuedeSubir: null };
  s.pendiente = null;        // canto esperando respuesta: { tipo, c, de }
  s.trucoSuspendido = null;  // truco cantado que espera mientras se resuelve envido o flor
  s.envido = null;
  s.florCantada = null;
  s.ganadorBazas = null;
  s.cierreTruco = null;      // puntos del truco cuando la mano termina por no quiero o mazo
  s.bonoMazo = null;         // jugador que suma 1 porque el rival se fue antes del envido
  s.mazo = null;
  s.listos = [false, false]; // quién ya mandó «seguir» en fin_mano
  s.puntosPrevios = null;    // puntos antes de anotar la mano (para recalcular si muestra al final)
}

export function nuevaPartida({ meta = 15, flor = false, nombres = ["Jugador 1", "Jugador 2"], semilla } = {}) {
  if (meta !== 15 && meta !== 30) throw new Error("meta tiene que ser 15 o 30");
  const sem = Number.isFinite(semilla) ? semilla >>> 0 : Math.floor(Math.random() * 4294967296);
  const s = {
    meta, flor: !!flor, nombres: [nombres[0], nombres[1]],
    semilla: sem, rng: sem,
    puntos: [0, 0], mano: 0, numeroMano: 0,
    fase: "fin_mano", ganador: null, resumenMano: null, ultimo: null,
  };
  limpiarMano(s);
  s.mano = azar(s) < 0.5 ? 0 : 1;
  s.turno = s.mano;
  return s;
}

export function repartir(estado) {
  if (estado.fase === "fin_partida") throw new Error("la partida ya terminó");
  if (estado.fase === "jugando") throw new Error("la mano todavía no terminó");
  const s = structuredClone(estado);
  if (s.numeroMano > 0) s.mano = 1 - s.mano;
  s.numeroMano++;
  limpiarMano(s);
  const mazo = barajar(s);
  const pie = 1 - s.mano;
  s.manos[pie] = [mazo[0], mazo[2], mazo[4]];
  s.manos[s.mano] = [mazo[1], mazo[3], mazo[5]];
  s.enMano = [[...s.manos[0]], [...s.manos[1]]];
  s.bazas = [{ c0: null, c1: null, gana: null, abre: s.mano }];
  s.fase = "jugando";
  s.resumenMano = null;
  const eventos = [{ t: "reparto", mano: s.mano }];
  s.ultimo = eventos[0];
  return { estado: s, eventos };
}

// ---------- Consultas internas ----------

const otro = (j) => 1 - j;
const canto = (c) => ({ t: "canto", c });
const enPrimera = (s) => s.bazas.length === 1 && s.bazas[0].gana === null;
const jugoEnPrimera = (s, j) => s.bazas[0][`c${j}`] !== null;
const tieneFlor = (s, j) => s.flor && esFlor(s.manos[j]);
const jugadasDe = (s, j) => s.bazas.map((b) => b[`c${j}`]).filter(Boolean);

/** Quién tiene que actuar ahora (tirar, responder o decir el tanto). */
function actor(s) {
  if (s.fase !== "jugando") return null;
  if (s.envido && s.envido.estado === "querido") return s.envido.habla;
  if (s.pendiente) return otro(s.pendiente.de);
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

export function subidasEnvido(cantos) {
  const ultimo = cantos[cantos.length - 1].c;
  if (ultimo === "falta_envido") return [];
  const r = [];
  if (ultimo === "envido" && cantos.filter((x) => x.c === "envido").length === 1) r.push("envido");
  if (!cantos.some((x) => x.c === "real_envido")) r.push("real_envido");
  r.push("falta_envido");
  return r;
}

/** Lo que vale la falta para quien la gana: en malas (a 30) le da el partido. */
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

export function envidoNoQuerido(cantos) {
  if (cantos.length === 1) return 1;
  return cantos.slice(0, -1).reduce((t, x) => t + VALOR_ENVIDO[x.c], 0);
}

export function florNoQuerida(cantos) {
  const ultimo = cantos[cantos.length - 1].c;
  if (ultimo === "contraflor_al_resto" && cantos[cantos.length - 2].c === "contraflor") return 6;
  return 4;
}

/** Las cartas del tanto del ganador ya se vieron (las mostró o las jugó boca arriba). */
function tantoALaVista(s) {
  const e = s.envido;
  if (e.mostrado) return true;
  const jugadas = jugadasDe(s, e.ganador);
  return cartasDelTanto(s.manos[e.ganador]).every((id) => jugadas.includes(id));
}

function puedeMostrarAlFinal(s, j) {
  const e = s.envido;
  return !!e && e.estado === "resuelto" && j === e.ganador && e.enMesaPedido && !tantoALaVista(s)
    && s.mazo !== j && !s.listos[j]; // si se fue al mazo o ya aceptó seguir, no puede
}

export function ganadorPorBazas(bazas, mano) {
  const r = bazas.filter((b) => b.gana !== null).map((b) => b.gana);
  for (const j of [0, 1]) if (r.filter((x) => x === j).length >= 2) return j;
  if (r.length < 2) return null;
  const [a, b, c] = r;
  if (a === "parda") {
    if (b !== "parda") return b;
    if (r.length < 3) return null;
    return c !== "parda" ? c : mano;
  }
  if (b === "parda") return a;
  if (r.length < 3) return null;
  return c === "parda" ? a : c;
}

// ---------- Acciones ----------

export function acciones(estado, jugador) {
  const s = estado;
  const j = jugador;
  if (j !== 0 && j !== 1) return [];
  if (s.fase !== "jugando") {
    // Terminada la mano, el ganador del envido todavía puede mostrar hasta que acepte seguir.
    const lista = [];
    if (s.fase === "fin_mano" && !s.listos[j]) lista.push({ t: "seguir" });
    if (puedeMostrarAlFinal(s, j)) lista.push({ t: "mostrar" });
    return lista;
  }

  const lista = [];
  if (actor(s) === j) {
    const e = s.envido;
    if (e && e.estado === "querido") {
      if (j === s.mano) return [{ t: "tanto" }];
      return tantoDe(s.manos[j]) > e.tantos[s.mano] ? [{ t: "son_mejores" }] : [{ t: "son_buenas" }];
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
          lista.push(canto("flor")); // con flor no se juega el envido
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
    } else {
      for (const carta of s.enMano[j]) lista.push({ t: "jugar", carta });
      if (puedeCantarEnvido(s, j)) ENVIDOS.forEach((c) => lista.push(canto(c)));
      if (puedeCantarFlor(s, j)) lista.push(canto("flor"));
      if (s.truco.nivel === 1) lista.push(canto("truco"));
      else if (s.truco.nivel < 4 && s.truco.quienPuedeSubir === j) lista.push(canto(CANTO_DE_NIVEL[s.truco.nivel + 1]));
      lista.push({ t: "mazo" });
    }
  }

  // «Las quiero en mesa»: se puede pedir y mostrar en cualquier momento de la mano, toque o no.
  const e = s.envido;
  if (e && e.estado === "resuelto" && !tantoALaVista(s)) {
    if (j !== e.ganador && !e.enMesaPedido) lista.push({ t: "en_mesa" });
    if (j === e.ganador && e.enMesaPedido) lista.push({ t: "mostrar" });
  }
  return lista;
}

function mismaAccion(a, b) {
  return a.t === b.t && (a.c ?? null) === (b.c ?? null) && (a.carta ?? null) === (b.carta ?? null);
}

// ---------- Aplicar ----------

function cerrarFlor(s, ganador, puntos, motivo) {
  Object.assign(s.florCantada, { estado: "resuelta", ganador, puntos, motivo });
  s.pendiente = s.trucoSuspendido;
  s.trucoSuspendido = null;
}

function rechazarEnvido(s, cantor) {
  Object.assign(s.envido, { estado: "no_querido", ganador: cantor, puntos: envidoNoQuerido(s.envido.cantos) });
}

function resolverEnvido(s, ganador) {
  Object.assign(s.envido, { estado: "resuelto", ganador, habla: null, puntos: envidoQuerido(s, ganador) });
  s.pendiente = s.trucoSuspendido;
  s.trucoSuspendido = null;
}

function terminarMano(s, ev) {
  s.puntosPrevios = [...s.puntos];
  ev.push(...anotarMano(s));
  s.pendiente = null;
  s.trucoSuspendido = null;
  ev.push({ t: "fin_mano" });
  if (s.ganador !== null) ev.push({ t: "fin_partida", ganador: s.ganador });
}

/** Anota la mano desde los puntos previos. Se puede volver a llamar si el ganador muestra al final. */
function anotarMano(s) {
  s.puntos = [...s.puntosPrevios];
  s.ganador = null;
  const ev = [];
  const entradas = [];
  const fc = s.florCantada;
  if (fc && fc.estado === "resuelta") entradas.push({ quien: fc.ganador, motivo: fc.motivo, puntos: fc.puntos });
  const e = s.envido;
  if (e && e.estado === "no_querido") entradas.push({ quien: e.ganador, motivo: "envido no querido", puntos: e.puntos });
  if (e && e.estado === "resuelto") {
    if (e.enMesaPedido && !tantoALaVista(s)) {
      const perdedor = otro(e.ganador);
      entradas.push({ quien: perdedor, motivo: "envido: no mostró las cartas", puntos: envidoQuerido(s, perdedor) });
    } else {
      entradas.push({ quien: e.ganador, motivo: "envido", puntos: e.puntos });
    }
  }
  if (s.bonoMazo !== null) entradas.push({ quien: s.bonoMazo, motivo: "mazo antes del envido", puntos: 1 });
  entradas.push(s.cierreTruco
    ?? { quien: s.ganadorBazas, motivo: NOMBRE_NIVEL[s.truco.nivel], puntos: s.truco.nivel });

  // Se anotan en orden (flor, envido, truco); el primero que llega a la meta gana y no se anota más.
  const anotadas = [];
  for (const en of entradas) {
    anotadas.push(en);
    s.puntos[en.quien] = Math.min(s.meta, s.puntos[en.quien] + en.puntos);
    ev.push({ t: "puntos", jugador: en.quien, n: en.puntos, motivo: en.motivo });
    if (s.puntos[en.quien] >= s.meta) { s.ganador = en.quien; break; }
  }
  s.resumenMano = anotadas;
  s.fase = s.ganador !== null ? "fin_partida" : "fin_mano";
  return ev;
}

export function aplicar(estado, jugador, accion) {
  if (!accion || typeof accion.t !== "string") throw new Error("acción inválida");
  if (!acciones(estado, jugador).some((a) => mismaAccion(a, accion))) {
    throw new Error(`acción no permitida para el jugador ${jugador}: ${JSON.stringify(accion)}`);
  }
  const s = structuredClone(estado);
  if (accion.t === "seguir") { // se reparte cuando los dos aceptaron
    s.listos[jugador] = true;
    const listo = { t: "listo", jugador };
    s.ultimo = listo;
    if (!s.listos.every(Boolean)) return { estado: s, eventos: [listo] };
    const r = repartir(s);
    return { estado: r.estado, eventos: [listo, ...r.eventos] };
  }

  const ev = [];
  const j = jugador;
  const p = s.pendiente;

  switch (accion.t) {
    case "jugar": {
      const b = s.bazas[s.bazas.length - 1];
      s.enMano[j] = s.enMano[j].filter((x) => x !== accion.carta);
      b[`c${j}`] = accion.carta;
      ev.push({ t: "jugada", jugador: j, carta: accion.carta });
      if (b[`c${otro(j)}`] === null) { s.turno = otro(j); break; }
      const f0 = jerarquia(b.c0);
      const f1 = jerarquia(b.c1);
      b.gana = f0 > f1 ? 0 : f1 > f0 ? 1 : "parda";
      ev.push({ t: "baza", gana: b.gana });
      const g = ganadorPorBazas(s.bazas, s.mano);
      if (g !== null) { s.ganadorBazas = g; terminarMano(s, ev); break; }
      const abre = b.gana === "parda" ? b.abre : b.gana; // tras una parda abre el mismo que abrió
      s.bazas.push({ c0: null, c1: null, gana: null, abre });
      s.turno = abre;
      break;
    }

    case "canto": {
      const c = accion.c;
      ev.push({ t: "canto", jugador: j, c });
      if (c in NIVEL_TRUCO) {
        if (p && p.tipo === "truco") s.truco.nivel = NIVEL_TRUCO[p.c]; // subir es querer lo anterior
        s.pendiente = { tipo: "truco", c, de: j };
      } else if (ENVIDOS.includes(c)) {
        if (p && p.tipo === "truco") s.trucoSuspendido = p;
        if (!s.envido) {
          s.envido = { cantos: [], estado: "cantado", puntos: null, tantos: [null, null], ganador: null,
            habla: null, enMesaPedido: false, mostrado: false };
        }
        s.envido.cantos.push({ c, de: j });
        s.pendiente = { tipo: "envido", c, de: j };
      } else if (c === "flor") {
        if (p && p.tipo === "truco") s.trucoSuspendido = p;
        if (p && p.tipo === "envido") s.envido.estado = "anulado";
        s.pendiente = null;
        s.florCantada = { cantos: [{ c, de: j }], estado: "cantada", puntos: null, ganador: null,
          tantos: [null, null], motivo: null };
        if (tieneFlor(s, otro(j))) s.pendiente = { tipo: "flor", c, de: j };
        else cerrarFlor(s, j, 3, "flor");
      } else { // contraflor, contraflor_al_resto
        s.florCantada.cantos.push({ c, de: j });
        s.pendiente = { tipo: "flor", c, de: j };
      }
      break;
    }

    case "quiero": {
      s.pendiente = null;
      ev.push({ t: "respuesta", jugador: j, r: "quiero" });
      if (p.tipo === "truco") {
        s.truco.nivel = NIVEL_TRUCO[p.c];
        s.truco.quienPuedeSubir = j;
      } else if (p.tipo === "envido") {
        s.envido.estado = "querido";
        s.envido.habla = s.mano;
      } else {
        const pie = otro(s.mano);
        const tm = tantoFlor(s.manos[s.mano]);
        const tp = tantoFlor(s.manos[pie]);
        s.florCantada.tantos[s.mano] = tm;
        s.florCantada.tantos[pie] = tp;
        ev.push({ t: "tanto", jugador: s.mano, n: tm }, { t: "tanto", jugador: pie, n: tp });
        const g = tp > tm ? pie : s.mano;
        if (p.c === "contraflor") cerrarFlor(s, g, 6, "contraflor");
        else cerrarFlor(s, g, faltaPara(s, g), "contraflor al resto");
      }
      break;
    }

    case "no_quiero": {
      s.pendiente = null;
      ev.push({ t: "respuesta", jugador: j, r: "no_quiero" });
      if (p.tipo === "truco") {
        s.cierreTruco = { quien: p.de, motivo: `${NOMBRE_NIVEL[NIVEL_TRUCO[p.c]]} no querido`, puntos: s.truco.nivel };
        terminarMano(s, ev);
      } else if (p.tipo === "envido") {
        rechazarEnvido(s, p.de);
        s.pendiente = s.trucoSuspendido;
        s.trucoSuspendido = null;
      } else {
        cerrarFlor(s, p.de, florNoQuerida(s.florCantada.cantos), `${p.c.replace(/_/g, " ")} no querida`);
      }
      break;
    }

    case "con_flor_me_achico":
      ev.push({ t: "respuesta", jugador: j, r: "con_flor_me_achico" });
      cerrarFlor(s, p.de, 4, "con flor me achico");
      break;

    case "tanto": {
      const n = tantoDe(s.manos[j]);
      s.envido.tantos[j] = n;
      s.envido.habla = otro(j);
      ev.push({ t: "tanto", jugador: j, n });
      break;
    }

    case "son_buenas":
      ev.push({ t: "respuesta", jugador: j, r: "son_buenas" });
      resolverEnvido(s, s.mano);
      break;

    case "son_mejores": {
      const n = tantoDe(s.manos[j]);
      s.envido.tantos[j] = n;
      ev.push({ t: "respuesta", jugador: j, r: "son_mejores" }, { t: "tanto", jugador: j, n });
      resolverEnvido(s, j);
      break;
    }

    case "en_mesa":
      s.envido.enMesaPedido = true;
      ev.push({ t: "en_mesa", jugador: j });
      break;

    case "mostrar": {
      s.envido.mostrado = true;
      ev.push({ t: "mostrar", jugador: j, cartas: cartasDelTanto(s.manos[j]) });
      if (s.fase !== "jugando") { // mostró después de terminada la mano: el envido vuelve a él
        const ganadorAntes = s.ganador;
        anotarMano(s);
        const env = s.resumenMano.find((x) => x.motivo === "envido");
        if (env) ev.push({ t: "puntos", jugador: j, n: env.puntos, motivo: "envido" });
        if (s.ganador !== null && s.ganador !== ganadorAntes) ev.push({ t: "fin_partida", ganador: s.ganador });
      }
      break;
    }

    case "mazo": {
      const rival = otro(j);
      ev.push({ t: "mazo", jugador: j });
      // Irse con un canto pendiente es no quererlo.
      if (p && p.tipo === "envido") rechazarEnvido(s, p.de);
      if (p && p.tipo === "flor") {
        if (p.c === "flor") cerrarFlor(s, p.de, 4, "con flor me achico");
        else cerrarFlor(s, p.de, florNoQuerida(s.florCantada.cantos), `${p.c.replace(/_/g, " ")} no querida`);
      }
      if (!s.envido && !s.florCantada && enPrimera(s) && s.truco.nivel === 1) s.bonoMazo = rival;
      s.mazo = j;
      s.cierreTruco = { quien: rival, motivo: "mazo", puntos: s.truco.nivel };
      terminarMano(s, ev);
      break;
    }

    default:
      throw new Error(`acción desconocida: ${accion.t}`);
  }

  if (ev.length) s.ultimo = ev[ev.length - 1];
  return { estado: s, eventos: ev };
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
    const cartas = cartasDelTanto(s.manos[e.ganador]);
    const jugadas = jugadasDe(s, e.ganador);
    mostradas = e.mostrado ? cartas : cartas.filter((id) => jugadas.includes(id));
  }
  return {
    estado: e.estado, cantos: e.cantos.map((x) => x.c), puntos,
    tantos: [...e.tantos], ganador: e.ganador, enMesaPedido: e.enMesaPedido, mostradas,
  };
}

function vistaFlor(s) {
  const f = s.florCantada;
  if (!f) return null;
  return {
    estado: f.estado, cantos: f.cantos.map((x) => x.c), puntos: f.puntos,
    tantos: [...f.tantos], ganador: f.ganador,
  };
}

export function vista(estado, jugador) {
  const s = estado;
  const yo = jugador;
  const trucoEnJuego = (s.pendiente && s.pendiente.tipo === "truco") || s.trucoSuspendido;
  return {
    yo, meta: s.meta, flor: s.flor, nombres: [...s.nombres], puntos: [...s.puntos],
    mano: s.mano, numeroMano: s.numeroMano, turno: actor(s),
    miMano: [...s.enMano[yo]], cartasRival: s.enMano[otro(yo)].length,
    bazas: s.bazas.map((b) => ({ c0: b.c0, c1: b.c1, gana: b.gana })),
    truco: { nivel: s.truco.nivel, quienPuedeSubir: trucoEnJuego ? null : s.truco.quienPuedeSubir },
    cantoPendiente: s.pendiente ? { c: s.pendiente.c, de: s.pendiente.de } : null,
    trucoEnSuspenso: s.trucoSuspendido ? { c: s.trucoSuspendido.c, de: s.trucoSuspendido.de } : null,
    envido: vistaEnvido(s),
    florCantada: vistaFlor(s),
    fase: s.fase,
    listos: [...s.listos],
    resumenMano: s.resumenMano ? s.resumenMano.map((x) => ({ ...x })) : null,
    ganador: s.ganador,
    ultimo: s.ultimo ? structuredClone(s.ultimo) : null,
    acciones: acciones(s, yo),
  };
}
