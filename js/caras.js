// Caras de la mesa de 4 y 6, estilo B «recorte de papel» (htmls/caras.html, elegido por Pedro).
// Cada asiento tiene su forma de cabeza. Las señas duran 0,7 s; las caras parpadean solas (no es seña).

export const SENAS = [
  { k: "ancho_espada", carta: "1 de espada", nombre: "cejas arriba", set: { cejas: "arriba" } },
  { k: "ancho_basto", carta: "1 de basto", nombre: "guiño", set: { ojos: "guino" } },
  { k: "siete_espada", carta: "7 de espada", nombre: "boca a la derecha", set: { boca: "der" } },
  { k: "siete_oro", carta: "7 de oro", nombre: "boca a la izquierda", set: { boca: "izq" } },
  { k: "tres", carta: "un tres", nombre: "muerde el labio", set: { boca: "muerde" } },
  { k: "dos", carta: "un dos", nombre: "trompita", set: { boca: "trompa" } },
  { k: "falso", carta: "ancho falso", nombre: "punta de la lengua", set: { boca: "lengua" } },
  { k: "flor", carta: "flor", nombre: "infla los cachetes", set: { boca: "cachetes", cach: "si" } },
  { k: "nada", carta: "nada", nombre: "cierra los ojos", set: { ojos: "cerrados", boca: "plana" } },
];
export const CABEZA = [
  { k: "mas", nombre: "Más", gesto: "levanta la cabeza" },
  { k: "menos", nombre: "Menos", gesto: "baja la cabeza" },
  { k: "si", nombre: "Sí", gesto: "asiente" },
  { k: "no", nombre: "No", gesto: "niega" },
];
// Lo que se dice en voz alta a la mesa (lo oyen todos, rivales incluidos: sirve también para mentir).
// pie: solo el pie; todos: cualquiera de la mesa. «¡Vamos a…!» se arma por compañero (p_vamos_<asiento>).
export const PREGUNTAS = [
  { k: "p_envido", texto: "¿Tenés para el envido?", quien: "pie" },
  { k: "p_mas27", texto: "¿Más de veintisiete?", quien: "pie" },
  { k: "p_puntita", texto: "¿Tenés una puntita?", quien: "pie" },
  { k: "p_truco", texto: "¿Tenés algo para el truco?", quien: "pie" },
  { k: "p_mata", texto: "Matala si podés.", quien: "pie" },
  { k: "p_pasa", texto: "Pasá, que voy yo.", quien: "pie" },
  { k: "p_canto", texto: "¿Canto?", quien: "todos" },
  { k: "p_canto_envido", texto: "¿Canto envido?", quien: "todos" },
  { k: "p_canto_truco", texto: "¿Canto truco?", quien: "todos" },
  { k: "p_mazo", texto: "¿Nos vamos al mazo?", quien: "pie" },
  { k: "p_flor", texto: "¿Tenés flor?", quien: "pie", soloFlor: true },
];
export const senaDe = (k) => SENAS.find((s) => s.k === k);
export const cabezaDe = (k) => CABEZA.find((c) => c.k === k);
/** La pregunta de clave k (incluida «¡Vamos a…!», p_vamos_<asiento>, que dice el pie). */
export function preguntaDe(k) {
  const v = /^p_vamos_([0-5])$/.exec(String(k));
  if (v) return { k, texto: "¡Vamos a la tuya!", quien: "pie", vamos: +v[1], voz: "p_vamos" };
  return PREGUNTAS.find((p) => p.k === k);
}

/** Seña que corresponde a una carta (o null si la carta no tiene seña). */
export function senaDeCarta(id) {
  const [n, palo] = id.split("-");
  if (id === "1-espada") return "ancho_espada";
  if (id === "1-basto") return "ancho_basto";
  if (id === "7-espada") return "siete_espada";
  if (id === "7-oro") return "siete_oro";
  if (n === "3") return "tres";
  if (n === "2") return "dos";
  if (n === "1" && (palo === "copa" || palo === "oro")) return "falso";
  return null;
}

