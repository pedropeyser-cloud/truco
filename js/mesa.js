// Mesa de 4 y de 6 (2 contra 2 y 3 contra 3): sala de espera, caras con señas, bots y punta y hacha.
// El anfitrión tiene la partida (equipos.js) y manda a cada invitado solo su vista. Los gestos (señas, cabeza,
// preguntas del pie) no pasan por el motor: el anfitrión los reparte a todos, rivales incluidos.
import { botonPantalla, alternarPantalla } from "./pantalla.js";
import * as E from "./equipos.js";
import * as BotE from "./bot-equipos.js";
import { tantoDe, jerarquia, esFlor } from "./motor.js";
import { frente, dorso, nombreCarta, idValido } from "./cartas.js";
import * as S from "./sonido.js";
import { abrirSalaGrupo, entrarSala, codigoNuevo, linkMesa } from "./red.js";
import * as K from "./caras.js";
import { selectorTanto, liderDicho } from "./tanto.js";
import * as Perfil from "./perfil.js";
import * as G from "./gloria.js";
import * as C from "./catalogo.js";
import { botonCompartir } from "./compartir.js"; // imagen del resultado (docs/crecer.md, tanda 3)
import * as Emo from "./emotes.js"; // reacciones en la mesa, por PeerJS (docs/crecer.md, tanda 5)

const $ = (s) => document.querySelector(s);
const RATIO = 860 / 600;
const CANTO = { envido: "envido", real_envido: "real envido", falta_envido: "falta envido", truco: "truco", retruco: "retruco", vale_cuatro: "vale cuatro", flor: "flor", contraflor: "contraflor", contraflor_al_resto: "contraflor al resto" };
const BOTON_CANTO = { envido: "Envido", real_envido: "Real envido", falta_envido: "Falta envido", truco: "Truco", retruco: "Quiero retruco", vale_cuatro: "Vale cuatro", flor: "Flor", contraflor: "Contraflor", contraflor_al_resto: "Contraflor al resto" };
const DICHO = { envido: "¡Envido!", envido_envido: "¡Envido, envido!", real_envido: "¡Real envido!", falta_envido: "¡Falta envido!", truco: "¡Truco!", retruco: "¡Quiero retruco!", vale_cuatro: "¡Vale cuatro!", flor: "¡Flor!", contraflor: "¡Contraflor!", contraflor_al_resto: "¡Contraflor al resto!",
  quiero: "¡Quiero!", no_quiero: "No quiero", con_flor_me_achico: "Con flor me achico", son_buenas: "Son buenas", son_mejores: "¡Son mejores!", en_mesa: "Las quiero en mesa", mazo: "Me voy al mazo", envido_primero: "¡El envido está primero!", gane: "¡Ganamos!", perdi: "Otra vez será" };
const ENVIDOS = ["envido", "real_envido", "falta_envido"], TRUCOS = ["truco", "retruco", "vale_cuatro"];
const NOMBRES_BOT = ["El Barajador", "La Tía", "El Tano", "La Abuela", "El Pibe"];
const GLIFO = { mas: "↑", menos: "↓", si: "sí", no: "no" };

let modo = null, estado = null, red = null, codigo = null;
let config = { jugadores: 4, meta: 15, flor: false, puntaYHacha: false, nombre: "" };
let asientos = [];              // anfitrión: [{ tipo: "yo"|"persona"|"bot", nombre, id, conectado }]
let vista = null, elegida = null, confirmaMazo = false, capaCerradaMano = null, bandeja = null;
let senasMano = [], ultimaPregunta = null, numeroManoSenas = -1, ultimoReparto = 0;
let perfilesMesa = [], idsMesa = [], enClasif = false, cuentas = {}, misCuentas = {};
const pruebas = new Map(); // anfitrión: id de conexión → { perfil que dice tener, código }
let probado = false;        // invitado: contesta una sola prueba por mesa // perfiles por asiento (de la base), clasificatoria, cuentas de estilo
const botTimers = new Map();
const cartasEl = new Map();
let carasEl = [];               // por asiento: { el, svg, parar }

