// Amigos fijos, ranking de la semana entre amigos y torneo de una noche (docs/crecer.md, tanda 6, dirección A).
// La base está en supabase/social.sql. Vive repartido en lo que ya hay, sin tocar perfil.js ni nube.js:
//   Jugar → «Tus amigos» y «Torneo de esta noche» (arriba de los conectados) · Liga → «Esta semana entre amigos» ·
//   en cada conectado, un «+» para pedirle amistad · el link ?amigo=usuario ofrece pedírsela al que te lo pasó.
// Usa la sesión que ya abrió nube.js (lee su token; no hace un segundo ingreso). Para probar sin base:
// window.__SOCIAL_FALSO (scripts/social-falsa.js).
import { NUBE } from "./nube-config.js";
import * as N from "./nube.js";
import { avatar, nombreHTML } from "./perfil.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const F = () => window.__SOCIAL_FALSO;
const avisar = (t) => { const a = $("#aviso"); if (!a) return; a.textContent = t; a.hidden = false; clearTimeout(avisar.t); avisar.t = setTimeout(() => (a.hidden = true), 3200); };
const yo = () => N.miPerfil();

// ---------------- base ----------------
let cli = null;
function token() {
  try { const ref = new URL(NUBE.url).hostname.split(".")[0]; return JSON.parse(localStorage.getItem(`sb-${ref}-auth-token`) || "null")?.access_token || null; }
  catch { return null; }
}
function base() {
  if (!cli && window.supabase && NUBE.url && NUBE.clave) cli = window.supabase.createClient(NUBE.url, NUBE.clave, { accessToken: async () => token() });
  return cli;
}
const limpio = (e) => String(e?.message || e || "No se pudo.").replace(/^.*?: /, "").replace(/^./, (c) => c.toUpperCase());
async function rpc(nombre, args = {}) {
  if (F()) return F().rpc(nombre, args);
  const { data, error } = await base().rpc(nombre, args);
  if (error) throw new Error(limpio(error));
  return data;
}
async function tabla(nombre, armar) {
  if (F()) return F().tabla(nombre);
  const { data, error } = await armar(base().from(nombre));
  if (error) throw new Error(limpio(error));
  return data || [];
}
const perfilesDe = (ids) => (F()?.perfilesDe ? F().perfilesDe(ids) : N.perfilesDe(ids));

// ---------------- estado ----------------
let amigos = [], recibidos = [], enviados = [], torneos = [], semana = null, confirmando = null, armando = false, ofrecido = null;
const ids = { amigos: new Set(), pendientes: new Set() };

async function cargarAmigos() {
  const p = yo(); if (!p) return;
  const filas = await tabla("amistades", (q) => q.select("de, para, aceptada").limit(400));
  const otro = (f) => (f.de === p.id ? f.para : f.de);
  const pf = await perfilesDe(filas.map(otro));
  const de = (f) => pf[otro(f)] || { id: otro(f), usuario: "?" };
  amigos = filas.filter((f) => f.aceptada).map(de);
  recibidos = filas.filter((f) => !f.aceptada && f.para === p.id).map(de);
  enviados = filas.filter((f) => !f.aceptada && f.de === p.id).map(de);
  ids.amigos = new Set(amigos.map((a) => a.id));
  ids.pendientes = new Set([...recibidos, ...enviados].map((a) => a.id));
}
async function cargarTorneos() {
  if (!yo()) return;
  const desde = new Date(Date.now() - 12 * 3600e3).toISOString();
  const ts = await tabla("torneos", (q) => q.select("*").gte("empieza", desde).order("empieza").limit(6));
  if (!ts.length) { torneos = []; return; }
  const tids = ts.map((t) => t.id);
  const [js, cs] = await Promise.all([
    tabla("torneo_jugadores", (q) => q.select("torneo, jugador, sembrado").in("torneo", tids)),
    tabla("torneo_cruces", (q) => q.select("*").in("torneo", tids).order("ronda").order("n")),
  ]);
  const pf = await perfilesDe([...new Set([...js.map((j) => j.jugador), ...ts.map((t) => t.creador)])]);
  torneos = ts.map((t) => ({
    ...t,
    jugadores: js.filter((j) => j.torneo === t.id).map((j) => pf[j.jugador] || { id: j.jugador, usuario: "?" }),
    cruces: cs.filter((c) => c.torneo === t.id),
    pf,
  }));
}
async function cargarSemana() { if (yo()) semana = await rpc("ranking_semana"); }

