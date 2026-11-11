// Cuenta del jugador: entrar con Google, elegir usuario, perfil con historial, conectados para invitar sin link,
// invitaciones, equipos (4B); lo que se desbloquea con la gloria, la pinta y el estilo de juego (4C); clasificatoria
// por ligas (4D). Usa nube.js (base) y gloria.js (reglas y dibujos). Sin nube no muestra nada.
import * as N from "./nube.js";
import * as G from "./gloria.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let ganchos = {};                 // { aviso, crearMesaEquipos, crearSalaClasif }
let linkActual = null, tipoActual = "", pendientes = [];
const invitados = new Set();
let mate = false;                 // tomó al menos un mate en esta partida

/** Lo llama app.js al arrancar. */
export async function iniciar(g) {
  ganchos = g;
  if (!N.activa()) return;
  $("#bloque-cuenta").hidden = false;
  pintarCuenta();
  N.on("sesion", () => { pintarCuenta(); ponerNombre(); });
  N.on("conectados", (l) => { pintarConectados(l); if ($("#capa")?.dataset.tipo === "clasif") pintarClasif(); });
  N.on("invitacion", mostrarInvitacion);
  N.on("busqueda", ({ error }) => ganchos.aviso?.(error));
  try { await N.iniciar(); } catch (e) { console.error(e); }
  pintarCuenta(); ponerNombre();
}

export const perfilId = () => N.miPerfil()?.id || null;
export const usuario = () => N.miPerfil()?.usuario || null;
export const miPerfil = () => N.miPerfil();
export const perfilesDe = (ids) => N.activa() ? N.perfilesDe(ids.filter(Boolean), true).catch(() => ({})) : Promise.resolve({});

/** El nombre en la mesa es el usuario (si entró). */
function ponerNombre() {
  const u = usuario();
  for (const id of ["#in-nombre", "#in-nombre-inv"]) {
    const i = $(id); if (!i) continue;
    if (u) { i.value = u; i.readOnly = true; i.title = "Es tu usuario"; } else { i.readOnly = false; i.title = ""; }
  }
}

/** Nombre con su color, su letra, su insignia y su título debajo (todo de listas cerradas o escapado). */
export function nombreHTML(p, { titulo = true, clase = "" } = {}) {
  if (!p) return "";
  const est = G.estiloNombre(p);
  const ins = G.tiene(p, "insignia") ? G.insignia(16) : "";
  const tit = titulo && p.titulo && G.tiene(p, "titulo") ? `<span class="titulo-n"${est ? ` style="${est}"` : ""}>${esc(p.titulo)}</span>` : "";
  return `<span class="nombre-g ${clase}"><span class="u-n"${est ? ` style="${est}"` : ""}>${esc(p.usuario)}</span>${ins}</span>${tit}`;
}

