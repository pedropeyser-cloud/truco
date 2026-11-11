// Pantalla del truco: inicio, mesa, animaciones (riffle, reparto, dar vuelta, abanico), cantos con voz y tanteador de fósforos.
// Modos: "anfitrion" (tiene la partida y la comparte por link), "invitado" (manda acciones, recibe vistas), "practica" (contra bot.js).
import { botonPantalla, alternarPantalla } from "./pantalla.js";
import { selectorTanto, liderDicho } from "./tanto.js";
import * as M from "./motor.js";
import * as Bot from "./bot.js";
import { frente, dorso, nombreCarta, idValido } from "./cartas.js";
import * as S from "./sonido.js";
import { abrirSala, entrarSala, codigoNuevo, linkDe } from "./red.js";
import * as Mesa from "./mesa.js"; // mesas de 4 y 6 (2 contra 2, 3 contra 3)
import * as Perfil from "./perfil.js"; // cuenta con Google, historial, conectados (tanda 4B)
import * as G from "./gloria.js";     // lo que se desbloquea con la gloria (4C) y la clasificatoria (4D)
import { azarDe } from "./bot-equipos.js";

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const RATIO = 860 / 600;
const CANTO = { envido: "envido", real_envido: "real envido", falta_envido: "falta envido", truco: "truco", retruco: "retruco", vale_cuatro: "vale cuatro", flor: "flor", contraflor: "contraflor", contraflor_al_resto: "contraflor al resto" };
const BOTON_CANTO = { envido: "Envido", real_envido: "Real envido", falta_envido: "Falta envido", truco: "Truco", retruco: "Quiero retruco", vale_cuatro: "Vale cuatro", flor: "Flor", contraflor: "Contraflor", contraflor_al_resto: "Contraflor al resto" };
const DICHO = { envido: "¡Envido!", envido_envido: "¡Envido, envido!", real_envido: "¡Real envido!", falta_envido: "¡Falta envido!", truco: "¡Truco!", retruco: "¡Quiero retruco!", vale_cuatro: "¡Vale cuatro!", flor: "¡Flor!", contraflor: "¡Contraflor!", contraflor_al_resto: "¡Contraflor al resto!",
  quiero: "¡Quiero!", no_quiero: "No quiero", con_flor_me_achico: "Con flor me achico", son_buenas: "Son buenas", son_mejores: "¡Son mejores!", en_mesa: "Las quiero en mesa", mazo: "Me voy al mazo", envido_primero: "¡El envido está primero!", gane: "¡Ganamos!", perdi: "Otra vez será" };
const ENVIDOS = ["envido", "real_envido", "falta_envido"], TRUCOS = ["truco", "retruco", "vale_cuatro"];

let modo = null, estado = null, red = null, codigo = null, config = { meta: 15, flor: false, nombre: "" };
let rivalPerfil = null; // perfil del rival en el 1 contra 1 (para el cara a cara y anotar la partida)
let perfiles1v1 = [null, null], enClasif = false, cuentas = {}, misCuentas = {}, prueba = null, probado = false; // probado: el invitado contesta una sola prueba por mesa // perfiles por asiento (de la base), clasificatoria, cuentas de estilo
let vista = null, elegida = null, botTimer = null, finTimer = null, ultimoReparto = 0, confirmaMazo = false, capaCerradaMano = null;
const cartasEl = new Map();

// ---------------- guardado (solo el anfitrión, para sobrevivir a una recarga) ----------------
const guardar = () => { if (modo !== "anfitrion") return; try { localStorage.setItem("truco-sala", JSON.stringify({ codigo, config, estado })); } catch {} };
const leerGuardado = () => { try { return JSON.parse(localStorage.getItem("truco-sala")); } catch { return null; } };
const nombreGuardado = () => { try { return localStorage.getItem("truco-nombre") || ""; } catch { return ""; } };
const guardarNombre = n => { try { localStorage.setItem("truco-nombre", n); } catch {} };

function aviso(txt, ms = 3200) {
  const a = $("#aviso"); a.textContent = txt; a.hidden = false;
  clearTimeout(aviso.t); aviso.t = setTimeout(() => (a.hidden = true), ms);
}

// ================= INICIO =================
function iniciar() {
  document.querySelector(".ic1").innerHTML = dorso();
  document.querySelector(".ic2").innerHTML = frente("1-espada");
  $("#in-nombre").value = $("#in-nombre-inv").value = nombreGuardado();
  for (const g of document.querySelectorAll(".segmentado")) g.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    for (const x of g.querySelectorAll("button")) x.setAttribute("aria-pressed", x === b);
    const enEquipo = jugadoresElegidos() > 2;
    $("#campo-punta").hidden = !enEquipo;
    $("#btn-crear").textContent = enEquipo ? "Armar la mesa" : "Invitar a alguien";
    $("#btn-practica").textContent = enEquipo ? "Practicar con bots" : "Practicar contra la máquina";
  });
  // en el celular el toque "vale" al levantar el dedo (pointerup/touchend/click), no al apoyarlo
  for (const ev of ["pointerdown", "pointerup", "touchend", "click", "keydown"])
    document.addEventListener(ev, () => { S.desbloquear(); S.precargar(); }, { passive: true, capture: true });
  S.cargarFrases();

  const sala = params.get("sala");
  if (params.get("mesa")) Mesa.desdeLink(params);
  else if (sala) {
    const g = leerGuardado();
    if (params.get("host") && g?.codigo === sala) return reanudarAnfitrion(g);
    $("#bloque-crear").hidden = true; $("#bloque-invitado").hidden = false;
    $("#btn-entrar").onclick = () => entrarComoInvitado(sala);
  }
  $("#btn-crear").onclick = () => crearSala();
  $("#btn-mate").innerHTML = G.MATE;
  $("#btn-mate").onclick = () => { Perfil.tomarMate(); const b = $("#btn-mate"); b.classList.add("tomando"); setTimeout(() => b.classList.remove("tomando"), 1300); aviso("Tomaste un mate: +1 de gloria al terminar la partida"); };
  $("#btn-practica").onclick = empezarPractica;
  $("#btn-copiar").onclick = copiarLink;
  $("#btn-compartir").onclick = compartirLink;
  addEventListener("resize", () => vista && render([], true));
  Perfil.iniciar({ aviso, crearMesaEquipos: extra => Mesa.crearMesa({ ...leerForm(), ...extra }), crearSalaClasif: extra => crearSala(extra) });
}
function leerForm() {
  const nombre = ($("#in-nombre").value.trim() || "Yo").slice(0, 16); guardarNombre(nombre);
  return { nombre, meta: +document.querySelector("[data-meta][aria-pressed=true]").dataset.meta, flor: document.querySelector("[data-flor][aria-pressed=true]").dataset.flor === "1",
    dificultad: document.querySelector("[data-nivel][aria-pressed=true]")?.dataset.nivel || "normal",
    jugadores: jugadoresElegidos(), puntaYHacha: jugadoresElegidos() > 2 && document.querySelector("[data-punta][aria-pressed=true]")?.dataset.punta === "1" };
}
function jugadoresElegidos() { return +(document.querySelector("[data-jug][aria-pressed=true]")?.dataset.jug || 2); }