// ---------------- Jugar: amigos ----------------
const enLinea = () => new Map((N.listaConectados() || []).map((c) => [c.id, c]));
function estadoDe(id, conectados) {
  const c = conectados.get(id);
  if (!c) return { txt: "no está", clase: "", libre: false };
  return c.estado === "libre" ? { txt: "en la pulpería", clase: "libre", libre: true } : { txt: "jugando", clase: "ocupado", libre: false };
}
function pintarAmigos() {
  const el = $("#bloque-amigos"); if (!el) return;
  const p = yo();
  if (!p || !N.activa()) { el.innerHTML = ""; return; }
  const con = enLinea();
  const orden = [...amigos].sort((a, b) => (con.has(b.id) - con.has(a.id)) || a.usuario.localeCompare(b.usuario));
  const fila = (a) => {
    const e = estadoDe(a.id, con);
    if (confirmando === a.id) return `<li class="confirma"><span class="u">¿Dejar de ser amigo de <b>${esc(a.usuario)}</b>?</span>
      <button class="b chico-e" data-s-borrar="${esc(a.id)}">Sí</button><button class="b chico-e" data-s-no>No</button></li>`;
    return `<li>${avatar(a, 34)}<span class="u">${nombreHTML(a, { titulo: false })}<small class="est ${e.clase}">${e.txt}</small></span>
      ${e.libre ? `<button class="b chico-e" data-s-invitar="${esc(a.id)}">Invitar</button>` : ""}
      <button class="b chico-e mas-persona" data-s-mas="${esc(a.id)}" aria-label="Opciones con ${esc(a.usuario)}">⋯</button></li>`;
  };
  const oferta = ofrecido && !ids.amigos.has(ofrecido.id) ? `<li class="pedido">${avatar(ofrecido, 34)}<span class="u"><b>${esc(ofrecido.usuario)}</b> te pasó su link de amigo</span>
      <button class="b chico-e fuerte" data-s-pedir-u="${esc(ofrecido.usuario)}">Sumar</button><button class="b chico-e" data-s-ofrecido-no>No</button></li>` : "";
  const pedidos = recibidos.map((a) => `<li class="pedido">${avatar(a, 34)}<span class="u"><b>${esc(a.usuario)}</b> quiere ser tu amigo</span>
      <button class="b chico-e fuerte" data-s-aceptar="${esc(a.id)}">Aceptar</button><button class="b chico-e" data-s-borrar="${esc(a.id)}" aria-label="Rechazar">No</button></li>`).join("");
  const esperas = enviados.map((a) => `<li class="espera"><span class="u"><small>esperando a</small> ${esc(a.usuario)}</span>
      <button class="b chico-e" data-s-borrar="${esc(a.id)}">Cancelar</button></li>`).join("");
  const vacio = !amigos.length && !recibidos.length && !enviados.length && !oferta
    ? `<li class="vacio">Sumá a los que juegan seguido con vos: los ves aunque no estén conectados y compiten en el ranking de la semana.</li>` : "";
  el.innerHTML = `<section class="conectados social-amigos"><h3 class="tit-sec">Tus amigos <small>${amigos.length}</small></h3>
    <ul>${oferta}${pedidos}${orden.map(fila).join("")}${esperas}${vacio}</ul>
    <form class="sumar-amigo" data-s-sumar><input name="u" maxlength="16" autocomplete="off" placeholder="usuario de tu amigo" aria-label="Usuario de tu amigo">
      <button class="b chico-e">Pedir</button><button type="button" class="b chico-e" data-s-link>Mi link</button></form></section>`;
}