// ---------- el bloque de arriba del inicio ----------
function pintarCuenta() {
  const el = $("#bloque-cuenta"); if (!el) return;
  const u = N.miUsuario(), p = N.miPerfil();
  if (!u) {
    el.innerHTML = `<div class="cuenta-fila"><p class="cuenta-txt">Entrá para guardar tus partidas, ver quién está conectado e invitarlo sin link.</p>
      <button class="b google" data-google>${G_LOGO}<span>Entrar con Google</span></button></div>`;
  } else if (!p) {
    el.innerHTML = `<form class="cuenta-alta" data-alta><label class="campo"><span>Elegí tu usuario (así te ven en la mesa)</span>
      <input type="text" name="u" maxlength="16" autocomplete="nickname" placeholder="ej. pedro" required></label>
      <p class="cuenta-error" data-error></p><button class="b fuerte">Guardar</button>
      <button type="button" class="b chico" data-salir>Salir</button></form>`;
    el.querySelector("input").value = (u.user_metadata?.full_name || "").split(" ")[0].toLowerCase().slice(0, 16);
  } else {
    const prox = G.proximo(p.puntos), liga = G.ligaDe(p.elo);
    el.innerHTML = `<div class="cuenta-yo"><span class="punto si"></span><span class="cuenta-quien">${nombreHTML(p)}</span>
      <button class="b chico" data-perfil>Mi perfil</button></div>
      <p class="cuenta-gloria"><b>${p.puntos}</b> de gloria${prox ? ` · a ${prox.p - p.puntos} de ${esc(prox.nombre.toLowerCase())}` : ""}</p>
      ${G.tiene(p, "clasif") ? `<button class="b clasif" data-clasif><span class="liga ${liga.metal}">${esc(liga.nombre)}</span>Clasificatoria</button>` : ""}
      <div class="conectados"><p class="campo-t">Conectados</p><ul data-conectados></ul></div>`;
    pintarConectados(N.listaConectados());
  }
  el.onclick = async (e) => {
    if (e.target.closest("[data-google]")) { try { await N.entrarConGoogle(); } catch { ganchos.aviso?.("No se pudo abrir Google. Probá de nuevo."); } }
    if (e.target.closest("[data-salir]")) await N.salir();
    if (e.target.closest("[data-perfil]")) abrirPerfil();
    if (e.target.closest("[data-clasif]")) abrirClasif();
    const inv = e.target.closest("[data-invitar]");
    if (inv) invitar(inv.dataset.invitar, inv.dataset.u);
  };
  const f = el.querySelector("[data-alta]");
  if (f) f.onsubmit = async (e) => {
    e.preventDefault();
    const err = f.querySelector("[data-error]"); err.textContent = "";
    try { await N.crearPerfil(f.u.value); } catch (x) { err.textContent = x.message; }
  };
}

function pintarConectados(lista) {
  const ul = document.querySelector("[data-conectados]"); if (!ul) return;
  if (!lista.length) { ul.innerHTML = `<li class="vacio">Nadie más conectado ahora.</li>`; return; }
  ul.innerHTML = lista.map((c) => `<li><span class="punto ${c.estado === "libre" ? "si" : "ocupado"}"></span><span class="u">${nombreHTML(c, { titulo: false })}</span>
    <span class="est">${c.estado === "libre" ? (c.busca ? `busca ${esc(c.busca)}` : "") : "jugando"}</span>
    <button class="b chico" data-invitar="${esc(c.id)}" data-u="${esc(c.usuario)}" ${invitados.has(c.id) ? "disabled" : ""}>${invitados.has(c.id) ? "invitado" : "Invitar"}</button></li>`).join("");
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
    // en la barra el nombre del rival ya está al lado: «vos 4 a 1» (verde si vas ganando, rojo si vas perdiendo)
    if (!r || r[0] + r[1] === 0) return { texto: "primera vez", clase: "", titulo: `Primera partida anotada contra ${rivalNombre}` };
    return { texto: `vos ${r[0]} a ${r[1]}`, clase: r[0] > r[1] ? "gana" : r[0] < r[1] ? "pierde" : "", titulo: `Contra ${rivalNombre}: ganaste ${r[0]}, perdiste ${r[1]}` };
  } catch { return null; }
}

// ---------- la hoja del perfil ----------
function abrirCapa(tipo, html) {
  const c = $("#capa"); c.innerHTML = html; c.hidden = false; c.dataset.tipo = tipo; return c;
}
function cerrar() { const c = $("#capa"); c.hidden = true; c.innerHTML = ""; c.dataset.tipo = ""; }