// ================= ANFITRIÓN =================
function crearSala(extra = {}) {
  if (!window.Peer) return aviso("No cargó la conexión. Revisá internet y recargá.");
  config = { ...leerForm(), ...extra };
  if (config.clasificatoria) config.jugadores = 2; // la clasificatoria de a 1 es mano a mano
  enClasif = !!config.clasificatoria;
  if (config.jugadores > 2) return Mesa.crearMesa(config);
  codigo = codigoNuevo(); estado = null; modo = "anfitrion";
  history.replaceState(null, "", `?sala=${codigo}&host=1`);
  guardar(); mostrarEspera(); conectarAnfitrion();
  Perfil.linkListo(linkDe(codigo), "mano a mano");
}
function reanudarAnfitrion(g) {
  config = g.config; codigo = g.codigo; estado = g.estado; modo = "anfitrion"; rivalPerfil = g.config.perfiles?.[1] || null; enClasif = !!g.config.clasificatoria;
  Perfil.linkListo(linkDe(codigo), "mano a mano");
  const esperarPeer = () => window.Peer ? conectarAnfitrion() : setTimeout(esperarPeer, 100);
  if (estado) { abrirJuego(); recibir(M.vista(estado, 0), []); aviso("Partida recuperada. Esperando que vuelva tu rival…"); }
  else mostrarEspera();
  esperarPeer();
}
function mostrarEspera() {
  $("#bloque-crear").hidden = true; $("#bloque-invitado").hidden = true; $("#bloque-espera").hidden = false;
  $("#txt-link").textContent = linkDe(codigo);
  if (!navigator.share) $("#btn-compartir").hidden = true;
  // probando en local: 127.0.0.1 en otro aparato es ese aparato, así que el link no le llega
  if (/^(localhost|127\.|\[::1\])/.test(location.hostname))
    aviso("Ojo: este link solo abre en esta compu. Para el celular, abrí la página con la IP de la PC (192.168…) o usá la versión publicada.", 9000);
}
function conectarAnfitrion() {
  red = abrirSala(codigo, {
    alAbrir: () => { $("#txt-espera").textContent = "Mesa abierta. Esperando que entre…"; },
    alEntrar: () => puntoRed(true),
    alSalir: () => { puntoRed(false); aviso(`${nombreRival()} se desconectó. Cuando vuelva a abrir el link, siguen.`, 5000); },
    alError: e => { if (e.type !== "peer-unavailable") aviso("Problema de conexión: " + (e.type || e.message)); },
    alMensaje: m => {
      if (m.t === "hola") {
        const nombre = (m.nombre || "Invitado").slice(0, 16);
        if (!estado) {
          estado = M.nuevaPartida({ meta: config.meta, flor: config.flor, nombres: [config.nombre, nombre] });
          const r = M.repartir(estado); estado = r.estado; guardar(); abrirJuego(); difundir(r.eventos);
          aviso(`${nombre} se sentó a la mesa`);
        } else { abrirJuego(); red.enviar({ t: "vista", vista: M.vista(estado, 1), eventos: [] }); aviso(`${nombre} volvió`); }
        puntoRed(true);
        // el perfil del invitado vale recién cuando prueba que es suyo (escribe en la base el código que le paso)
        const dice = typeof m.perfil === "string" ? m.perfil.slice(0, 40) : null;
        if (dice && dice !== rivalPerfil) { prueba = { perfil: dice, codigo: Perfil.nuevoCodigo() }; red.enviar({ t: "prueba", codigo: prueba.codigo }); }
        if (!rivalPerfil) { config.perfiles = [Perfil.perfilId(), null]; guardar(); }
        red.enviar({ t: "perfiles", ids: config.perfiles || [Perfil.perfilId(), null], clasificatoria: enClasif });
        caraACara(); if (!prueba) aplicarPerfiles(config.perfiles || [Perfil.perfilId(), null]); // con prueba pendiente, los objetos esperan
      } else if (m.t === "probado" && prueba) {
        const { perfil, codigo: cod } = prueba; prueba = null;
        Perfil.verificar(perfil, `${codigo}:${cod}`).then(ok => {
          if (!ok) { aplicarPerfiles([Perfil.perfilId(), null]); return aviso("No pude comprobar la cuenta de tu rival: juega sin perfil."); }
          rivalPerfil = perfil; config.perfiles = [Perfil.perfilId(), rivalPerfil]; guardar();
          red.enviar({ t: "perfiles", ids: config.perfiles, clasificatoria: enClasif });
          caraACara(); aplicarPerfiles(config.perfiles);
        });
      } else if (m.t === "accion") hostAplicar(1, m.accion);
      else if (m.t === "revancha" && vista?.fase === "fin_partida") nuevaPartidaMismaMesa();
    }
  });
}
function hostAplicar(j, accion) {
  let r;
  try { r = M.aplicar(estado, j, accion); }
  catch (e) { console.warn("acción rechazada", j, accion, e.message); if (j === 1 && modo === "anfitrion") red.enviar({ t: "vista", vista: M.vista(estado, 1), eventos: [] }); return; }
  estado = r.estado; guardar(); difundir(r.eventos);
}
/**
 * Perfiles de los dos asientos (de la base, no de lo que dice cada navegador): pinta del nombre y, en el anfitrión,
 * los objetos de cada uno para esta partida (peluca, trampa; en la clasificatoria, desde Oro 4).
 */
