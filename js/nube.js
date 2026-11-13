// Perfiles, partidas, equipos y conectados en Supabase (tanda 4B). Todo lo de la base pasa por acá.
// Sin configuración (nube-config.js vacío) no hace nada y el juego sigue igual.
// Para probar sin base: window.__NUBE_FALSA puede reemplazar estas funciones (ver las pruebas en el scratchpad).
import { NUBE } from "./nube-config.js";

let cli = null, usuario = null, perfil = null, canal = null, bloqueados = new Set();
const oyentes = { sesion: [], conectados: [], invitacion: [], busqueda: [] };
let conectados = [];
const emitir = (t, x) => oyentes[t].forEach((f) => { try { f(x); } catch (e) { console.error(e); } });
export const on = (t, f) => oyentes[t].push(f);

export const activa = () => !!window.__NUBE_FALSA || !!(NUBE.url && NUBE.clave && window.supabase);
export const miPerfil = () => perfil;
export const miUsuario = () => usuario;
export const listaConectados = () => window.__NUBE_FALSA?.conectados || conectados;

/** Arranca: recupera la sesión (también la que vuelve de Google en la URL) y el perfil. */
export async function iniciar() {
  if (window.__NUBE_FALSA) return window.__NUBE_FALSA.iniciar({ emitir, fijar: (u, p) => { usuario = u; perfil = p; } });
  if (!activa()) return;
  cli = window.supabase.createClient(NUBE.url, NUBE.clave, {
    auth: { flowType: "implicit", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  cli.auth.onAuthStateChange((_ev, sesion) => { setTimeout(() => cambioSesion(sesion), 0); });
  const { data } = await cli.auth.getSession();
  await cambioSesion(data.session);
}

async function cambioSesion(sesion) {
  const u = sesion?.user || null;
  if (u?.id === usuario?.id && perfil) return;
  usuario = u; perfil = null;
  if (u) {
    const { data } = await cli.from("perfiles").select("*").eq("id", u.id).maybeSingle();
    perfil = data || null;
  }
  bloqueados = new Set();
  if (perfil) { const { data: b } = await cli.from("bloqueos").select("contra"); bloqueados = new Set((b || []).map((x) => x.contra)); }
  emitir("sesion", { usuario, perfil });
  if (perfil) conectarPresencia(); else desconectarPresencia();
}

export async function entrarConGoogle() {
  if (window.__NUBE_FALSA) return window.__NUBE_FALSA.entrarConGoogle();
  // vuelve a la misma dirección (con ?sala= o ?mesa= si te invitaron)
  const { error } = await cli.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.href.split("#")[0] } });
  if (error) throw error;
}
export async function salir() {
  if (window.__NUBE_FALSA) return window.__NUBE_FALSA.salir();
  if (perfil) await cli.from("conectados").delete().eq("id", perfil.id);
  desconectarPresencia();
  await cli.auth.signOut();
}

/** Primer ingreso: elige su usuario (3 a 16: letras, números, punto, guion). */
export async function crearPerfil(nombre) {
  const u = normalizarUsuario(nombre);
  if (!/^[a-z0-9_.ñ-]{3,16}$/.test(u)) throw new Error("De 3 a 16 letras o números, sin espacios.");
  if (window.__NUBE_FALSA) { perfil = await window.__NUBE_FALSA.crearPerfil(u); emitir("sesion", { usuario, perfil }); return perfil; }
  const { data, error } = await cli.from("perfiles").insert({ id: usuario.id, usuario: u }).select().single();
  if (error) throw new Error(error.code === "23505" ? "Ese usuario ya existe. Probá otro."
    : /no se puede usar/.test(error.message) ? "Ese usuario no se puede usar en el truco. Elegí otro." : "No se pudo guardar. Probá de nuevo.");
  perfil = data; emitir("sesion", { usuario, perfil }); conectarPresencia();
  return perfil;
}
export const normalizarUsuario = (s) => String(s || "").trim().toLowerCase().normalize("NFC").replace(/\s+/g, "");