// ---------------- Jugar: torneo de esta noche ----------------
const hora = (t) => new Date(t).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
function horasDeHoy() {
  const r = [], t = new Date(); t.setSeconds(0, 0);
  t.setMinutes(t.getMinutes() < 30 ? 30 : 60);
  for (let i = 0; i < 12; i++) { r.push(new Date(t)); t.setMinutes(t.getMinutes() + 30); }
  return r;
}
function pintarTorneo() {
  const el = $("#bloque-torneo"); if (!el) return;
  const p = yo();
  if (!p || !N.activa()) { el.innerHTML = ""; return; }
  const mio = torneos.find((t) => t.creador === p.id && t.estado !== "terminado");
  let html = torneos.map((t) => tarjetaTorneo(t, p)).join("");
  if (!mio) {
    html += armando ? formTorneo(p) : `<section class="conectados social-torneo vacio-t"><h3 class="tit-sec">Torneo de esta noche</h3>
      <p class="vacio">Armá una llave de 4 u 8 con tus amigos. Cada cruce es un 1 contra 1 entre los dos; cuando confirman la partida, pasa el ganador solo.</p>
      <button class="b chico-e" data-s-armar>Armar un torneo</button></section>`;
  }
  el.innerHTML = html;
}
function formTorneo(p) {
  const hs = horasDeHoy().map((h, i) => `<option value="${h.toISOString()}" ${i === 0 ? "selected" : ""}>${hora(h)}</option>`).join("");
  return `<section class="conectados social-torneo"><h3 class="tit-sec">Armar el torneo</h3>
    <form class="form-torneo" data-s-crear>
      <label class="campo"><span>Nombre</span><input name="nombre" maxlength="32" value="${esc(`La noche de ${p.usuario}`)}"></label>
      <div class="fila-t">
        <label class="campo"><span>Jugadores</span><select name="tamano"><option value="4">4</option><option value="8">8</option></select></label>
        <label class="campo"><span>Empieza</span><select name="empieza"><option value="${new Date().toISOString()}">ahora</option>${hs}</select></label>
      </div>
      <div class="fila-t"><button class="b chico-e fuerte">Armarlo</button><button type="button" class="b chico-e" data-s-armar-no>Mejor no</button></div>
    </form></section>`;
}
function tarjetaTorneo(t, p) {
  const anotado = t.jugadores.some((j) => j.id === p.id), soyCreador = t.creador === p.id, lleno = t.jugadores.length >= t.tamano;
  const quien = soyCreador ? "lo armaste vos" : `lo armó ${esc(t.pf[t.creador]?.usuario || "un amigo")}`;
  const cab = `<h3 class="tit-sec">${esc(t.nombre)}</h3><p class="t-meta">hoy ${hora(t.empieza)} · de ${t.tamano} · ${quien}</p>`;
  if (t.estado === "abierto") {
    const sillas = Array.from({ length: t.tamano }, (_, i) => t.jugadores[i]
      ? `<span class="silla" title="${esc(t.jugadores[i].usuario)}">${avatar(t.jugadores[i], 30)}</span>` : `<span class="silla libre"></span>`).join("");
    const botones = soyCreador
      ? `<button class="b chico-e fuerte" data-s-llave="${t.id}" ${lleno ? "" : "disabled"}>Sortear la llave</button><button class="b chico-e" data-s-salir="${t.id}">Borrarlo</button>`
      : anotado ? `<button class="b chico-e" data-s-salir="${t.id}">Bajarme</button>`
      : `<button class="b chico-e fuerte" data-s-anotar="${t.id}" ${lleno ? "disabled" : ""}>${lleno ? "Completo" : "Anotarme"}</button>`;
    return `<section class="conectados social-torneo">${cab}<div class="sillas">${sillas}</div>
      <p class="t-meta">${t.jugadores.length} de ${t.tamano} anotados${lleno ? "" : soyCreador ? " · invitá a tus amigos a anotarse" : ""}</p><div class="fila-t">${botones}</div></section>`;
  }
  return `<section class="conectados social-torneo">${cab}${llave(t, p, soyCreador)}</section>`;
}
function llave(t, p, soyCreador) {
  const rondas = t.tamano === 4 ? 2 : 3, nombreR = (r) => (r === rondas ? "Final" : r === rondas - 1 ? "Semis" : "Cuartos");
  const u = (id) => (id ? esc(t.pf[id]?.usuario || "?") : "…");
  const con = enLinea();
  let mio = null;
  const cols = Array.from({ length: rondas }, (_, i) => {
    const r = i + 1, cuantos = t.tamano / 2 ** r;
    const cs = Array.from({ length: cuantos }, (_, k) => t.cruces.find((c) => c.ronda === r && c.n === k + 1) || { ronda: r, n: k + 1 });
    return `<div class="ronda"><small>${nombreR(r)}</small>${cs.map((c) => {
      if (!c.ganador && c.a && c.b && (c.a === p.id || c.b === p.id)) mio = c;
      const lado = (id) => `<span class="${c.ganador ? (c.ganador === id ? "gano" : "afuera") : ""} ${id === p.id ? "vos" : ""}">${u(id)}</span>`;
      // el pase lo da quien armó el torneo, no en un cruce que juega él, y pasados 15 min desde que se habilitó el cruce (lo exige la base)
      const abierto = !c.ganador && c.a && c.b, mioC = c.a === p.id || c.b === p.id;
      const espera = c.desde ? new Date(c.desde).getTime() + 15 * 60e3 - Date.now() : 0;
      const pase = abierto && soyCreador && !mioC
        ? (espera > 0 ? `<span class="pase">pase desde las ${hora(Date.now() + espera)}</span>`
          : `<span class="pase">pase a: <button data-s-pase="${t.id}|${c.ronda}|${c.n}|${c.a}">${u(c.a)}</button> <button data-s-pase="${t.id}|${c.ronda}|${c.n}|${c.b}">${u(c.b)}</button></span>`) : "";
      const rinde = abierto && mioC ? `<span class="pase"><button data-s-rendir="${t.id}|${c.ronda}|${c.n}">rendirme</button></span>` : "";
      return `<div class="cruce">${lado(c.a)}${lado(c.b)}${pase}${rinde}</div>`;
    }).join("")}</div>`;
  }).join("");
  let pie;
  if (t.estado === "terminado") pie = `<p class="campeon">Campeón: <b>${u(t.campeon)}</b></p>`;
  else if (mio) {
    const rival = mio.a === p.id ? mio.b : mio.a, e = estadoDe(rival, con);
    pie = `<div class="te-toca"><p>Te toca con <b>${u(rival)}</b> <small class="est ${e.clase}">${e.txt}</small></p>
      ${e.libre ? `<button class="b chico-e fuerte" data-s-invitar="${esc(rival)}">Invitarlo</button>` : ""}
      <p class="t-meta">Jueguen un 1 contra 1 con cuenta. Cuando los dos confirman la partida, el ganador pasa solo.</p></div>`;
  } else pie = `<p class="t-meta">Se mira solo cada un rato. <button class="b-link" data-s-mirar="${t.id}">Mirar ahora</button></p>`;
  return `<div class="llave r${rondas}">${cols}</div>${pie}`;
}