async function aplicarPerfiles(ids) {
  const pf = await Perfil.perfilesDe(ids);
  perfiles1v1 = [pf[ids[0]] || null, pf[ids[1]] || null];
  // una sola vez por partida (si el invitado se reconecta, no se le devuelven los usos)
  if ((modo === "anfitrion" || modo === "practica") && estado && estado.fase !== "fin_partida" && !estado.poderesListos) {
    const pd = perfiles1v1.map(x => G.poderesDe(x, enClasif));
    estado = M.darPoderes(estado, { peluca: pd.map(x => x.peluca), trampa: pd.map(x => x.trampa) });
    estado.poderesListos = true;
    guardar(); difundir([]);
  } else if (vista) render([], true);
}
function difundir(eventos) {
  if (eventos.some(e => e.t === "reparto")) ultimoReparto = Date.now();
  if (modo === "anfitrion") G.contarEventos(cuentas, eventos, estado);
  recibir(M.vista(estado, 0), eventos);
  if (modo === "anfitrion") red?.enviar({ t: "vista", vista: M.vista(estado, 1), eventos });
  if (modo === "practica") programarBot();
  if (modo === "anfitrion" && eventos.some(e => e.t === "fin_partida")) anotarPartida();
}
/** Terminó la partida: el anfitrión la propone y el invitado la confirma desde su navegador. */
async function anotarPartida() {
  const id = await Perfil.anotar({ codigo, tipo: "1v1", meta: estado.meta, puntos: [...estado.puntos], ganador: estado.ganador, clasificatoria: enClasif,
    estilo: cuentas[0] || null, jugadores: [{ id: Perfil.perfilId(), lado: 0 }, { id: rivalPerfil, lado: 1 }] });
  cuentas = {};
  if (!id) return;
  red?.enviar({ t: "anotada", id, puntos: [...estado.puntos] });
  setTimeout(caraACara, 4000);
}
/** «Fulano 4 a 1» en la barra: verde si vas ganando, rojo si vas perdiendo. */
async function caraACara() {
  const el = $("#cara-a-cara");
  if (!rivalPerfil || !Perfil.perfilId() || !vista) { el.hidden = true; return; }
  const r = await Perfil.caraACara(rivalPerfil, nombreRival());
  if (!r) return;
  el.textContent = r.texto; el.title = r.titulo || ""; el.className = "cara-a-cara " + r.clase; el.hidden = false;
}
function nuevaPartidaMismaMesa() {
  const nombres = vista.nombres.slice();
  estado = M.nuevaPartida({ meta: config.meta, flor: config.flor, nombres });
  cuentas = {}; Perfil.nuevaPartida();
  if (perfiles1v1.some(Boolean)) { const pd = perfiles1v1.map(x => G.poderesDe(x, enClasif)); estado = M.darPoderes(estado, { peluca: pd.map(x => x.peluca), trampa: pd.map(x => x.trampa) }); estado.poderesListos = true; }
  const r = M.repartir(estado); estado = r.estado; guardar(); cerrarCapa(); difundir(r.eventos);
}
async function copiarLink() {
  const url = linkDe(codigo);
  try { await navigator.clipboard.writeText(url); aviso("Link copiado"); } catch { aviso(url, 6000); }
}
async function compartirLink() {
  try { await navigator.share({ title: "Truco", text: `${config.nombre || "Te"} te invita a un truco`, url: linkDe(codigo) }); } catch {}
}

// ================= INVITADO =================
function entrarComoInvitado(sala) {
  if (!window.Peer) return aviso("No cargó la conexión. Revisá internet y recargá.");
  const nombre = ($("#in-nombre-inv").value.trim() || "Invitado").slice(0, 16); guardarNombre(nombre);
  modo = "invitado"; codigo = sala;
  $("#btn-entrar").disabled = true; $("#txt-invitado").textContent = "Buscando la mesa…";
  let conectadoAlguna = false;
  red = entrarSala(sala, {
    alConectar: () => { conectadoAlguna = true; red.enviar({ t: "hola", nombre, perfil: Perfil.perfilId() }); $("#txt-invitado").textContent = "Sentándote…"; puntoRed(true); },
    alMensaje: m => {
      if (m.t === "vista") { abrirJuego(); recibir(m.vista, m.eventos || []); }
      else if (m.t === "prueba" && typeof m.codigo === "string" && !probado) { probado = true; Perfil.probar(`${codigo}:${m.codigo.slice(0, 24)}`).then(ok => ok && red.enviar({ t: "probado" })); }
      else if (m.t === "perfiles") {
        rivalPerfil = typeof m.ids?.[0] === "string" ? m.ids[0].slice(0, 40) : null; enClasif = m.clasificatoria === true;
        setTimeout(caraACara, 600); aplicarPerfiles([rivalPerfil, Perfil.perfilId()]);
      }
      else if (m.t === "anotada" && vista) Perfil.confirmar(m.id, m.puntos, vista.puntos, { clasif: enClasif, estilo: misCuentas[vista.yo] || null }).then(() => { misCuentas = {}; setTimeout(caraACara, 2000); });
      else if (m.t === "lleno") { $("#txt-invitado").textContent = "La mesa ya está completa."; red.cerrar(); }
    },
    alCortar: () => { puntoRed(false); aviso("Se cortó la conexión. Reconectando…"); },
    alError: e => {
      if (e.type === "peer-unavailable") {
        const t = conectadoAlguna ? "No encuentro la mesa. Reintentando…" : "No encuentro la mesa. ¿El que te invitó tiene la pestaña abierta? Reintento solo.";
        if ($("#juego").hidden) $("#txt-invitado").textContent = t; else aviso(t);
      }
    }
  });
}

// ================= PRÁCTICA =================
function empezarPractica() {
  config = leerForm();
  if (config.jugadores > 2) return Mesa.practicarMesa(config);
  modo = "practica";
  estado = M.nuevaPartida({ meta: config.meta, flor: config.flor, nombres: [config.nombre, "El Barajador"] });
  const r = M.repartir(estado); estado = r.estado; abrirJuego(); difundir(r.eventos);
  if (Perfil.perfilId()) aplicarPerfiles([Perfil.perfilId(), null]);
}
function programarBot() {
  clearTimeout(botTimer);
  const acc = M.acciones(estado, 1);
  if (!acc.length) return;
  // en el fin de mano el bot confirma tranquilo, para que se alcance a leer el resumen
  const finMano = acc.every(a => a.t === "seguir" || a.t === "mostrar" || a.t === "en_mesa");
  if (acc.every(a => a.t === "en_mesa")) return;  // pedir en mesa es decisión del bot solo cuando además le toca algo
  const espera = (finMano ? 2600 : 900 + Math.random() * 900) + Math.max(0, 2800 - (Date.now() - ultimoReparto));
  botTimer = setTimeout(() => { try { hostAplicar(1, Bot.elegir(M.vista(estado, 1), azarDe(config.dificultad))); } catch (e) { console.error(e); } }, espera);
}