const NEUTRA = { boca: "normal", ojos: "abiertos", cejas: "normal", cach: "no" };
const TINTA = "#14171c", PAPEL = "#ebe4d4", AMBAR = "#f0a93b";
const G = 5;

const CRANEOS = [
  `<ellipse class="craneo" cx="100" cy="118" rx="68" ry="76"/>`,
  `<ellipse class="craneo" cx="100" cy="116" rx="60" ry="84"/>`,
  `<rect class="craneo" x="34" y="44" width="132" height="150" rx="46"/>`,
  `<path class="craneo" d="M100 40C130 40 140 66 146 100C160 130 168 160 150 182C136 198 64 198 50 182C32 160 40 130 54 100C60 66 70 40 100 40Z"/>`,
  `<ellipse class="craneo" cx="100" cy="122" rx="76" ry="68"/>`,
  `<path class="craneo" d="M100 38C152 38 168 78 162 116C154 164 126 198 100 198C74 198 46 164 38 116C32 78 48 38 100 38Z"/>`,
];

function bocas() {
  const s = `fill="none" stroke="${TINTA}" stroke-width="${G}" stroke-linecap="round" stroke-linejoin="round"`;
  return `
    <path class="m m-normal" d="M82 150Q100 162 118 150" ${s}/>
    <path class="m m-plana" d="M86 154L114 154" ${s}/>
    <path class="m m-der" d="M64 140Q76 160 102 156" ${s}/>
    <path class="m m-izq" d="M136 140Q124 160 98 156" ${s}/>
    <g class="m m-muerde"><path d="M82 149Q100 153 118 149" ${s}/><rect x="91" y="149" width="9" height="9" rx="2" fill="#fff" stroke="${TINTA}" stroke-width="2.5"/><rect x="100" y="149" width="9" height="9" rx="2" fill="#fff" stroke="${TINTA}" stroke-width="2.5"/><path d="M86 160Q100 165 114 160" ${s}/></g>
    <g class="m m-trompa"><ellipse cx="100" cy="153" rx="7" ry="9" ${s}/><circle cx="100" cy="153" r="2" fill="${TINTA}"/></g>
    <g class="m m-lengua"><path d="M94 151Q100 169 106 151Z" fill="${AMBAR}" stroke="${TINTA}" stroke-width="3"/><path d="M83 150Q100 156 117 150" ${s}/></g>
    <path class="m m-cachetes" d="M93 154Q100 150 107 154" ${s}/>`;
}

function ojos() {
  const abierto = (x, d) => `<g class="ojo-a ${d}"><ellipse cx="${x}" cy="102" rx="7.5" ry="10.5" fill="${TINTA}"/><circle cx="${x + 2.5}" cy="98" r="2.6" fill="#fff"/></g>`;
  const cerrado = (x, d) => `<path class="ojo-c ${d}" d="M${x - 9} 101Q${x} 109 ${x + 9} 101" fill="none" stroke="${TINTA}" stroke-width="${G}" stroke-linecap="round"/>`;
  return abierto(76, "i") + abierto(124, "d") + cerrado(76, "i") + cerrado(124, "d");
}