export async function refrescarPerfil() {
  if (!perfil) return null;
  if (window.__NUBE_FALSA) return perfil;
  const { data } = await cli.from("perfiles").select("*").eq("id", perfil.id).maybeSingle();
  if (data) { perfil = data; emitir("sesion", { usuario, perfil }); }
  return perfil;
}

// ---------- historial ----------
/** Mis partidas confirmadas con los demás jugadores de cada una (las más nuevas primero). */
export async function misPartidas(limite = 200) {
  if (!perfil) return [];
  if (window.__NUBE_FALSA) return window.__NUBE_FALSA.misPartidas();
  const { data: mias } = await cli.from("partida_jugadores").select("partida, lado, gano, gloria, estilo, elo_delta").eq("jugador", perfil.id).limit(limite);
  const ids = (mias || []).map((x) => x.partida);
  if (!ids.length) return [];
  const [{ data: partidas }, { data: todos }] = await Promise.all([
    cli.from("partidas").select("*").in("id", ids).eq("confirmada", true),
    cli.from("partida_jugadores").select("partida, jugador, lado").in("partida", ids),
  ]);
  const ids2 = [...new Set((todos || []).map((x) => x.jugador))];
  const { data: perfiles } = await cli.from("perfiles").select("id, usuario").in("id", ids2);
  const nombre = Object.fromEntries((perfiles || []).map((p) => [p.id, p.usuario]));
  const yo = Object.fromEntries((mias || []).map((x) => [x.partida, x]));
  return (partidas || []).map((p) => ({
    ...p, lado: yo[p.id].lado, gano: yo[p.id].gano, gloria: yo[p.id].gloria, estilo: yo[p.id].estilo, eloDelta: yo[p.id].elo_delta,
    jugadores: (todos || []).filter((x) => x.partida === p.id).map((x) => ({ id: x.jugador, lado: x.lado, usuario: nombre[x.jugador] || "?" })),
  })).sort((a, b) => (a.jugada < b.jugada ? 1 : -1));
}

/** Resumen: jugadas, ganadas, perdidas y el registro contra cada rival (y con cada compañero). */
export function resumir(partidas) {
  const r = { jugadas: partidas.length, ganadas: 0, perdidas: 0, rivales: {}, companeros: {} };
  for (const p of partidas) {
    if (p.gano) r.ganadas++; else r.perdidas++;
    for (const j of p.jugadores) {
      if (j.id === perfil?.id) continue;
      const tabla = j.lado === p.lado ? r.companeros : r.rivales;
      const x = (tabla[j.id] ||= { usuario: j.usuario, ganadas: 0, perdidas: 0, mano: 0, manoG: 0 });
      if (p.gano) x.ganadas++; else x.perdidas++;
      if (p.tipo === "1v1") { x.mano++; if (p.gano) x.manoG++; }
    }
  }
  return r;
}

/** Cara a cara en el 1 contra 1: [mis victorias, las suyas]. */
export async function caraACara(rivalId) {
  if (!perfil || !rivalId) return null;
  if (window.__NUBE_FALSA) return window.__NUBE_FALSA.caraACara(rivalId);
  const ps = (await misPartidas()).filter((p) => p.tipo === "1v1" && p.jugadores.some((j) => j.id === rivalId));
  return [ps.filter((p) => p.gano).length, ps.filter((p) => !p.gano).length];
}

