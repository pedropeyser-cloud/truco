// Cuenta del jugador y las pantallas de afuera de la mesa (rediseño 2026-11-12, «pulpería de noche»):
// cabecera con tu cara y tu gloria, barra de abajo (Jugar · Pulpería · Liga · Partidas · Vos), la pulpería (lo que
// se desbloquea con la gloria, como tienda: se canjea al llegar, no se gasta), la liga (clasificatoria), el
// historial y tu perfil con lo que tenés puesto y tus equipos. Usa nube.js (base), gloria.js (reglas 4C/4D),
// catalogo.js (productos y dibujos) y caras.js. Sin nube: solo la pantalla Jugar, como antes.
import * as N from "./nube.js";
import * as G from "./gloria.js";
import * as C from "./catalogo.js";
import * as K from "./caras.js";
import { dorso } from "./cartas.js";
import * as S from "./sonido.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let ganchos = {};                 // { aviso, crearMesaEquipos, crearSalaClasif }
let linkActual = null, tipoActual = "", pendientes = [];
const invitados = new Set();
let mate = false;                 // tomó al menos un mate en esta partida
let vistaActual = "jugar", filtroTienda = "todo", filtroPartidas = "todas";

export const DIBUJOS = { gorra: G.gorra, peluca: G.peluca, sombreros: C.SOMBREROS, ojos: C.OJOS, bocas: C.BOCAS };
const leer = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const escribir = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

/** Lo llama app.js al arrancar. */
export async function iniciar(g) {
  ganchos = g;
  if (!N.activa()) return;
  $("#bloque-cuenta").hidden = false;
  $("#pestanas").hidden = false; $("#cabecera").hidden = false;
  $("#inicio").classList.add("con-pestanas");
  $("#pestanas").onclick = (e) => { const b = e.target.closest("[data-ir]"); if (b) irA(b.dataset.ir); };
  $("#cabecera").onclick = (e) => { const b = e.target.closest("[data-ir]"); if (b) irA(b.dataset.ir); if (e.target.closest("[data-google]")) entrar(); };
  // los clics de las pantallas: uno por pantalla, y lo que pintan adentro cambia
  $("#bloque-cuenta").onclick = clicCuenta;
  $("#bloque-conectados").onclick = (e) => {
    const inv = e.target.closest("[data-invitar]"); if (inv) invitar(inv.dataset.invitar, inv.dataset.u);
    const mas = e.target.closest("[data-mas]"); if (mas) abrirPersona(mas.dataset.mas, mas.dataset.u);
  };
  $("#vista-pulperia").onclick = clicPulperia;
  $("#vista-liga").onclick = clicLiga;
  $("#vista-partidas").onclick = clicPartidas;
  $("#vista-vos").onclick = clicVos;
  // con link de invitación se queda en Jugar; si no, vuelve a la última pestaña
  const conLink = new URLSearchParams(location.search).has("sala") || new URLSearchParams(location.search).has("mesa");
  irA(conLink ? "jugar" : leer("truco-pestana", "jugar"), true);
  N.on("sesion", () => { pintarTodo(); ponerNombre(); });
  N.on("conectados", (l) => { pintarConectados(l); if (vistaActual === "liga") pintarLiga(); });
  N.on("invitacion", mostrarInvitacion);
  N.on("busqueda", ({ error }) => ganchos.aviso?.(error));
  try { await N.iniciar(); } catch (e) { console.error(e); }
  pintarTodo(); ponerNombre();
}

export const perfilId = () => N.miPerfil()?.id || null;
export const usuario = () => N.miPerfil()?.usuario || null;
export const miPerfil = () => N.miPerfil();
export const perfilesDe = (ids) => N.activa() ? N.perfilesDe(ids.filter(Boolean), true).catch(() => ({})) : Promise.resolve({});

/** Lo que se ve en la cara: gorrita y peluca (4C, en la liga desde Oro 4) y lo de la pulpería (siempre). */
export const accDe = (p, enClasif = false) => (p ? { ...G.accesoriosDe(p, enClasif), ...C.pintaCara(p) } : {});
export const formaDe = (p, defecto) => C.formaDe(p, defecto);
export const miDorso = () => C.dorsoDe(N.miPerfil());
export const miPano = () => C.panoDe(N.miPerfil());
export const misPorotos = () => C.usaPorotos(N.miPerfil());

/** Tu cara (o la de otro) ya vestida, en un círculo. */
export function avatar(p, px = 40, { marco = C.tieneMarco(p), acc = null, forma = null } = {}) {
  if (!p) return `<span class="avatar vacio" style="--av:${px}px"></span>`;
  const svg = K.caraCon(forma ?? C.formaDe(p), acc || accDe(p), DIBUJOS, esc(p.usuario));
  return `<span class="avatar${marco ? " marco" : ""}" style="--av:${px}px">${svg}</span>`;
}

/** El nombre en la mesa es el usuario (si entró). */
function ponerNombre() {
  const u = usuario();
  for (const id of ["#in-nombre", "#in-nombre-inv"]) {
    const i = $(id); if (!i) continue;
    if (u) { i.value = u; i.readOnly = true; i.title = "Es tu usuario"; } else { i.readOnly = false; i.title = ""; }
  }
  const campo = $("#campo-nombre"); if (campo) campo.hidden = !!u;
}

/** Nombre con su color, su letra, su insignia y su título debajo (todo de listas cerradas o escapado). */
export function nombreHTML(p, { titulo = true, clase = "" } = {}) {
  if (!p) return "";
  const est = G.estiloNombre(p);
  const ins = G.tiene(p, "insignia") ? G.insignia(16) : "";
  const tit = titulo && p.titulo && G.tiene(p, "titulo") ? `<span class="titulo-n"${est ? ` style="${est}"` : ""}>${esc(p.titulo)}</span>` : "";
  return `<span class="nombre-g ${clase}"><span class="u-n"${est ? ` style="${est}"` : ""}>${esc(p.usuario)}</span>${ins}</span>${tit}`;
}