/** SVG de la cara del asiento `i` (forma de cabeza = i % 6). */
export function cara(i, etiqueta = "cara", { busto = false, color = "#5b616c" } = {}) {
  const craneo = CRANEOS[i % CRANEOS.length].replace("/>", ` fill="${PAPEL}" stroke="${TINTA}" stroke-width="${G}"/>`);
  // busto: hombros del color del equipo y cuello, detrás de la cabeza
  const cuerpo = busto ? `<path d="M6 300C8 238 50 208 100 208C150 208 192 238 194 300Z" fill="${color}" stroke="${TINTA}" stroke-width="${G}"/>
    <path d="M78 212L100 246L122 212" fill="none" stroke="${TINTA}" stroke-width="4" stroke-linejoin="round" opacity=".55"/>
    <rect x="82" y="176" width="36" height="40" rx="10" fill="${PAPEL}" stroke="${TINTA}" stroke-width="${G}"/>` : "";
  return `<svg class="cara-jugador" viewBox="0 0 200 ${busto ? 300 : 210}" role="img" aria-label="${etiqueta}" data-boca="normal" data-ojos="abiertos" data-cejas="normal" data-cach="no">
    ${cuerpo}<g class="cabeza">${craneo}
      <g class="rasgos">
        <ellipse class="cachete" cx="64" cy="138" rx="11" ry="8" fill="${AMBAR}" opacity=".38"/><ellipse class="cachete" cx="136" cy="138" rx="11" ry="8" fill="${AMBAR}" opacity=".38"/>
        <g class="cejas"><path d="M63 84Q76 77 89 83" fill="none" stroke="${TINTA}" stroke-width="${G}" stroke-linecap="round"/><path d="M111 83Q124 77 137 84" fill="none" stroke="${TINTA}" stroke-width="${G}" stroke-linecap="round"/></g>
        ${ojos()}
        <path d="M99 117Q93 127 103 129" fill="none" stroke="${TINTA}" stroke-width="4" stroke-linecap="round"/>
        ${bocas()}
      </g>
    </g>
  </svg>`;
}

const ocupada = new WeakMap();

/** Hace la seña `k` en la cara `svg` durante `ms` milisegundos. */
export function senar(svg, k, ms = 700) {
  const s = senaDe(k);
  if (!svg || !s) return;
  clearTimeout(ocupada.get(svg));
  Object.entries({ ...NEUTRA, ...s.set }).forEach(([a, b]) => (svg.dataset[a] = b));
  ocupada.set(svg, setTimeout(() => {
    Object.entries(NEUTRA).forEach(([a, b]) => (svg.dataset[a] = b));
    ocupada.delete(svg);
  }, ms));
}

/** Movimiento de cabeza: mas, menos, si, no. */
export function cabecear(svg, k) {
  if (!svg || !cabezaDe(k)) return;
  CABEZA.forEach((c) => svg.classList.remove("g-" + c.k));
  void svg.getBoundingClientRect();
  svg.classList.add("g-" + k);
  setTimeout(() => svg.classList.remove("g-" + k), 1150);
}

/** Parpadeo de fondo: dos ojos cerrados un instante, cada 2,5 a 6,5 s. No es seña. */
export function parpadear(svg) {
  let t = null;
  const uno = () => {
    t = setTimeout(() => {
      if (!svg.isConnected) return;
      if (!ocupada.has(svg) && svg.dataset.ojos === "abiertos") {
        svg.dataset.ojos = "cerrados";
        setTimeout(() => { if (!ocupada.has(svg)) svg.dataset.ojos = "abiertos"; }, 110);
      }
      uno();
    }, 2500 + Math.random() * 4000);
  };
  uno();
  return () => clearTimeout(t);
}

/**
 * Accesorios de la gloria sobre una cara: gorrita (encima de la cabeza, no tapa cejas ni ojos) y peluca de color
 * (detrás de la cabeza: asoma arriba y a los costados). Se mueven con la cabeza al asentir o negar.
 * acc: { gorra: bool, peluca: "#rrggbb" | null }. El dibujo lo da gloria.js.
 */
export function accesorios(svg, acc, { gorra, peluca }) {
  const cab = svg?.querySelector(".cabeza");
  if (!cab) return;
  cab.querySelectorAll(".acc").forEach((x) => x.remove());
  if (acc?.peluca) cab.insertAdjacentHTML("afterbegin", peluca(acc.peluca));
  if (acc?.gorra) cab.insertAdjacentHTML("beforeend", gorra());
}
