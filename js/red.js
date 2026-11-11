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
export function entrarSala(codigo, { alConectar, alMensaje, alCortar, alError }) {
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
  return { enviar: m => { if (conn?.open) conn.send(m); }, cerrar: () => { cerrado = true; peer.destroy(); } };
}