// ================= JUEGO =================
function abrirJuego() {
  if (!$("#juego").hidden) return;
  $("#inicio").hidden = true; $("#juego").hidden = false;
  Perfil.jugando(true);
  $("#btn-tanteador").onclick = () => abrirCapa(hojaTanteador());
  $("#btn-menu").onclick = () => abrirCapa(hojaMenu());
  $("#mesa").addEventListener("click", e => { if (!e.target.closest(".carta") && elegida) { elegida = null; render([], false); } });
}
function enviarAccion(accion) {
  elegida = null; confirmaMazo = false;
  if (modo === "invitado") red.enviar({ t: "accion", accion });
  else hostAplicar(0, accion);
}
const yo = () => vista.yo;
const rv = () => 1 - vista.yo;
const nombreRival = () => vista ? vista.nombres[rv()] : "Tu rival";
const nombreDe = j => (j === vista.yo ? "Vos" : vista.nombres[j]);
function puntoRed(ok) { const p = $("#punto-red"); if (p) { p.classList.toggle("si", ok); p.classList.toggle("no", !ok); } }

let cola = Promise.resolve();
function recibir(v, eventos) { cola = cola.then(() => procesar(v, eventos)).catch(e => console.error(e)); }
// el invitado recibe la vista por red: se normaliza antes de usarla (números, ids de carta, nombres como texto)
function sanear(v) {
  const n = x => Number.isFinite(+x) ? Math.trunc(+x) : 0, carta = x => (idValido(x) ? x : null);
  v.yo = v.yo === 1 ? 1 : 0; v.meta = v.meta === 30 ? 30 : 15; v.mano = v.mano === 1 ? 1 : 0;
  v.puntos = [n(v.puntos?.[0]), n(v.puntos?.[1])]; v.cartasRival = Math.min(3, Math.max(0, n(v.cartasRival)));
  v.nombres = [String(v.nombres?.[0] ?? "").slice(0, 16), String(v.nombres?.[1] ?? "").slice(0, 16)];
  v.miMano = (v.miMano || []).map(carta).filter(Boolean).slice(0, 3);
  v.bazas = (v.bazas || []).slice(0, 3).map(b => ({ c0: carta(b.c0), c1: carta(b.c1), gana: [0, 1, "parda"].includes(b.gana) ? b.gana : null }));
  if (v.envido) { v.envido.mostradas = (v.envido.mostradas || []).map(carta).filter(Boolean); v.envido.puntos = v.envido.puntos == null ? null : n(v.envido.puntos);
    v.envido.tantos = [0, 1].map(j => v.envido.tantos?.[j] == null ? null : n(v.envido.tantos[j])); }
  if (v.truco) v.truco.nivel = n(v.truco.nivel);
  v.listos = [!!v.listos?.[0], !!v.listos?.[1]]; v.numeroMano = n(v.numeroMano);
  const TIPOS = ["jugar", "canto", "quiero", "no_quiero", "con_flor_me_achico", "tanto", "son_buenas", "son_mejores", "en_mesa", "mostrar", "mazo", "seguir", "mazo_peluca", "trampa"];
  v.acciones = (Array.isArray(v.acciones) ? v.acciones : []).filter(a => a && TIPOS.includes(a.t) && (a.t !== "canto" || a.c in CANTO) && (a.t !== "jugar" || idValido(a.carta)))
    .map(a => (a.t === "canto" ? { t: a.t, c: a.c } : a.t === "jugar" ? { t: a.t, carta: a.carta } : { t: a.t }));
  if (v.cantoPendiente && !(v.cantoPendiente.c in CANTO)) v.cantoPendiente = null;
  v.resumenMano = Array.isArray(v.resumenMano) ? v.resumenMano.map(x => ({ quien: x.quien === 1 ? 1 : 0, motivo: String(x.motivo ?? ""), puntos: n(x.puntos) })) : null;
  return v;
}
async function procesar(v, eventos) {
  if (modo === "invitado") { v = sanear(v); eventos = Array.isArray(eventos) ? eventos : []; }
  const prev = vista;
  if (eventos.some(e => e.t === "reparto")) { cerrarCapa(); await juntarYMezclar(); vista = v; render(eventos, false, true); }
  else { vista = v; render(eventos, false, false); }
  if (!prev && rivalPerfil) caraACara(); // el perfil del rival llegó antes que la primera mesa
  if (modo === "invitado") G.contarMio(misCuentas, eventos, v.yo, [...v.miMano, ...v.bazas.map(b => b["c" + v.yo]).filter(Boolean)], v.envido?.tantos);
  cantar(eventos, prev);
}

// ---------- medidas de la mesa ----------
function medidas() {
  const mesa = $("#mesa"), W = mesa.clientWidth, H = mesa.clientHeight, barH = $("#acciones").offsetHeight;
  const ancho = Math.min(W, 520), cx = W / 2;
  const cw = Math.min(ancho * 0.27, 128, (H - barH) * 0.17), ch = cw * RATIO;
  const rw = Math.min(ancho * 0.15, 70), rh = rw * RATIO;
  const top = parseFloat(getComputedStyle($(".barra")).height) || 52;
  const rivalY = top + rh / 2 + 2;
  const manoY = H - barH - ch / 2 - 4;
  const libre = (manoY - ch / 2) - (rivalY + rh / 2);
  const tw = Math.min(ancho * 0.2, 100, libre * 0.42 / RATIO), th = tw * RATIO;
  const mesaY = rivalY + rh / 2 + libre * 0.46;
  return { W, H, cx, cw, ch, rw, rh, tw, th, rivalY, manoY, mesaY, barH, ancho };
}
const giroDe = id => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0; return (Math.abs(h) % 13) - 6; };

