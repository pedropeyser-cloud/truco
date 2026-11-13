// «Aprender a jugar» (2026-11-12, docs/crecer.md tanda 1): el truco en cinco minutos, con ejercicios que corrige
// el propio motor (jerarquia y tantoDe), y al final una mano contra el Barajador en fácil.
// Pantalla aparte, encima del inicio; no toca la partida ni la red.
import { jerarquia, tantoDe, cartasDelTanto } from "./motor.js";
import { frente, nombreCarta, MAZO } from "./cartas.js";
import * as S from "./sonido.js";

const CLAVE = "truco-tutorial";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const carta = (id, cls = "") => `<span class="tu-carta ${cls}" role="img" aria-label="${nombreCarta(id)}">${frente(id)}</span>`;
const azar = (a) => a[Math.floor(Math.random() * a.length)];
const mezclar = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((x) => x[1]);

export const hecho = () => { try { return localStorage.getItem(CLAVE) === "hecho"; } catch { return false; } };
const marcarHecho = () => { try { localStorage.setItem(CLAVE, "hecho"); } catch {} ganchos.terminado?.(); };   // terminado: 3 de gloria (la base los da una vez)

let ganchos = {}, paso = 0, el = null, quiz = null;

/** ganchos: { practicar } (arranca una mano contra el bot en fácil), { terminado } (llegó al final). */
export function abrir(g = {}) {
  ganchos = g; paso = 0; quiz = null;
  el = document.createElement("section");
  el.className = "pantalla tutorial"; el.setAttribute("aria-label", "Aprender a jugar");
  document.body.appendChild(el);
  document.querySelector("#inicio").hidden = true;
  el.onclick = clic;
  pintar();
}
function cerrar() {
  el?.remove(); el = null;
  document.querySelector("#inicio").hidden = false;
}

// ---------- los pasos ----------
const BRAVAS = ["1-espada", "1-basto", "7-espada", "7-oro"];
const ESCALERA = [["3-espada", "treses"], ["2-oro", "doses"], ["1-copa", "anchos falsos (copa y oro)"], ["12-basto", "reyes"], ["11-copa", "caballos"],
  ["10-oro", "sotas"], ["7-copa", "sietes falsos (copa y basto)"], ["6-espada", "seises"], ["5-basto", "cincos"], ["4-oro", "cuatros"]];