async function abrirPerfil() {
  const p = N.miPerfil();
  const capa = abrirCapa("perfil", `<div class="hoja perfil"><h2>${esc(p.usuario)}</h2><p class="sala">cargando tu historial…</p></div>`);
  capa.onclick = (e) => { if (e.target === capa || e.target.closest("[data-cerrar]")) cerrar(); };
  const [partidas, equipos] = await Promise.all([N.misPartidas().catch(() => []), N.misEquipos().catch(() => [])]);
  if (capa.dataset.tipo !== "perfil") return;
  capa.innerHTML = hojaPerfil(N.miPerfil(), N.resumir(partidas), partidas, equipos);
  capa.onclick = (e) => accionPerfil(e, equipos);
  const f = capa.querySelector("[data-nuevo-equipo]");
  if (f) f.onsubmit = async (e) => {
    e.preventDefault();
    try { await N.crearEquipo(f.nombre.value, +f.tamano.value); abrirPerfil(); } catch (x) { ganchos.aviso?.(x.message); }
  };
  capa.querySelectorAll("[data-sumar]").forEach((fs) => fs.onsubmit = async (e) => {
    e.preventDefault();
    try { await N.sumarAlEquipo(fs.dataset.sumar, fs.u.value); abrirPerfil(); } catch (x) { ganchos.aviso?.(x.message); }
  });
  const pinta = capa.querySelector("[data-pinta]");
  if (pinta) {
    const muestra = () => { const v = leerPinta(pinta); pinta.querySelector("[data-muestra]").innerHTML = nombreHTML({ ...N.miPerfil(), titulo: v.titulo, estilo: v.estilo }); };
    pinta.oninput = muestra; pinta.onchange = muestra;
    pinta.onsubmit = async (e) => {
      e.preventDefault();
      try { await N.guardarCosmeticos(leerPinta(pinta)); ganchos.aviso?.("Guardado"); abrirPerfil(); } catch (x) { ganchos.aviso?.(x.message, 5000); }
    };
  }
}

/** Lee el formulario de la pinta: solo valores de las listas (y el título libre, si ya llegó a 35). */
function leerPinta(f) {
  const p = N.miPerfil(), e = {};
  const val = (n) => f.elements[n]?.value || "";
  if (G.tiene(p, "estilo")) { if (G.COLORES[val("color")]) e.color = val("color"); if (G.FUENTES[val("fuente")]) e.fuente = val("fuente"); }
  if (G.tiene(p, "peluca") && G.COLORES[val("peluca")]) e.peluca = val("peluca");
  if (G.tiene(p, "gorra") && f.elements.gorra?.checked) e.gorra = true;
  let titulo = null;
  if (G.tiene(p, "libre") && val("libre").trim()) titulo = val("libre").trim().slice(0, 32);
  else if (G.tiene(p, "titulo") && G.TITULOS.includes(val("titulo"))) titulo = val("titulo");
  return { titulo, estilo: e };
}