function posiciones(v, m) {
  const out = [], Y = v.yo, R = 1 - Y;
  const enMesa = new Set(); v.bazas.forEach(b => { if (b.c0) enMesa.add(b.c0); if (b.c1) enMesa.add(b.c1); });
  const jugables = new Set((v.acciones || []).filter(a => a.t === "jugar").map(a => a.carta));
  const mostradas = new Set(v.envido?.mostradas || []);
  // mi mano, en abanico
  const n = v.miMano.length;
  v.miMano.forEach((id, i) => {
    const off = i - (n - 1) / 2, sel = id === elegida;
    out.push({ key: id, id, x: m.cx + off * m.cw * 0.74, y: m.manoY + Math.abs(off) * m.cw * 0.07 - (sel ? m.ch * 0.16 : 0), w: m.cw, r: sel ? 0 : off * 8, arriba: true, z: 50 + i,
      jugable: jugables.has(id), elegida: sel, mostrada: mostradas.has(id) && v.envido?.ganador === Y });
  });
  // mano del rival: dorsos, y boca arriba las que mostró del tanto y todavía no jugó
  const visibles = v.envido?.ganador === R ? [...mostradas].filter(id => !enMesa.has(id)) : [];
  const nDorsos = Math.max(0, v.cartasRival - visibles.length), total = nDorsos + visibles.length;
  for (let i = 0; i < total; i++) {
    const off = i - (total - 1) / 2, esVisible = i >= nDorsos, id = esVisible ? visibles[i - nDorsos] : null;
    out.push({ key: esVisible ? id : "r" + i, id, x: m.cx + off * m.rw * 0.62, y: m.rivalY - Math.abs(off) * m.rw * 0.06, w: m.rw, r: -off * 8 + 180 * 0, arriba: esVisible, z: 20 + i, rival: true });
  }
  // la mesa: cada baza en su columna, la del rival arriba y la mía abajo, como en una mesa de verdad
  v.bazas.forEach((b, i) => {
    const x = m.cx + (i - 1) * m.tw * 1.22;
    for (const j of [R, Y]) {
      const id = b["c" + j]; if (!id) continue;
      const mia = j === Y;
      out.push({ key: id, id, x, y: m.mesaY + (mia ? 1 : -1) * m.th * 0.3, w: m.tw, r: giroDe(id), arriba: true, z: 30 + i * 2 + (mia ? 1 : 0),
        gana: b.gana === j, apagada: b.gana != null && b.gana !== "parda" && b.gana !== j, deRival: !mia });
    }
  });
  return out;
}

function crearCarta(key, id) {
  const el = document.createElement("div");
  el.className = "carta abajo sin-anim"; el.dataset.key = key;
  el.innerHTML = `<div class="giro"><div class="cara frente">${id ? frente(id) : ""}</div><div class="cara dorso">${dorso()}</div></div>`;
  el.addEventListener("click", () => tocarCarta(el));
  $("#mesa").appendChild(el); cartasEl.set(key, el);
  return el;
}
function ubicar(el, p) {
  const h = p.w * RATIO;
  el.style.width = p.w + "px"; el.style.height = h + "px";
  el.style.transform = `translate(${p.x - p.w / 2}px, ${p.y - h / 2}px) rotate(${p.r}deg)`;
  el.style.zIndex = p.z;
}
function tocarCarta(el) {
  const id = el.dataset.key;
  if (!el.classList.contains("jugable")) return;
  S.desbloquear();
  if (elegida === id) { enviarAccion({ t: "jugar", carta: id }); }
  else { elegida = id; S.roce(0, 0.1, 0.05); render([], false); }
}

function render(eventos, sinAnim, reparto) {
  const v = vista, m = medidas();
  const pr = perfiles1v1[rv()];
  if (pr) $("#nombre-rival").innerHTML = Perfil.nombreHTML(pr, { titulo: true }); else $("#nombre-rival").textContent = v.nombres[rv()];
  const ac = G.accesoriosDe(pr, enClasif), po = v.poderes || {};
  $("#poderes-rival").innerHTML = (ac.gorra ? G.gorraMini() : "") + (ac.peluca ? `<span class="pelu-dot" style="background:${ac.peluca}" title="peluca"></span>` : "")
    + (po.peluca?.[rv()] > 0 ? '<span class="mini-chip">peluca</span>' : "") + (po.trampa?.[rv()] > 0 ? '<span class="mini-chip">trampa</span>' : "");
  $("#btn-mate").hidden = !(modo !== "practica" && Perfil.mateDisponible(enClasif) && v.fase !== "fin_partida");
  $("#chip-rival").hidden = v.mano !== rv() || v.fase !== "jugando";
  if (elegida && !v.miMano.includes(elegida)) elegida = null;

  const ps = posiciones(v, m), vivos = new Set(ps.map(p => p.key));
  // el dorso que el rival acaba de tirar: de ahí sale su carta
  let origenRival = null;
  for (const [k, el] of cartasEl) if (!vivos.has(k)) {
    if (k.startsWith("r") && !origenRival) origenRival = el.style.transform;
    el.remove(); cartasEl.delete(k);
  }
  let orden = 0;
  for (const p of ps) {
    let el = cartasEl.get(p.key), nueva = false;
    if (!el) {
      nueva = true; el = crearCarta(p.key, p.id);
      if (reparto) {
        // sale del mazo, en el centro, boca abajo
        ubicar(el, { x: m.cx, y: m.mesaY, w: m.tw, r: 0, z: 100 });
      } else if (p.deRival) {
        el.style.width = m.rw + "px"; el.style.height = m.rw * RATIO + "px";
        el.style.transform = origenRival || `translate(${m.cx - m.rw / 2}px, ${m.rivalY - m.rh / 2}px)`;
      } else { ubicar(el, p); el.style.opacity = 0; }
    } else if (p.id && !el.querySelector(".frente svg")) el.querySelector(".frente").innerHTML = frente(p.id);
    el.classList.toggle("jugable", !!p.jugable);
    el.classList.toggle("elegida", !!p.elegida);
    el.classList.toggle("gana", !!p.gana);
    el.classList.toggle("apagada", !!p.apagada);
    el.classList.toggle("mostrada", !!p.mostrada);
    if (p.jugable) { el.setAttribute("role", "button"); el.tabIndex = 0; el.setAttribute("aria-label", nombreCarta(p.id) + (p.elegida ? ", tocá de nuevo para tirarla" : "")); }
    else { el.removeAttribute("role"); el.tabIndex = -1; el.setAttribute("aria-label", p.id ? nombreCarta(p.id) : "carta boca abajo"); }

    if (sinAnim) { el.classList.add("sin-anim"); ubicar(el, p); el.classList.toggle("abajo", !p.arriba); el.style.opacity = 1; continue; }
    const demora = reparto ? repartoDemora(p, v) : 0;
    el.getBoundingClientRect();  // fija el punto de partida antes de animar
    el.classList.remove("sin-anim");
    el.style.transitionDelay = demora + "ms";
    requestAnimationFrame(() => {
      ubicar(el, p); el.style.opacity = 1;
      if (reparto && nueva) { if (p.arriba) setTimeout(() => el.classList.remove("abajo"), demora + 480); else el.classList.add("abajo"); S.roce(demora / 1000, 0.12, 0.05); }
      else if (nueva && p.deRival) { setTimeout(() => { el.classList.remove("abajo"); S.chasquido(0, 0.24); }, 180); S.golpe(0.5, 0.15); }
      else el.classList.toggle("abajo", !p.arriba);
      setTimeout(() => (el.style.transitionDelay = "0ms"), demora + 20);
    });
    orden++;
  }
  // los sonidos de mis jugadas
  for (const e of eventos) if (e.t === "jugada" && e.jugador === v.yo) { S.roce(0, 0.15, 0.06); S.golpe(0.45, 0.14); }

  renderEstado(v, m); renderNota(v, m); renderAcciones(v); renderTanteador(v);
  clearTimeout(finTimer);
  if (v.fase === "fin_mano" || v.fase === "fin_partida") {
    const recien = eventos.some(e => e.t === "fin_mano" || e.t === "fin_partida");
    const capa = $("#capa"), abierta = !capa.hidden && capa.dataset.tipo === "fin";
    // si la cerró para mirar la mesa, no se la reabrimos en esta misma mano (salvo que termine la partida)
    if (recien || abierta || (capaCerradaMano !== v.numeroMano) || v.fase === "fin_partida")
      finTimer = setTimeout(() => abrirCapa(v.fase === "fin_partida" ? hojaFinPartida() : hojaFinMano()), recien ? 1700 : 50);
  } else if ($("#capa").dataset.tipo === "fin") cerrarCapa();
}
function repartoDemora(p, v) {
  // se reparte de a una, alternando, empezando por el que es mano
  const i = p.rival ? +String(p.key).replace("r", "") || 0 : v.miMano.indexOf(p.key);
  const primeroYo = v.mano === v.yo;
  const turno = p.rival ? (primeroYo ? 1 : 0) : (primeroYo ? 0 : 1);
  return (i * 2 + turno) * 170;
}