const partidasPara = (n) => { const k = Math.ceil(n / 3); return k === 1 ? "con una partida ganada llegás" : `unas ${k} partidas ganadas`; };
const SOL = (px = 16) => `<svg class="sol-i" viewBox="-50 -50 100 100" width="${px}" height="${px}" aria-hidden="true"><circle r="20" fill="none" stroke="currentColor" stroke-width="10"/><circle r="5" fill="currentColor"/>${Array.from({ length: 8 }, (_, k) => { const a = k * Math.PI / 4; return `<line x1="${32 * Math.cos(a)}" y1="${32 * Math.sin(a)}" x2="${45 * Math.cos(a)}" y2="${45 * Math.sin(a)}" stroke="currentColor" stroke-width="9" stroke-linecap="round"/>`; }).join("")}</svg>`;
const CANDADO = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>`;

// ================= navegación =================
function irA(v, primera = false) {
  if (!["jugar", "pulperia", "liga", "partidas", "vos"].includes(v)) v = "jugar";
  vistaActual = v; escribir("truco-pestana", v);
  document.querySelectorAll("#inicio > .vista").forEach((el) => (el.hidden = el.dataset.vista !== v));
  document.querySelectorAll("#pestanas [data-ir]").forEach((b) => (b.dataset.ir === v ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
  if (!primera) $("#inicio").scrollTo({ top: 0 });
  pintarVista();
}
function pintarTodo() { pintarCabecera(); pintarPestanas(); pintarVista(); }
function pintarVista() {
  ({ jugar: pintarCuenta, pulperia: pintarPulperia, liga: pintarLiga, partidas: pintarPartidas, vos: pintarVos })[vistaActual]?.();
}

function pintarCabecera() {
  const el = $("#cabecera"); if (!el) return;
  const u = N.miUsuario(), p = N.miPerfil();
  $("#inicio").classList.toggle("con-cuenta", !!p);
  if (!p) {
    el.innerHTML = `<span class="cab-marca">truco</span>${u ? "" : `<button class="b chico-e" data-google>Entrar</button>`}`;
    return;
  }
  const liga = G.ligaDe(p.elo);
  el.innerHTML = `<button class="cab-yo" data-ir="vos" aria-label="Tu perfil">${avatar(p, 42)}<span class="cab-nombre">${nombreHTML(p)}</span></button>
    <span class="cab-chips">${G.tiene(p, "clasif") ? `<button class="chip-liga ${liga.metal}" data-ir="liga">${esc(liga.nombre)}</button>` : ""}
    <button class="chip-gloria" data-ir="pulperia" aria-label="${p.puntos} de gloria: ir a la pulpería">${SOL(16)}<b>${p.puntos}</b></button></span>`;
}
/** La pulpería abre con la gloria del primer producto (3 = una partida ganada); la liga, con los 40 de la clasificatoria. */
const PUL_MIN = C.CATALOGO.find((x) => x.p > 0)?.p ?? 3;
function pintarPestanas() {
  const p = N.miPerfil(), n = p ? canjeables(p).length : 0;
  $("#pestanas [data-ir=pulperia]")?.classList.toggle("bloq", (p?.puntos || 0) < PUL_MIN);
  $("#pestanas [data-ir=liga]")?.classList.toggle("bloq", !G.tiene(p, "clasif"));
  const globo = $("#pestanas .globo");
  if (globo) { globo.hidden = !n; globo.textContent = n || ""; }
  const tc = $("#pestanas .tab-cara");
  if (tc && p) tc.innerHTML = avatar(p, 26, { marco: false });
}

function tarjetaEntrar(texto) {
  return `<div class="entrar-t"><div class="entrar-caras" aria-hidden="true">${[0, 3, 5].map((f) => K.caraCon(f, {}, DIBUJOS)).join("")}</div>
    <p>${texto}</p><button class="b google" data-google>${G_LOGO}<span>Entrar con Google</span></button></div>`;
}
async function entrar() { try { await N.entrarConGoogle(); } catch { ganchos.aviso?.("No se pudo abrir Google. Probá de nuevo."); } }

// ================= Jugar: la cuenta arriba y los conectados abajo =================
function pintarCuenta() {
  const el = $("#bloque-cuenta"); if (!el) return;
  const u = N.miUsuario(), p = N.miPerfil();
  if (!u) {
    el.innerHTML = `<div class="cuenta-fila"><p class="cuenta-txt">Entrá para juntar gloria, canjearla en la pulpería y ver quién está conectado.</p>
      <button class="b google" data-google>${G_LOGO}<span>Entrar con Google</span></button></div>`;
  } else if (!p) {
    el.innerHTML = `<form class="cuenta-alta" data-alta><label class="campo"><span>Elegí tu usuario (así te ven en la mesa)</span>
      <input type="text" name="u" maxlength="16" autocomplete="nickname" placeholder="ej. pedro" required></label>
      <p class="cuenta-error" data-error></p>
      <p class="cuenta-legal">Al guardar aceptás los <a href="terminos.html" target="_blank" rel="noopener">términos de uso</a> y la <a href="privacidad.html" target="_blank" rel="noopener">privacidad</a>.</p>
      <button class="b fuerte">Guardar</button>
      <button type="button" class="b chico" data-salir>Salir</button></form>`;
    el.querySelector("input").value = (u.user_metadata?.full_name || "").split(" ")[0].toLowerCase().slice(0, 16);
    const f = el.querySelector("[data-alta]");
    f.onsubmit = async (e) => {
      e.preventDefault();
      const err = f.querySelector("[data-error]"); err.textContent = "";
      try { await N.crearPerfil(f.u.value); } catch (x) { err.textContent = x.message; }
    };
  } else {
    const nuevos = canjeables(p), prox = C.proximoProducto(p.puntos);
    if (nuevos.length) {
      const x = nuevos[0];
      el.innerHTML = `<button class="aviso-pul brilla" data-ir="pulperia"><span class="ap-ilus">${ilus(x, p, 52)}</span>
        <span class="ap-txt"><b>${nuevos.length === 1 ? "Tenés algo para canjear" : `Tenés ${nuevos.length} cosas para canjear`}</b><small>${esc(x.nombre)}${nuevos.length > 1 ? " y más" : ""} · en la pulpería</small></span><span class="ap-ir">›</span></button>`;
    } else if (prox) {
      const ant = [...C.CATALOGO].reverse().find((x) => x.p <= p.puntos)?.p || 0;
      const pct = Math.round(((p.puntos - ant) / Math.max(1, prox.p - ant)) * 100);
      el.innerHTML = `<button class="aviso-pul" data-ir="pulperia"><span class="ap-ilus apagado">${ilus(prox, p, 52)}</span>
        <span class="ap-txt"><b>Te faltan ${prox.p - p.puntos} de gloria</b><small>para ${esc(prox.nombre.toLowerCase())}</small>
        <span class="barra-g"><i style="width:${pct}%"></i></span></span><span class="ap-ir">›</span></button>`;
    } else el.innerHTML = "";
  }
  pintarConectados(N.listaConectados());
}
function clicCuenta(e) {
  if (e.target.closest("[data-google]")) entrar();
  if (e.target.closest("[data-salir]")) N.salir();
  const ir = e.target.closest("[data-ir]"); if (ir) irA(ir.dataset.ir);
}

function pintarConectados(lista) {
  const el = $("#bloque-conectados"); if (!el) return;
  if (!N.miPerfil()) { el.innerHTML = ""; return; }
  const filas = lista.length ? lista.map((c) => `<li>${avatar(c, 34)}<span class="u">${nombreHTML(c, { titulo: false })}<small class="est ${c.estado === "libre" ? "libre" : "ocupado"}">${c.estado === "libre" ? (c.busca ? `busca ${esc(c.busca)}` : "libre") : "jugando"}</small></span>
    <button class="b chico-e" data-invitar="${esc(c.id)}" data-u="${esc(c.usuario)}" ${invitados.has(c.id) || c.estado !== "libre" ? "disabled" : ""}>${invitados.has(c.id) ? "invitado" : "Invitar"}</button>
    <button class="b chico-e mas-persona" data-mas="${esc(c.id)}" data-u="${esc(c.usuario)}" aria-label="Bloquear o denunciar a ${esc(c.usuario)}">⋯</button></li>`).join("")
    : `<li class="vacio">Nadie más conectado ahora. Mandá el link y que entre con su cuenta.</li>`;
  el.innerHTML = `<section class="conectados"><h3 class="tit-sec"><span class="punto si"></span>En la pulpería ahora <small>${lista.length}</small></h3><ul>${filas}</ul></section>`;
}

// ---------- invitar sin link ----------
/** Lo llaman app.js y mesa.js cuando la mesa ya tiene link. Manda las invitaciones pendientes. */
export function linkListo(link, tipo) {
  linkActual = link; tipoActual = tipo;
  N.fijarEstado("libre");
  const p = pendientes; pendientes = [];
  p.forEach(([id, u]) => mandar(id, u));
}
function invitar(id, u) {
  if (linkActual) return mandar(id, u);
  pendientes.push([id, u]); // todavía no hay mesa: se arma con lo elegido en el formulario y después se manda
  $("#btn-crear")?.click();
}
function mandar(id, u) {
  Promise.resolve(N.invitar(id, linkActual, tipoActual)).catch((e) => ganchos.aviso?.(e.message));
  invitados.add(id);
  ganchos.aviso?.(`Le mandé la invitación a ${u}`);
  pintarConectados(N.listaConectados());
}
export function jugando(si) { N.fijarEstado(si ? "jugando" : "libre"); if (si && N.buscando()) N.buscarRival(null).catch(() => {}); }

function mostrarInvitacion({ de, link, tipo }) {
  let c = $("#invitacion");
  if (!c) { c = document.createElement("div"); c.id = "invitacion"; c.className = "invitacion"; c.setAttribute("role", "alertdialog"); document.body.appendChild(c); }
  c.innerHTML = `<p><b></b> te invita a un truco<span class="tipo"></span></p><div class="fila"><button class="b fuerte" data-ir>Entrar</button><button class="b" data-no>Ahora no</button></div>`;
  c.querySelector("b").textContent = de;
  c.querySelector(".tipo").textContent = tipo ? ` (${tipo})` : "";
  c.hidden = false;
  c.onclick = (e) => {
    if (e.target.closest("[data-ir]")) location.href = link;
    if (e.target.closest("[data-no]")) c.hidden = true;
  };
}

// ---------- prueba de identidad en la mesa ----------
export const nuevoCodigo = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
export const probar = (codigo) => (N.activa() && perfilId() ? N.probarIdentidad(codigo).catch(() => false) : Promise.resolve(false));
export const verificar = (id, codigo) => (N.activa() ? N.verificarIdentidad(id, codigo).catch(() => false) : Promise.resolve(false));

// ---------- el mate ----------
/** ¿Puede tomar mate en esta partida? (15 de gloria; en la clasificatoria, desde Oro 4). */
export const mateDisponible = (enClasif = false) => G.poderesDe(N.miPerfil(), enClasif).mate;
export function tomarMate() { mate = true; }
export const tomoMate = () => mate;
export function nuevaPartida() { mate = false; }

// ---------- anotar la partida al terminar ----------
/** Anfitrión: propone el resultado. jugadores: [{ id: perfil, lado, estilo }]. Devuelve el id de la partida (o null). */
export async function anotar({ codigo, tipo, meta, puntos, ganador, jugadores, equipos = null, clasificatoria = false, estilo = null }) {
  const conPerfil = jugadores.filter((j) => j.id).map((j) => ({ id: j.id, lado: j.lado }));
  if (!perfilId() || new Set(conPerfil.map((j) => j.lado)).size < 2) return null; // contra bots o sin cuentas: no suma
  const id = `${codigo}-${Date.now().toString(36)}`;
  try {
    await N.registrarPartida({ id, tipo, meta, puntos, ganador, mate, clasificatoria: !!clasificatoria, estilo, equipos: equipos || [null, null], jugadores: conPerfil });
    nuevaPartida();
    return id;
  } catch (e) { ganchos.aviso?.("No pude anotar la partida: " + e.message, 6000); return null; }
}
/** Invitado: confirma lo que vio en su mesa (puntos y tipo de partida) y manda lo suyo (mate y estilo). */
export async function confirmar(id, puntos, vistos, { clasif = false, estilo = null } = {}) {
  if (!perfilId() || !id) return;
  if (+puntos?.[0] !== vistos[0] || +puntos?.[1] !== vistos[1]) return; // no coincide con lo que vio: no confirma
  try { await N.confirmarPartida(String(id).slice(0, 64), vistos, mate, clasif, estilo); nuevaPartida(); ganchos.aviso?.("Partida anotada en tu perfil"); }
  catch (e) { ganchos.aviso?.("No pude confirmar la partida: " + e.message, 6000); }
}

/** Cara a cara en el 1 contra 1: { texto, clase, titulo } o null. */
export async function caraACara(rivalId, rivalNombre) {
  try {
    const r = await N.caraACara(rivalId);
    if (!r || r[0] + r[1] === 0) return { texto: "primera vez", clase: "", titulo: `Primera partida anotada contra ${rivalNombre}` };
    return { texto: `vos ${r[0]} a ${r[1]}`, clase: r[0] > r[1] ? "gana" : r[0] < r[1] ? "pierde" : "", titulo: `Contra ${rivalNombre}: ganaste ${r[0]}, perdiste ${r[1]}` };
  } catch { return null; }
}

// ================= la pulpería =================
const claveCanjes = () => "truco-canjes:" + (perfilId() || "-");
function canjeados() { try { return new Set(JSON.parse(leer(claveCanjes(), "[]"))); } catch { return new Set(); } }
function marcarCanje(k) { const s = canjeados(); s.add(k); escribir(claveCanjes(), JSON.stringify([...s])); }

/** ¿Lo tiene puesto ahora? */
function puesto(p, x) {
  const e = p?.estilo || {};
  if (x.slot === "sombrero") return x.k === "gorra" ? e.gorra === true && !e.sombrero : e.sombrero === x.k;
  if (x.slot === "ojos") return e.ojos === x.k;
  if (x.slot === "boca") return e.boca === x.k;
  if (x.k.startsWith("dorso_")) return e.dorso === x.k.slice(6);
  if (x.k.startsWith("pano_")) return e.pano === x.k.slice(5);
  return ({ porotos: e.tanteador === "porotos", marco: e.marco === "oro", titulo: !!p.titulo && G.TITULOS.includes(p.titulo),
    libre: !!p.titulo && !G.TITULOS.includes(p.titulo), estilo: !!(e.color || e.fuente), peluca: !!e.peluca, cara: Number.isInteger(e.cara) })[x.k] || false;
}
/** bloqueado · canjear · tuyo · puesto */
function estadoDe(p, x, hechos = canjeados()) {
  if (!p || (p.puntos || 0) < x.p) return "bloqueado";
  if (puesto(p, x)) return "puesto";
  return x.p === 0 || hechos.has(x.k) ? "tuyo" : "canjear";
}
const canjeables = (p) => { const h = canjeados(); return C.CATALOGO.filter((x) => estadoDe(p, x, h) === "canjear"); };

/** El dibujo de cada producto. Lo de la cara se muestra puesto en tu propia cara. */
function ilus(x, p, px = 72) {
  const base = p ? accDe(p) : {};
  const conSlot = (cambio) => K.caraCon(C.formaDe(p, 0), { ...base, ...cambio }, DIBUJOS, esc(x.nombre));
  const caja = (inner, cls = "") => `<span class="ilus ${cls}" style="--px:${px}px">${inner}</span>`;
  if (x.k === "cara") return caja(conSlot({}), "de-cara");
  if (x.slot === "sombrero") return caja(conSlot(x.k === "gorra" ? { sombrero: null, gorra: true } : { sombrero: x.k }), "de-cara");
  if (x.slot === "ojos") return caja(conSlot({ ojos: x.k }), "de-cara");
  if (x.slot === "boca") return caja(conSlot({ boca: x.k }), "de-cara");
  if (x.k === "peluca") return caja(conSlot({ peluca: base.peluca || G.COLORES.rosa }), "de-cara");
  if (x.k === "marco") return `<span class="ilus" style="--px:${px}px">${avatar(p || { usuario: "?" }, Math.round(px * 0.86), { marco: true })}</span>`;
  if (x.k.startsWith("dorso_")) return caja(`<span class="mini-carta">${dorso(x.k.slice(6))}</span>`);
  if (x.k.startsWith("pano_")) return caja(`<span class="muestra-pano pano-${x.k.slice(5)}"></span>`);
  if (x.k === "mate") return caja(G.MATE.replace('width="22" height="22"', `width="${px * 0.8}" height="${px * 0.8}"`));
  if (x.k === "insignia") return caja(G.insignia(Math.round(px * 0.75)));
  return caja((C.ILUS[x.k]?.() || "").replace('width="64" height="64"', `width="${px}" height="${px}"`));
}

function pintarPulperia() {
  const el = $("#vista-pulperia"); if (!el) return;
  const p = N.miPerfil(), puntos = p?.puntos || 0, hechos = canjeados();
  const prox = C.proximoProducto(puntos);
  const ant = [...C.CATALOGO].reverse().find((x) => x.p <= puntos)?.p || 0;
  const pct = prox ? Math.round(((puntos - ant) / Math.max(1, prox.p - ant)) * 100) : 100;
  if (puntos < PUL_MIN) return pintarPulperiaCerrada(el, p, puntos, hechos);
  const lista = C.CATALOGO.filter((x) => filtroTienda === "todo" || x.cat === filtroTienda);
  const n = (k) => C.CATALOGO.filter((x) => (k === "todo" || x.cat === k) && estadoDe(p, x, hechos) === "canjear").length;
  const tienes = C.CATALOGO.filter((x) => estadoDe(p, x, hechos) !== "bloqueado").length;
  const prods = lista.map((x) => {
    const est = estadoDe(p, x, hechos);
    const tag = est === "bloqueado" ? `${CANDADO}<span>${x.p}</span>` : est === "canjear" ? `<span>¡Canjealo!</span>` : est === "puesto" ? `<span>puesto</span>` : `<span>tuyo</span>`;
    return `<li><button class="prod ${est}" data-ficha="${x.k}" aria-label="${esc(x.nombre)}, ${est === "bloqueado" ? `se abre con ${x.p} de gloria` : est}">
      <span class="prod-luz">${ilus(x, p, 66)}</span>
      <span class="prod-n">${esc(x.nombre)}</span>
      <span class="etiqueta">${est === "bloqueado" ? "" : SOL(11)}${tag}</span></button></li>`;
  }).join("");
  el.innerHTML = `<header class="pul-cab">
      <div class="toldo" aria-hidden="true"></div>
      <div class="pul-tit"><h2>La pulpería</h2><p>Llegás a la gloria y lo canjeás. No se gasta: lo que conseguís, queda.</p></div>
      <div class="saldo">${SOL(22)}<b>${puntos}</b><small>de gloria</small></div>
    </header>
    ${!p ? tarjetaEntrar(N.miUsuario() ? "Elegí tu usuario en Jugar para empezar a juntar gloria." : "Entrá con tu cuenta para juntar gloria jugando con amigos y canjearla acá.") : ""}
    <div class="pul-prog">${prox ? `<span>Próximo: <b>${esc(prox.nombre)}</b> a ${prox.p}</span><span class="faltan">faltan ${prox.p - puntos}</span>` : `<span><b>Tenés todo el almacén.</b></span>`}
      <span class="barra-g"><i style="width:${pct}%"></i></span><small class="tienes">${tienes} de ${C.CATALOGO.length} en tu poder</small></div>
    <div class="filtros" role="group" aria-label="Qué mostrar">${Object.entries(C.CATS).map(([k, t]) => `<button type="button" data-filtro="${k}" aria-pressed="${k === filtroTienda}">${t}${n(k) ? `<i>${n(k)}</i>` : ""}</button>`).join("")}</div>
    <ul class="estante">${prods}</ul>
    <p class="como">${SOL(14)} Cómo se junta: ganar una partida da 3; perder por menos de 5, 1; con el mate y tomando uno, +1. Cuenta en partidas con alguien que también entró con su cuenta.</p>`;
}
/** Antes de la primera gloria la pulpería está cerrada: se ve qué hay y cuánto falta, y solo se puede elegir la cara (regalo de la casa). */
function pintarPulperiaCerrada(el, p, puntos, hechos) {
  const falta = PUL_MIN - puntos;
  const muestra = C.CATALOGO.slice(0, 6).map((x) => {
    const est = estadoDe(p, x, hechos);
    return `<li><button class="prod ${est}" data-ficha="${x.k}" aria-label="${esc(x.nombre)}, ${est === "bloqueado" ? `se abre con ${x.p} de gloria` : "regalo de la casa"}">
      <span class="prod-luz">${ilus(x, p, 66)}</span><span class="prod-n">${esc(x.nombre)}</span>
      <span class="etiqueta">${est === "bloqueado" ? `${CANDADO}<span>${x.p}</span>` : `${SOL(11)}<span>tuyo</span>`}</span></button></li>`;
  }).join("");
  el.innerHTML = `<h2 class="tit-vista">La pulpería</h2>
    ${!p ? tarjetaEntrar(N.miUsuario() ? "Elegí tu usuario en Jugar para empezar a juntar gloria." : "Entrá con tu cuenta para juntar gloria jugando con amigos y canjearla acá.") : ""}
    <div class="liga-cerrada"><span class="sol-cerrado">${SOL(96)}</span><span class="candado-g">${CANDADO}</span>
      <h3>Abre con ${PUL_MIN} de gloria</h3>
      <p>${p ? `Tenés ${puntos}. Te faltan <b>${falta}</b>: ${partidasPara(falta)}.` : `Se abre con tu primera partida ganada.`} Cuentan las partidas con alguien que también entró con su cuenta; contra la máquina no.</p>
      <span class="barra-g"><i style="width:${Math.round((puntos / PUL_MIN) * 100)}%"></i></span></div>
    <section><h3 class="tit-sec">Lo que te espera</h3><ul class="estante">${muestra}</ul></section>
    <p class="como">${SOL(14)} Cómo se junta: ganar una partida da 3; perder por menos de 5, 1; con el mate y tomando uno, +1.</p>`;
}
function clicPulperia(e) {
  const f = e.target.closest("[data-filtro]");
  if (f) { filtroTienda = f.dataset.filtro; return pintarPulperia(); }
  if (e.target.closest("[data-google]")) return entrar();
  const pr = e.target.closest("[data-ficha]");
  if (pr) abrirFicha(pr.dataset.ficha);
}

// ---------- la ficha de un producto ----------
function abrirCapa(tipo, html) {
  const c = $("#capa"); c.innerHTML = html; c.hidden = false; c.dataset.tipo = tipo; return c;
}
function cerrar() { const c = $("#capa"); c.hidden = true; c.innerHTML = ""; c.dataset.tipo = ""; }

// ---------- apertura al público (2026-11-12): bloquear, denunciar y borrar la cuenta ----------
const MOTIVOS = [["nombre", "Nombre o título ofensivo"], ["insultos", "Insultos o acoso"], ["trampa", "Hizo trampa"], ["otro", "Otra cosa"]];
function abrirPersona(id, u) {
  if (!N.miPerfil() || !id || id === perfilId()) return;
  const bloq = N.estaBloqueado(id);
  const capa = abrirCapa("persona", `<div class="hoja persona">
    <h2>${esc(u)}</h2>
    <p class="f-que">${bloq ? "Lo tenés bloqueado." : "Si te molesta, bloquealo: deja de aparecerte entre los conectados y no te puede invitar. No se entera."}</p>
    ${bloq ? `<button class="b ancho" data-desbloquear-p>Desbloquear</button>` : `<button class="b ancho" data-bloquear-p>Bloquear a ${esc(u)}</button>`}
    <form class="denuncia" data-denuncia><h3 class="tit-sec">Denunciar</h3>
      <div class="motivos" role="radiogroup" aria-label="Motivo">${MOTIVOS.map(([k, t], i) => `<label><input type="radio" name="motivo" value="${k}"${i === 0 ? " checked" : ""}><span>${t}</span></label>`).join("")}</div>
      <textarea name="detalle" maxlength="300" rows="3" placeholder="Contá qué pasó (si querés)"></textarea>
      <button class="b fuerte ancho">Mandar la denuncia</button>
      <p class="f-nota">La lee una persona. Si corresponde, se le cambia el nombre o se lo suspende unos días.</p>
    </form>
    <button class="b claro" data-cerrar>Volver</button></div>`);
  capa.onclick = async (e) => {
    if (e.target === capa || e.target.closest("[data-cerrar]")) return cerrar();
    try {
      if (e.target.closest("[data-bloquear-p]")) { await N.bloquear(id); cerrar(); ganchos.aviso?.(`Bloqueaste a ${u}`); pintarVista(); }
      if (e.target.closest("[data-desbloquear-p]")) { await N.desbloquear(id); cerrar(); ganchos.aviso?.(`Desbloqueaste a ${u}`); pintarVista(); }
    } catch (x) { ganchos.aviso?.(x.message); }
  };
  const f = capa.querySelector("[data-denuncia]");
  f.onsubmit = async (e) => {
    e.preventDefault();
    const b = f.querySelector("button"); b.disabled = true;
    try { await N.denunciar(id, f.motivo.value, f.detalle.value); cerrar(); ganchos.aviso?.("Gracias. La denuncia llegó.", 4000); }
    catch (x) { b.disabled = false; ganchos.aviso?.(x.message, 5000); }
  };
}

function abrirBorrado() {
  const p = N.miPerfil(); if (!p) return;
  const capa = abrirCapa("borrar", `<div class="hoja borrar-cuenta">
    <h2>Borrar tu cuenta</h2>
    <p class="f-que">Se borran tu usuario, tu gloria, tu liga, lo que tenés puesto, los equipos que armaste y tu lugar en el historial. Las partidas quedan en el historial de tus rivales, sin tu nombre. <b>No tiene vuelta atrás.</b></p>
    <form data-confirmar-borrado><label class="f-nota" for="borrar-u">Para confirmar, escribí tu usuario: <b>${esc(p.usuario)}</b></label>
      <input id="borrar-u" name="u" autocomplete="off" autocapitalize="off" spellcheck="false" required>
      <button class="b peligro ancho" disabled>Borrar para siempre</button></form>
    <button class="b claro" data-cerrar>Mejor no</button></div>`);
  capa.onclick = (e) => { if (e.target === capa || e.target.closest("[data-cerrar]")) cerrar(); };
  const f = capa.querySelector("[data-confirmar-borrado]"), b = f.querySelector("button");
  f.oninput = () => { b.disabled = N.normalizarUsuario(f.u.value) !== p.usuario; };
  f.onsubmit = async (e) => {
    e.preventDefault(); if (b.disabled) return;
    b.disabled = true; b.textContent = "Borrando…";
    try {
      await N.borrarMiCuenta();
      try { localStorage.removeItem(claveCanjes()); localStorage.removeItem("truco-pestana"); } catch {}
      cerrar(); irA("jugar"); ganchos.aviso?.("Listo: tu cuenta y tus datos se borraron.", 5000);
    } catch (x) { b.disabled = false; b.textContent = "Borrar para siempre"; ganchos.aviso?.(x.message, 5000); }
  };
}

function abrirFicha(k, recien = false) {
  const x = C.producto(k); if (!x) return;
  const p = N.miPerfil(), est = estadoDe(p, x), puntos = p?.puntos || 0;
  const cat = { cara: "Para tu cara", mesa: "Para tu mesa", poder: "Poder", nombre: "Para tu nombre" }[x.cat];
  let accion = "";
  if (!p) accion = `<p class="f-nota">Entrá con tu cuenta para juntar gloria.</p><button class="b fuerte" data-google>${G_LOGO}<span>Entrar con Google</span></button>`;
  else if (est === "bloqueado") {
    const pct = Math.round((puntos / x.p) * 100);
    accion = `<div class="f-falta"><span class="barra-g"><i style="width:${pct}%"></i></span><p>Tenés ${puntos} de ${x.p}. Te faltan <b>${x.p - puntos}</b>: ${partidasPara(x.p - puntos)}.</p></div>
      <button class="b" disabled>${CANDADO} Se abre con ${x.p} de gloria</button>`;
  } else if (est === "canjear") accion = `<button class="b fuerte grande" data-canjear="${x.k}">${SOL(18)}<span>Canjear</span></button><p class="f-nota">No se descuenta nada: la gloria que juntaste queda igual.</p>`;
  else accion = opciones(x, p, est);
  const vitrina = x.cat === "mesa" && x.k.startsWith("pano_") ? `pano-${x.k.slice(5)}` : "";
  const html = `<div class="hoja ficha ${est}${recien ? " recien" : ""}" data-k="${x.k}">
    <div class="f-vitrina ${vitrina}">${ilus(x, p, 132)}<span class="sello" aria-hidden="true">canjeado</span></div>
    <p class="f-cat">${cat} · ${x.p ? `${SOL(12)} ${x.p}` : "gratis"}</p>
    <h2>${esc(x.nombre)}</h2><p class="f-que">${esc(x.que)}</p>
    ${accion}
    <button class="b claro" data-cerrar>Volver</button></div>`;
  const capa = abrirCapa("ficha", html);
  capa.onclick = (e) => clicFicha(e, x);
  const fe = capa.querySelector("[data-pinta-form]");
  if (fe) { const vivo = () => { const m = capa.querySelector("[data-muestra]"); if (m) m.innerHTML = nombreHTML({ ...N.miPerfil(), ...leerForm(fe, x) }); }; fe.oninput = vivo; fe.onchange = vivo; fe.onsubmit = (ev) => { ev.preventDefault(); guardarForm(fe, x); }; }
  if (recien) { festejo(capa.querySelector(".f-vitrina")); }
}

/** Lo que se puede hacer con algo que ya es tuyo. */
function opciones(x, p, est) {
  const e = p.estilo || {};
  if (x.uso === "poner") return est === "puesto" ? `<p class="f-ok">Lo tenés puesto.</p><button class="b claro" data-sacar="${x.k}">Sacármelo</button>`
    : `<button class="b fuerte grande" data-poner="${x.k}">Ponérmelo</button>`;
  if (x.uso === "solo") return `<p class="f-ok">Es tuyo. Se usa solo en la mesa${x.k === "mate" ? ": tocá el mate arriba durante la partida" : x.k === "trampa" ? ": aparece abajo, en tu turno, una vez por partida" : ""}.</p>`;
  if (x.uso === "ir") return `<button class="b fuerte grande" data-ir-liga>Ir a la liga</button>`;
  if (x.k === "cara") return `<p class="f-t">Elegí tu cara</p><div class="elegir-caras">${[0, 1, 2, 3, 4, 5].map((f) => `<button type="button" data-cara="${f}" aria-pressed="${C.formaDe(p) === f}" aria-label="Cara ${f + 1}">${K.caraCon(f, accDe(p), DIBUJOS)}</button>`).join("")}</div>`;
  if (x.k === "peluca") return `<p class="f-t">Color de la peluca</p><div class="muestras">${Object.entries(G.COLORES).map(([k, c]) => `<button type="button" data-peluca="${k}" aria-pressed="${e.peluca === k}" style="--c:${c}" aria-label="${G.NOMBRE_COLOR[k]}"></button>`).join("")}</div>
    ${e.peluca ? `<button class="b claro" data-peluca="">Sin peluca a la vista</button>` : ""}`;
  if (x.k === "titulo") return `<p class="f-t">Elegí tu título</p><div class="titulos">${G.TITULOS.map((t) => `<button type="button" data-titulo="${esc(t)}" aria-pressed="${p.titulo === t}">${esc(t)}</button>`).join("")}</div>
    ${p.titulo ? `<button class="b claro" data-titulo="">Sin título</button>` : ""}`;
  if (x.k === "libre") {
    const libre = p.titulo && !G.TITULOS.includes(p.titulo) ? p.titulo : "";
    return `<form data-pinta-form class="f-form"><div class="muestra-n" data-muestra>${nombreHTML(p)}</div>
      <label class="campo"><span>Tu título (pisa al de la lista)</span><input type="text" name="libre" maxlength="32" value="${esc(libre)}" placeholder="ej. El que nunca se va al mazo"></label>
      <button class="b fuerte">Guardar</button></form>`;
  }
  if (x.k === "estilo") return `<form data-pinta-form class="f-form"><div class="muestra-n" data-muestra>${nombreHTML(p)}</div>
    <p class="f-t">Color</p><div class="muestras">${Object.entries(G.COLORES).map(([k, c]) => `<label style="--c:${c}" aria-label="${G.NOMBRE_COLOR[k]}"><input type="radio" name="color" value="${k}"${e.color === k ? " checked" : ""}></label>`).join("")}<label class="ninguno" aria-label="el de siempre"><input type="radio" name="color" value=""${!e.color ? " checked" : ""}></label></div>
    <p class="f-t">Letra</p><div class="letras">${Object.entries(G.FUENTES).map(([k, f]) => `<label style="font-family:${f}"><input type="radio" name="fuente" value="${k}"${e.fuente === k ? " checked" : ""}>${G.NOMBRE_FUENTE[k]}</label>`).join("")}<label><input type="radio" name="fuente" value=""${!e.fuente ? " checked" : ""}>la de siempre</label></div>
    <button class="b fuerte">Guardar</button></form>`;
  return "";
}
function leerForm(f, x) {
  const v = (n) => f.elements[n]?.value || "";
  if (x.k === "libre") return { titulo: v("libre").trim().slice(0, 32) || N.miPerfil().titulo };
  const est = { ...(N.miPerfil().estilo || {}) };
  const c = [...f.querySelectorAll("[name=color]")].find((i) => i.checked)?.value || "";
  const fu = [...f.querySelectorAll("[name=fuente]")].find((i) => i.checked)?.value || "";
  if (c) est.color = c; else delete est.color;
  if (fu) est.fuente = fu; else delete est.fuente;
  return { estilo: est };
}
async function guardarForm(f, x) {
  const r = leerForm(f, x);
  if (x.k === "libre") await guardar({}, r.titulo || null, x.k);
  else await guardar({ color: r.estilo.color || null, fuente: r.estilo.fuente || null }, undefined, x.k);
}

/** Guarda la pinta: cambios en estilo (null borra la clave) y, si viene, el título. Después reabre la ficha. */
async function guardar(cambios, titulo, fichaK) {
  const p = N.miPerfil(); if (!p) return;
  const e = { ...(p.estilo || {}) };
  for (const [k, v] of Object.entries(cambios)) { if (v === null || v === false || v === "") delete e[k]; else e[k] = v; }
  try {
    await N.guardarCosmeticos({ titulo: titulo === undefined ? p.titulo : titulo, estilo: e });
    S.chasquido?.(0, 0.18);
    if (fichaK && $("#capa").dataset.tipo === "ficha") abrirFicha(fichaK);
  } catch (x) { ganchos.aviso?.(x.message, 5000); }
}
/** Ponerse o sacarse un producto de «poner». */
function ponerCambios(x, si) {
  if (x.slot === "sombrero") return x.k === "gorra" ? { gorra: si, sombrero: null } : { sombrero: si ? x.k : null, ...(si ? { gorra: null } : {}) };
  if (x.slot === "ojos") return { ojos: si ? x.k : null };
  if (x.slot === "boca") return { boca: si ? x.k : null };
  if (x.k.startsWith("dorso_")) return { dorso: si ? x.k.slice(6) : null };
  if (x.k.startsWith("pano_")) return { pano: si ? x.k.slice(5) : null };
  if (x.k === "porotos") return { tanteador: si ? "porotos" : null };
  if (x.k === "marco") return { marco: si ? "oro" : null };
  return {};
}
function clicFicha(e, x) {
  const t = e.target, capa = $("#capa");
  if (t === capa || t.closest("[data-cerrar]")) { cerrar(); return pintarVista(); }
  if (t.closest("[data-google]")) return entrar();
  if (t.closest("[data-ir-liga]")) { cerrar(); return irA("liga"); }
  if (t.closest("[data-canjear]")) {
    marcarCanje(x.k); S.chasquido?.(0, 0.3);
    abrirFicha(x.k, true); pintarPestanas(); pintarCabecera();
    return;
  }
  if (t.closest("[data-poner]")) return guardar(ponerCambios(x, true), undefined, x.k);
  if (t.closest("[data-sacar]")) return guardar(ponerCambios(x, false), undefined, x.k);
  const cara = t.closest("[data-cara]"); if (cara) return guardar({ cara: +cara.dataset.cara }, undefined, x.k);
  const pel = t.closest("[data-peluca]"); if (pel) return guardar({ peluca: pel.dataset.peluca || null }, undefined, x.k);
  const tit = t.closest("[data-titulo]"); if (tit) return guardar({}, tit.dataset.titulo || null, x.k);
}
/** Unos soles que saltan al canjear. */
function festejo(el) {
  if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (let i = 0; i < 14; i++) {
    const s = document.createElement("span"); s.className = "chispa"; s.innerHTML = SOL(14);
    const a = (i / 14) * Math.PI * 2, d = 70 + Math.random() * 50;
    s.style.setProperty("--dx", Math.cos(a) * d + "px"); s.style.setProperty("--dy", Math.sin(a) * d - 20 + "px");
    s.style.animationDelay = Math.random() * 120 + "ms";
    el.appendChild(s); setTimeout(() => s.remove(), 1400);
  }
}

// ================= Partidas (historial) =================
const TIPO = { "1v1": "mano a mano", "2v2": "2 contra 2", "3v3": "3 contra 3", equipos: "equipo contra equipo" };
let partidasCache = null;
async function pintarPartidas() {
  const el = $("#vista-partidas"); if (!el) return;
  const p = N.miPerfil();
  if (!p) { el.innerHTML = `<h2 class="tit-vista">Partidas</h2>${tarjetaEntrar("Entrá con tu cuenta y cada partida con amigos queda anotada acá, con el cara a cara contra cada uno.")}`; return; }
  if (!partidasCache) el.innerHTML = `<h2 class="tit-vista">Partidas</h2><p class="cargando">Buscando tus partidas…</p>`;
  const partidas = await N.misPartidas().catch(() => []);
  partidasCache = partidas;
  if (vistaActual !== "partidas") return;
  const r = N.resumir(partidas);
  let racha = 0; const gano0 = partidas[0]?.gano;
  for (const x of partidas) { if (x.gano === gano0) racha++; else break; }
  const pct = r.jugadas ? Math.round((r.ganadas / r.jugadas) * 100) : 0;
  const filtra = (x) => filtroPartidas === "todas" || (filtroPartidas === "mano" && x.tipo === "1v1" && !x.clasificatoria)
    || (filtroPartidas === "equipo" && x.tipo !== "1v1" && !x.clasificatoria) || (filtroPartidas === "liga" && x.clasificatoria);
  const lista = partidas.filter(filtra);
  const tickets = lista.map((x) => {
    const rivs = x.jugadores.filter((j) => j.lado !== x.lado).map((j) => `<button type="button" class="persona-n" data-mas="${esc(j.id)}" data-u="${esc(j.usuario)}" title="Bloquear o denunciar">${esc(j.usuario)}</button>`).join(", ");
    const comp = x.jugadores.filter((j) => j.lado === x.lado && j.id !== p.id).map((j) => esc(j.usuario)).join(", ");
    const mio = x.lado === 0 ? x.puntos0 : x.puntos1, suyo = x.lado === 0 ? x.puntos1 : x.puntos0;
    const fecha = new Date(x.jugada).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
    const elo = x.clasificatoria && x.eloDelta ? `<span class="t-liga">${x.eloDelta > 0 ? "+" : ""}${+x.eloDelta} liga</span>` : "";
    return `<li class="ticket ${x.gano ? "gana" : "pierde"}"><span class="t-sello">${x.gano ? "G" : "P"}</span>
      <span class="t-medio"><b>contra ${rivs || "?"}</b><small>${fecha} · ${TIPO[x.tipo] || ""}${x.clasificatoria ? " · liga" : ""}${comp ? ` · con ${comp}` : ""}</small></span>
      <span class="t-fin"><b>${mio} a ${suyo}</b>${x.gloria ? `<span class="t-gloria">+${+x.gloria} ${SOL(10)}</span>` : ""}${elo}</span></li>`;
  }).join("");
  const rivales = Object.values(r.rivales).sort((a, b) => b.ganadas + b.perdidas - a.ganadas - a.perdidas).slice(0, 8);
  const caa = rivales.map((x) => { const t = x.ganadas + x.perdidas, g = Math.round((x.ganadas / t) * 100);
    return `<li><span class="caa-n">${esc(x.usuario)}</span><span class="caa-barra" role="img" aria-label="ganaste ${x.ganadas}, perdiste ${x.perdidas}"><i style="width:${g}%"></i></span><span class="caa-r ${x.ganadas > x.perdidas ? "gana" : x.ganadas < x.perdidas ? "pierde" : ""}">${x.ganadas}–${x.perdidas}</span></li>`; }).join("");
  el.innerHTML = `<h2 class="tit-vista">Partidas</h2>
    <div class="cifras4"><div><b>${r.jugadas}</b><span>jugadas</span></div><div class="g"><b>${r.ganadas}</b><span>ganadas</span></div><div class="p"><b>${r.perdidas}</b><span>perdidas</span></div><div><b>${pct}%</b><span>de victorias</span></div></div>
    ${racha >= 2 ? `<p class="racha ${gano0 ? "gana" : "pierde"}">${gano0 ? `Racha: ${racha} ganadas seguidas` : `Venís de ${racha} perdidas. La próxima se da vuelta.`}</p>` : ""}
    ${caa ? `<section><h3 class="tit-sec">Cara a cara</h3><ul class="caa">${caa}</ul></section>` : ""}
    <section><h3 class="tit-sec">Historial</h3>
    <div class="filtros chicos" role="group" aria-label="Filtrar partidas">${[["todas", "Todas"], ["mano", "Mano a mano"], ["equipo", "En equipo"], ["liga", "Liga"]].map(([k, t]) => `<button type="button" data-fp="${k}" aria-pressed="${k === filtroPartidas}">${t}</button>`).join("")}</div>
    ${tickets ? `<ul class="tickets">${tickets}</ul>` : `<div class="vacio-g"><span class="vacio-cartas" aria-hidden="true">${dorso()}${dorso()}</span><p>${partidas.length ? "No hay partidas de este tipo." : "Todavía ninguna partida anotada. Se anotan las que jugás con alguien que también entró con su cuenta (contra la máquina no cuentan)."}</p>${partidas.length ? "" : `<button class="b fuerte" data-ir="jugar">Armar una mesa</button>`}</div>`}</section>`;
}
function clicPartidas(e) {
  const f = e.target.closest("[data-fp]"); if (f) { filtroPartidas = f.dataset.fp; return pintarPartidas(); }
  const mas = e.target.closest("[data-mas]"); if (mas) return abrirPersona(mas.dataset.mas, mas.dataset.u);
  if (e.target.closest("[data-google]")) return entrar();
  const ir = e.target.closest("[data-ir]"); if (ir) irA(ir.dataset.ir);
}

// ================= Vos (perfil) =================
async function pintarVos() {
  const el = $("#vista-vos"); if (!el) return;
  const p = N.miPerfil();
  if (!p) { el.innerHTML = `<h2 class="tit-vista">Vos</h2>${tarjetaEntrar("Entrá para tener tu cara, tu título y tus equipos.")}`; return; }
  const liga = G.ligaDe(p.elo), e = p.estilo || {}, pc = C.pintaCara(p), ac = accDe(p);
  const slot = (k, rotulo, valor, prod) => `<button class="slot${valor ? "" : " vacio"}" data-ficha="${prod}"><span class="slot-ilus">${ilus(C.producto(prod), p, 44)}</span><span class="slot-t"><small>${rotulo}</small><b>${valor ? esc(valor) : "nada"}</b></span></button>`;
  const somb = pc.sombrero || (ac.gorra ? "gorra" : null);
  const slots = [
    slot("cara", "Cara", `cara ${C.formaDe(p) + 1}`, "cara"),
    slot("sombrero", "Sombrero", somb ? C.producto(somb).nombre : "", somb || "gorra"),
    slot("ojos", "Ojos", pc.ojos ? C.producto(pc.ojos).nombre : "", pc.ojos || "anteojos"),
    slot("boca", "Bigote", pc.boca ? C.producto(pc.boca).nombre : "", "bigote"),
    slot("peluca", "Peluca", e.peluca && G.tiene(p, "peluca") ? G.NOMBRE_COLOR[e.peluca] : "", "peluca"),
    slot("dorso", "Dorso", C.dorsoDe(p) !== "clasico" ? C.DORSOS[C.dorsoDe(p)] : "el de siempre", C.dorsoDe(p) !== "clasico" ? "dorso_" + C.dorsoDe(p) : "dorso_rayado"),
    slot("pano", "Mesa", C.PANOS[C.panoDe(p)], C.panoDe(p) !== "madera" ? "pano_" + C.panoDe(p) : "pano_verde"),
    slot("tanteador", "Tanteador", C.usaPorotos(p) ? "porotos" : "fósforos", "porotos"),
    slot("titulo", "Título", G.tiene(p, "titulo") ? p.titulo || "" : "", p.titulo && !G.TITULOS.includes(p.titulo) ? "libre" : "titulo"),
  ].join("");
  el.innerHTML = `<div class="vos-heroe">
      <button class="vos-cara" data-ficha="cara" aria-label="Cambiar tu cara">${avatar(p, 124)}<span class="lapiz" aria-hidden="true">✎</span></button>
      <h2 class="vos-n">${nombreHTML(p)}</h2>
      <div class="vos-chips"><button class="chip-gloria" data-ir="pulperia">${SOL(15)}<b>${p.puntos}</b> de gloria</button>${G.tiene(p, "clasif") ? `<button class="chip-liga ${liga.metal}" data-ir="liga">${esc(liga.nombre)}</button>` : ""}</div>
    </div>
    <div data-vos-cifras class="cifras4"><div><b>·</b><span>jugadas</span></div><div class="g"><b>·</b><span>ganadas</span></div><div class="p"><b>·</b><span>perdidas</span></div><div><b>·</b><span>racha</span></div></div>
    <div data-vos-estilo></div>
    <section><h3 class="tit-sec">Lo que tenés puesto <button class="b chico-e" data-ir="pulperia">Pulpería ›</button></h3><div class="slots">${slots}</div></section>
    <section data-vos-equipos><h3 class="tit-sec">Equipos</h3><p class="cargando">…</p></section>
    <section class="tu-cuenta"><h3 class="tit-sec">Tu cuenta</h3>
      <div data-bloqueados></div>
      <button class="b claro ancho salir" data-salir-cuenta>Salir de la cuenta</button>
      <p class="legales"><a href="terminos.html" target="_blank" rel="noopener">Términos de uso</a> · <a href="privacidad.html" target="_blank" rel="noopener">Privacidad</a> · <button type="button" class="enlace peligro" data-borrar-cuenta>Borrar mi cuenta</button></p>
    </section>`;
  const [partidas, equipos, bloq] = await Promise.all([N.misPartidas().catch(() => []), N.misEquipos().catch(() => []), N.misBloqueos().catch(() => [])]);
  if (vistaActual !== "vos") return;
  const eb = el.querySelector("[data-bloqueados]");
  if (eb) eb.innerHTML = bloq.length ? `<p class="nota-eq">Bloqueados: no te aparecen ni te pueden invitar.</p><ul class="bloqueados">${bloq.map((b) => `<li><span>${esc(b.usuario)}</span><button class="b chico" data-desbloquear="${esc(b.id)}">Desbloquear</button></li>`).join("")}</ul>` : "";
  partidasCache = partidas;
  const r = N.resumir(partidas);
  let racha = 0; for (const x of partidas) { if (x.gano) racha++; else break; }
  const cif = el.querySelector("[data-vos-cifras]");
  if (cif) cif.innerHTML = `<div><b>${r.jugadas}</b><span>jugadas</span></div><div class="g"><b>${r.ganadas}</b><span>ganadas</span></div><div class="p"><b>${r.perdidas}</b><span>perdidas</span></div><div><b>${racha}</b><span>racha</span></div>`;
  const est = G.tiene(p, "insignia") ? G.estiloDeJuego(G.sumarEstilos(partidas.map((x) => x.estilo))) : null;
  const ee = el.querySelector("[data-vos-estilo]");
  if (ee) ee.innerHTML = est ? `<div class="estilo-juego"><small>tu estilo de juego</small><b>${esc(est.nombre)}</b><p>${esc(est.que)}</p></div>`
    : `<button class="estilo-juego bloq" data-ficha="insignia"><small>tu estilo de juego</small><b>Se descubre con la insignia (50 de gloria)</b></button>`;
  pintarEquipos(el.querySelector("[data-vos-equipos]"), p, equipos);
}

function pintarEquipos(sec, p, equipos) {
  if (!sec) return;
  equiposVos = equipos;
  const eqs = equipos.map((e) => {
    const yoCreo = e.creador === p.id;
    const listos = e.miembros.filter((m) => m.acepto !== false), lleno = listos.length >= e.tamano;
    if (e.miembros.some((m) => m.id === p.id && m.acepto === false))
      return `<div class="equipo pendiente"><div class="eq-cab"><b>${esc(e.nombre)}</b><small>de a ${e.tamano}</small></div>
      <p class="miembros">Te invitaron a este equipo: ${listos.map((m) => esc(m.usuario)).join(" · ")}</p>
      <div class="fila"><button class="b fuerte" data-aceptar="${esc(e.id)}">Aceptar</button><button class="b" data-dejar="${esc(e.id)}">No, gracias</button></div></div>`;
    return `<div class="equipo"><div class="eq-cab"><b>${esc(e.nombre)}</b><small>de a ${e.tamano} · ${listos.length}/${e.tamano}</small></div>
      <p class="miembros">${e.miembros.map((m) => esc(m.usuario) + (m.acepto === false ? " <i>(invitado)</i>" : "")).join(" · ")}</p>
      ${yoCreo && e.miembros.length < e.tamano ? `<form class="sumar" data-sumar="${esc(e.id)}"><input type="text" name="u" maxlength="16" placeholder="usuario a sumar" required><button class="b">Sumar</button></form>` : ""}
      ${lleno ? `<button class="b fuerte ancho" data-desafiar="${esc(e.id)}">Jugar contra otro equipo</button>` : `<p class="nota-eq">Cuando estén los ${e.tamano}, pueden desafiar a otro equipo.</p>`}
      ${yoCreo ? `<button class="b chico" data-borrar="${esc(e.id)}">Borrar el equipo</button>` : `<button class="b chico" data-dejar="${esc(e.id)}">Salir del equipo</button>`}</div>`;
  }).join("");
  sec.innerHTML = `<h3 class="tit-sec">Equipos</h3>${eqs || `<p class="vacio">No estás en ningún equipo. Armá uno y desafíen a otros de igual a igual.</p>`}
    <form class="nuevo-equipo" data-nuevo-equipo><input type="text" name="nombre" maxlength="24" placeholder="Nombre del equipo nuevo" required>
      <div class="segmentado chico-seg" role="radiogroup"><label><input type="radio" name="tamano" value="2" checked><span>de a 2</span></label><label><input type="radio" name="tamano" value="3"><span>de a 3</span></label></div>
      <button class="b">Armar el equipo</button></form>`;
  const f = sec.querySelector("[data-nuevo-equipo]");
  f.onsubmit = async (e) => { e.preventDefault(); try { await N.crearEquipo(f.nombre.value, +f.tamano.value); pintarVos(); } catch (x) { ganchos.aviso?.(x.message); } };
  sec.querySelectorAll("[data-sumar]").forEach((fs) => fs.onsubmit = async (e) => {
    e.preventDefault();
    try { await N.sumarAlEquipo(fs.dataset.sumar, fs.u.value); pintarVos(); } catch (x) { ganchos.aviso?.(x.message); }
  });
}
let equiposVos = [];
async function clicVos(e) {
  const t = e.target;
  if (t.closest("[data-salir-cuenta]")) { await N.salir(); return irA("jugar"); }
  if (t.closest("[data-borrar-cuenta]")) return abrirBorrado();
  const desb = t.closest("[data-desbloquear]");
  if (desb) { try { await N.desbloquear(desb.dataset.desbloquear); ganchos.aviso?.("Desbloqueado"); } catch (x) { ganchos.aviso?.(x.message); } return pintarVos(); }
  const ir = t.closest("[data-ir]"); if (ir) return irA(ir.dataset.ir);
  const fi = t.closest("[data-ficha]"); if (fi) return abrirFicha(fi.dataset.ficha);
  const borrar = t.closest("[data-borrar]"), dejar = t.closest("[data-dejar]"), des = t.closest("[data-desafiar]"), acepta = t.closest("[data-aceptar]");
  try {
    if (acepta) { await N.aceptarEquipo(acepta.dataset.aceptar); return pintarVos(); }
    if (borrar) { await N.borrarEquipo(borrar.dataset.borrar); return pintarVos(); }
    if (dejar) { await N.sacarDelEquipo(dejar.dataset.dejar, perfilId()); return pintarVos(); }
  } catch (x) { return ganchos.aviso?.(x.message); }
  if (des) return elegirRival(equiposVos.find((x) => x.id === des.dataset.desafiar));
}

const soloListos = (e) => ({ ...e, miembros: e.miembros.filter((m) => m.acepto !== false) });
/** Lista de equipos del mismo tamaño para desafiar; marca los que tienen a todos conectados. */
async function elegirRival(mio) {
  if (!mio) return;
  mio = soloListos(mio);
  const capa = abrirCapa("rival", `<div class="hoja"><h2>Contra qué equipo</h2><p class="sala">buscando equipos…</p></div>`);
  const todos = (await N.todosLosEquipos().catch(() => [])).map(soloListos).filter((e) => e.id !== mio.id && e.tamano === mio.tamano && e.miembros.length >= e.tamano
    && !e.miembros.some((m) => mio.miembros.some((x) => x.id === m.id)));
  const on = new Set(N.listaConectados().map((c) => c.id));
  todos.sort((a, b) => b.miembros.filter((m) => on.has(m.id)).length - a.miembros.filter((m) => on.has(m.id)).length);
  const faltan = mio.miembros.filter((m) => m.id !== perfilId() && !on.has(m.id)).map((m) => esc(m.usuario));
  capa.dataset.mio = JSON.stringify(mio);
  capa.innerHTML = `<div class="hoja"><h2>Contra qué equipo</h2><p class="sala">${esc(mio.nombre)} · de a ${mio.tamano}</p>
    ${faltan.length ? `<p>De tu equipo no está conectado: ${faltan.join(", ")}. Igual les llega el link si se conectan.</p>` : ""}
    ${todos.length ? `<ul>${todos.map((e) => {
      const n = e.miembros.filter((m) => on.has(m.id)).length;
      return `<li><span>${esc(e.nombre)}<small>${e.miembros.map((m) => `${on.has(m.id) ? "● " : ""}${esc(m.usuario)}`).join(" · ")}</small></span>
        <button class="b chico-h" data-contra='${esc(JSON.stringify({ id: e.id, nombre: e.nombre, miembros: e.miembros }))}'>${n}/${e.tamano} · Invitar</button></li>`;
    }).join("")}</ul>` : `<p>No hay otros equipos de a ${mio.tamano} completos todavía.</p>`}
    <button class="b" data-cerrar>Volver</button></div>`;
  capa.onclick = (e) => {
    if (e.target === capa || e.target.closest("[data-cerrar]")) return cerrar();
    const rival = e.target.closest("[data-contra]");
    if (rival) desafiar(JSON.parse(capa.dataset.mio), JSON.parse(rival.dataset.contra));
  };
}

/** Arma la mesa equipo contra equipo e invita a todos los demás. Cuenta en el historial como «equipos». */
function desafiar(mio, rival, extra = {}) {
  cerrar();
  irA("jugar");
  const lados = {};
  mio.miembros.forEach((m) => (lados[m.id] = 0));
  rival.miembros.forEach((m) => (lados[m.id] = 1));
  pendientes = [...mio.miembros, ...rival.miembros].filter((m) => m.id !== perfilId()).map((m) => [m.id, m.usuario]);
  ganchos.crearMesaEquipos({ jugadores: mio.tamano * 2, equipos: [mio.id, rival.id], nombresEquipos: [mio.nombre, rival.nombre], lados, ...extra });
}

// ================= Liga (clasificatoria, 40 de gloria) =================
let modoClasif = "1v1", equipoClasif = null, statsClasif = {}, equiposClasif = null;
const METAL = { bronce: ["#e0a477", "#8a4f26"], plata: ["#e3e8ee", "#7d8794"], oro: ["#f4d77a", "#a87a1f"] };
function escudo(liga, px = 96, apagado = false) {
  const [a, b] = METAL[liga.metal] || METAL.bronce, id = "es" + Math.random().toString(36).slice(2, 7), num = liga.nombre.split(" ")[1];
  return `<svg class="escudo${apagado ? " apagado" : ""}" viewBox="0 0 100 112" width="${px}" height="${px * 1.12}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
    <path d="M50 4l40 14v32c0 28-18 46-40 58C28 96 10 78 10 50V18z" fill="url(#${id})" stroke="#14171c" stroke-width="4" stroke-linejoin="round"/>
    <path d="M50 16l29 10v24c0 21-13 35-29 44-16-9-29-23-29-44V26z" fill="none" stroke="#14171c" stroke-width="2" opacity=".35"/>
    <text x="50" y="68" text-anchor="middle" font-family="Bricolage, sans-serif" font-weight="800" font-size="34" fill="#14171c">${num}</text></svg>`;
}
async function pintarLiga() {
  const el = $("#vista-liga"); if (!el) return;
  const p = N.miPerfil();
  if (!p) { el.innerHTML = `<h2 class="tit-vista">Liga</h2>${tarjetaEntrar("La liga se abre con 40 de gloria: partidas por puntos contra gente de tu nivel, de Bronce 1 a Oro 1.")}`; return; }
  const liga = G.ligaDe(p.elo);
  const escalera = `<ol class="escalera">${G.LIGAS.map((n, i) => { const l = G.ligaDe(i * 100); return `<li class="${i < liga.i ? "pasada" : i === liga.i ? "actual" : ""}">${escudo(l, i === liga.i ? 34 : 24, i > liga.i)}<span>${esc(n)}</span></li>`; }).join("")}</ol>`;
  if (!G.tiene(p, "clasif")) {
    el.innerHTML = `<h2 class="tit-vista">Liga</h2><div class="liga-cerrada">${escudo(G.ligaDe(0), 110, true)}<span class="candado-g">${CANDADO}</span>
      <h3>Se abre con 40 de gloria</h3><p>Tenés ${p.puntos}. Te faltan <b>${40 - p.puntos}</b>: ${partidasPara(40 - p.puntos)}. Cuentan las partidas con alguien que también entró con su cuenta.</p>
      <span class="barra-g"><i style="width:${Math.round((p.puntos / 40) * 100)}%"></i></span></div>
      <section><h3 class="tit-sec">Las ligas</h3>${escalera}<p class="nota-eq">Cada liga son 100 puntos: unas 3 victorias contra alguien de tu nivel. Los objetos (mate, peluca, trampa, gorrita) valen recién desde Oro 4.</p></section>`;
    return;
  }
  if (!equiposClasif) {
    el.innerHTML = `<h2 class="tit-vista">Liga</h2><p class="cargando">Abriendo la liga…</p>`;
    equiposClasif = (await N.misEquipos().catch(() => [])).map(soloListos).filter((e) => e.miembros.length >= e.tamano && e.miembros.some((m) => m.id === perfilId()));
    if (vistaActual !== "liga") return;
  }
  const busco = N.buscando();
  const tam = modoClasif === "2v2" ? 2 : modoClasif === "3v3" ? 3 : 1;
  const misEqs = equiposClasif.filter((e) => e.tamano === tam);
  if (tam > 1 && !misEqs.some((e) => e.id === equipoClasif)) equipoClasif = misEqs[0]?.id || null;
  const otros = N.listaConectados().filter((c) => c.busca === modoClasif && c.estado === "libre");
  const faltanStats = otros.map((c) => c.id).filter((id) => !statsClasif[id]);
  if (faltanStats.length) N.estadisticasDe(faltanStats).then((r) => { Object.assign(statsClasif, r); faltanStats.forEach((id) => (statsClasif[id] ||= { jugadas: 0, ganadas: 0 })); if (vistaActual === "liga") pintarLiga(); }).catch(() => {});
  let rivales;
  if (tam === 1) rivales = otros.map((c) => ({ ids: [c.id], nombre: c.usuario, elo: c.elo || 0, gente: [c] }));
  else {
    const porEq = {};
    otros.forEach((c) => { if (c.equipo && c.equipo !== equipoClasif) (porEq[c.equipo] ||= []).push(c); });
    rivales = Object.entries(porEq).map(([id, gente]) => ({ equipo: id, ids: gente.map((g) => g.id), nombre: gente.map((g) => g.usuario).join(" · "), elo: Math.round(gente.reduce((t, g) => t + (g.elo || 0), 0) / gente.length), gente }));
  }
  const mio = tam === 1 ? p.elo || 0 : Math.round((() => { const e = misEqs.find((x) => x.id === equipoClasif); if (!e) return p.elo || 0; const on = Object.fromEntries(N.listaConectados().map((c) => [c.id, c.elo || 0])); return e.miembros.reduce((t, m) => t + (m.id === p.id ? p.elo || 0 : on[m.id] ?? 0), 0) / e.miembros.length; })());
  rivales.sort((a, b) => Math.abs(a.elo - mio) - Math.abs(b.elo - mio));
  const filas = rivales.map((r) => {
    const v = G.previa(mio, r.elo), lg = G.ligaDe(r.elo);
    const st = r.gente.map((g) => statsClasif[g.id]).filter(Boolean);
    const jug = st.reduce((t, x) => t + x.jugadas, 0), gan = st.reduce((t, x) => t + x.ganadas, 0);
    const cerca = Math.abs(r.elo - mio) <= 100;
    return `<li class="rival-l${cerca ? " cerca" : ""}">${tam === 1 ? avatar(r.gente[0], 40) : escudo(lg, 30)}<span class="r-t"><b>${esc(r.nombre)}</b><small>${esc(lg.nombre)} · ${r.elo} pts · ${jug} jugadas, ${gan} ganadas</small>
      <small class="previa"><span class="mas">+${v.gana}</span> si ganás · <span class="menos">−${v.pierde}</span> si perdés</small></span>
      <button class="b fuerte chico-e" data-jugar='${esc(JSON.stringify({ ids: r.ids, equipo: r.equipo || null }))}'>Jugar</button></li>`;
  }).join("");
  el.innerHTML = `<h2 class="tit-vista">Liga</h2>
    <div class="liga-heroe">${escudo(liga, 92)}<div><p class="lh-n">${esc(liga.nombre)}</p><p class="lh-p">${p.elo || 0} puntos${liga.i < G.LIGAS.length - 1 ? ` · ${100 - liga.progreso} para ${esc(G.LIGAS[liga.i + 1])}` : " · la más alta"}</p>
      <span class="barra-g metal-${liga.metal}" role="img" aria-label="${liga.progreso} de 100 para subir"><i style="width:${liga.progreso}%"></i></span></div></div>
    ${escalera}
    <div class="segmentado tres modos">${["1v1", "2v2", "3v3"].map((m) => `<button type="button" data-modo="${m}" aria-pressed="${m === modoClasif}">${TIPO[m]}</button>`).join("")}</div>
    ${tam > 1 ? (misEqs.length ? `<label class="campo"><span>Con tu equipo</span><select data-equipo>${misEqs.map((e) => `<option value="${esc(e.id)}"${e.id === equipoClasif ? " selected" : ""}>${esc(e.nombre)}</option>`).join("")}</select></label>`
      : `<p class="vacio">Para jugar de a ${tam} necesitás un equipo completo de ${tam} (se arma en Vos).</p>`) : ""}
    ${busco === modoClasif ? `<button class="b claro ancho buscando" data-parar><span class="radar" aria-hidden="true"></span>Buscando rival… tocá para dejar de buscar</button>` : `<button class="b fuerte ancho grande" data-buscar ${tam > 1 && !equipoClasif ? "disabled" : ""}>Buscar rival</button>`}
    <section><h3 class="tit-sec">Buscando ${esc(TIPO[modoClasif])} <small>${rivales.length}</small></h3>
    ${filas ? `<ul class="rivales">${filas}</ul>` : `<p class="vacio">Ahora no hay nadie buscando ${esc(TIPO[modoClasif])}. Poné «Buscar rival» y te van a ver; también podés invitar a alguien conectado desde Jugar.</p>`}</section>
    <p class="nota-eq">Cada liga son 100 puntos: unas 3 victorias contra alguien de tu nivel. Ganarle a uno mejor da más; perder resta menos de lo que suma ganar. Los objetos (mate, peluca, trampa, gorrita) valen recién desde Oro 4.</p>`;
  const sel = el.querySelector("[data-equipo]");
  if (sel) sel.onchange = () => { equipoClasif = sel.value; pintarLiga(); };
}
async function clicLiga(e) {
  const t = e.target;
  if (t.closest("[data-google]")) return entrar();
  const m = t.closest("[data-modo]");
  if (m) { modoClasif = m.dataset.modo; if (N.buscando()) await N.buscarRival(null).catch(() => {}); return pintarLiga(); }
  try {
    if (t.closest("[data-buscar]")) { await N.buscarRival(modoClasif, equipoClasif); ganchos.aviso?.("Buscando: te ven los que buscan lo mismo"); return pintarLiga(); }
    if (t.closest("[data-parar]")) { await N.buscarRival(null); return pintarLiga(); }
  } catch (x) { return ganchos.aviso?.(x.message, 5000); }
  const j = t.closest("[data-jugar]");
  if (j) jugarClasif(JSON.parse(j.dataset.jugar));
}

/** Arma la partida de clasificatoria e invita al rival (o a los dos equipos). */
async function jugarClasif({ ids, equipo }) {
  const gente = N.listaConectados();
  const nombre = (id) => gente.find((c) => c.id === id)?.usuario || "?";
  if (N.buscando()) await N.buscarRival(null).catch(() => {});
  if (modoClasif === "1v1") {
    irA("jugar");
    pendientes = ids.map((id) => [id, nombre(id)]);
    return ganchos.crearSalaClasif({ clasificatoria: true });
  }
  const mio = equiposClasif.find((e) => e.id === equipoClasif);
  const todos = await N.todosLosEquipos().catch(() => []);
  const suyo = soloListos(todos.find((e) => e.id === equipo) || { id: equipo, nombre: "rival", miembros: ids.map((id) => ({ id, usuario: nombre(id) })) });
  if (!mio) return ganchos.aviso?.("Elegí tu equipo primero.");
  desafiar(mio, suyo, { clasificatoria: true });
}

const G_LOGO = `<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg>`;