// ---------- anotar partidas ----------
/** El anfitrión propone el resultado. datos: ver registrar_partida en esquema.sql. */
export async function registrarPartida(datos) {
  if (!perfil) return;
  if (window.__NUBE_FALSA) return window.__NUBE_FALSA.registrarPartida(datos);
  const { error } = await cli.rpc("registrar_partida", { datos });
  if (error) throw new Error(error.message);
  refrescarPerfil();
}
/** Cada invitado con perfil confirma lo que vio. Reintenta si la partida todavía no llegó a la base. */
export async function confirmarPartida(id, puntos, tomoMate = false, clasif = false, estilo = null) {
  if (!perfil) return;
  if (window.__NUBE_FALSA) return window.__NUBE_FALSA.confirmarPartida(id, puntos, tomoMate, clasif, estilo);
  for (let i = 0; i < 6; i++) {
    const { error } = await cli.rpc("confirmar_partida", { partida_id: id, p0: puntos[0], p1: puntos[1], tomo_mate: tomoMate, p_clasif: !!clasif, p_estilo: estilo });
    if (!error) { setTimeout(refrescarPerfil, 1500); return; }
    if (!/no existe/.test(error.message)) throw new Error(error.message);
    await new Promise((r) => setTimeout(r, 2500));
  }
}

// ---------- equipos ----------
export async function misEquipos() {
  if (!perfil) return [];
  if (window.__NUBE_FALSA) return window.__NUBE_FALSA.misEquipos();
  const { data: mios } = await cli.from("equipo_miembros").select("equipo").eq("jugador", perfil.id);
  const { data: creados } = await cli.from("equipos").select("id").eq("creador", perfil.id);
  const ids = [...new Set([...(mios || []), ...(creados || [])].map((x) => x.equipo || x.id))];
  return equiposCon(ids);
}
/** Todos los equipos (para desafiar a uno). */
export async function todosLosEquipos() {
  if (!perfil) return [];
  if (window.__NUBE_FALSA) return window.__NUBE_FALSA.todosLosEquipos();
  const { data } = await cli.from("equipos").select("id").limit(200);
  return equiposCon((data || []).map((x) => x.id));
}
async function equiposCon(ids) {
  if (!ids.length) return [];
  const [{ data: eqs }, { data: miembros }] = await Promise.all([
    cli.from("equipos").select("*").in("id", ids),
    cli.from("equipo_miembros").select("equipo, jugador, acepto").in("equipo", ids),
  ]);
  const pids = [...new Set((miembros || []).map((m) => m.jugador))];
  const { data: perfiles } = pids.length ? await cli.from("perfiles").select("id, usuario").in("id", pids) : { data: [] };
  const nombre = Object.fromEntries((perfiles || []).map((p) => [p.id, p.usuario]));
  return (eqs || []).map((e) => ({ ...e, miembros: (miembros || []).filter((m) => m.equipo === e.id).map((m) => ({ id: m.jugador, usuario: nombre[m.jugador] || "?", acepto: m.acepto })) }));
}
export async function crearEquipo(nombre, tamano) {
  if (window.__NUBE_FALSA) return window.__NUBE_FALSA.crearEquipo(nombre, tamano);
  const { data, error } = await cli.from("equipos").insert({ nombre: String(nombre).trim().slice(0, 24), creador: perfil.id, tamano }).select().single();
  if (error) throw new Error(/no se puede usar/.test(error.message) ? "Ese nombre de equipo no se puede usar. Elegí otro." : "No se pudo crear el equipo.");
  await cli.from("equipo_miembros").insert({ equipo: data.id, jugador: perfil.id, acepto: true });
  return data;
}
export async function sumarAlEquipo(equipoId, nombreUsuario) {
  if (window.__NUBE_FALSA) return window.__NUBE_FALSA.sumarAlEquipo(equipoId, nombreUsuario);
  const { data: p } = await cli.from("perfiles").select("id").eq("usuario", normalizarUsuario(nombreUsuario)).maybeSingle();
  if (!p) throw new Error("No hay nadie con ese usuario.");
  const { error } = await cli.from("equipo_miembros").insert({ equipo: equipoId, jugador: p.id });
  if (error) throw new Error(error.code === "23505" ? "Ya está en el equipo." : /completo/.test(error.message) ? "El equipo ya está completo." : "Solo el que armó el equipo puede sumar gente.");
}
/** El invitado acepta entrar al equipo (hasta entonces no juega con él). */
export async function aceptarEquipo(equipoId) {
  if (window.__NUBE_FALSA) return window.__NUBE_FALSA.aceptarEquipo(equipoId);
  const { error } = await cli.from("equipo_miembros").update({ acepto: true }).eq("equipo", equipoId).eq("jugador", perfil.id);
  if (error) throw new Error("No se pudo.");
}
export async function sacarDelEquipo(equipoId, jugadorId) {
  if (window.__NUBE_FALSA) return window.__NUBE_FALSA.sacarDelEquipo(equipoId, jugadorId);
  const { error } = await cli.from("equipo_miembros").delete().eq("equipo", equipoId).eq("jugador", jugadorId);
  if (error) throw new Error("No se pudo.");
}
export async function borrarEquipo(equipoId) {
  if (window.__NUBE_FALSA) return window.__NUBE_FALSA.borrarEquipo(equipoId);
  const { error } = await cli.from("equipos").delete().eq("id", equipoId);
  if (error) throw new Error("Solo el que lo armó puede borrarlo.");
}