const PASOS = [
  { t: "El truco en cinco minutos", cuerpo: () => `
      <div class="tu-abanico">${carta("1-espada")}${carta("7-oro")}${carta("3-copa")}</div>
      <p class="tu-grande">Gana el primero que llega a <b>15 puntos</b> (o a 30, si eligen partida larga).</p>
      <p>Cada mano te tocan <b>3 cartas</b>. Los puntos salen de dos peleas que van al mismo tiempo: el <b>envido</b> (quién suma más con sus cartas) y el <b>truco</b> (quién gana las bazas).</p>
      <p class="tu-nota">Se juega mano a mano, de a 4 o de a 6. Acá aprendés lo de mano a mano; en equipo es lo mismo, más las señas.</p>` },
  { t: "Las cuatro bravas", cuerpo: () => `
      <div class="tu-fila bravas">${BRAVAS.map((id, i) => `<div>${carta(id)}<small>${i + 1}.º</small></div>`).join("")}</div>
      <p>No manda el número: manda la carta. Estas cuatro le ganan a todas, en este orden:</p>
      <ol class="tu-lista"><li><b>1 de espada</b> (el macho)</li><li><b>1 de basto</b> (la hembra)</li><li><b>7 de espada</b></li><li><b>7 de oro</b></li></ol>
      <p class="tu-nota">En el juego tienen un brillo ámbar para que las reconozcas.</p>` },
  { t: "Y después, el resto", cuerpo: () => `
      <p>Después de las bravas, de mayor a menor. Entre cartas del mismo escalón no hay ganador: es <b>parda</b> (empate).</p>
      <ol class="tu-escalera">${ESCALERA.map(([id, n]) => `<li>${carta(id, "chica")}<span>${n}</span></li>`).join("")}</ol>
      <p class="tu-nota">El 3 le gana al rey. El 1 de copa le gana al rey pero pierde con el 2. No hay 8 ni 9.</p>` },
  { t: "¿Cuál mata?", quiz: "mata", cuerpo: () => quizMata() },
  { t: "Las bazas", cuerpo: () => `
      <div class="tu-bazas"><div><span>1.ª</span>${carta("3-oro", "chica")}<i>vs</i>${carta("12-copa", "chica")}<b class="si">ganás</b></div>
        <div><span>2.ª</span>${carta("5-basto", "chica")}<i>vs</i>${carta("7-espada", "chica")}<b class="no">perdés</b></div>
        <div><span>3.ª</span>${carta("2-espada", "chica")}<i>vs</i>${carta("1-copa", "chica")}<b class="si">ganás</b></div></div>
      <p>Cada uno tira una carta por vez: eso es una <b>baza</b>. Gana la mano el que gana <b>2 de las 3</b>.</p>
      <p>Si una baza es parda, la define la siguiente. Si la primera es parda, gana el que gane la segunda.</p>
      <p class="tu-nota">El que gana una baza tira primero en la siguiente.</p>` },
  { t: "Cantar truco", cuerpo: () => `
      <div class="tu-cantos"><div><b>Truco</b><span>vale 2</span><small>no quiero: 1</small></div><div><b>Retruco</b><span>vale 3</span><small>no quiero: 2</small></div><div><b>Vale cuatro</b><span>vale 4</span><small>no quiero: 3</small></div></div>
      <p>Sin cantar, la mano vale <b>1 punto</b>. En cualquier momento podés cantar <b>truco</b>: el otro dice <b>quiero</b> (se juega por más), <b>no quiero</b> (te llevás los puntos de antes y termina la mano) o sube.</p>
      <p>Solo puede subir el que recibió el último canto. Y siempre te podés <b>ir al mazo</b>: perdés la mano, pero no más que eso.</p>
      <p class="tu-nota">Cantar truco con cartas malas es parte del juego: se llama mentir, y vale.</p>` },
  { t: "El tanto del envido", cuerpo: () => `
      <div class="tu-ejemplos">
        <div><div class="tu-abanico chico">${carta("7-oro")}${carta("6-oro")}${carta("12-espada")}</div><p>Dos de oro: <b>20 + 7 + 6 = 33</b>, lo máximo.</p></div>
        <div><div class="tu-abanico chico">${carta("12-copa")}${carta("4-copa")}${carta("1-espada")}</div><p>Dos de copa: <b>20 + 0 + 4 = 24</b>. Las figuras valen 0.</p></div>
        <div><div class="tu-abanico chico">${carta("5-oro")}${carta("3-basto")}${carta("11-espada")}</div><p>Ningún palo repetido: vale la más alta, <b>5</b>.</p></div></div>
      <p>Con <b>dos cartas del mismo palo</b>: 20 más lo que valen esas dos (del 1 al 7 valen su número; sota, caballo y rey, 0). Sin palo repetido, tu tanto es tu carta más alta.</p>` },
  { t: "¿Cuánto tenés?", quiz: "tanto", cuerpo: () => quizTanto() },
  { t: "Cantar envido", cuerpo: () => `
      <div class="tu-cantos"><div><b>Envido</b><span>vale 2</span></div><div><b>Real envido</b><span>vale 3</span></div><div><b>Falta envido</b><span>lo que falta</span></div></div>
      <p>Se canta en la <b>primera baza</b>, antes de tirar tu carta. Si lo quieren, cada uno dice su tanto y gana el más alto (si empatan, gana el que es mano). Si no lo quieren, el que cantó se lleva 1 (o lo que se venía cantando).</p>
      <p>Se pueden encadenar: envido, envido, real envido… La <b>falta envido</b> vale lo que le falta al que va ganando para terminar.</p>
      <p>Si te cantan truco antes, podés contestar «<b>el envido está primero</b>» y pelear el envido antes.</p>` },
  { t: "Mentir y pedir las cartas", cuerpo: () => `
      <div class="tu-abanico">${carta("4-basto")}${carta("10-copa")}${carta("6-espada")}</div>
      <p>En este truco podés <b>decir el tanto que quieras</b>: con un 6 podés decir 30. Si el otro te cree, ganaste.</p>
      <p>Pero el que pierde puede pedir <b>«las quiero en mesa»</b>: si mostrás menos de lo que dijiste, los puntos son para él. Y si no las mostrás antes de que termine la mano, también.</p>
      <p class="tu-nota">Mentir bien es el corazón del truco. Mentir siempre, no.</p>` },
  { t: "Listo para la mesa", fin: true, cuerpo: () => `
      <div class="tu-abanico">${carta("1-espada")}${carta("1-basto")}${carta("7-espada")}</div>
      <p class="tu-grande">Ya sabés lo necesario.</p>
      <p>Lo mejor ahora es jugar una mano contra <b>el Barajador en fácil</b>: abajo tenés los botones de cada canto, y si dudás, el juego solo te deja hacer lo que vale.</p>
      <button class="b fuerte ancho grande" data-practicar>Jugar contra el Barajador</button>
      <p class="tu-nota">Lo de la flor (tres del mismo palo) solo cuenta si la prenden al armar la mesa.</p>` },
];