// junta las cartas de la mano anterior en el mazo y lo mezcla tipo riffle (como en el reel)
async function juntarYMezclar() {
  const m = medidas(), mesa = $("#mesa");
  if (cartasEl.size) {
    for (const el of cartasEl.values()) { el.style.transitionDelay = "0ms"; el.classList.add("abajo"); ubicar(el, { x: m.cx, y: m.mesaY, w: m.tw, r: 0, z: 60 }); }
    S.roce(0, 0.5, 0.08);
    await espera(560);
    for (const el of cartasEl.values()) el.remove();
    cartasEl.clear();
  }
  const pila = [];
  for (let j = 0; j < 10; j++) {
    const el = document.createElement("div"); el.className = "carta abajo sin-anim";
    el.innerHTML = `<div class="giro"><div class="cara frente"></div><div class="cara dorso">${dorso()}</div></div>`;
    ubicar(el, { x: m.cx, y: m.mesaY - j * 1.5, w: m.tw, r: 0, z: 70 + j }); mesa.appendChild(el); pila.push(el);
  }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { await espera(300); pila.forEach(e => e.remove()); return; }
  const dur = 1150, abre = Math.min(m.W * 0.2, 120);
  S.riffle(0, dur / 1000);
  await Promise.all(pila.map((el, j) => {
    const lado = j % 2 ? 1 : -1, base = el.style.transform, cierre = 0.36 + 0.5 * j / 10;
    return el.animate([
      { transform: base, offset: 0 },
      { transform: `${base} translate(${lado * abre}px, -6px) rotate(${lado * 9}deg)`, offset: 0.3 },
      { transform: `${base} translate(${lado * abre}px, -6px) rotate(${lado * 9}deg)`, offset: Math.min(cierre, 0.84) },
      { transform: base, offset: Math.min(cierre + 0.14, 1) },
      { transform: base, offset: 1 }
    ], { duration: dur, easing: "cubic-bezier(.45,0,.25,1)" }).finished;
  }));
  pila.forEach(e => e.remove());
}
const espera = ms => new Promise(r => setTimeout(r, ms));

