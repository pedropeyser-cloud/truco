// Conexión directa entre dos navegadores con PeerJS (servidor público gratuito de PeerJS solo para presentarse; después
// los datos van de navegador a navegador). El anfitrión tiene la partida; el invitado manda acciones y recibe vistas.
const PREFIJO = "truco-bjr-";
const ICE = { config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] } };

export const codigoNuevo = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
export const linkDe = codigo => `${location.origin}${location.pathname}?sala=${codigo}`;

// anfitrión: abre la sala con el código y avisa cuando entra (o vuelve) el invitado
export function abrirSala(codigo, { alAbrir, alEntrar, alMensaje, alSalir, alError }) {
  let peer, conn = null, intentos = 0;
  const crear = () => {
    peer = new Peer(PREFIJO + codigo, ICE);
    peer.on("open", () => { intentos = 0; alAbrir?.(); });
    peer.on("connection", c => {
      c.on("open", () => {
        if (conn && conn.open && conn !== c) { c.send({ t: "lleno" }); setTimeout(() => c.close(), 300); return; }
        conn = c; alEntrar?.();
      });
      c.on("data", m => { if (c === conn) alMensaje?.(m); });
      c.on("close", () => { if (c === conn) { conn = null; alSalir?.(); } });
    });
    peer.on("disconnected", () => { try { peer.reconnect(); } catch {} });
    peer.on("error", e => {
      // si la pestaña se recargó, el id viejo tarda unos segundos en liberarse
      if (e.type === "unavailable-id" && intentos++ < 8) { peer.destroy(); setTimeout(crear, 2500); return; }
      alError?.(e);
    });
  };
  crear();
  return { enviar: m => { if (conn?.open) conn.send(m); }, conectado: () => !!conn?.open, cerrar: () => peer.destroy() };
}

// invitado: se conecta a la sala y reintenta si se corta
export function entrarSala(codigo, { alConectar, alMensaje, alCortar, alError, alLlamada }) {
  let peer, conn = null, cerrado = false, timer = null;
  const conectar = () => {
    if (cerrado) return;
    conn = peer.connect(PREFIJO + codigo, { reliable: true });
    conn.on("open", () => alConectar?.());
    conn.on("data", m => alMensaje?.(m));
    conn.on("close", () => { alCortar?.(); reintentar(); });
  };
  const reintentar = () => { clearTimeout(timer); if (!cerrado) timer = setTimeout(() => (peer.disconnected ? peer.reconnect() : conectar()), 3000); };
  peer = new Peer(ICE);
  peer.on("open", conectar);
  peer.on("disconnected", () => { try { peer.reconnect(); } catch {} });
  peer.on("error", e => { alError?.(e); if (e.type === "peer-unavailable" || e.type === "network" || e.type === "server-error") reintentar(); });
  peer.on("call", c => alLlamada?.(c)); // audio del micrófono del pie, reenviado por el anfitrión
  return { enviar: m => { if (conn?.open) conn.send(m); }, cerrar: () => { cerrado = true; peer.destroy(); },
    llamar: (stream, metadata) => peer.call(PREFIJO + codigo, stream, { metadata }) };
}

// ---------- mesa de 4 o 6: el anfitrión recibe a varios invitados ----------
// Cada invitado se identifica con un id propio (guardado en su navegador) para volver a su asiento si se corta.
export function abrirSalaGrupo(codigo, maximo, { alAbrir, alEntrar, alMensaje, alSalir, alError, alLlamada }) {
  let peer, intentos = 0;
  const conns = new Map(); // conexión → id del invitado (null hasta el «hola»)
  const crear = () => {
    peer = new Peer(PREFIJO + codigo, ICE);
    peer.on("open", () => { intentos = 0; alAbrir?.(); });
    peer.on("connection", c => {
      c.on("open", () => {
        if ([...conns.keys()].filter(x => x.open).length >= maximo) { c.send({ t: "lleno" }); setTimeout(() => c.close(), 300); return; }
        conns.set(c, null);
      });
      c.on("data", m => {
        if (!m || typeof m !== "object") return;
        if (m.t === "hola") {
          const id = String(m.id || "").slice(0, 40) || Math.random().toString(36).slice(2);
          // si ese id ya tenía otra conexión (recargó), la vieja se descarta
          for (const [x, i] of conns) if (i === id && x !== c) { conns.delete(x); try { x.close(); } catch {} }
          conns.set(c, id);
          alEntrar?.(id, m);
          return;
        }
        const id = conns.get(c);
        if (id) alMensaje?.(id, m);
      });
      c.on("close", () => { const id = conns.get(c); conns.delete(c); if (id && ![...conns.values()].includes(id)) alSalir?.(id); });
    });
    peer.on("disconnected", () => { try { peer.reconnect(); } catch {} });
    peer.on("error", e => {
      if (e.type === "unavailable-id" && intentos++ < 8) { peer.destroy(); setTimeout(crear, 2500); return; }
      alError?.(e);
    });
    peer.on("call", c => alLlamada?.(String(c.metadata?.id || ""), c));
  };
  crear();
  const conDe = id => [...conns].find(([c, i]) => i === id && c.open)?.[0];
  return {
    enviar: (id, m) => { const c = conDe(id); if (c) c.send(m); },
    enviarTodos: m => { for (const [c, i] of conns) if (i && c.open) c.send(m); },
    conectados: () => [...new Set([...conns].filter(([c, i]) => i && c.open).map(([, i]) => i))],
    llamarA: (id, stream) => { const c = conDe(id); return c ? peer.call(c.peer, stream, { metadata: { de: "anfitrion" } }) : null; },
    echar: id => { const c = conDe(id); if (c) { c.send({ t: "lleno" }); setTimeout(() => c.close(), 300); } },
    cerrar: () => peer.destroy(),
  };
}
export const linkMesa = codigo => `${location.origin}${location.pathname}?mesa=${codigo}`;