// ---------- ejercicios ----------
function nuevoQuiz(tipo) {
  quiz = { tipo, n: 0, bien: 0, total: tipo === "mata" ? 6 : 5, resp: null, item: null };
  siguienteItem();
}
function siguienteItem() {
  quiz.resp = null;
  if (quiz.tipo === "mata") {
    // mitad de las veces una brava contra algo que parece más alto, para que se aprenda la trampa
    let a, b;
    do { a = azar(MAZO); b = Math.random() < 0.35 ? azar(MAZO.filter((x) => jerarquia(x) === jerarquia(a) && x !== a)) || azar(MAZO) : azar(MAZO); } while (!b || a === b);
    quiz.item = { a, b };
  } else {
    let mano;
    do { mano = mezclar(MAZO).slice(0, 3); } while (Math.random() < 0.6 && cartasDelTanto(mano).length < 2); // que salgan seguido dos del mismo palo
    const real = tantoDe(mano), ops = new Set([real]);
    const cerca = [real + 1, real - 1, real + 20, real - 20, real + 7, real - 3, 20, 7].filter((x) => x >= 0 && x <= 33 && x !== real);
    for (const x of mezclar(cerca)) { if (ops.size >= 4) break; ops.add(x); }
    quiz.item = { mano, real, ops: [...ops].sort((p, q) => p - q) };
  }
}
function quizMata() {
  if (!quiz || quiz.tipo !== "mata") nuevoQuiz("mata");
  if (quiz.n >= quiz.total) return finQuiz("Cuál mata");
  const { a, b } = quiz.item, r = quiz.resp;
  const ja = jerarquia(a), jb = jerarquia(b), bien = ja > jb ? "a" : jb > ja ? "b" : "parda";
  const marca = (k) => (r ? (k === bien ? " bien" : k === r ? " mal" : " apagada") : "");
  return `<p class="tu-cuenta">${quiz.n + 1} de ${quiz.total} · ${quiz.bien} bien</p>
    <p>Tocá la carta que gana. Si empatan, tocá <b>parda</b>.</p>
    <div class="tu-duelo"><button class="tu-elegir${marca("a")}" data-r="a" ${r ? "disabled" : ""}>${carta(a)}</button><span>vs</span><button class="tu-elegir${marca("b")}" data-r="b" ${r ? "disabled" : ""}>${carta(b)}</button></div>
    <button class="b ancho tu-parda${marca("parda")}" data-r="parda" ${r ? "disabled" : ""}>Parda</button>
    ${r ? `<p class="tu-fb ${r === bien ? "si" : "no"}">${r === bien ? "¡Eso!" : "No."} ${bien === "parda" ? `Están en el mismo escalón: ${esc(nombreCarta(a))} y ${esc(nombreCarta(b))} empatan.` : `Gana ${esc(nombreCarta(bien === "a" ? a : b))}.`}</p>
      <button class="b fuerte ancho" data-otra>${quiz.n + 1 >= quiz.total ? "Ver cómo te fue" : "Otra"}</button>` : ""}`;
}
function quizTanto() {
  if (!quiz || quiz.tipo !== "tanto") nuevoQuiz("tanto");
  if (quiz.n >= quiz.total) return finQuiz("Cuánto tenés");
  const { mano, real, ops } = quiz.item, r = quiz.resp;
  const del = cartasDelTanto(mano);
  const explica = del.length >= 2 ? `Dos de ${del[0].split("-")[1]}: 20 + ${del.map((id) => (+id.split("-")[0] <= 7 ? id.split("-")[0] : "0")).join(" + ")} = ${real}.` : `Sin palo repetido: vale la más alta, ${real}.`;
  return `<p class="tu-cuenta">${quiz.n + 1} de ${quiz.total} · ${quiz.bien} bien</p>
    <p>¿Cuánto tenés de envido con estas tres?</p>
    <div class="tu-abanico">${mano.map((id) => carta(id, r && del.includes(id) ? "luz" : "")).join("")}</div>
    <div class="tu-ops">${ops.map((x) => `<button class="b${r ? (x === real ? " bien" : x === r ? " mal" : "") : ""}" data-r="${x}" ${r ? "disabled" : ""}>${x}</button>`).join("")}</div>
    ${r ? `<p class="tu-fb ${r === real ? "si" : "no"}">${r === real ? "¡Eso!" : "No."} ${esc(explica)}</p><button class="b fuerte ancho" data-otra>${quiz.n + 1 >= quiz.total ? "Ver cómo te fue" : "Otra"}</button>` : ""}`;
}
function finQuiz(que) {
  const { bien, total } = quiz;
  const frase = bien === total ? "Perfecto. Ya podés sentarte con los viejos del club." : bien >= total - 2 ? "Muy bien. Con un par de manos lo terminás de agarrar." : "Se aprende jugando. Si querés, repetilo.";
  return `<div class="tu-resultado"><b>${bien} de ${total}</b><p>${frase}</p></div>
    <button class="b ancho" data-repetir>Repetir «${que}»</button>`;
}