// ---------- texto de estado, nota del envido, botones ----------
function renderEstado(v, m) {
  const el = $("#estado"), riv = `<b>${esc(v.nombres[rv()])}</b>`;
  let t = "";
  if (v.fase === "fin_partida") t = v.ganador === v.yo ? "<b>¡Ganaste la partida!</b>" : `Ganó ${riv}`;
  else if (v.fase === "fin_mano") t = "Terminó la mano";
  else if (v.cantoPendiente) { const c = esc(CANTO[v.cantoPendiente.c] || v.cantoPendiente.c); t = v.cantoPendiente.de === v.yo ? `Cantaste ${c}. Contesta ${riv}…` : `${riv} cantó <b>${c}</b>`; }
  else if ((v.acciones || []).some(a => a.t === "tanto")) t = "Decí tu tanto";
  else if ((v.acciones || []).some(a => a.t === "son_buenas" || a.t === "son_mejores")) t = `${riv} dijo su tanto`;
  else if (v.turno === v.yo) t = elegida ? "Tocala de nuevo para tirarla" : (v.bazas.every(b => !b.c0 && !b.c1) && v.mano === v.yo ? "Sos mano. <b>Te toca</b>" : "<b>Te toca</b>");
  else if (v.turno != null) t = `Juega ${riv}…`;
  el.innerHTML = t;
  el.style.top = (m.manoY - m.ch / 2 - 40) + "px";
}
function renderNota(v, m) {
  const el = $("#nota"), lineas = [];
  if (v.truco?.nivel > 1) lineas.push(["", "", "truco", "retruco", "vale cuatro"][v.truco.nivel] + " querido");
  const e = v.envido;
  if (e) {
    const [a, b] = [e.tantos?.[v.yo], e.tantos?.[rv()]];
    if (e.puntos != null && e.ganador != null) lineas.push(`envido: ${e.ganador === v.yo ? "vos" : esc(v.nombres[rv()])} +${e.puntos}`);
    if (a != null || b != null) lineas.push(`vos ${a ?? "—"} · ${esc(v.nombres[rv()])} ${b ?? "—"}`);
    if (e.enMesaPedido) lineas.push((e.mostradas?.length ? "las mostró" : "pidió las cartas en mesa"));
    if (e.mintio) lineas.push(`<b>¡mintió! tenía ${+e.real}</b>`);
  }
  el.innerHTML = lineas.map(l => `<span>${l}</span>`).join("");
  el.style.top = (m.mesaY + m.th * 0.95) + "px";
}
function renderAcciones(v) {
  const nav = $("#acciones"), acc = v.acciones || [];
  nav.innerHTML = "";
  const misCartas = () => [...v.miMano, ...v.bazas.map(b => b["c" + v.yo]).filter(Boolean)];
  const tanto = () => { try { return M.tantoDe(misCartas()); } catch { return null; } };
  const fila = () => { const f = document.createElement("div"); f.className = "fila-acc"; nav.appendChild(f); return f; };
  const boton = (f, txt, clase, fn) => { const b = document.createElement("button"); b.className = "b " + clase; b.textContent = txt; b.onclick = () => { S.desbloquear(); fn(); }; f.appendChild(b); return b; };

  if (v.fase === "fin_partida") {
    const f = fila();
    if (modo === "invitado") boton(f, "Pedir otra partida", "fuerte", () => { red.enviar({ t: "revancha" }); aviso(`Le avisé a ${nombreRival()}`); });
    else boton(f, "Otra partida", "fuerte", nuevaPartidaMismaMesa);
    return;
  }
  const resp = acc.filter(a => ["quiero", "no_quiero", "con_flor_me_achico", "son_buenas", "son_mejores", "tanto", "mostrar", "seguir"].includes(a.t));
  const cantos = acc.filter(a => a.t === "canto");
  const chicas = acc.filter(a => ["en_mesa", "mazo", "mazo_peluca", "trampa"].includes(a.t));
  if (resp.length) {
    const f = fila();
    for (const a of resp) {
      if (a.t === "tanto" || a.t === "son_mejores") {
        const min = a.t === "son_mejores" ? liderDicho(v.envido) + 1 : 0;
        if (min <= 33) selectorTanto(f, { real: tanto(), min, tipo: a.t, enviar: enviarAccion, alTocar: () => S.desbloquear() });
        continue;
      }
      const t = { quiero: "Quiero", no_quiero: "No quiero", con_flor_me_achico: "Con flor me achico", son_buenas: "Son buenas", son_mejores: `¡${tanto() ?? ""} son mejores!`, tanto: `Tengo ${tanto() ?? ""}`, mostrar: "Mostrar las cartas", seguir: "Siguiente mano" }[a.t];
      boton(f, t, ["quiero", "tanto", "son_mejores", "mostrar", "seguir"].includes(a.t) ? "fuerte" : "", () => enviarAccion(a));
    }
  }
  if (cantos.length) {
    const env = cantos.filter(a => !TRUCOS.includes(a.c)), tru = cantos.filter(a => TRUCOS.includes(a.c));
    for (const grupo of [env, tru]) if (grupo.length) { const f = fila(); for (const a of grupo) boton(f, BOTON_CANTO[a.c] || a.c, "canto", () => enviarAccion(a)); }
  }
  if (chicas.length) {
    const f = fila();
    for (const a of chicas) {
      if (a.t === "en_mesa") boton(f, "Las quiero en mesa", "chico alerta", () => enviarAccion(a));
      else if (a.t === "mazo_peluca") boton(f, "Mazo con peluca", "chico poder", () => enviarAccion(a));
      else if (a.t === "trampa") boton(f, "Hacer la trampa", "chico poder", () => enviarAccion(a));
      else { const b = boton(f, "Irme al mazo", "chico", () => { if (!confirmaMazo) { confirmaMazo = true; b.textContent = "¿Seguro? Tocá de nuevo"; b.classList.add("alerta"); setTimeout(() => { confirmaMazo = false; if (b.isConnected) { b.textContent = "Irme al mazo"; b.classList.remove("alerta"); } }, 2500); } else enviarAccion(a); }); }
    }
  }
  if (!nav.children.length) { const d = document.createElement("p"); d.className = "vacio"; d.textContent = v.turno === v.yo ? "tirá una carta" : ""; nav.appendChild(d); }
}

// ---------- cantos: voz, bocadillo y lámpara ----------
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
    if (e.t === "fin_partida") { const k = e.ganador === vista.yo ? "gane" : "perdi"; setTimeout(() => S.decir(k), t + 1200); continue; }
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
function bocadillo(jugador, texto) {
  const m = medidas(), el = document.createElement("div"), mio = jugador === vista.yo;
  el.className = "bocadillo" + (mio ? "" : " rival"); el.textContent = texto;
  el.style.top = (mio ? m.manoY - m.ch / 2 - 96 : m.rivalY + m.rh / 2 + 6) + "px";
  $("#bocadillos").appendChild(el);
  setTimeout(() => el.remove(), 2400);
}
function pulsoLampara() {
  const j = $("#juego"); j.classList.add("luz-alta");
  clearTimeout(pulsoLampara.t); pulsoLampara.t = setTimeout(() => j.classList.remove("luz-alta"), 1400);
}

