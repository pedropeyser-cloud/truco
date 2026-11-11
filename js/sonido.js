// Voces (mp3 con la voz clonada de Pedro, listadas en audio/frases.json) y sonido de cartas sintetizado como en el reel.
let ctx = null, frases = {}, activo = true;
const buffers = new Map();

export function setActivo(v) { activo = v; try { localStorage.setItem("truco-sonido", v ? "1" : "0"); } catch {} }
export function estaActivo() { return activo; }
try { activo = localStorage.getItem("truco-sonido") !== "0"; } catch {}

// los navegadores del celular solo dejan sonar después de un toque, y solo cuentan ciertos eventos
// (al levantar el dedo, no al apoyarlo). Además el iPhone en silencio calla el audio web:
// "playback" (Safari 17+) o un <audio> mudo sonando lo pasan a la categoría de reproducción.
let silencioso = null, primerDesbloqueo = true;
function wavMudo() {
  const n = 800, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); s(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, "data"); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
}
export function desbloquear() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; } }
  if (ctx.state !== "running") ctx.resume().catch(() => {});
  if (primerDesbloqueo) {
    primerDesbloqueo = false;
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch {}
    // un instante de silencio por el contexto: en Safari viejo es lo que lo destraba
    try { const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(0); } catch {}
  }
  if (!navigator.audioSession && /iPhone|iPad|iPod/.test(navigator.userAgent) && (!silencioso || silencioso.paused)) {
    try { silencioso ??= Object.assign(new Audio(wavMudo()), { loop: true, volume: 0.01 }); silencioso.setAttribute("playsinline", ""); silencioso.play().catch(() => {}); } catch {}
  }
}
// al volver a la pestaña el celular suele dejar el audio suspendido o "interrumpido"
document.addEventListener("visibilitychange", () => { if (!document.hidden && ctx && ctx.state !== "running") ctx.resume().catch(() => {}); });
export async function cargarFrases() {
  try { frases = await (await fetch("audio/frases.json")).json(); } catch { frases = {}; }
}
async function buffer(archivo) {
  if (buffers.has(archivo)) return buffers.get(archivo);
  const p = fetch("audio/" + archivo).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b));
  buffers.set(archivo, p);
  return p;
}
// precarga en segundo plano las frases más usadas para que el canto no llegue tarde
export function precargar() {
  if (!ctx) return;
  for (const k of ["truco", "envido", "quiero", "no_quiero", "retruco", "real_envido", "son_buenas", "mazo"])
    for (const a of frases[k] || []) buffer(a).catch(() => {});
}
let vozActual = null;
export async function decir(clave) {
  if (!activo || !ctx || !frases[clave]?.length) return false;
  const lista = frases[clave], archivo = lista[Math.floor(Math.random() * lista.length)];
  try {
    const b = await buffer(archivo);
    if (vozActual) try { vozActual.stop(); } catch {}
    const s = ctx.createBufferSource(), g = ctx.createGain(); g.gain.value = 1;
    s.buffer = b; s.connect(g).connect(ctx.destination); s.start(); vozActual = s;
    return true;
  } catch { return false; }
}

// ---- cartas: ruido filtrado con envolvente (chasquido, roce, golpe en la mesa) ----
function ruido(dur) {
  const n = Math.max(1, Math.floor(ctx.sampleRate * dur)), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function golpeDeRuido(t, dur, vol, frec, q, ataque = 0.002) {
  const s = ctx.createBufferSource(); s.buffer = ruido(dur);
  const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = frec; f.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + ataque); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  s.connect(f).connect(g).connect(ctx.destination); s.start(t); s.stop(t + dur + 0.02);
}
export function chasquido(retraso = 0, vol = 0.22) { if (!activo || !ctx) return; golpeDeRuido(ctx.currentTime + retraso, 0.025, vol, 3200, 0.9); }
export function roce(retraso = 0, dur = 0.18, vol = 0.07) { if (!activo || !ctx) return; golpeDeRuido(ctx.currentTime + retraso, dur, vol, 2200, 0.6, dur * 0.4); }
export function golpe(retraso = 0, vol = 0.25) {
  if (!activo || !ctx) return;
  const t = ctx.currentTime + retraso, o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.09);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.1);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.12);
  golpeDeRuido(t, 0.06, vol * 0.5, 1200, 0.7);
}
export function riffle(retraso = 0, dur = 1.1) {
  if (!activo || !ctx) return;
  roce(retraso, 0.28, 0.06);
  for (let j = 0; j < 42; j++) { const u = j / 42; chasquido(retraso + dur * (0.36 + 0.46 * u ** 0.85) + (Math.random() - 0.5) * 0.006, 0.08 + Math.random() * 0.1); }
  roce(retraso + dur * 0.86, 0.2, 0.1); golpe(retraso + dur * 0.97, 0.2);
}