// ---------------- Liga: esta semana entre amigos ----------------
function seccionSemana() {
  const s = document.createElement("section");
  s.className = "conectados social-semana";
  if (!semana) { s.innerHTML = `<h3 class="tit-sec">Esta semana entre amigos</h3><p class="cargando">Sumando la gloria de la semana…</p>`; return s; }
  const p = yo();
  const filas = semana.map((r, i) => `<li class="${r.id === p?.id ? "yo" : ""}"><span class="pos">${i + 1}</span>${avatar(rankPerfil(r), 32)}
    <span class="u">${esc(r.usuario)}<small>${r.jugadas} ${r.jugadas === 1 ? "partida" : "partidas"}${r.ganadas ? ` · ${r.ganadas} ganada${r.ganadas === 1 ? "" : "s"}` : ""}</small></span>
    <b class="glo">+${r.gloria}</b></li>`).join("");
  const solo = semana.length <= 1 ? `<p class="vacio">Sumá amigos en Jugar y acá ven quién juntó más gloria en la semana.</p>` : "";
  s.innerHTML = `<h3 class="tit-sec">Esta semana entre amigos <small>de lunes a domingo</small></h3><ol>${filas}</ol>${solo}`;
  return s;
}
const perfilesRank = new Map();
const rankPerfil = (r) => perfilesRank.get(r.id) || { id: r.id, usuario: r.usuario };
function ponerSemana() {
  const v = $("#vista-liga");
  if (!v || v.hidden || !yo() || !N.activa() || v.querySelector(".social-semana")) return;
  v.appendChild(seccionSemana());
}
let ultSemana = 0;
async function refrescarSemana() {
  if (!yo() || Date.now() - ultSemana < 60000) return;
  ultSemana = Date.now();
  try {
    await cargarSemana();
    const pf = await perfilesDe(semana.map((r) => r.id));
    Object.values(pf).forEach((x) => x && perfilesRank.set(x.id, x));
  } catch (e) { semana = semana || []; console.warn("ranking:", e.message); }
  $("#vista-liga .social-semana")?.remove(); ponerSemana();
}