// ---------- conectados, búsqueda de rival e invitaciones ----------
// Conectados: tabla «conectados» (cada uno solo escribe su fila; la hora la pone la base). La página se marca cada
// 25 s y mira la lista cada 15 s; conectado = marcado en los últimos 70 s. Los datos de cada uno salen de perfiles.
// Invitaciones: tabla «invitaciones» (la base pone quién invita); llegan por Realtime en un canal privado.
let miEstado = "libre", miBusca = null, miEquipo = null, latido = null, sondeo = null;
const cache = new Map(); // id → { p: perfil público, t: cuándo se trajo }

/** Perfiles públicos (usuario, gloria, liga, título, estilo) de esos ids, con un minuto de memoria. */
export async function perfilesDe(ids, fresco = false) {
  if (window.__NUBE_FALSA?.perfilesDe) return window.__NUBE_FALSA.perfilesDe(ids);
  const ahora = Date.now();
  const validos = [...new Set(ids)].filter((id) => /^[0-9a-f-]{36}$/.test(String(id)));
  const faltan = validos.filter((id) => fresco || !cache.has(id) || ahora - cache.get(id).t > 60000);
  if (faltan.length && cli) {
    const { data } = await cli.from("perfiles").select("id, usuario, puntos, elo, titulo, estilo").in("id", faltan);
    (data || []).forEach((x) => cache.set(x.id, { p: x, t: ahora }));
  }
  return Object.fromEntries(validos.filter((id) => cache.has(id)).map((id) => [id, cache.get(id).p]));
}

async function conectarPresencia() {
  if (window.__NUBE_FALSA || latido || !perfil) return;
  marcarme();
  latido = setInterval(marcarme, 25000);
  sondeo = setInterval(mirarConectados, 15000);
  setTimeout(mirarConectados, 800);
  addEventListener("pagehide", () => { cli.from("conectados").delete().eq("id", perfil?.id || "").then(() => {}); });
  try { await cli.realtime.setAuth(); } catch {}
  canal = cli.channel("truco-conectados", { config: { private: true } });
  canal.on("postgres_changes", { event: "INSERT", schema: "public", table: "invitaciones", filter: `para=eq.${perfil.id}` }, async ({ new: inv }) => {
    if (!inv || inv.para !== perfil?.id || bloqueados.has(inv.de)) return;
    const link = String(inv.link || "");
    if (!link.startsWith(location.origin + location.pathname)) return; // solo links a este mismo juego
    const quien = (await perfilesDe([inv.de]))[inv.de];
    emitir("invitacion", { de: quien?.usuario || "alguien", link, tipo: String(inv.tipo || "").slice(0, 40) });
  });
  canal.subscribe();
}
async function marcarme() {
  if (!perfil) return;
  const { error } = await cli.rpc("marcarme", { p_estado: miEstado, p_busca: miBusca, p_equipo: miEquipo });
  if (error && miBusca) { miBusca = null; miEquipo = null; emitir("busqueda", { error: error.message }); }
}
async function mirarConectados() {
  if (!perfil) return;
  const desde = new Date(Date.now() - 70000).toISOString();
  const { data } = await cli.from("conectados").select("id, estado, busca, equipo").gt("visto", desde).neq("id", perfil.id).limit(200);
  const filas = data || [];
  const pf = await perfilesDe(filas.map((f) => f.id));
  conectados = filas.filter((f) => pf[f.id] && !bloqueados.has(f.id)).map((f) => ({ ...pf[f.id], id: f.id, estado: f.estado, busca: f.busca, equipo: f.equipo }))
    .sort((a, b) => a.usuario.localeCompare(b.usuario));
  emitir("conectados", conectados);
}
function desconectarPresencia() {
  clearInterval(latido); clearInterval(sondeo); latido = sondeo = null;
  if (canal) { cli.removeChannel(canal); canal = null; }
  conectados = []; emitir("conectados", conectados);
}
export function fijarEstado(estado) { miEstado = estado; if (window.__NUBE_FALSA || !latido) return; marcarme(); }