// ---------- tanteador con fósforos (cuadrado de cuatro y uno cruzado = 5) ----------
function fosforos(p, meta, s = 22, gap = 10) {
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
  const col = j => `<div class="col"><span class="quien">${j === v.yo ? "vos" : esc(v.nombres[j])}</span><span class="num">${v.puntos[j]}${v.meta === 30 ? (v.puntos[j] >= 15 ? " · buenas" : " · malas") : ""}</span>${fosforos(v.puntos[j], v.meta, s)}</div>`;
  return `<div class="cols">${col(v.yo)}${col(rv())}</div>`;
}
function renderTanteador(v) {
  $("#btn-tanteador").innerHTML = `<svg viewBox="0 0 14 22" aria-hidden="true"><line x1="7" y1="20" x2="7" y2="5" stroke="#3b3024" stroke-width="2" stroke-linecap="round"/><circle cx="7" cy="4.5" r="3" fill="#b8621b"/></svg><span>vos <b>${v.puntos[v.yo]}</b> · <b>${v.puntos[rv()]}</b></span>`;
  $("#servilleta-fija").innerHTML = servilleta(v, v.meta === 30 ? 18 : 22);
}
function hojaTanteador() {
  return `<div class="hoja servilleta-hoja"><h2>Tanteador</h2><p class="sala">a ${vista.meta}${vista.meta === 30 ? " · malas hasta 15, buenas después" : ""}${vista.flor ? " · con flor" : ""}</p>
    <div class="servilleta">${servilleta(vista, vista.meta === 30 ? 20 : 26)}</div><button class="b" data-cerrar>Volver a la mesa</button></div>`;
}
function hojaFinMano() {
  const r = vista.resumenMano || [];
  const filas = r.length ? r.map(x => `<li><span>${esc(nombreDe(x.quien))} · ${esc(x.motivo)}</span><b>+${x.puntos}</b></li>`).join("") : "<li><span>Sin puntos</span><b>0</b></li>";
  const acc = vista.acciones || [], puede = acc.some(a => a.t === "seguir"), muestra = acc.some(a => a.t === "mostrar");
  const listoRival = vista.listos?.[rv()];
  const e = vista.envido, debeMostrar = muestra && e?.enMesaPedido;
  const avisoMesa = debeMostrar ? `<p><b>Te pidieron las cartas en mesa.</b> Si seguís sin mostrarlas, el envido es para ${esc(nombreRival())}.</p>`
    : (e?.enMesaPedido && e.ganador === rv() && !(e.mostradas?.length) ? `<p>Pediste las cartas en mesa. Si ${esc(nombreRival())} sigue sin mostrarlas, el envido es tuyo.</p>` : "");
  return `<div class="hoja" data-tipo="fin"><h2>Terminó la mano</h2><p class="sala">vos ${vista.puntos[vista.yo]} · ${esc(vista.nombres[rv()])} ${vista.puntos[rv()]} · a ${vista.meta}</p><ul>${filas}</ul>${avisoMesa}
    ${muestra ? '<button class="b" data-accion="mostrar">Mostrar las cartas</button>' : ""}
    ${puede ? `<button class="b${muestra ? " claro" : ""}" data-accion="seguir">Siguiente mano</button>` : `<p>Esperando a ${esc(nombreRival())}…</p>`}
    ${puede && listoRival ? `<p class="sala">${esc(nombreRival())} ya está para la siguiente</p>` : ""}<button class="b claro" data-cerrar>Ver la mesa</button></div>`;
}
function hojaFinPartida() {
  const gane = vista.ganador === vista.yo;
  const otra = modo === "invitado" ? '<button class="b" data-revancha>Pedir otra partida</button>' : '<button class="b" data-otra>Otra partida</button>';
  return `<div class="hoja" data-tipo="fin"><h2>${gane ? "¡Ganaste!" : `Ganó ${esc(nombreRival())}`}</h2><p class="sala">partida a ${vista.meta}</p>
    <div class="marcador">vos ${vista.puntos[vista.yo]} — ${vista.puntos[rv()]} ${esc(nombreRival())}</div><div class="servilleta">${servilleta(vista, vista.meta === 30 ? 16 : 22)}</div>${otra}<button class="b claro" data-cerrar>Ver la mesa</button></div>`;
}
function hojaMenu() {
  const link = codigo ? `<button class="b claro" data-copiar>Copiar el link de la mesa</button>` : "";
  return `<div class="hoja"><h2>Menú</h2><p class="sala">${modo === "practica" ? "práctica contra la máquina" : "partida por link"} · a ${vista.meta}${vista.flor ? " · con flor" : ""}</p>
    <button class="b claro" data-sonido>${S.estaActivo() ? "Silenciar las voces" : "Prender las voces"}</button>${link}
    ${botonPantalla()}<button class="b claro" data-reglas>Reglas rápidas</button><button class="b claro" data-salir>Salir de la mesa</button><button class="b" data-cerrar>Volver</button></div>`;
}
function hojaReglas() {
  return `<div class="hoja"><h2>Reglas rápidas</h2>
  <p><b>Orden:</b> 1 de espada, 1 de basto, 7 de espada, 7 de oro, treses, doses, anchos falsos, reyes, caballos, sotas, sietes falsos, seises, cincos, cuatros.</p>
  <p><b>Envido</b> en la primera baza: envido 2, real 3, falta lo que le falta al que va ganando. El envido está primero: si te cantan truco, todavía podés envidar.</p>
  <p><b>Truco</b> 2, retruco 3, vale cuatro 4. Solo sube el que recibió el último canto.</p>
  <p><b>Las quiero en mesa:</b> si perdiste el envido, podés pedir que el ganador muestre sus cartas. Si termina la mano sin mostrarlas, los puntos son tuyos.</p>
  <button class="b" data-cerrar>Volver</button></div>`;
}
function abrirCapa(html) {
  const c = $("#capa"); c.innerHTML = html; c.hidden = false;
  c.dataset.tipo = c.querySelector("[data-tipo]")?.dataset.tipo || "";
  c.onclick = e => {
    const t = e.target;
    if (t === c || t.closest("[data-cerrar]")) { if (c.dataset.tipo === "fin") capaCerradaMano = vista?.numeroMano; return cerrarCapa(); }
    if (t.closest("[data-accion]")) { const a = t.closest("[data-accion]").dataset.accion; if (a === "seguir") cerrarCapa(); enviarAccion({ t: a }); }
    if (t.closest("[data-otra]")) nuevaPartidaMismaMesa();
    if (t.closest("[data-revancha]")) { red.enviar({ t: "revancha" }); aviso(`Le avisé a ${nombreRival()}`); }
    if (t.closest("[data-pantalla]")) { alternarPantalla(); setTimeout(() => abrirCapa(hojaMenu()), 300); }
    if (t.closest("[data-sonido]")) { S.setActivo(!S.estaActivo()); abrirCapa(hojaMenu()); }
    if (t.closest("[data-copiar]")) copiarLink();
    if (t.closest("[data-reglas]")) abrirCapa(hojaReglas());
    if (t.closest("[data-salir]")) { if (modo === "anfitrion") try { localStorage.removeItem("truco-sala"); } catch {} location.href = location.pathname; }
  };
}
function cerrarCapa() { const c = $("#capa"); c.hidden = true; c.innerHTML = ""; c.dataset.tipo = ""; }
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