const TIPO = { "1v1": "mano a mano", "2v2": "2 contra 2", "3v3": "3 contra 3", equipos: "equipo contra equipo" };
function hojaPerfil(p, r, partidas, equipos) {
  const registro = (x) => `<span class="reg ${x.ganadas > x.perdidas ? "gana" : x.ganadas < x.perdidas ? "pierde" : ""}">${x.ganadas} a ${x.perdidas}</span>`;
  const rivales = Object.values(r.rivales).sort((a, b) => b.ganadas + b.perdidas - a.ganadas - a.perdidas);
  const ultimas = partidas.slice(0, 8).map((x) => {
    const rivs = x.jugadores.filter((j) => j.lado !== x.lado).map((j) => esc(j.usuario)).join(", ");
    const mio = x.lado === 0 ? x.puntos0 : x.puntos1, suyo = x.lado === 0 ? x.puntos1 : x.puntos0;
    const fecha = new Date(x.jugada).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
    const elo = x.clasificatoria && x.eloDelta ? ` · ${x.eloDelta > 0 ? "+" : ""}${+x.eloDelta} liga` : "";
    return `<li><span><small>${fecha} · ${TIPO[x.tipo] || ""}${x.clasificatoria ? " · clasificatoria" : ""}${esc(elo)}</small>contra ${rivs || "?"}</span><span class="reg ${x.gano ? "gana" : "pierde"}">${mio} a ${suyo}</span></li>`;
  }).join("");
  const eqs = equipos.map((e) => {
    const yoCreo = e.creador === p.id;
    const listos = e.miembros.filter((m) => m.acepto !== false), lleno = listos.length >= e.tamano;
    if (e.miembros.some((m) => m.id === p.id && m.acepto === false))
      return `<div class="equipo pendiente"><div class="eq-cab"><b>${esc(e.nombre)}</b><small>de a ${e.tamano}</small></div>
      <p class="miembros">Te invitaron a este equipo: ${listos.map((m) => esc(m.usuario)).join(" · ")}</p>
      <button class="b chico-h" data-aceptar="${esc(e.id)}">Aceptar</button> <button class="b claro chico-h" data-dejar="${esc(e.id)}">No, gracias</button></div>`;
    return `<div class="equipo"><div class="eq-cab"><b>${esc(e.nombre)}</b><small>de a ${e.tamano} · ${listos.length}/${e.tamano}</small></div>
      <p class="miembros">${e.miembros.map((m) => esc(m.usuario) + (m.acepto === false ? " <i>(invitado)</i>" : "")).join(" · ")}</p>
      ${yoCreo && e.miembros.length < e.tamano ? `<form class="sumar" data-sumar="${esc(e.id)}"><input type="text" name="u" maxlength="16" placeholder="usuario a sumar" required><button class="b">Sumar</button></form>` : ""}
      ${lleno ? `<button class="b" data-desafiar="${esc(e.id)}">Jugar contra otro equipo</button>` : `<p class="nota-eq">Cuando estén los ${e.tamano}, pueden desafiar a otro equipo.</p>`}
      ${yoCreo ? `<button class="b claro chico-h" data-borrar="${esc(e.id)}">Borrar el equipo</button>` : `<button class="b claro chico-h" data-dejar="${esc(e.id)}">Salir del equipo</button>`}</div>`;
  }).join("");
  const liga = G.ligaDe(p.elo);
  const vitrina = G.UMBRALES.map((u) => `<li class="${p.puntos >= u.p ? "si" : "no"}"><span><b>${u.p}</b> ${esc(u.nombre)}<small>${esc(u.que)}</small></span>
    <span class="estado-u">${p.puntos >= u.p ? "✓" : `faltan ${u.p - p.puntos}`}</span></li>`).join("");
  const estilo = G.tiene(p, "insignia") ? G.estiloDeJuego(G.sumarEstilos(partidas.map((x) => x.estilo))) : null;
  return `<div class="hoja perfil"><h2 class="cab-perfil">${nombreHTML(p)}</h2><p class="sala">${p.puntos} de gloria${G.tiene(p, "clasif") ? ` · ${esc(liga.nombre)} (${p.elo || 0})` : ""}</p>
    <div class="cifras"><div><b>${r.jugadas}</b><span>jugadas</span></div><div><b>${r.ganadas}</b><span>ganadas</span></div><div><b>${r.perdidas}</b><span>perdidas</span></div></div>
    ${estilo ? `<div class="estilo-juego"><small>tu estilo de juego</small><b>${esc(estilo.nombre)}</b><p>${esc(estilo.que)}</p></div>` : ""}
    ${hojaPinta(p)}
    <h3>Lo que se desbloquea con la gloria</h3><ul class="vitrina">${vitrina}</ul>
    <p class="nota-eq">Ganar da 3; perder por menos de 5, 1; con el mate y tomando uno, +1. Se suma en partidas con otra persona que también entró.</p>
    <h3>Contra quiénes jugaste</h3>
    ${rivales.length ? `<ul>${rivales.map((x) => `<li><span>${esc(x.usuario)}</span>${registro(x)}</li>`).join("")}</ul>` : `<p class="vacio">Todavía ninguna partida anotada. Se anotan las que jugás con alguien que también entró con su usuario.</p>`}
    ${ultimas ? `<h3>Últimas partidas</h3><ul class="ultimas">${ultimas}</ul>` : ""}
    <h3>Equipos</h3>${eqs || `<p class="vacio">No estás en ningún equipo.</p>`}
    <form class="nuevo-equipo" data-nuevo-equipo><input type="text" name="nombre" maxlength="24" placeholder="Nombre del equipo nuevo" required>
      <div class="segm"><label><input type="radio" name="tamano" value="2" checked> de a 2</label><label><input type="radio" name="tamano" value="3"> de a 3</label></div>
      <button class="b">Armar el equipo</button></form>
    <button class="b claro" data-salir-cuenta>Salir de la cuenta</button><button class="b" data-cerrar>Volver</button></div>`;
}