// ---------- pantalla ----------
function pintar() {
  const p = PASOS[paso];
  if (p.quiz && quiz?.tipo !== p.quiz) quiz = null;
  el.innerHTML = `<header class="tu-cab"><button class="b-icono" data-cerrar aria-label="Cerrar">✕</button>
      <div class="tu-progreso" role="progressbar" aria-valuemin="1" aria-valuemax="${PASOS.length}" aria-valuenow="${paso + 1}">${PASOS.map((_, i) => `<i class="${i < paso ? "ya" : i === paso ? "ahora" : ""}"></i>`).join("")}</div>
      <span class="tu-num">${paso + 1}/${PASOS.length}</span></header>
    <div class="tu-cuerpo"><h2>${p.t}</h2>${p.cuerpo()}</div>
    <footer class="tu-pie">${paso ? `<button class="b" data-atras>Atrás</button>` : `<span></span>`}
      ${p.fin ? `<button class="b" data-cerrar>Volver al inicio</button>` : `<button class="b fuerte" data-sig>${p.quiz && quiz && quiz.n < quiz.total ? "Saltar" : "Siguiente"}</button>`}</footer>`;
  el.querySelector(".tu-cuerpo").scrollTop = 0;
}
function clic(e) {
  const t = e.target;
  if (t.closest("[data-cerrar]")) return cerrar();
  if (t.closest("[data-sig]")) { paso = Math.min(PASOS.length - 1, paso + 1); if (paso === PASOS.length - 1) marcarHecho(); return pintar(); }
  if (t.closest("[data-atras]")) { paso = Math.max(0, paso - 1); return pintar(); }
  if (t.closest("[data-practicar]")) { marcarHecho(); cerrar(); return ganchos.practicar?.(); }
  if (t.closest("[data-repetir]")) { quiz = null; return pintar(); }
  if (t.closest("[data-otra]")) { quiz.n++; if (quiz.n < quiz.total) siguienteItem(); return pintar(); }
  const r = t.closest("[data-r]");
  if (r && quiz && !quiz.resp) {
    const v = quiz.tipo === "tanto" ? +r.dataset.r : r.dataset.r;
    quiz.resp = v;
    let ok;
    if (quiz.tipo === "tanto") ok = v === quiz.item.real;
    else { const ja = jerarquia(quiz.item.a), jb = jerarquia(quiz.item.b); ok = v === (ja > jb ? "a" : jb > ja ? "b" : "parda"); }
    if (ok) { quiz.bien++; S.chasquido?.(0, 0.2); }
    pintar();
  }
}