// ---------------- guardado ----------------
const guardar = () => { if (modo !== "anfitrion") return; try { localStorage.setItem("truco-mesa", JSON.stringify({ codigo, config, asientos, estado })); } catch {} };
const leerGuardado = () => { try { return JSON.parse(localStorage.getItem("truco-mesa")); } catch { return null; } };
function miId() {
  try { let id = localStorage.getItem("truco-id"); if (!id) { id = Math.random().toString(36).slice(2, 12); localStorage.setItem("truco-id", id); } return id; }
  catch { return Math.random().toString(36).slice(2, 12); }
}
function aviso(txt, ms = 3200) {
  const a = $("#aviso"); a.textContent = txt; a.hidden = false;
  clearTimeout(aviso.t); aviso.t = setTimeout(() => (a.hidden = true), ms);
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ================= ENTRADAS (las llama app.js) =================
export function crearMesa(cfg) {
  if (!window.Peer) return aviso("No cargó la conexión. Revisá internet y recargá.");
  config = { ...cfg }; codigo = codigoNuevo(); modo = "anfitrion"; estado = null;
  asientos = Array.from({ length: config.jugadores }, (_, i) => (i === 0 ? { tipo: "yo", nombre: config.nombre, perfil: Perfil.perfilId() } : null));
  history.replaceState(null, "", `?mesa=${codigo}&host=1`);
  guardar(); mostrarLobby(); conectarAnfitrion();
  Perfil.linkListo(linkMesa(codigo), config.equipos ? "equipo contra equipo" : `de a ${config.jugadores}`);
}

export function practicarMesa(cfg) {
  config = { ...cfg }; modo = "practica";
  asientos = Array.from({ length: config.jugadores }, (_, i) => (i === 0 ? { tipo: "yo", nombre: config.nombre } : { tipo: "bot", nombre: NOMBRES_BOT[i - 1] }));
  empezarPartida();
}

/** Link ?mesa=: el anfitrión que recargó retoma; los demás entran como invitados. Devuelve true si se encargó. */
export function desdeLink(params) {
  const sala = params.get("mesa");
  if (!sala) return false;
  const g = leerGuardado();
  if (params.get("host") && g?.codigo === sala) { reanudarAnfitrion(g); return true; }
  $("#bloque-crear").hidden = true; $("#bloque-invitado").hidden = false;
  $("#bloque-invitado .guia").textContent = "Te invitaron a una mesa de truco en equipo.";
  $("#btn-entrar").onclick = () => entrarComoInvitado(sala);
  return true;
}

// ================= ANFITRIÓN =================
function reanudarAnfitrion(g) {
  config = g.config; codigo = g.codigo; estado = g.estado; asientos = g.asientos; modo = "anfitrion";
  Perfil.linkListo(linkMesa(codigo), config.equipos ? "equipo contra equipo" : `de a ${config.jugadores}`);
  asientos.forEach((a) => { if (a?.tipo === "persona") a.conectado = false; });
  const esperarPeer = () => (window.Peer ? conectarAnfitrion() : setTimeout(esperarPeer, 100));
  if (estado) { abrirJuego(); difundir([]); aviso("Partida recuperada. Los demás vuelven abriendo el link."); mandarPerfiles(); }
  else mostrarLobby();
  esperarPeer();
}

function conectarAnfitrion() {
  red = abrirSalaGrupo(codigo, config.jugadores - 1, {
    alAbrir: () => { const t = $("#txt-lobby"); if (t) t.textContent = "Mesa abierta. Mandá el link."; puntoRed(true); },
    alEntrar: (id, m) => entra(id, String(m.nombre || "Invitado").slice(0, 16), typeof m.perfil === "string" ? m.perfil.slice(0, 40) : null),
    alSalir: (id) => {
      const j = asientos.findIndex((a) => a?.id === id);
      if (j < 0) return;
      asientos[j].conectado = false;
      if (!estado) { asientos[j] = null; renderLobby(); avisarLobby(); }
      else aviso(`${asientos[j].nombre} se desconectó. Puede volver con el link, o lo reemplaza un bot desde el menú.`, 5000);
      guardar();
    },
    alError: (e) => { if (e.type !== "peer-unavailable") aviso("Problema de conexión: " + (e.type || e.message)); },
    alLlamada: (id, call) => recibirLlamadaAnfitrion(id, call),
    alMensaje: (id, m) => {
      const j = asientos.findIndex((a) => a?.id === id);
      if (j < 0) return;
      if (m.t === "accion") hostAplicar(j, m.accion);
      else if (m.t === "gesto") registrarGesto(j, m.tipo, m.k);
      else if (m.t === "voz") registrarVoz(j, !!m.on);
      else if (m.t === "emote") registrarEmote(j, m.k);
      else if (m.t === "revancha" && estado?.fase === "fin_partida") nuevaPartidaMismaMesa();
      else if (m.t === "probado" && pruebas.has(id)) verificarAsiento(id);
    },
  });
}

/** El perfil de un invitado vale recién cuando prueba que es suyo (escribe en la base el código que le paso). */
function pedirPrueba(id, perfil) {
  const codigo = Perfil.nuevoCodigo();
  pruebas.set(id, { perfil, codigo });
  red?.enviar(id, { t: "prueba", codigo });
}
async function verificarAsiento(id) {
  const { perfil, codigo: cod } = pruebas.get(id); pruebas.delete(id);
  const ok = await Perfil.verificar(perfil, `${codigo}:${cod}`);
  const j = asientos.findIndex((a) => a?.id === id);
  if (j < 0) return;
  if (!ok) return aviso(`No pude comprobar la cuenta de ${asientos[j].nombre}: juega sin perfil.`);
  asientos[j].perfil = perfil; guardar(); mandarPerfiles();
}

function entra(id, nombre, perfil = null) {
  let j = asientos.findIndex((a) => a?.id === id);
  // equipo contra equipo: cada uno se sienta del lado de su equipo
  const lado = perfil && config.lados ? config.lados[perfil] : undefined;
  if (j < 0 && !estado) j = asientos.findIndex((a, k) => a === null && (lado === undefined || E.equipoDe(k) === lado));
  if (j < 0 && estado) j = asientos.findIndex((a) => a.tipo === "bot"); // con la partida empezada, toma el lugar de un bot
  if (j < 0) { red.echar(id); return; }
  const volvio = asientos[j]?.id === id;
  const yaProbado = asientos[j]?.id === id && asientos[j]?.perfil === perfil ? perfil : null; // volvió el mismo
  asientos[j] = { tipo: "persona", nombre, id, conectado: true, perfil: yaProbado };
  if (perfil && !yaProbado) pedirPrueba(id, perfil);
  if (estado) {
    estado.nombres[j] = nombre;
    clearTimeout(botTimers.get(j)); botTimers.delete(j);
    guardar();
    aviso(volvio ? `${nombre} volvió` : `${nombre} se sentó a la mesa`);
    difundir([]);
  } else {
    guardar(); renderLobby(); avisarLobby();
    aviso(`${nombre} se sentó a la mesa`);
  }
  mandarPerfiles();
}

/** Anfitrión: manda a todos qué perfil está en cada asiento (y si es clasificatoria). */
function mandarPerfiles() {
  if (modo === "invitado") return;
  idsMesa = asientos.map((a) => (a?.tipo === "yo" ? Perfil.perfilId() : a?.perfil || null));
  enClasif = !!config.clasificatoria;
  red?.enviarTodos({ t: "perfiles", ids: idsMesa, clasificatoria: enClasif });
  aplicarPerfiles(idsMesa);
}
/**
 * Perfiles de cada asiento (de la base): pinta del nombre, gorrita y peluca en la cara y, en el anfitrión, los
 * objetos de cada uno para esta partida (en la clasificatoria, desde Oro 4). Una sola vez por partida.
 */
async function aplicarPerfiles(ids) {
  idsMesa = ids;
  const pf = await Perfil.perfilesDe(ids);
  perfilesMesa = ids.map((id) => (id && pf[id]) || null);
  if (modo !== "invitado" && estado && estado.fase !== "fin_partida" && !estado.poderesListos) {
    const pd = Array.from({ length: estado.n }, (_, j) => G.poderesDe(perfilesMesa[j], enClasif));
    estado = E.darPoderes(estado, { peluca: pd.map((x) => x.peluca), trampa: pd.map((x) => x.trampa) });
    estado.poderesListos = true;
    guardar(); difundir([]);
  } else if (vista) render([], true);
}

function avisarLobby() {
  if (modo !== "anfitrion" || !red) return;
  const lista = asientos.map((a) => (a ? { nombre: a.nombre, tipo: a.tipo === "yo" ? "persona" : a.tipo } : null));
  asientos.forEach((a, j) => { if (a?.tipo === "persona") red.enviar(a.id, { t: "lobby", yo: j, asientos: lista, config: { ...config, nombre: "" } }); });
}

function empezarPartida() {
  asientos = asientos.map((a, i) => a || { tipo: "bot", nombre: NOMBRES_BOT[(i - 1 + NOMBRES_BOT.length) % NOMBRES_BOT.length] });
  estado = E.nuevaPartida({ jugadores: config.jugadores, meta: config.meta, flor: config.flor, puntaYHacha: config.puntaYHacha, nombres: asientos.map((a) => a.nombre) });
  const r = E.repartir(estado); estado = r.estado; cuentas = {};
  guardar(); abrirJuego(); difundir(r.eventos);
  mandarPerfiles();
}

function nuevaPartidaMismaMesa() {
  if (modo === "invitado") return;
  estado = E.nuevaPartida({ jugadores: config.jugadores, meta: config.meta, flor: config.flor, puntaYHacha: config.puntaYHacha, nombres: asientos.map((a) => a.nombre) });
  const r = E.repartir(estado); estado = r.estado; cuentas = {}; Perfil.nuevaPartida(); guardar(); cerrarCapa(); difundir(r.eventos);
  aplicarPerfiles(idsMesa);
}

function hostAplicar(j, accion) {
  let r;
  try { r = E.aplicar(estado, j, accion); }
  catch (e) {
    console.warn("acción rechazada", j, accion, e.message);
    if (asientos[j]?.tipo === "persona") red?.enviar(asientos[j].id, { t: "vista", vista: E.vista(estado, j), eventos: [] });
    return;
  }
  estado = r.estado; guardar(); difundir(r.eventos);
}

function difundir(eventos) {
  if (eventos.some((e) => e.t === "reparto")) { ultimoReparto = Date.now(); senasMano = Array.from({ length: estado.n }, () => []); ultimaPregunta = null; }
  if (modo === "anfitrion") G.contarEventos(cuentas, eventos, estado);
  asientos.forEach((a, j) => {
    if (a.tipo === "yo") recibir(E.vista(estado, j), eventos);
    else if (a.tipo === "persona" && red) red.enviar(a.id, { t: "vista", vista: E.vista(estado, j), eventos });
  });
  if (eventos.some((e) => e.t === "reparto")) planificarSenasBots();
  programarBots();
  if (modo === "anfitrion" && eventos.some((e) => e.t === "fin_partida")) anotarMesa();
}

/** Terminó la partida: la propone el anfitrión; cada invitado con perfil la confirma desde su navegador. */
async function anotarMesa() {
  const tipo = config.equipos ? "equipos" : config.jugadores === 4 ? "2v2" : "3v3";
  const jugadores = asientos.map((a, j) => ({ id: a.tipo === "yo" ? Perfil.perfilId() : a.tipo === "persona" ? a.perfil || null : null, lado: E.equipoDe(j) }));
  const puntos = [...estado.puntos], yo = asientos.findIndex((a) => a.tipo === "yo");
  const id = await Perfil.anotar({ codigo, tipo, meta: estado.meta, puntos, ganador: estado.ganador, jugadores, equipos: config.equipos || null,
    clasificatoria: !!config.clasificatoria, estilo: cuentas[yo] || null });
  cuentas = {};
  if (id) red?.enviarTodos({ t: "anotada", id, puntos });
}

// ---------------- bots ----------------
function programarBots() {
  if (modo === "invitado" || !estado) return;
  asientos.forEach((a, j) => {
    if (a.tipo !== "bot" || botTimers.has(j)) return;
    const acc = E.acciones(estado, j);
    if (!acc.length || acc.every((x) => x.t === "en_mesa")) return;
    const finMano = estado.fase !== "jugando";
    const pausa = (finMano ? 1800 + Math.random() * 900 : 1000 + Math.random() * 1100) + Math.max(0, 3000 - (Date.now() - ultimoReparto));
    botTimers.set(j, setTimeout(() => {
      botTimers.delete(j);
      if (asientos[j]?.tipo !== "bot" || !E.acciones(estado, j).length) return programarBots();
      try { hostAplicar(j, BotE.elegir(E.vista(estado, j), { senas: senasPara(j), nivel: config.dificultad || "normal" })); } catch (e) { console.error(e); }
      programarBots();
    }, pausa));
  });
}

/** Lo que el bot sabe de sus compañeros: las señas de cartas y las respuestas con la cabeza. */
function senasPara(j) {
  const cartas = [], rivales = [], equipo = E.equipoDe(j);
  let tanto = 0;
  senasMano.forEach((lista, x) => {
    if (E.equipoDe(x) !== equipo) { // solo el difícil está atento a las señas de los rivales
      if (config.dificultad === "dificil") for (const g of lista) if (g.tipo === "sena" && g.k !== "nada" && g.k !== "flor") rivales.push(g.k);
      return;
    }
    if (x === j) return;
    for (const g of lista) {
      if (g.tipo === "sena" && g.k !== "nada" && g.k !== "flor") cartas.push(g.k);
      if (g.tipo === "cabeza" && g.a === "p_envido" && g.k === "si") tanto = Math.max(tanto, 28);
      if (g.tipo === "cabeza" && g.a === "p_mas27" && g.k === "mas") tanto = Math.max(tanto, 30);
    }
  });
  return { cartas, tanto, rivales };
}

function planificarSenasBots() {
  if (estado.tipoMano !== "redonda") return;
  const mano = estado.numeroMano;
  asientos.forEach((a, j) => {
    if (a.tipo !== "bot") return;
    const cartas = estado.manos[j];
    const lista = [];
    if (estado.flor && esFlor(cartas)) lista.push("flor");
    cartas.map((c) => ({ c, f: jerarquia(c), k: K.senaDeCarta(c) })).filter((x) => x.k && x.f >= 9)
      .sort((a, b) => b.f - a.f).slice(0, 2).forEach((x) => lista.push(x.k));
    if (!lista.length && Math.random() < 0.6) lista.push("nada");
    lista.forEach((k, i) => setTimeout(() => {
      if (!estado || estado.numeroMano !== mano || estado.fase !== "jugando" || estado.alMazo[j] || asientos[j]?.tipo !== "bot") return;
      registrarGesto(j, "sena", k);
    }, 1800 + i * 1700 + Math.random() * 2600));
  });
}

function respuestaBot(j, k) {
  const mano = estado.manos[j], quedan = estado.enMano[j], tanto = tantoDe(mano);
  const fuerza = quedan.reduce((t, c) => t + Math.max(0, jerarquia(c) - 5), 0);
  switch (k) {
    case "p_envido": return tanto >= 27 ? "si" : "no";
    case "p_mas27": return tanto > 27 ? "mas" : "menos";
    case "p_truco": return quedan.some((c) => jerarquia(c) >= 10) ? "si" : "no";
    case "p_canto": return fuerza >= 11 ? "si" : "no";
    case "p_canto_truco": return fuerza >= 11 ? "si" : "no";
    case "p_canto_envido": return tanto >= 27 ? "si" : "no";
    case "p_puntita": return quedan.some((c) => jerarquia(c) >= 11) ? "si" : "no";
    case "p_mata": case "p_pasa": return "si";
    case "p_mazo": return fuerza < 5 ? "si" : "no";
    case "p_flor": return esFlor(mano) ? "si" : "no";
    default: return /^p_vamos_/.test(k) ? "si" : "no";
  }
}

// ---------------- gestos ----------------
function registrarGesto(j, tipo, k) {
  if (!estado || estado.fase !== "jugando" || estado.tipoMano !== "redonda" || estado.alMazo[j]) return;
  const valido = (tipo === "sena" && K.senaDe(k)) || (tipo === "cabeza" && K.cabezaDe(k)) || (tipo === "pregunta" && puedePreguntar(j, k));
  if (!valido) return;
  const g = { tipo, k, a: tipo === "cabeza" && ultimaPregunta && E.equipoDe(ultimaPregunta.de) === E.equipoDe(j) ? ultimaPregunta.k : null };
  senasMano[j]?.push(g);
  red?.enviarTodos({ t: "gesto", jugador: j, tipo, k });
  if (asientos[j].tipo !== "yo") mostrarGesto(j, tipo, k);
  if (tipo === "pregunta") {
    ultimaPregunta = { de: j, k };
    const mano = estado.numeroMano;
    asientos.forEach((a, b) => {
      if (a.tipo !== "bot" || b === j || E.equipoDe(b) !== E.equipoDe(j) || estado.alMazo[b]) return;
      setTimeout(() => { if (estado.numeroMano === mano) registrarGesto(b, "cabeza", respuestaBot(b, k)); }, 900 + Math.random() * 900);
    });
  }
}

/** El pie pregunta todo; los demás, solo si cantan. «¡Vamos a…!» va a un compañero que sigue en la mano. */
function puedePreguntar(j, k) {
  const p = K.preguntaDe(k);
  if (!p) return false;
  if (p.quien === "todos") return true;
  if (E.pieDe(estado, E.equipoDe(j)) !== j) return false;
  if (p.vamos === undefined) return true;
  return p.vamos !== j && p.vamos < estado.n && E.equipoDe(p.vamos) === E.equipoDe(j) && !estado.alMazo[p.vamos];
}
function textoPregunta(k) {
  const p = K.preguntaDe(k);
  if (!p) return "";
  if (p.vamos === undefined) return p.texto;
  return p.vamos === vista?.yo ? "¡Vamos a la tuya!" : `¡Vamos a ${vista?.nombres[p.vamos] || "vos"}!`;
}

// emotes (tanda 5): el que manda lo ve al toque; el anfitrión valida, pone tope y reenvía a todos
const topeEmote = Emo.tope();
function mandarEmote(k) {
  if (!vista || !topeEmote("yo")) return;
  mostrarEmote(vista.yo, k);
  if (modo === "invitado") red.enviar({ t: "emote", k });
  else registrarEmote(vista.yo, k);
}
function registrarEmote(j, k) {
  if (!Emo.valido(k) || !asientos[j]) return;
  if (asientos[j].tipo !== "yo") { if (!topeEmote(j)) return; if (!Emo.mudo()) mostrarEmote(j, k); }
  red?.enviarTodos({ t: "emote", jugador: j, k });
}
function mostrarEmote(j, k) { if (vista && Emo.valido(k)) bocadillo(j, Emo.textoDe(k))?.classList.add("emote"); }

function hacerGesto(tipo, k) {
  S.desbloquear();
  mostrarGesto(vista.yo, tipo, k);
  if (modo === "invitado") red.enviar({ t: "gesto", tipo, k });
  else registrarGesto(vista.yo, tipo, k);
}

function mostrarGesto(j, tipo, k) {
  const c = carasEl[j];
  if (!c) return;
  if (tipo === "sena") K.senar(c.svg, k);
  else if (tipo === "cabeza") { K.cabecear(c.svg, k); glifo(j, GLIFO[k]); }
  else if (tipo === "pregunta") { const p = K.preguntaDe(k); if (p) { bocadillo(j, textoPregunta(k), true); S.decir(p.voz || k); } }
}

function glifo(j, txt) {
  const c = carasEl[j]; if (!c) return;
  const g = document.createElement("span"); g.className = "glifo"; g.textContent = txt;
  c.el.appendChild(g); setTimeout(() => g.remove(), 1000);
}

// ---------------- micrófono del pie (mantener apretado) ----------------
// El audio va del pie al anfitrión, y el anfitrión lo reenvía a los demás. Lo oyen todos, rivales incluidos.
let micStream = null, hablando = false, misLlamadas = [];
const audios = new Map(), reenvios = new Map(), llamadaDe = new Map();

async function empezarHablar() {
  if (hablando || !vista || vista.pies?.[vista.equipo] !== vista.yo || vista.tipoMano !== "redonda") return;
  hablando = true; renderGestos(vista, medidas());
  try {
    micStream = micStream || await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch { hablando = false; renderGestos(vista, medidas()); return aviso("No pude usar el micrófono. Revisá el permiso del navegador."); }
  if (!hablando) return; // soltó antes de que el navegador diera permiso
  micStream.getAudioTracks().forEach((t) => (t.enabled = true));
  if (modo === "invitado") { misLlamadas = [red.llamar(micStream, { id: miId() })].filter(Boolean); red.enviar({ t: "voz", on: true }); }
  else { misLlamadas = asientos.filter((a) => a.tipo === "persona" && a.conectado).map((a) => red.llamarA(a.id, micStream)).filter(Boolean); registrarVoz(vista.yo, true); }
}
function terminarHablar() {
  if (!hablando) return;
  hablando = false;
  misLlamadas.forEach((c) => { try { c.close(); } catch {} });
  misLlamadas = [];
  micStream?.getAudioTracks().forEach((t) => (t.enabled = false));
  if (modo === "invitado") red.enviar({ t: "voz", on: false }); else if (estado) registrarVoz(vista.yo, false);
  if (vista) renderGestos(vista, medidas());
}
document.addEventListener("pointerup", terminarHablar);
document.addEventListener("pointercancel", terminarHablar);

function recibirLlamadaAnfitrion(id, call) {
  const j = asientos.findIndex((a) => a?.id === id);
  const esPie = j >= 0 && estado?.fase === "jugando" && estado.tipoMano === "redonda" && E.pieDe(estado, E.equipoDe(j)) === j;
  if (!esPie) { try { call.close(); } catch {} return; }
  call.answer();
  llamadaDe.get(id)?.close();
  llamadaDe.set(id, call);
  call.on("stream", (st) => {
    sonar(call, st);
    // reenvío a los demás invitados
    reenvios.set(call, asientos.filter((a) => a.tipo === "persona" && a.conectado && a.id !== id).map((a) => red.llamarA(a.id, st)).filter(Boolean));
  });
  call.on("close", () => cortarLlamada(id, call));
}
function cortarLlamada(id, call) {
  (reenvios.get(call) || []).forEach((c) => { try { c.close(); } catch {} });
  reenvios.delete(call); callar(call);
  if (llamadaDe.get(id) === call) llamadaDe.delete(id);
}
function sonar(call, st) {
  S.desbloquear();
  const a = new Audio(); a.srcObject = st; a.autoplay = true; a.play().catch(() => {});
  audios.set(call, a);
}
function callar(call) { const a = audios.get(call); if (a) { a.pause(); a.srcObject = null; audios.delete(call); } }

function registrarVoz(j, on) {
  if (!on) { const id = asientos[j]?.id; const c = id && llamadaDe.get(id); if (c) { try { c.close(); } catch {} cortarLlamada(id, c); } }
  red?.enviarTodos({ t: "voz", jugador: j, on });
  marcarVoz(j, on);
}
function marcarVoz(j, on) { carasEl[j]?.el.classList.toggle("hablando", on); }

// ================= INVITADO =================
function entrarComoInvitado(sala) {
  if (!window.Peer) return aviso("No cargó la conexión. Revisá internet y recargá.");
  const nombre = ($("#in-nombre-inv").value.trim() || "Invitado").slice(0, 16);
  try { localStorage.setItem("truco-nombre", nombre); } catch {}
  modo = "invitado"; codigo = sala;
  $("#btn-entrar").disabled = true; $("#txt-invitado").textContent = "Buscando la mesa…";
  red = entrarSala(sala, {
    alConectar: () => { red.enviar({ t: "hola", nombre, id: miId(), perfil: Perfil.perfilId() }); $("#txt-invitado").textContent = "Sentándote…"; puntoRed(true); },
    alMensaje: (m) => {
      if (!m || typeof m !== "object") return;
      if (m.t === "lobby") lobbyInvitado(m);
      else if (m.t === "vista") { abrirJuego(); recibir(m.vista, Array.isArray(m.eventos) ? m.eventos : []); }
      else if (m.t === "gesto" && vista && m.jugador !== vista.yo) mostrarGesto(+m.jugador, String(m.tipo), String(m.k));
      else if (m.t === "voz" && vista) marcarVoz(+m.jugador, !!m.on);
      else if (m.t === "emote" && vista && +m.jugador !== vista.yo && Emo.valido(m.k) && !Emo.mudo()) mostrarEmote(+m.jugador, m.k);
      else if (m.t === "anotada" && vista) Perfil.confirmar(m.id, m.puntos, vista.puntos, { clasif: enClasif, estilo: misCuentas[vista.yo] || null }).then(() => { misCuentas = {}; });
      // la prueba se ata a ESTA mesa (la del link que abrí) y se contesta una sola vez: no se puede reenviar a otra mesa
      else if (m.t === "prueba" && typeof m.codigo === "string" && !probado) { probado = true; Perfil.probar(`${codigo}:${m.codigo.slice(0, 24)}`).then((ok) => ok && red.enviar({ t: "probado" })); }
      else if (m.t === "perfiles" && Array.isArray(m.ids)) { enClasif = m.clasificatoria === true; aplicarPerfiles(m.ids.slice(0, 6).map((x) => (typeof x === "string" ? x.slice(0, 40) : null))); }
      else if (m.t === "lleno") { $("#txt-invitado").textContent = "La mesa ya está completa."; red.cerrar(); }
    },
    alCortar: () => { puntoRed(false); aviso("Se cortó la conexión. Reconectando…"); },
    alLlamada: (call) => { call.answer(); call.on("stream", (st) => sonar(call, st)); call.on("close", () => callar(call)); },
    alError: (e) => { if (e.type === "peer-unavailable") { const t = "No encuentro la mesa. ¿El que te invitó tiene la pestaña abierta? Reintento solo."; if ($("#mesa-eq").hidden) $("#txt-invitado").textContent = t; else aviso(t); } },
  });
}

function lobbyInvitado(m) {
  $("#bloque-invitado").hidden = true; $("#bloque-lobby").hidden = false;
  $("#lobby-link").hidden = true; $("#btn-repartir").hidden = true;
  $("#txt-lobby").textContent = "Esperando que reparta el que te invitó…";
  pintarAsientosLobby(m.asientos || [], +m.yo, m.config || {});
}

// ================= SALA DE ESPERA =================
function mostrarLobby() {
  $("#bloque-crear").hidden = true; $("#bloque-invitado").hidden = true; $("#bloque-espera").hidden = true; $("#bloque-lobby").hidden = false;
  $("#lobby-link").hidden = false;
  $("#txt-link-mesa").textContent = linkMesa(codigo);
  $("#btn-copiar-mesa").onclick = copiarLink;
  $("#btn-compartir-mesa").hidden = !navigator.share;
  $("#btn-compartir-mesa").onclick = () => navigator.share({ title: "Truco", text: `${config.nombre || "Te"} te invita a un truco de a ${config.jugadores}`, url: linkMesa(codigo) }).catch(() => {});
  $("#btn-repartir").hidden = false;
  $("#btn-repartir").onclick = () => {
    if (config.clasificatoria && asientos.some((a) => !a)) return aviso("La clasificatoria se juega sin bots: esperá a que se sienten todos.", 4500);
    $("#bloque-lobby").hidden = true; empezarPartida();
  };
  renderLobby();
}

let cambio = null; // anfitrión: asiento elegido para cambiar de lugar
function renderLobby() {
  pintarAsientosLobby(asientos.map((a) => (a ? { nombre: a.nombre, tipo: a.tipo === "yo" ? "persona" : a.tipo } : null)), 0, config, true);
  const libres = asientos.filter((a) => !a).length;
  $("#btn-repartir").textContent = libres ? `Repartir (${libres === 1 ? "un bot completa" : `${libres} bots completan`} la mesa)` : "Repartir";
}

function pintarAsientosLobby(lista, yo, cfg, editable = false) {
  const ul = $("#lobby-asientos");
  ul.innerHTML = lista.map((a, j) => `<li data-j="${j}" class="${E.equipoDe(j) === E.equipoDe(yo) ? "nos" : "ellos"}${cambio === j ? " elegido" : ""}">
      <span class="lugar-n">${j + 1}</span><i></i><span class="quien">${a ? esc(a.nombre) + (j === yo ? " (vos)" : "") : "libre"}</span>
      <span class="tipo">${a ? (a.tipo === "bot" ? "bot" : "") : "si no llega nadie, un bot"}</span></li>`).join("");
  const versus = Array.isArray(cfg.nombresEquipos) ? `${String(cfg.nombresEquipos[0]).slice(0, 24)} contra ${String(cfg.nombresEquipos[1]).slice(0, 24)} · ` : "";
  $("#lobby-sala").textContent = versus + `mesa de ${lista.length} · a ${cfg.meta || 15}${cfg.flor ? " · con flor" : ""}${cfg.puntaYHacha ? " · punta y hacha" : ""} · bots ${({ facil: "fáciles", dificil: "difíciles" })[cfg.dificultad] || "normales"}`;
  $("#lobby-ayuda").hidden = !editable;
  if (!editable) return;
  ul.onclick = (e) => {
    const li = e.target.closest("li"); if (!li) return;
    const j = +li.dataset.j;
    if (cambio === null) { cambio = j; }
    else { if (cambio !== j) { [asientos[cambio], asientos[j]] = [asientos[j], asientos[cambio]]; guardar(); avisarLobby(); } cambio = null; }
    renderLobby();
  };
}

async function copiarLink() {
  const url = linkMesa(codigo);
  try { await navigator.clipboard.writeText(url); aviso("Link copiado"); } catch { aviso(url, 6000); }
}
function puntoRed(ok) { const p = $("#eq-red"); if (p) { p.classList.toggle("si", ok); p.classList.toggle("no", !ok); } }

// ================= JUEGO =================
function abrirJuego() {
  if (!$("#mesa-eq").hidden) return;
  Emo.montar($("#mesa-eq .barra"), $("#eq-tanteador"), mandarEmote);
  // tocar fuera de la bandeja de señas la cierra
  document.addEventListener("pointerdown", (e) => {
    if (!bandeja || e.target.closest("#eq-bandeja, #eq-gestos")) return;
    bandeja = null; if (vista) renderGestos(vista, medidas());
  }, true);
  $("#inicio").hidden = true; $("#mesa-eq").hidden = false;
  Perfil.jugando(true);
  $("#eq-tanteador").onclick = () => abrirCapa(hojaTanteador());
  $("#eq-menu").onclick = () => abrirCapa(hojaMenu());
  $("#eq-mate").innerHTML = G.MATE;
  $("#eq-mate").onclick = () => { Perfil.tomarMate(); const b = $("#eq-mate"); b.classList.add("tomando"); setTimeout(() => b.classList.remove("tomando"), 1300); aviso("Tomaste un mate: +1 de gloria al terminar la partida"); };
  $("#eq-mesa").addEventListener("click", (e) => { if (!e.target.closest(".carta") && elegida) { elegida = null; render([], false); } });
  addEventListener("resize", () => vista && render([], true));
}

function enviarAccion(accion) {
  elegida = null; confirmaMazo = false;
  if (modo === "invitado") red.enviar({ t: "accion", accion });
  else hostAplicar(vista.yo, accion);
}

const nombreDe = (j) => (j === vista.yo ? "vos" : vista.nombres[j]);
const deNos = (eq) => eq === vista.equipo;
const nombreEquipo = (eq) => (deNos(eq) ? "nosotros" : "ellos");

let cola = Promise.resolve();
function recibir(v, eventos) { cola = cola.then(() => procesar(v, eventos)).catch((e) => console.error(e)); }

function sanear(v) {
  const n = (x) => (Number.isFinite(+x) ? Math.trunc(+x) : 0), carta = (x) => (idValido(x) ? x : null);
  v.n = v.n === 6 ? 6 : 4; v.yo = Math.min(v.n - 1, Math.max(0, n(v.yo))); v.equipo = v.yo % 2;
  v.meta = v.meta === 30 ? 30 : 15; v.mano = Math.min(v.n - 1, Math.max(0, n(v.mano)));
  v.puntos = [n(v.puntos?.[0]), n(v.puntos?.[1])];
  v.nombres = Array.from({ length: v.n }, (_, j) => String(v.nombres?.[j] ?? "").slice(0, 16));
  v.miMano = (v.miMano || []).map(carta).filter(Boolean).slice(0, 3);
  v.cartasEnMano = Array.from({ length: v.n }, (_, j) => Math.min(3, Math.max(0, n(v.cartasEnMano?.[j]))));
  v.alMazo = Array.from({ length: v.n }, (_, j) => !!v.alMazo?.[j]);
  v.listos = Array.from({ length: v.n }, (_, j) => !!v.listos?.[j]);
  if (v.bazas) v.bazas = v.bazas.slice(0, 3).map((b) => ({ cartas: Array.from({ length: v.n }, (_, j) => carta(b.cartas?.[j])), gana: [0, 1, "parda"].includes(b.gana) ? b.gana : null }));
  if (v.duelos) v.duelos = v.duelos.slice(0, 3).map((d) => ({ ...d, jugadores: (d.jugadores || []).map(n), bazas: (d.bazas || []).slice(0, 3).map((b) => {
    const c = {}; for (const j of d.jugadores || []) c[n(j)] = carta(b.cartas?.[j]); return { cartas: c, gana: [0, 1, "parda"].includes(b.gana) ? b.gana : null }; }) }));
  const TIPOS = ["jugar", "canto", "quiero", "no_quiero", "con_flor_me_achico", "tanto", "son_buenas", "son_mejores", "en_mesa", "mostrar", "mazo", "seguir", "mazo_peluca", "trampa"];
  v.acciones = (Array.isArray(v.acciones) ? v.acciones : []).filter((a) => a && TIPOS.includes(a.t) && (a.t !== "canto" || a.c in CANTO) && (a.t !== "jugar" || idValido(a.carta)))
    .map((a) => (a.t === "canto" ? { t: a.t, c: a.c } : a.t === "jugar" ? { t: a.t, carta: a.carta } : a.t === "trampa" ? { t: a.t, a: Math.min(v.n - 1, Math.max(0, n(a.a))) } : { t: a.t }));
  v.resumenMano = Array.isArray(v.resumenMano) ? v.resumenMano.map((x) => ({ quien: x.quien === 1 ? 1 : 0, motivo: String(x.motivo ?? ""), puntos: n(x.puntos), duelo: x.duelo })) : null;
  return v;
}

async function procesar(v, eventos) {
  if (modo === "invitado") v = sanear(v);
  if (modo === "invitado") { // cada uno cuenta su estilo con sus propias cartas (mano redonda)
    const jugadas = (v.bazas || []).map((b) => b.cartas?.[v.yo]).filter(Boolean);
    G.contarMio(misCuentas, eventos, v.yo, [...v.miMano, ...jugadas], v.envido?.tantos);
  }
  const prev = vista;
  if (!carasEl.length || carasEl.length !== v.n || prev?.yo !== v.yo) armarAsientos(v);
  if (eventos.some((e) => e.t === "reparto")) { cerrarCapa(); bandeja = null; await juntar(); vista = v; render(eventos, false, true); }
  else { vista = v; render(eventos, false, false); }
  cantar(eventos, prev);
}

// ---------- la mesa en perspectiva: tablero 3D, bustos detrás del borde, cartas que caen ----------
// Lugares de cada asiento sobre el tablero (u: 0 izquierda → 1 derecha, v: 0 borde lejano → 1 tu borde),
// por posición relativa a vos (r = 1 es el que juega después de vos).
const LUGARES = {
  4: [null, [1, 0.5], [0.5, 0], [0, 0.5]],
  6: [null, [1, 0.62], [0.8, 0], [0.5, 0], [0.2, 0], [0, 0.62]],
};
const CENTRO_MESA = [0.5, 0.47];
const posAsiento = [];
function medidas() {
  const mesa = $("#eq-mesa"), W = mesa.clientWidth, H = mesa.clientHeight, barH = $("#eq-acciones").offsetHeight;
  const grande = W >= 900 && H >= 640; // compu: la mesa crece con la pantalla
  const cx = W / 2, ancho = Math.min(W, grande ? 680 : 560);
  const cw = Math.min(ancho * 0.24, grande ? 136 : 112, (H - barH) * 0.15), ch = cw * RATIO;
  const manoY = H - barH - ch / 2 - 4;
  const top = (parseFloat(getComputedStyle($("#mesa-eq .barra")).height) || 52) + 6;
  const bottom = manoY - ch / 2 - 8;
  const RH = bottom - top;
  const cara = Math.max(44, Math.min(W * 0.13, grande ? 84 : 64, RH * 0.13)); // tu cara-espejo
  const tabW = Math.min(W * 0.96, grande ? Math.min(1180, RH * 2.3) : 760), tabH = Math.min(RH * (grande ? 0.8 : 0.98), tabW * 1.4); // en la compu el borde lejano baja: los de enfrente se ven más grandes
  const busto = Math.min(W * 0.3, grande ? 210 : 150, RH * (grande ? 0.4 : 0.33));
  return { W, H, cx, cw, ch, manoY, top, bottom, RH, cara, tabW, tabH, busto, ancho };
}
const relativo = (j, v) => (j - v.yo + v.n) % v.n;
function uvDe(j, v) { return LUGARES[v.n][relativo(j, v)]; }

function armarEscena() {
  if ($("#eq-escena")) return;
  const e3 = document.createElement("div");
  e3.id = "eq-escena"; e3.className = "escena";
  e3.innerHTML = `<div id="eq-tablero" class="tablero pano-${Perfil.miPano()}"><div class="canto"></div><div class="ancla" data-a="c"></div></div>`;
  $("#eq-mesa").appendChild(e3);
}
function layoutTablero(v, m) {
  armarEscena();
  const e3 = $("#eq-escena"), tab = $("#eq-tablero");
  e3.style.top = m.top + "px"; e3.style.height = m.RH + "px";
  tab.style.width = m.tabW + "px"; tab.style.height = m.tabH + "px";
  tab.style.left = (m.cx - m.tabW / 2) + "px"; tab.style.top = (m.RH - m.tabH) + "px";
  // anclas: un punto por asiento sobre el borde, para saber dónde cae cada busto en la pantalla
  for (let j = 0; j < v.n; j++) {
    let a = tab.querySelector(`.ancla[data-a="${j}"]`);
    if (!a) { a = document.createElement("div"); a.className = "ancla"; a.dataset.a = j; tab.appendChild(a); }
    const uv = j === v.yo ? [0.5, 1] : uvDe(j, v);
    a.style.left = (uv[0] * m.tabW - 50) + "px"; a.style.top = (uv[1] * m.tabH) + "px";
  }
  let n = tab.querySelector('.ancla[data-a="n"]');
  if (!n) { n = document.createElement("div"); n.className = "ancla"; n.dataset.a = "n"; tab.appendChild(n); }
  n.style.left = (0.97 * m.tabW - 50) + "px"; n.style.top = (0.93 * m.tabH) + "px"; // rincón de tu derecha, lejos de las cartas
  const c = tab.querySelector('.ancla[data-a="c"]');
  c.style.left = (CENTRO_MESA[0] * m.tabW - 50) + "px"; c.style.top = (CENTRO_MESA[1] * m.tabH) + "px";
}
/** Dónde quedó en la pantalla un punto del tablero (y cuánto lo achica la distancia). */
function proyectar(sel) {
  const a = $("#eq-tablero").querySelector(sel), r = a.getBoundingClientRect(), base = $("#eq-mesa").getBoundingClientRect();
  return { x: r.left + r.width / 2 - base.left, y: r.top - base.top, s: r.width / 100 };
}
function lugarDe(j, v, m) {
  if (relativo(j, v) === 0) {
    const x = Math.max(m.cara / 2 + 12, m.cx - m.ancho / 2 + m.cara / 2 + 12), y = m.bottom - m.cara * 0.62;
    return { x, y, top: y - m.cara / 2, h: m.cara };
  }
  return posAsiento[j] || { x: m.cx, y: m.top + 60, top: m.top + 10, h: 100 };
}
function centro(m) { try { return proyectar('.ancla[data-a="c"]'); } catch { return { x: m.cx, y: m.top + m.RH * 0.5 }; } }
/** Dónde va la carta de cada uno sobre el tablero (coordenadas del tablero). */
function lugarCarta(j, v, m) {
  if (relativo(j, v) === 0) return { x: 0.36 * m.tabW, y: 0.7 * m.tabH };
  const [u, w] = uvDe(j, v), t = v.n === 6 ? 0.42 : 0.45;
  const x = u + (CENTRO_MESA[0] - u) * t, y = w + (CENTRO_MESA[1] - w) * t + 0.03;
  // los del costado dejan sus cartas un poco más arriba, para que la fila no se meta en la tuya
  return { x: x * m.tabW, y: (u === 0 || u === 1 ? y - 0.1 : y) * m.tabH };
}
/** Hacia dónde se corre cada carta nueva de un jugador (en anchos de carta). */
function corrimiento(j, v) {
  if (relativo(j, v) === 0) return { x: 0.62, y: 0 };
  const [u] = uvDe(j, v);
  if (u === 0) return { x: 0.06, y: 0.45 };
  if (u === 1) return { x: -0.06, y: 0.45 };
  return { x: -0.16, y: 0.42 }; // los de enfrente: cada carta nueva un poco más hacia el centro (no pisa al de al lado)
}

function armarAsientos(v) {
  carasEl.forEach((c) => { c.parar(); c.el.remove(); });
  carasEl = [];
  for (let j = 0; j < v.n; j++) {
    const el = document.createElement("div"), yo = j === v.yo, nos = E.equipoDe(j) === v.equipo;
    const lado = !yo && [0, 1].includes(uvDe(j, v)[0]);
    el.className = "asiento " + (nos ? "nos" : "ellos") + (yo ? " yo" : " busto") + (lado ? " lado" : "");
    el.dataset.j = j;
    const etq = yo ? "tu cara" : `${esc(v.nombres[j])}, ${nos ? "de tu equipo" : "rival"}`, ops = yo ? {} : { busto: true, color: nos ? "#f0a93b" : "#5b616c" };
    const cara = K.cara(j, etq, ops);
    el.innerHTML = yo ? cara + '<div class="etq"><i></i><span class="n"></span></div><div class="chips"></div>'
      : '<div class="etq"><i></i><span class="n"></span></div><div class="chips"></div><div class="quedan"></div>' + cara;
    // los de enfrente se sientan detrás del borde lejano; los de los costados, sobre el borde (nada les tapa la cara)
    (yo || lado ? $("#eq-mesa") : $("#eq-asientos")).appendChild(el);
    const svg = el.querySelector("svg");
    carasEl.push({ el, svg, parar: K.parpadear(svg), etq, ops, forma: j });
  }
}

/** La baza que se ve en la mesa: la que está en curso o, si recién empezó, la que acaba de terminar. */
function bazaVisible(bazas) {
  if (!bazas?.length) return null;
  const ult = bazas[bazas.length - 1];
  const tiene = (b) => Object.values(b.cartas).some(Boolean);
  if (tiene(ult) || bazas.length === 1) return ult;
  return bazas[bazas.length - 2];
}

/** Todas las cartas jugadas en la mano: en el truco quedan en la mesa, cada una delante de quien la tiró. */
function cartasEnMesa(v) {
  const out = []; // { j, id, gana, apagada, baza, vieja }
  const marcar = (bazas, asientosB) => {
    const visible = bazaVisible(bazas);
    (bazas || []).forEach((b, i) => {
      const ids = asientosB.map((j) => ({ j, id: b.cartas[j] })).filter((x) => x.id);
      const cerrada = b.gana !== null && b.gana !== undefined;
      const max = ids.length ? Math.max(...ids.map((x) => jerarquia(x.id))) : 0;
      for (const x of ids) {
        const gana = cerrada && b.gana !== "parda" && E.equipoDe(x.j) === b.gana && jerarquia(x.id) === max;
        out.push({ ...x, gana, apagada: cerrada && b.gana !== "parda" && E.equipoDe(x.j) !== b.gana, baza: i, vieja: b !== visible });
      }
    });
  };
  if (v.tipoMano === "punta" && v.duelos) for (const d of v.duelos) marcar(d.bazas, d.jugadores);
  else if (v.bazas) marcar(v.bazas, Array.from({ length: v.n }, (_, j) => j));
  return out;
}

function posiciones(v, m) {
  const out = [];
  const jugables = new Set((v.acciones || []).filter((a) => a.t === "jugar").map((a) => a.carta));
  const n = v.miMano.length;
  v.miMano.forEach((id, i) => {
    const off = i - (n - 1) / 2, sel = id === elegida;
    out.push({ key: id, id, x: m.cx + off * m.cw * 0.74, y: m.manoY + Math.abs(off) * m.cw * 0.07 - (sel ? m.ch * 0.16 : 0), w: m.cw, r: sel ? 0 : off * 8, z: 50 + i, jugable: jugables.has(id), elegida: sel });
  });
  const tw = Math.min(m.tabW, m.tabH * 1.15) * (v.n === 6 ? 0.13 : 0.15); // en pantallas anchas la mesa es baja: manda el fondo
  cartasEnMesa(v).forEach((c, i) => {
    // cada baza nueva se apoya encima de la anterior, corrida hacia un costado (como en la mesa de verdad)
    const p = lugarCarta(c.j, v, m), d = corrimiento(c.j, v, m);
    out.push({ key: "m-" + c.id, id: c.id, x: p.x + d.x * c.baza * tw, y: p.y + d.y * c.baza * tw, w: tw, r: giroDe(c.id) * 1.5, z: 1 + c.baza * 10 + i,
      gana: c.gana && !c.vieja, apagada: c.apagada || c.vieja, de: c.j, plano: true });
  });
  return out;
}
const giroDe = (id) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0; return (Math.abs(h) % 13) - 6; };

function crearCarta(key, id, plano) {
  const el = document.createElement("div");
  el.className = "carta sin-anim" + (plano ? " en-mesa" : " abajo"); el.dataset.key = key;
  el.innerHTML = `<div class="giro"><div class="cara frente">${id ? frente(id) : ""}</div><div class="cara dorso">${dorso(Perfil.miDorso())}</div></div>`;
  if (!plano) el.addEventListener("click", () => tocarCarta(el));
  (plano ? $("#eq-tablero") : $("#eq-mesa")).appendChild(el); cartasEl.set(key, el);
  return el;
}
function ubicar(el, p) {
  const h = p.w * RATIO;
  el.style.width = p.w + "px"; el.style.height = h + "px";
  el.style.transform = p.plano
    ? `translate3d(${p.x - p.w / 2}px, ${p.y - h / 2}px, ${p.alto || 1}px) rotateZ(${p.r}deg)`
    : `translate(${p.x - p.w / 2}px, ${p.y - h / 2}px) rotate(${p.r}deg)`;
  el.style.zIndex = p.z;
}
function tocarCarta(el) {
  const id = el.dataset.key;
  if (!el.classList.contains("jugable")) return;
  S.desbloquear();
  if (elegida === id) enviarAccion({ t: "jugar", carta: id });
  else { elegida = id; S.roce(0, 0.1, 0.05); render([], false); }
}

async function juntar() {
  if (!cartasEl.size) return;
  const m = medidas(), c = centro(m);
  for (const el of cartasEl.values()) {
    el.style.transitionDelay = "0ms"; el.classList.add("abajo");
    if (el.classList.contains("en-mesa")) ubicar(el, { x: CENTRO_MESA[0] * m.tabW, y: CENTRO_MESA[1] * m.tabH, w: parseFloat(el.style.width), r: 0, z: 1, plano: true, alto: 2 });
    else ubicar(el, { x: c.x, y: c.y, w: m.cw * 0.6, r: 0, z: 60 });
  }
  S.roce(0, 0.5, 0.08);
  await espera(560);
  for (const el of cartasEl.values()) el.remove();
  cartasEl.clear();
  S.riffle(0, 0.7);
  await espera(450);
}

function render(eventos, sinAnim, reparto) {
  const v = vista, m = medidas();
  $("#mesa-eq").style.setProperty("--cara", m.cara + "px");
  if (elegida && !v.miMano.includes(elegida)) elegida = null;
  layoutTablero(v, m);
  renderAsientos(v, m);

  const ps = posiciones(v, m), vivos = new Set(ps.map((p) => p.key)), c = centro(m);
  for (const [k, el] of cartasEl) if (!vivos.has(k)) { el.remove(); cartasEl.delete(k); }
  ps.forEach((p, orden) => {
    let el = cartasEl.get(p.key), nueva = false;
    if (!el) {
      nueva = true; el = crearCarta(p.key, p.id, p.plano);
      if (p.plano) {
        // la carta cae sobre la mesa desde la mano de quien la tira: arranca en el aire, girada
        const uv = p.de === v.yo ? [0.5, 1.05] : uvDe(p.de, v);
        ubicar(el, { ...p, x: uv[0] * m.tabW, y: uv[1] * m.tabH, r: p.r + (p.de % 2 ? 35 : -35), alto: 170 });
        el.style.opacity = 0;
      } else if (reparto) ubicar(el, { x: c.x, y: c.y, w: m.cw * 0.5, r: 0, z: 100 });
      else { ubicar(el, p); el.style.opacity = 0; }
    }
    el.classList.toggle("jugable", !!p.jugable);
    el.classList.toggle("elegida", !!p.elegida);
    el.classList.toggle("gana", !!p.gana);
    el.classList.toggle("apagada", !!p.apagada);
    if (p.jugable) { el.setAttribute("role", "button"); el.tabIndex = 0; el.setAttribute("aria-label", nombreCarta(p.id) + (p.elegida ? ", tocá de nuevo para tirarla" : "")); }
    else { el.removeAttribute("role"); el.tabIndex = -1; el.setAttribute("aria-label", nombreCarta(p.id)); }
    if (sinAnim) { el.classList.add("sin-anim"); ubicar(el, p); el.classList.remove("abajo"); el.style.opacity = 1; return; }
    const demora = reparto && !p.plano ? orden * 170 : 0;
    el.getBoundingClientRect();
    el.classList.remove("sin-anim");
    el.style.transitionDelay = demora + "ms";
    requestAnimationFrame(() => {
      ubicar(el, p); el.style.opacity = 1;
      if (reparto && nueva && !p.plano) { setTimeout(() => el.classList.remove("abajo"), demora + 480); S.roce(demora / 1000, 0.12, 0.05); }
      else if (nueva && p.plano) { S.roce(0, 0.12, 0.05); S.golpe(0.42, 0.16); }
      else el.classList.remove("abajo");
      setTimeout(() => (el.style.transitionDelay = "0ms"), demora + 20);
    });
  });

  renderEstado(v, m); renderNota(v); ubicarNota(m); renderAcciones(v); renderGestos(v, m); renderTanteador(v); renderMate(v);
  clearTimeout(render.fin);
  if (v.fase === "fin_mano" || v.fase === "fin_partida") {
    const recien = eventos.some((e) => e.t === "fin_mano" || e.t === "fin_partida");
    const capa = $("#capa"), abierta = !capa.hidden && capa.dataset.tipo === "fin";
    if (recien || abierta || capaCerradaMano !== v.numeroMano || v.fase === "fin_partida")
      render.fin = setTimeout(() => abrirCapa(v.fase === "fin_partida" ? hojaFinPartida() : hojaFinMano()), recien ? 1700 : 50);
  } else if ($("#capa").dataset.tipo === "fin") cerrarCapa();
}

function ubicarNota(m) {
  const a = proyectar('.ancla[data-a="n"]'), el = $("#eq-bazas");
  el.style.left = "auto"; el.style.right = Math.max(8, m.W - a.x) + "px";
  el.style.top = (a.y - 4) + "px";
}

function renderAsientos(v, m) {
  const turnoDuelo = v.tipoMano === "punta" && v.duelos;
  v.nombres.forEach((nombre, j) => {
    const c = carasEl[j]; if (!c) return;
    if (j === v.yo) {
      const p = lugarDe(j, v, m);
      c.el.style.left = p.x + "px"; c.el.style.top = p.y + "px";
    } else {
      // el busto se sienta detrás del borde de la mesa: la madera le tapa los hombros
      const a = proyectar(`.ancla[data-a="${j}"]`), [u] = uvDe(j, v), lado = u === 0 || u === 1;
      // enfrente: la madera tapa el pecho; al costado: los hombros quedan apoyados sobre el borde
      const k = lado ? 0.34 : 0.2;
      let ancho = m.busto * Math.max(lado ? 0.62 : 0.8, Math.min(1.1, a.s)) * (lado ? 0.92 : 1);
      const altoMax = (a.y - m.top - 38) / (1 - k);   // el nombre no puede subirse a la barra
      ancho = Math.max(52, Math.min(ancho, altoMax / 1.5));
      const alto = ancho * 1.5;
      const corre = lado ? (u === 0 ? -1 : 1) * ancho * 0.3 : 0; // hacia afuera, para que la cara quede al borde
      const x = Math.min(m.W - ancho * 0.5 - 2, Math.max(ancho * 0.5 + 2, a.x + corre));
      const pie = a.y + alto * k;
      c.svg.style.width = ancho + "px";
      c.el.style.left = x + "px"; c.el.style.top = pie + "px";
      posAsiento[j] = { x, y: pie - alto * 0.62, top: pie - alto - 30, h: alto };
    }
    const pj = perfilesMesa[j];
    if (pj && j !== v.yo) c.el.querySelector(".n").innerHTML = Perfil.nombreHTML(pj, { titulo: true }); else c.el.querySelector(".n").textContent = j === v.yo ? "vos" : nombre;
    // la cara de cada uno: la que eligió en la pulpería (o la del asiento) con lo que tiene puesto
    const forma = pj ? Perfil.formaDe(pj, j) : j;
    const acc = Perfil.accDe(pj, enClasif), clave = JSON.stringify([forma, acc]);
    if (c.acc !== clave) {
      c.acc = clave;
      if (c.forma !== forma) {
        const d = document.createElement("div"); d.innerHTML = K.cara(forma, c.etq, c.ops);
        const nuevo = d.firstElementChild; nuevo.style.width = c.svg.style.width;
        c.parar(); c.svg.replaceWith(nuevo); c.svg = nuevo; c.parar = K.parpadear(nuevo); c.forma = forma;
      }
      K.accesorios(c.svg, acc, Perfil.DIBUJOS);
    }
    const chips = [];
    if (v.mano === j && v.fase === "jugando") chips.push("mano");
    if (v.tipoMano === "redonda" && v.pies?.includes(j) && v.fase === "jugando") chips.push("pie");
    if (v.alMazo[j]) chips.push("al mazo");
    if (v.poderes?.peluca?.[j] > 0) chips.push("peluca");
    if (v.poderes?.trampa?.[j] > 0) chips.push("trampa");
    if (turnoDuelo && v.miDuelo?.contra === j) chips.push("tu duelo");
    c.el.querySelector(".chips").innerHTML = chips.map((t) => `<span class="mini-chip">${t}</span>`).join("");
    const q = c.el.querySelector(".quedan"); if (q) q.innerHTML = "<span></span>".repeat(v.alMazo[j] ? 0 : v.cartasEnMano[j]);
    c.el.classList.toggle("turno", v.fase === "jugando" && v.turno === j);
    c.el.classList.toggle("mazo", !!v.alMazo[j]);
    c.el.classList.toggle("apagado", !!turnoDuelo && j !== v.yo && v.miDuelo?.contra !== j);
  });
}

// ---------- textos ----------
function pendienteVisible(v) {
  if (v.tipoMano === "punta" && v.miDuelo) {
    const dv = v.miDuelo.vista, jug = v.duelos[v.miDuelo.duelo].jugadores;
    return dv.cantoPendiente ? { c: dv.cantoPendiente.c, de: jug[dv.cantoPendiente.de], responde: jug[1 - dv.cantoPendiente.de] } : null;
  }
  return v.cantoPendiente;
}

function renderEstado(v, m) {
  const el = $("#eq-estado"), quien = (j) => (j === v.yo ? "vos" : `<b>${esc(v.nombres[j])}</b>`);
  let t = "";
  const acc = v.acciones || [], p = pendienteVisible(v);
  if (v.fase === "fin_partida") t = v.ganador === v.equipo ? "<b>¡Ganamos la partida!</b>" : "Ganaron <b>ellos</b>";
  else if (v.fase === "fin_mano") t = "Terminó la mano";
  else if (p) {
    const c = esc(CANTO[p.c] || p.c);
    t = p.de === v.yo ? `Cantaste ${c}. ` : `${quien(p.de)} cantó <b>${c}</b>. `;
    t += p.responde === v.yo ? "<b>Contestás vos</b>" : `Contesta ${quien(p.responde)}…`;
  } else if (acc.some((a) => a.t === "tanto")) t = "Decí tu tanto";
  else if (acc.some((a) => a.t === "son_buenas" || a.t === "son_mejores")) t = "Te toca decir el tanto";
  else if (v.envido?.estado === "querido" && v.envido.habla != null) t = `${quien(v.envido.habla)} dice el tanto…`;
  else if (v.turno === v.yo) t = elegida ? "Tocala de nuevo para tirarla" : "<b>Te toca</b>";
  else if (v.alMazo[v.yo]) t = "Te fuiste al mazo. Mirá cómo sigue tu equipo";
  else if (v.turno != null) t = `Juega ${quien(v.turno)}…`;
  else if (v.tipoMano === "punta") t = "Esperando los otros duelos…";
  if (v.tipoMano === "punta" && v.fase === "jugando" && v.miDuelo) t = `<span class="punta">punta y hacha · contra ${esc(v.nombres[v.miDuelo.contra])}</span><br>` + t;
  el.innerHTML = t;
  const yo = lugarDe(v.yo, v, m);
  el.style.top = (yo.y - m.cara * 0.6 - (v.tipoMano === "punta" ? 54 : 34)) + "px";
}

function renderNota(v) {
  const el = $("#eq-bazas"), lineas = [];
  const fuente = v.tipoMano === "punta" && v.miDuelo ? null : v;
  if (fuente?.bazas) fuente.bazas.forEach((b, i) => { if (b.gana != null) lineas.push(`${i + 1}ª ${b.gana === "parda" ? "parda" : nombreEquipo(b.gana)}`); });
  if (v.tipoMano === "punta" && v.miDuelo) {
    const dv = v.miDuelo.vista, l = v.miDuelo.local;
    dv.bazas.forEach((b, i) => { if (b.gana != null) lineas.push(`${i + 1}ª ${b.gana === "parda" ? "parda" : b.gana === l ? "vos" : v.nombres[v.miDuelo.contra]}`); });
    if (dv.truco?.nivel > 1) lineas.push(["", "", "truco", "retruco", "vale cuatro"][dv.truco.nivel] + " querido");
    if (dv.envido?.mintio) lineas.push(`¡mintió! tenía ${+dv.envido.real}`);
    if (dv.envido?.ganador != null && dv.envido.puntos != null) lineas.push(`envido: ${dv.envido.ganador === l ? "vos" : v.nombres[v.miDuelo.contra]} +${dv.envido.puntos}`);
  } else {
    if (v.truco?.nivel > 1) lineas.push(["", "", "truco", "retruco", "vale cuatro"][v.truco.nivel] + " querido");
    const e = v.envido;
    if (e) {
      const dichos = e.tantos.map((t, j) => (t == null ? null : `${j === v.yo ? "vos" : v.nombres[j]} ${t}`)).filter(Boolean);
      if (dichos.length) lineas.push(dichos.join(" · "));
      if (e.puntos != null && e.ganador != null && e.estado !== "querido") lineas.push(`envido: ${nombreEquipo(e.ganador)} +${e.puntos}`);
      if (e.enMesaPedido) lineas.push(e.mostradas?.length ? `mostró: ${e.mostradas.map(nombreCarta).join(", ")}` : "pidieron las cartas en mesa");
      if (e.mintio) lineas.push(`¡${e.ganadorJugador === v.yo ? "mentiste" : "mintió"}! tenía ${+e.real}`);
    }
    if (v.florCantada?.estado === "resuelta") lineas.push(`flor: ${nombreEquipo(v.florCantada.ganador)} +${v.florCantada.puntos}`);
  }
  // texto plano: lo que llega por la red nunca se interpreta como HTML
  el.replaceChildren(...lineas.map((l) => { const s = document.createElement("span"); s.textContent = String(l); return s; }));
}

function miTanto(v) {
  try {
    if (v.tipoMano === "punta" && v.miDuelo) {
      const dv = v.miDuelo.vista; return tantoDe([...dv.miMano, ...dv.bazas.map((b) => b["c" + v.miDuelo.local]).filter(Boolean)]);
    }
    return tantoDe([...v.miMano, ...(v.bazas || []).map((b) => b.cartas[v.yo]).filter(Boolean)]);
  } catch { return null; }
}

function renderAcciones(v) {
  const nav = $("#eq-acciones"), acc = v.acciones || [];
  nav.innerHTML = "";
  const fila = () => { const f = document.createElement("div"); f.className = "fila-acc"; nav.appendChild(f); return f; };
  const boton = (f, txt, clase, fn) => { const b = document.createElement("button"); b.className = "b " + clase; b.textContent = txt; b.onclick = () => { S.desbloquear(); fn(); }; f.appendChild(b); return b; };
  if (v.fase === "fin_partida") {
    const f = fila();
    if (modo === "invitado") boton(f, "Pedir otra partida", "fuerte", () => { red.enviar({ t: "revancha" }); aviso("Le avisé al que armó la mesa"); });
    else boton(f, "Otra partida", "fuerte", nuevaPartidaMismaMesa);
    return;
  }
  const resp = acc.filter((a) => ["quiero", "no_quiero", "con_flor_me_achico", "son_buenas", "son_mejores", "tanto", "mostrar", "seguir"].includes(a.t));
  const cantos = acc.filter((a) => a.t === "canto");
  const chicas = acc.filter((a) => ["en_mesa", "mazo", "mazo_peluca", "trampa"].includes(a.t));
  if (resp.length) {
    const f = fila(), t = miTanto(v);
    for (const a of resp) {
      if (a.t === "tanto" || a.t === "son_mejores") {
        const min = a.t === "son_mejores" ? liderDicho(v.tipoMano === "punta" && v.miDuelo ? v.miDuelo.vista.envido : v.envido) + 1 : 0;
        if (min <= 33) selectorTanto(f, { real: t, min, tipo: a.t, enviar: enviarAccion, alTocar: () => S.desbloquear() });
        continue;
      }
      const txt = { quiero: "Quiero", no_quiero: "No quiero", con_flor_me_achico: "Con flor me achico", son_buenas: "Son buenas", son_mejores: `¡${t ?? ""} son mejores!`, tanto: `Tengo ${t ?? ""}`, mostrar: "Mostrar las cartas", seguir: "Siguiente mano" }[a.t];
      boton(f, txt, ["quiero", "tanto", "son_mejores", "mostrar", "seguir"].includes(a.t) ? "fuerte" : "", () => enviarAccion(a));
    }
  }
  if (cantos.length) {
    const env = cantos.filter((a) => !TRUCOS.includes(a.c)), tru = cantos.filter((a) => TRUCOS.includes(a.c));
    for (const grupo of [env, tru]) if (grupo.length) { const f = fila(); for (const a of grupo) boton(f, BOTON_CANTO[a.c] || a.c, "canto", () => enviarAccion(a)); }
  }
  if (chicas.length) {
    const f = fila();
    for (const a of chicas) {
      if (a.t === "en_mesa") boton(f, "Las quiero en mesa", "chico alerta", () => enviarAccion(a));
      else if (a.t === "mazo_peluca") boton(f, "Mazo con peluca", "chico poder", () => enviarAccion(a));
      else if (a.t === "trampa") boton(f, `Trampa a ${v.nombres[a.a]}`, "chico poder", () => enviarAccion(a));
      else {
        const b = boton(f, "Irme al mazo", "chico", () => {
          if (!confirmaMazo) { confirmaMazo = true; b.textContent = "¿Seguro? Tocá de nuevo"; b.classList.add("alerta"); setTimeout(() => { confirmaMazo = false; if (b.isConnected) { b.textContent = "Irme al mazo"; b.classList.remove("alerta"); } }, 2500); }
          else enviarAccion(a);
        });
      }
    }
  }
  if (!nav.children.length) { const d = document.createElement("p"); d.className = "vacio"; d.textContent = v.turno === v.yo ? "tirá una carta" : ""; nav.appendChild(d); }
}

// ---------- señas, cabeza y preguntas ----------
function renderGestos(v, m) {
  const cont = $("#eq-gestos"), band = $("#eq-bandeja");
  const puede = v.fase === "jugando" && v.tipoMano === "redonda" && !v.alMazo[v.yo];
  if (!puede) { cont.hidden = true; band.hidden = true; bandeja = null; return; }
  const soyPie = v.pies?.[v.equipo] === v.yo;
  cont.hidden = false;
  const p = lugarDe(v.yo, v, m);
  cont.style.left = (p.x + m.cara * 0.62) + "px";
  cont.style.top = (p.y - 18) + "px";
  const pestañas = [["sena", "señas"], ["cabeza", "cabeza"], ["pregunta", soyPie ? "preguntar" : "¿canto?"]];
  const conMic = soyPie && modo !== "practica" && !!navigator.mediaDevices?.getUserMedia;
  cont.innerHTML = pestañas.map(([k, t]) => `<button class="pestana" data-g="${k}" aria-pressed="${bandeja === k}">${t}</button>`).join("")
    + (conMic ? `<button class="pestana mic" data-mic aria-pressed="${hablando}" title="Mantené apretado para hablarle a la mesa">${hablando ? "hablando…" : "hablar"}</button>` : "");
  const mic = cont.querySelector("[data-mic]");
  if (mic) {
    mic.onpointerdown = (e) => { e.preventDefault(); empezarHablar(); };
    mic.oncontextmenu = (e) => e.preventDefault();
  }
  cont.onclick = (e) => { const b = e.target.closest("[data-g]"); if (!b) return; bandeja = bandeja === b.dataset.g ? null : b.dataset.g; renderGestos(vista, medidas()); };
  if (!bandeja) { band.hidden = true; return; }
  band.hidden = false;
  band.style.bottom = (m.H - (p.y - m.cara * 0.62) + 6) + "px"; // arriba de tu cara, para que veas la seña que hacés
  let botones = [];
  if (bandeja === "sena") botones = K.SENAS.filter((s) => s.k !== "flor" || v.flor).map((s) => [s.k, s.carta, s.nombre]);
  if (bandeja === "cabeza") botones = K.CABEZA.map((c) => [c.k, c.nombre, c.gesto]);
  if (bandeja === "pregunta") {
    botones = K.PREGUNTAS.filter((q) => (!q.soloFlor || v.flor) && (soyPie || q.quien === "todos")).map((q) => [q.k, q.texto, ""]);
    if (soyPie) v.nombres.forEach((n, j) => { // «¡Vamos a…!»: a la carta de cada compañero que sigue en la mano
      if (j !== v.yo && E.equipoDe(j) === v.equipo && !v.alMazo[j]) botones.splice(5, 0, [`p_vamos_${j}`, `¡Vamos a ${n}!`, "en esta baza vamos a su carta"]);
    });
  }
  band.innerHTML = `<p class="ayuda">${{ sena: "Tu cara la hace un instante. La ven todos.", cabeza: "Contestale a tu compañero con la cabeza.", pregunta: soyPie ? "Sos el pie: hablale a tu equipo. Lo oyen todos (también sirve para mentir)." : "Preguntale a tu pie si cantás. Lo oyen todos." }[bandeja]}</p>`
    + `<div class="botones">${botones.map(([k, t, sub]) => `<button class="b" data-k="${k}" title="${esc(sub)}">${esc(t)}</button>`).join("")}</div>`;
  band.onclick = (e) => { const b = e.target.closest("[data-k]"); if (!b) return; hacerGesto(bandeja, b.dataset.k); bandeja = null; renderGestos(vista, medidas()); };
}

// ---------- cantos: voz y bocadillo junto a la cara ----------
function claveVoz(e, prev) {
  if (e.t === "canto") return e.c === "envido" && prev?.cantoPendiente?.c === "envido" ? "envido_envido" : e.c;
  if (e.t === "respuesta") return e.r;
  if (e.t === "tanto") return "tengo_" + e.n;
  if (e.t === "en_mesa") return "en_mesa";
  if (e.t === "mazo") return "mazo";
  return null;
}
function cantar(eventos, prev) {
  let t = 0;
  for (const e of eventos) {
    if (e.t === "fin_partida") { const k = e.ganador === vista.equipo ? "gane" : "perdi"; setTimeout(() => S.decir(k), t + 1200); continue; }
    if (e.t === "reparto" && e.tipo === "punta") { setTimeout(() => anuncio("¡Punta y hacha!"), 700); continue; }
    if (e.t === "trampa") { setTimeout(() => { bocadillo(e.jugador, "¡Trampa!"); if (e.a === vista.yo) aviso("Te hicieron la trampa: te cambiaron una carta de la mano"); }, t); t += 1150; continue; }
    if (e.t === "mazo" && e.peluca) { setTimeout(() => { S.decir("mazo"); bocadillo(e.jugador, "Me voy… con peluca"); }, t); t += 1150; continue; }
    const k = claveVoz(e, prev); if (!k) continue;
    const dichos = [];
    if (e.t === "canto" && ENVIDOS.includes(e.c) && TRUCOS.includes(prev?.cantoPendiente?.c)) dichos.push("envido_primero");
    dichos.push(k);
    for (const d of dichos) {
      const texto = d.startsWith("tengo_") ? `Tengo ${e.n}` : DICHO[d] || d;
      setTimeout(() => { S.decir(d); bocadillo(e.jugador, texto); if (e.t === "canto") pulsoLampara(); }, t);
      t += 1150;
    }
    prev = null;
  }
}
function bocadillo(j, texto, pregunta = false) {
  if (!vista || j == null) return;
  const m = medidas(), p = lugarDe(j, vista, m), el = document.createElement("div");
  el.className = "bocadillo eq-boca" + (j === vista.yo ? "" : " rival") + (pregunta ? " pregunta" : "");
  el.textContent = texto;
  const x = Math.min(m.W - 90, Math.max(90, p.x));
  el.style.left = x + "px";
  el.style.top = Math.max(m.top + 4, p.top) + "px";
  $("#eq-bocadillos").appendChild(el);
  setTimeout(() => el.remove(), 2400);
  return el;
}
function anuncio(texto) {
  const m = medidas(), c = centro(m), el = document.createElement("div");
  el.className = "bocadillo eq-boca"; el.textContent = texto;
  el.style.left = c.x + "px"; el.style.top = (c.y - 30) + "px";
  $("#eq-bocadillos").appendChild(el);
  setTimeout(() => el.remove(), 2400);
}
function pulsoLampara() {
  const j = $("#mesa-eq"); j.classList.add("luz-alta");
  clearTimeout(pulsoLampara.t); pulsoLampara.t = setTimeout(() => j.classList.remove("luz-alta"), 1400);
}

// ---------- tanteador y hojas ----------
function fosforos(p, meta, s = 22, gap = 10) {
  if (Perfil.misPorotos()) return C.porotos(p, meta, s, gap); // de la pulpería: porotos en vez de fósforos
  const grupos = meta / 5, alto = grupos * (s + gap) + (meta === 30 ? 16 : 0), w = s + 12;
  let svg = `<svg viewBox="-6 -4 ${w} ${alto + 4}" width="${w}" height="${alto + 4}" aria-hidden="true">`;
  const lados = [[0, 0, 0, 1], [0, 0, 1, 0], [1, 0, 1, 1], [0, 1, 1, 1], [0, 0, 1, 1]];
  for (let g = 0; g < grupos; g++) {
    const oy = g * (s + gap) + (meta === 30 && g >= 3 ? 16 : 0);
    if (meta === 30 && g === 3) svg += `<line x1="-6" y1="${oy - 11}" x2="${s + 6}" y2="${oy - 11}" stroke="#b8621b" stroke-width="1.4" stroke-dasharray="3 3"/>`;
    for (let k = 0; k < 5; k++) {
      if (g * 5 + k >= p) break;
      const [x1, y1, x2, y2] = lados[k], jit = ((g * 5 + k) * 37 % 7 - 3) * 0.5;
      const ax = x1 * s + jit * 0.3, ay = oy + y1 * s, bx = x2 * s - jit * 0.2, by = oy + y2 * s + jit * 0.3;
      svg += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="#3b3024" stroke-width="2.2" stroke-linecap="round"/><circle cx="${bx}" cy="${by}" r="2.6" fill="#b8621b"/>`;
    }
  }
  return svg + "</svg>";
}
function servilleta(v, s) {
  const col = (eq) => `<div class="col"><span class="quien">${nombreEquipo(eq)}</span><span class="num">${v.puntos[eq]}${v.meta === 30 ? (v.puntos[eq] >= 15 ? " · buenas" : " · malas") : ""}</span>${fosforos(v.puntos[eq], v.meta, s)}</div>`;
  return `<div class="cols">${col(v.equipo)}${col(1 - v.equipo)}</div>`;
}
function renderMate(v) {
  $("#eq-mate").hidden = !(modo !== "practica" && Perfil.mateDisponible(enClasif) && v.fase !== "fin_partida");
}
function renderTanteador(v) {
  $("#eq-tanteador").innerHTML = `<svg viewBox="0 0 14 22" aria-hidden="true"><line x1="7" y1="20" x2="7" y2="5" stroke="#3b3024" stroke-width="2" stroke-linecap="round"/><circle cx="7" cy="4.5" r="3" fill="#b8621b"/></svg><span>nos <b>${v.puntos[v.equipo]}</b> · <b>${v.puntos[1 - v.equipo]}</b></span>`;
  $("#eq-titulo").textContent = `${v.n === 6 ? "3 contra 3" : "2 contra 2"} · a ${v.meta}`;
}
function hojaTanteador() {
  return `<div class="hoja servilleta-hoja"><h2>Tanteador</h2><p class="sala">a ${vista.meta}${vista.flor ? " · con flor" : ""}${vista.puntaYHacha ? " · punta y hacha" : ""}</p>
    <div class="servilleta">${servilleta(vista, vista.meta === 30 ? 20 : 26)}</div><button class="b" data-cerrar>Volver a la mesa</button></div>`;
}
function hojaFinMano() {
  const v = vista, r = v.resumenMano || [];
  const duelo = (k) => { const d = v.duelos?.[k]; return d ? ` <small>(${d.jugadores.map((j) => esc(nombreDe(j))).join(" vs ")})</small>` : ""; };
  const filas = r.length ? r.map((x) => `<li><span>${nombreEquipo(x.quien)} · ${esc(x.motivo)}${x.duelo !== undefined ? duelo(x.duelo) : ""}</span><b>+${x.puntos}</b></li>`).join("") : "<li><span>Sin puntos</span><b>0</b></li>";
  const acc = v.acciones || [], puede = acc.some((a) => a.t === "seguir"), muestra = acc.some((a) => a.t === "mostrar");
  const faltan = v.nombres.map((n, j) => (!v.listos[j] && j !== v.yo ? n : null)).filter(Boolean);
  const avisoMesa = muestra ? "<p><b>Te pidieron las cartas en mesa.</b> Si seguís sin mostrarlas, el envido es para ellos.</p>" : "";
  return `<div class="hoja" data-tipo="fin"><h2>Terminó la mano</h2><p class="sala">nosotros ${v.puntos[v.equipo]} · ellos ${v.puntos[1 - v.equipo]} · a ${v.meta}</p><ul>${filas}</ul>${avisoMesa}
    ${muestra ? '<button class="b" data-accion="mostrar">Mostrar las cartas</button>' : ""}
    ${puede ? `<button class="b${muestra ? " claro" : ""}" data-accion="seguir">Siguiente mano</button>` : `<p>Esperando a ${esc(faltan.join(", ")) || "los demás"}…</p>`}
    <button class="b claro" data-cerrar>Ver la mesa</button></div>`;
}
function hojaFinPartida() {
  const v = vista, gane = v.ganador === v.equipo;
  const otra = modo === "invitado" ? '<button class="b" data-revancha>Pedir otra partida</button>' : '<button class="b" data-otra>Otra partida</button>';
  return `<div class="hoja" data-tipo="fin"><h2>${gane ? "¡Ganamos!" : "Ganaron ellos"}</h2><p class="sala">partida a ${v.meta}</p>
    <div class="marcador">nosotros ${v.puntos[v.equipo]} — ${v.puntos[1 - v.equipo]} ellos</div><div class="servilleta">${servilleta(v, v.meta === 30 ? 16 : 22)}</div>
    ${botonCompartir({ gane, mios: v.nombres.map((n, j) => (E.equipoDe(j) === v.equipo ? (j === v.yo ? "vos" : n) : null)).filter(Boolean), suyos: v.nombres.filter((_, j) => E.equipoDe(j) !== v.equipo), pm: v.puntos[v.equipo], ps: v.puntos[1 - v.equipo], meta: v.meta })}${otra}<button class="b claro" data-cerrar>Ver la mesa</button></div>`;
}
function hojaMenu() {
  const link = codigo ? `<button class="b claro" data-copiar>Copiar el link de la mesa</button>` : "";
  const ausentes = modo === "anfitrion" && asientos.some((a) => a.tipo === "persona" && !a.conectado);
  return `<div class="hoja"><h2>Menú</h2><p class="sala">${modo === "practica" ? "práctica con bots" : "mesa por link"} · ${vista.n === 6 ? "3 contra 3" : "2 contra 2"} · a ${vista.meta}${vista.flor ? " · con flor" : ""}${vista.puntaYHacha ? " · punta y hacha" : ""}</p>
    <button class="b claro" data-sonido>${S.estaActivo() ? "Silenciar las voces" : "Prender las voces"}</button>${link}
    ${ausentes ? '<button class="b claro" data-bots>Poner bots en lugar de los que se fueron</button>' : ""}
    ${botonPantalla()}<button class="b claro" data-reglas>Reglas en equipo</button><button class="b claro" data-salir>Salir de la mesa</button><button class="b" data-cerrar>Volver</button></div>`;
}
function hojaReglas() {
  return `<div class="hoja"><h2>Reglas en equipo</h2>
  <p><b>Equipos:</b> se sientan alternados. Se juega en orden desde la mano. La baza la gana el equipo de la carta más alta.</p>
  <p><b>El pie habla:</b> los cantos del otro equipo los contesta el pie (el último de tu equipo en jugar). Puede preguntar (¿tenés para el envido?, ¿una puntita?) y decir «¡vamos a…!» la carta de un compañero; ellos contestan solo con la cabeza.</p>
  <p><b>Los demás</b> cantan envido o truco en su turno, y pueden preguntarle al pie «¿canto?». Todo lo que se dice lo oye la mesa entera: se puede mentir.</p>
  <p><b>Envido:</b> podés decir cualquier número. Si te piden las cartas en mesa y no lo tenías, los puntos son para ellos.</p>
  <p><b>Señas:</b> duran un instante y las ven todos, rivales incluidos. 1 de espada: cejas · 1 de basto: guiño · 7 de espada: boca a la derecha · 7 de oro: boca a la izquierda · tres: muerde el labio · dos: trompita · ancho falso: lengua · flor: cachetes · nada: ojos cerrados.</p>
  <p><b>Al mazo</b> se va cada uno: tus compañeros pueden seguir sin vos. Si se van todos, el equipo pierde la mano.</p>
  <p><b>Punta y hacha:</b> si está prendida, entre 5 y 25 (a 30) se alterna una mano normal con una de duelos: cada uno contra el suyo, y lo que gana suma para el equipo.</p>
  <button class="b" data-cerrar>Volver</button></div>`;
}
function abrirCapa(html) {
  const c = $("#capa"); c.innerHTML = html; c.hidden = false;
  c.dataset.tipo = c.querySelector("[data-tipo]")?.dataset.tipo || "";
  c.onclick = (e) => {
    const t = e.target;
    if (t === c || t.closest("[data-cerrar]")) { if (c.dataset.tipo === "fin") capaCerradaMano = vista?.numeroMano; return cerrarCapa(); }
    if (t.closest("[data-accion]")) { const a = t.closest("[data-accion]").dataset.accion; if (a === "seguir") cerrarCapa(); enviarAccion({ t: a }); }
    if (t.closest("[data-otra]")) nuevaPartidaMismaMesa();
    if (t.closest("[data-revancha]")) { red.enviar({ t: "revancha" }); aviso("Le avisé al que armó la mesa"); }
    if (t.closest("[data-pantalla]")) { alternarPantalla(); setTimeout(() => abrirCapa(hojaMenu()), 300); }
    if (t.closest("[data-sonido]")) { S.setActivo(!S.estaActivo()); abrirCapa(hojaMenu()); }
    if (t.closest("[data-copiar]")) copiarLink();
    if (t.closest("[data-reglas]")) abrirCapa(hojaReglas());
    if (t.closest("[data-bots]")) { asientos.forEach((a, j) => { if (a.tipo === "persona" && !a.conectado) asientos[j] = { tipo: "bot", nombre: a.nombre }; }); guardar(); cerrarCapa(); programarBots(); aviso("Los bots siguen por los que se fueron"); }
    if (t.closest("[data-salir]")) { if (modo === "anfitrion") try { localStorage.removeItem("truco-mesa"); } catch {} location.href = location.pathname; }
  };
}
function cerrarCapa() { const c = $("#capa"); c.hidden = true; c.innerHTML = ""; c.dataset.tipo = ""; }