/** Clasificatoria: empezar a buscar rival (modo 1v1, 2v2 o 3v3; con tu equipo si es de a 2 o 3) o dejar de buscar. */
export async function buscarRival(modo, equipo = null) {
  if (window.__NUBE_FALSA) return window.__NUBE_FALSA.buscarRival?.(modo, equipo);
  miBusca = modo || null; miEquipo = modo && modo !== "1v1" ? equipo : null;
  const { error } = await cli.rpc("marcarme", { p_estado: miEstado, p_busca: miBusca, p_equipo: miEquipo });
  if (error) { miBusca = null; miEquipo = null; throw new Error(error.message); }
  mirarConectados();
}
export const buscando = () => miBusca;

/** Jugadas y ganadas (partidas confirmadas) de cada uno: { id: { jugadas, ganadas } }. */
export async function estadisticasDe(ids) {
  if (window.__NUBE_FALSA) return window.__NUBE_FALSA.estadisticasDe?.(ids) || {};
  const validos = ids.filter((id) => /^[0-9a-f-]{36}$/.test(String(id)));
  if (!validos.length) return {};
  const { data } = await cli.from("partida_jugadores").select("jugador, gano, partidas!inner(confirmada)").in("jugador", validos).eq("partidas.confirmada", true).limit(2000);
  const r = {};
  for (const x of data || []) { const t = (r[x.jugador] ||= { jugadas: 0, ganadas: 0 }); t.jugadas++; if (x.gano) t.ganadas++; }
  return r;
}

/** Guarda lo que eligió del perfil (título, color, letra, peluca, gorrita). La base controla los umbrales. */
export async function guardarCosmeticos({ titulo, estilo }) {
  if (window.__NUBE_FALSA) { perfil = { ...perfil, titulo, estilo }; emitir("sesion", { usuario, perfil }); return; }
  const { data, error } = await cli.from("perfiles").update({ titulo: titulo || null, estilo: estilo || {} }).eq("id", perfil.id).select().single();
  if (error) throw new Error(error.message.replace(/^.*?: /, ""));
  perfil = data; cache.delete(perfil.id); emitir("sesion", { usuario, perfil });
}

/** Prueba de identidad para la mesa: escribe el código que mandó el anfitrión en la fila propia. */
export async function probarIdentidad(codigo) {
  if (window.__NUBE_FALSA) return true;
  const { error } = await cli.rpc("probar_identidad", { p_prueba: String(codigo).slice(0, 40) });
  return !error;
}
/** El anfitrión comprueba que ese perfil escribió su código (solo el dueño de la cuenta puede). */
export async function verificarIdentidad(id, codigo) {
  if (window.__NUBE_FALSA) return window.__NUBE_FALSA.verificarIdentidad ? window.__NUBE_FALSA.verificarIdentidad(id, codigo) : true;
  if (!/^[0-9a-f-]{36}$/.test(String(id))) return false;
  for (let i = 0; i < 4; i++) {
    const { data } = await cli.from("conectados").select("id").eq("id", id).eq("prueba", String(codigo)).maybeSingle();
    if (data) return true;
    await new Promise((r) => setTimeout(r, 1200));
  }
  return false;
}