/** «Tu pinta»: solo aparecen las opciones ya desbloqueadas. */
function hojaPinta(p) {
  if (!G.tiene(p, "titulo")) return "";
  const e = p.estilo || {};
  const op = (obj, nombres, actual, vacio) => `<option value="">${vacio}</option>` + Object.keys(obj).map((k) => `<option value="${k}"${k === actual ? " selected" : ""}>${esc(nombres[k])}</option>`).join("");
  const libre = p.titulo && !G.TITULOS.includes(p.titulo) ? p.titulo : "";
  return `<form class="pinta" data-pinta><h3>Tu pinta</h3>
    <div class="muestra" data-muestra>${nombreHTML(p)}</div>
    <label class="campo"><span>Título</span><select name="titulo"><option value="">sin título</option>${G.TITULOS.map((t) => `<option${t === p.titulo ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
    ${G.tiene(p, "libre") ? `<label class="campo"><span>O escribí el tuyo (pisa al de la lista)</span><input type="text" name="libre" maxlength="32" value="${esc(libre)}" placeholder="ej. El que nunca se va al mazo"></label>` : ""}
    ${G.tiene(p, "estilo") ? `<div class="dos"><label class="campo"><span>Color</span><select name="color">${op(G.COLORES, G.NOMBRE_COLOR, e.color, "el de siempre")}</select></label>
      <label class="campo"><span>Letra</span><select name="fuente">${op(G.FUENTES, G.NOMBRE_FUENTE, e.fuente, "la de siempre")}</select></label></div>` : ""}
    ${G.tiene(p, "peluca") ? `<label class="campo"><span>Peluca</span><select name="peluca">${op(G.COLORES, G.NOMBRE_COLOR, e.peluca, "sin peluca a la vista")}</select></label>` : ""}
    ${G.tiene(p, "gorra") ? `<label class="tilde"><input type="checkbox" name="gorra"${e.gorra ? " checked" : ""}> Usar la gorrita de la Selección</label>` : ""}
    <button class="b">Guardar mi pinta</button></form>`;
}

async function accionPerfil(e, equipos) {
  const capa = $("#capa"), t = e.target;
  if (t === capa || t.closest("[data-cerrar]")) return cerrar();
  if (t.closest("[data-salir-cuenta]")) { await N.salir(); return cerrar(); }
  const borrar = t.closest("[data-borrar]"), dejar = t.closest("[data-dejar]"), des = t.closest("[data-desafiar]"), acepta = t.closest("[data-aceptar]");
  try {
    if (acepta) { await N.aceptarEquipo(acepta.dataset.aceptar); return abrirPerfil(); }
    if (borrar) { await N.borrarEquipo(borrar.dataset.borrar); return abrirPerfil(); }
    if (dejar) { await N.sacarDelEquipo(dejar.dataset.dejar, perfilId()); return abrirPerfil(); }
  } catch (x) { return ganchos.aviso?.(x.message); }
  if (des) return elegirRival(equipos.find((x) => x.id === des.dataset.desafiar));
  const rival = t.closest("[data-contra]");
  if (rival) desafiar(JSON.parse(capa.dataset.mio), JSON.parse(rival.dataset.contra));
}

const soloListos = (e) => ({ ...e, miembros: e.miembros.filter((m) => m.acepto !== false) });
/** Lista de equipos del mismo tamaño para desafiar; marca los que tienen a todos conectados. */
async function elegirRival(mio) {
  const capa = $("#capa");
  mio = soloListos(mio);
  const todos = (await N.todosLosEquipos().catch(() => [])).map(soloListos).filter((e) => e.id !== mio.id && e.tamano === mio.tamano && e.miembros.length >= e.tamano
    && !e.miembros.some((m) => mio.miembros.some((x) => x.id === m.id)));
  const on = new Set(N.listaConectados().map((c) => c.id));
  todos.sort((a, b) => b.miembros.filter((m) => on.has(m.id)).length - a.miembros.filter((m) => on.has(m.id)).length);
  const faltan = mio.miembros.filter((m) => m.id !== perfilId() && !on.has(m.id)).map((m) => esc(m.usuario));
  capa.dataset.mio = JSON.stringify(mio);
  capa.innerHTML = `<div class="hoja perfil"><h2>Contra qué equipo</h2><p class="sala">${esc(mio.nombre)} · de a ${mio.tamano}</p>
    ${faltan.length ? `<p class="vacio">De tu equipo no está conectado: ${faltan.join(", ")}. Igual les llega el link si se conectan.</p>` : ""}
    ${todos.length ? `<ul>${todos.map((e) => {
      const n = e.miembros.filter((m) => on.has(m.id)).length;
      return `<li><span>${esc(e.nombre)}<small>${e.miembros.map((m) => `${on.has(m.id) ? "● " : ""}${esc(m.usuario)}`).join(" · ")}</small></span>
        <button class="b chico-h" data-contra='${esc(JSON.stringify({ id: e.id, nombre: e.nombre, miembros: e.miembros }))}'>${n}/${e.tamano} conectados · Invitar</button></li>`;
    }).join("")}</ul>` : `<p class="vacio">No hay otros equipos de a ${mio.tamano} completos todavía.</p>`}
    <button class="b" data-cerrar>Volver</button></div>`;
}

/** Arma la mesa equipo contra equipo e invita a todos los demás. Cuenta en el historial como «equipos». */
function desafiar(mio, rival, extra = {}) {
  cerrar();
  const lados = {};
  mio.miembros.forEach((m) => (lados[m.id] = 0));
  rival.miembros.forEach((m) => (lados[m.id] = 1));
  pendientes = [...mio.miembros, ...rival.miembros].filter((m) => m.id !== perfilId()).map((m) => [m.id, m.usuario]);
  ganchos.crearMesaEquipos({ jugadores: mio.tamano * 2, equipos: [mio.id, rival.id], nombresEquipos: [mio.nombre, rival.nombre], lados, ...extra });
}

// ---------- clasificatoria (40 de gloria) ----------
let modoClasif = "1v1", equipoClasif = null, statsClasif = {}, equiposClasif = [];
async function abrirClasif() {
  abrirCapa("clasif", `<div class="hoja perfil clasif"><h2>Clasificatoria</h2><p class="sala">cargando…</p></div>`);
  equiposClasif = (await N.misEquipos().catch(() => [])).map(soloListos).filter((e) => e.miembros.length >= e.tamano && e.miembros.some((m) => m.id === perfilId()));
  pintarClasif();
}
async function pintarClasif() {
  const capa = $("#capa"); if (capa.dataset.tipo !== "clasif") return;
  const p = N.miPerfil(), liga = G.ligaDe(p.elo), busco = N.buscando();
  const tam = modoClasif === "2v2" ? 2 : modoClasif === "3v3" ? 3 : 1;
  const misEqs = equiposClasif.filter((e) => e.tamano === tam);
  if (tam > 1 && !misEqs.some((e) => e.id === equipoClasif)) equipoClasif = misEqs[0]?.id || null;
  // los que buscan lo mismo que yo
  const otros = N.listaConectados().filter((c) => c.busca === modoClasif && c.estado === "libre");
  const faltanStats = otros.map((c) => c.id).filter((id) => !statsClasif[id]);
  if (faltanStats.length) N.estadisticasDe(faltanStats).then((r) => { Object.assign(statsClasif, r); faltanStats.forEach((id) => (statsClasif[id] ||= { jugadas: 0, ganadas: 0 })); pintarClasif(); }).catch(() => {});
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
    return `<li class="${cerca ? "cerca" : ""}"><span><b>${esc(r.nombre)}</b><small>${esc(lg.nombre)} · ${r.elo} pts · ${jug} jugadas, ${gan} ganadas</small>
      <small class="previa">si ganás +${v.gana} · si perdés −${v.pierde}</small></span>
      <button class="b chico-h" data-jugar='${esc(JSON.stringify({ ids: r.ids, equipo: r.equipo || null }))}'>Jugar</button></li>`;
  }).join("");
  capa.innerHTML = `<div class="hoja perfil clasif"><h2>Clasificatoria</h2>
    <div class="liga-cab"><span class="liga ${liga.metal}">${esc(liga.nombre)}</span><span>${p.elo || 0} puntos</span></div>
    <div class="barra-liga" role="img" aria-label="${liga.progreso} de 100 para subir"><i style="width:${liga.progreso}%"></i></div>
    <p class="nota-eq">Cada liga son 100 puntos: unas 3 victorias contra alguien de tu nivel. Ganarle a uno mejor da más; perder resta menos de lo que suma ganar. Los objetos (mate, peluca, trampa, gorrita) valen recién desde Oro 4.</p>
    <div class="segmentado tres modos">${["1v1", "2v2", "3v3"].map((m) => `<button type="button" data-modo="${m}" aria-pressed="${m === modoClasif}">${TIPO[m]}</button>`).join("")}</div>
    ${tam > 1 ? (misEqs.length ? `<label class="campo"><span>Con tu equipo</span><select data-equipo>${misEqs.map((e) => `<option value="${esc(e.id)}"${e.id === equipoClasif ? " selected" : ""}>${esc(e.nombre)}</option>`).join("")}</select></label>`
      : `<p class="vacio">Para jugar de a ${tam} necesitás un equipo completo de ${tam} (se arma en tu perfil).</p>`) : ""}
    ${busco === modoClasif ? `<button class="b claro" data-parar>Dejar de buscar</button>` : `<button class="b" data-buscar ${tam > 1 && !equipoClasif ? "disabled" : ""}>Buscar rival</button>`}
    <h3>Buscando ${esc(TIPO[modoClasif])}</h3>
    ${filas ? `<ul class="rivales">${filas}</ul>` : `<p class="vacio">Ahora no hay nadie buscando ${esc(TIPO[modoClasif])}. Poné «Buscar rival» y te van a ver; también podés invitar a alguien conectado.</p>`}
    <button class="b" data-cerrar>Volver</button></div>`;
  capa.onclick = async (e) => {
    const t = e.target;
    if (t === capa || t.closest("[data-cerrar]")) return cerrar();
    const m = t.closest("[data-modo]");
    if (m) { modoClasif = m.dataset.modo; if (N.buscando()) await N.buscarRival(null).catch(() => {}); return pintarClasif(); }
    try {
      if (t.closest("[data-buscar]")) { await N.buscarRival(modoClasif, equipoClasif); ganchos.aviso?.("Buscando: te ven los que buscan lo mismo"); return pintarClasif(); }
      if (t.closest("[data-parar]")) { await N.buscarRival(null); return pintarClasif(); }
    } catch (x) { return ganchos.aviso?.(x.message, 5000); }
    const j = t.closest("[data-jugar]");
    if (j) jugarClasif(JSON.parse(j.dataset.jugar));
  };
  const sel = capa.querySelector("[data-equipo]");
  if (sel) sel.onchange = () => { equipoClasif = sel.value; pintarClasif(); };
}

/** Arma la partida de clasificatoria e invita al rival (o a los dos equipos). */
async function jugarClasif({ ids, equipo }) {
  const gente = N.listaConectados();
  const nombre = (id) => gente.find((c) => c.id === id)?.usuario || "?";
  if (N.buscando()) await N.buscarRival(null).catch(() => {});
  if (modoClasif === "1v1") {
    cerrar();
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