// ---------------- en cada conectado: «+» para pedir amistad ----------------
function marcarConectados() {
  const p = yo(); if (!p) return;
  document.querySelectorAll("#bloque-conectados li").forEach((li) => {
    const b = li.querySelector("[data-invitar]"); if (!b) return;
    const id = b.dataset.invitar, ya = li.querySelector(".mas-amigo");
    if (ids.amigos.has(id) || ids.pendientes.has(id)) { ya?.remove(); return; } // ya es amigo o hay pedido: sobra el «+»
    if (ya) return;
    const x = document.createElement("button");
    x.className = "b chico-e mas-amigo"; x.type = "button"; x.textContent = "+";
    x.dataset.sPedirU = b.dataset.u; x.setAttribute("aria-label", `Pedirle amistad a ${b.dataset.u}`); x.title = "Pedirle amistad";
    b.before(x);
  });
}

// ---------------- acciones ----------------
async function hacer(f, ok) {
  try { const r = await f(); if (ok) avisar(typeof ok === "function" ? ok(r) : ok); } catch (e) { avisar(limpio(e)); }
  await todo();
}
function invitar(id) {
  const b = document.querySelector(`#bloque-conectados [data-invitar="${CSS.escape(id)}"]`);
  if (b && !b.disabled) b.click(); else avisar("No está libre ahora.");
}
async function compartirLink() {
  const link = `${location.origin}${location.pathname}?amigo=${encodeURIComponent(yo().usuario)}`;
  try {
    if (navigator.share) await navigator.share({ title: "Truco", text: `Sumame como amigo en el truco: ${yo().usuario}`, url: link });
    else { await navigator.clipboard.writeText(link); avisar("Copié tu link de amigo"); }
  } catch {}
}
function clic(e) {
  const t = e.target, d = (k) => t.closest(`[data-${k}]`)?.dataset;
  let x;
  if ((x = d("s-pedir-u"))) { e.stopPropagation(); ofrecido = null; limpiarParam(); return hacer(() => rpc("pedir_amistad", { p_usuario: x.sPedirU }), (r) => (r === "aceptada" ? "¡Ya son amigos!" : r === "ya" ? "Ya eran amigos" : "Le mandé el pedido")); }
  if ((x = d("s-aceptar"))) return hacer(() => rpc("aceptar_amistad", { p_de: x.sAceptar }), "¡Ya son amigos!");
  if ((x = d("s-borrar"))) { confirmando = null; return hacer(() => rpc("borrar_amistad", { p_otro: x.sBorrar })); }
  if ((x = d("s-mas"))) { confirmando = x.sMas; return pintarAmigos(); }
  if (d("s-no")) { confirmando = null; return pintarAmigos(); }
  if (d("s-ofrecido-no")) { ofrecido = null; limpiarParam(); return pintarAmigos(); }
  if ((x = d("s-invitar"))) return invitar(x.sInvitar);
  if (d("s-link")) return compartirLink();
  if (d("s-armar")) { armando = true; return pintarTorneo(); }
  if (d("s-armar-no")) { armando = false; return pintarTorneo(); }
  if ((x = d("s-anotar"))) return hacer(() => rpc("anotarme_torneo", { p_torneo: x.sAnotar }), "Te anotaste");
  if ((x = d("s-salir"))) return hacer(() => rpc("salir_torneo", { p_torneo: x.sSalir }));
  if ((x = d("s-llave"))) return hacer(() => rpc("armar_llave", { p_torneo: x.sLlave }), "¡Llave sorteada!");
  if ((x = d("s-mirar"))) return hacer(() => rpc("actualizar_torneo", { p_torneo: x.sMirar }));
  if ((x = d("s-rendir"))) { const [t1, r, n] = x.sRendir.split("|"); confirmando = null; return hacer(() => rpc("rendirme_cruce", { p_torneo: t1, p_ronda: +r, p_n: +n }), "Te rendiste: pasa tu rival"); }
  if ((x = d("s-pase"))) { const [t1, r, n, g] = x.sPase.split("|"); return hacer(() => rpc("dar_pase", { p_torneo: t1, p_ronda: +r, p_n: +n, p_ganador: g })); }
}
function enviar(e) {
  const f = e.target;
  if (f.matches("[data-s-sumar]")) {
    e.preventDefault();
    const u = N.normalizarUsuario(f.u.value);
    if (!u) return;
    hacer(() => rpc("pedir_amistad", { p_usuario: u }), (r) => (r === "aceptada" ? "¡Ya son amigos!" : r === "ya" ? "Ya eran amigos" : `Le mandé el pedido a ${u}`));
  } else if (f.matches("[data-s-crear]")) {
    e.preventDefault();
    armando = false;
    hacer(() => rpc("crear_torneo", { p_nombre: f.nombre.value, p_tamano: +f.tamano.value, p_empieza: f.empieza.value }), "Torneo armado: que se anoten tus amigos");
  }
}
function limpiarParam() {
  const q = new URLSearchParams(location.search);
  if (!q.has("amigo")) return;
  q.delete("amigo");
  history.replaceState(null, "", location.pathname + (q.size ? "?" + q : "") + location.hash);
}
async function mirarOferta() {
  const u = new URLSearchParams(location.search).get("amigo");
  const p = yo();
  if (!u || !p || N.normalizarUsuario(u) === p.usuario) { if (u && p) limpiarParam(); return; }
  if (F()) { ofrecido = F().buscar?.(u) || null; return; }
  const { data } = await base().from("perfiles").select("id, usuario, puntos, elo, titulo, estilo").eq("usuario", N.normalizarUsuario(u)).maybeSingle();
  ofrecido = data || null;
}