/** Invita a un conectado: le aparece un cartel con el link de la mesa. */
export async function invitar(paraId, link, tipo) {
  if (window.__NUBE_FALSA) return window.__NUBE_FALSA.invitar(paraId, link, tipo);
  const { error } = await cli.from("invitaciones").insert({ para: paraId, link: String(link).slice(0, 300), tipo: String(tipo || "").slice(0, 40) });
  if (error) throw new Error("No se pudo mandar la invitación.");
}

// ---------- apertura al público: bloqueos, denuncias, borrar la cuenta y errores (2026-11-12) ----------
/** Bloqueados: no aparecen en tus conectados y no te pueden invitar (eso lo controla la base). */
export async function misBloqueos() {
  if (!perfil || !bloqueados.size) return [];
  if (window.__NUBE_FALSA) return window.__NUBE_FALSA.misBloqueos?.() || [];
  const pf = await perfilesDe([...bloqueados]);
  return [...bloqueados].map((id) => ({ id, usuario: pf[id]?.usuario || "?" }));
}
export const estaBloqueado = (id) => bloqueados.has(id);
export async function bloquear(id) {
  if (window.__NUBE_FALSA) { bloqueados.add(id); return; }
  const { error } = await cli.from("bloqueos").insert({ contra: id });
  if (error && error.code !== "23505") throw new Error("No se pudo bloquear.");
  bloqueados.add(id); invitadosFuera(id);
}
export async function desbloquear(id) {
  if (window.__NUBE_FALSA) { bloqueados.delete(id); return; }
  const { error } = await cli.from("bloqueos").delete().eq("contra", id);
  if (error) throw new Error("No se pudo desbloquear.");
  bloqueados.delete(id);
}
function invitadosFuera(id) { conectados = conectados.filter((c) => c.id !== id); emitir("conectados", conectados); }

/** Denuncia (motivo: nombre, insultos, trampa u otro). La lee Pedro en el monitoreo. */
export async function denunciar(id, motivo, detalle = "") {
  if (window.__NUBE_FALSA) return;
  const { error } = await cli.from("denuncias").insert({ contra: id, motivo, detalle: String(detalle).slice(0, 300) });
  if (error) throw new Error(error.code === "23505" ? "Ya lo denunciaste; lo estamos mirando." : /muchas/.test(error.message) ? "Ya mandaste muchas denuncias hoy." : "No se pudo mandar la denuncia.");
}

/** Borra la cuenta y todo lo suyo (perfil, gloria, equipos que armó, historial propio). No tiene vuelta atrás. */
export async function borrarMiCuenta() {
  if (window.__NUBE_FALSA) { perfil = null; emitir("sesion", { usuario: null, perfil: null }); return; }
  const { error } = await cli.rpc("borrar_mi_cuenta");
  if (error) throw new Error(/suspendido/.test(error.message) ? "Con el usuario suspendido no se puede borrar la cuenta. Probá cuando termine la suspensión." : "No se pudo borrar la cuenta. Probá de nuevo.");
  desconectarPresencia();
  await cli.auth.signOut().catch(() => {});
  usuario = null; perfil = null; emitir("sesion", { usuario, perfil });
}

/** Manda un error del juego a la base (anda también sin cuenta). Lo usa vigia.js; nunca tira.
 *  Devuelve false solo si la nube todavía no arrancó (para que lo reintente); si no hay base, lo descarta. */
export async function reportarError(e) {
  if (window.__NUBE_FALSA || !activa()) return true;
  if (!cli) return false;
  try { await cli.from("errores").insert(e); } catch {}
  return true;
}