// ---------------- ciclo ----------------
let corriendo = false, ultTorneo = 0;
async function todo() {
  if (!yo() || !N.activa() || corriendo) { pintarAmigos(); pintarTorneo(); return; }
  corriendo = true;
  try {
    await Promise.all([cargarAmigos(), cargarTorneos()].map((p) => p.catch((e) => console.warn("social:", e.message))));
    // el torneo en juego se mira solo cada 45 s (la base reconoce las partidas confirmadas)
    if (Date.now() - ultTorneo > 45000) {
      const enJuego = torneos.filter((t) => t.estado === "jugando");
      if (enJuego.length) {
        ultTorneo = Date.now();
        await Promise.all(enJuego.map((t) => rpc("actualizar_torneo", { p_torneo: t.id }).catch(() => {})));
        await cargarTorneos().catch(() => {});
      }
    }
  } finally { corriendo = false; }
  pintarAmigos(); pintarTorneo(); marcarConectados();
}
let iniciado = false, reloj = null;
function iniciar() {
  if (iniciado) return;
  const jugar = $("#vista-jugar"); if (!jugar) return;
  iniciado = true;
  jugar.addEventListener("click", clic);
  jugar.addEventListener("submit", enviar);
  new MutationObserver(marcarConectados).observe($("#bloque-conectados"), { childList: true, subtree: true });
  const liga = $("#vista-liga");
  new MutationObserver(() => { if (!liga.hidden) { ponerSemana(); refrescarSemana(); } }).observe(liga, { childList: true, attributes: true, attributeFilter: ["hidden"] });
  N.on("sesion", async () => { semana = null; ultSemana = 0; await mirarOferta().catch(() => {}); todo(); });
  N.on("conectados", () => { pintarAmigos(); if (torneos.some((t) => t.estado === "jugando")) pintarTorneo(); marcarConectados(); });
  clearInterval(reloj);
  reloj = setInterval(() => { if (!document.hidden && !jugar.hidden) todo(); }, 60000);
  if (yo()) mirarOferta().catch(() => {}).then(todo);
}
if (document.readyState === "loading") addEventListener("DOMContentLoaded", iniciar); else iniciar();
