// Cartas del truco en SVG, estética Contraluz. Palos «naipe en línea» (propuesta B de htmls/palos.html, elegida por Pedro).
// Ids de carta: "<número>-<palo>", palo en espada | basto | oro | copa.

export const C = { noche: "#14171c", papel: "#ebe4d4", tinta: "#14171c", ambar: "#f0a93b", ambarP: "#b8621b", dorso: "#1e222a" };
const NS = 'stroke-linecap="round" stroke-linejoin="round" fill="none"';  // sw en unidades del símbolo (caja de 100)
const P = (d, c, sw) => `<path d="${d}" stroke="${c}" stroke-width="${sw}" ${NS}/>`;

export function sol(c, sw) {  // el sol del reel: círculo, punto de 0,17 r, 12 rayos de 1,36 r a 1,9 r
  let s = `<circle r="24" stroke="${c}" stroke-width="${sw}" ${NS}/><circle r="4.1" fill="${c}"/>`;
  for (let k = 0; k < 12; k++) {
    const a = k * Math.PI / 6, x = Math.cos(a), y = Math.sin(a);
    s += `<line x1="${(32.6 * x).toFixed(1)}" y1="${(32.6 * y).toFixed(1)}" x2="${(45.6 * x).toFixed(1)}" y2="${(45.6 * y).toFixed(1)}" stroke="${c}" stroke-width="${sw}" ${NS}/>`;
  }
  return s;
}
export const PALOS = {
  oro: sol,
  copa: (c, sw) => P("M-22,-34 L22,-34 Q22,4 0,6 Q-22,4 -22,-34 Z M0,6 L0,30 M-15,36 Q0,29 15,36", c, sw),
  espada: (c, sw) => P("M0,-47 L6,-35 L6,19 L-6,19 L-6,-35 Z M-18,19 L18,19 M0,19 L0,35", c, sw) + `<circle cy="41" r="4.6" stroke="${c}" stroke-width="${sw}" ${NS}/>`,
  basto: (c, sw) => P("M-5,46 L-9,-30 Q0,-50 9,-30 L5,46 Z M7,-6 L17,-14 M-7,16 L-17,8", c, sw)
};
export const NOMBRE_PALO = { espada: "espada", basto: "basto", oro: "oro", copa: "copa" };
const FIG = { 10: "sota", 11: "caballo", 12: "rey" };
export const nombreCarta = id => { const [n, p] = id.split("-"); return `${FIG[n] ? FIG[n] : n} de ${p}`; };

const W = 600, H = 860;
const PIPS = {
  2: [[300, 250], [300, 610]], 3: [[300, 230], [300, 430], [300, 630]],
  4: [[190, 260], [410, 260], [190, 600], [410, 600]], 5: [[190, 250], [410, 250], [300, 430], [190, 610], [410, 610]],
  6: [[190, 230], [410, 230], [190, 430], [410, 430], [190, 630], [410, 630]],
  7: [[190, 220], [410, 220], [300, 325], [190, 430], [410, 430], [190, 640], [410, 640]]
};
// las cuatro bravas llevan un halo ámbar: es la única luz del frente
export const esBrava = id => ["1-espada", "1-basto", "7-espada", "7-oro"].includes(id);

const cache = new Map();
export const idValido = id => typeof id === "string" && /^(1|2|3|4|5|6|7|10|11|12)-(espada|basto|oro|copa)$/.test(id);
export function frente(id) {
  if (!idValido(id)) return dorso();  // lo que llega por red se valida antes de meterlo en el SVG
  if (cache.has(id)) return cache.get(id);
  const [ns, palo] = id.split("-"), n = +ns, f = PALOS[palo], g = "h-" + id;
  let s = `<svg class="svg-carta" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`;
  s += `<rect width="${W}" height="${H}" rx="30" fill="${C.papel}"/>`;
  if (esBrava(id)) s += `<defs><radialGradient id="${g}"><stop offset="0" stop-color="${C.ambar}" stop-opacity=".38"/><stop offset="1" stop-color="${C.ambar}" stop-opacity="0"/></radialGradient></defs><circle cx="300" cy="430" r="260" fill="url(#${g})"/>`;
  if (n === 1) s += `<g transform="translate(300,430) scale(3.7)">${f(C.tinta, 15 / 3.7)}</g>`;
  else if (FIG[n]) s += `<text x="300" y="300" text-anchor="middle" font-family="Caveat, cursive" font-size="130" fill="${C.tinta}">${FIG[n]}</text><g transform="translate(300,530) scale(2.3)">${f(C.tinta, 13 / 2.3)}</g>`;
  else for (const [x, y] of PIPS[n]) s += `<g transform="translate(${x},${y}) scale(1.1)">${f(C.tinta, 10 / 1.1)}</g>`;
  const idx = `<text x="66" y="80" text-anchor="middle" font-family="Plex, monospace" font-size="62" font-weight="600" fill="${C.ambarP}">${n}</text><g transform="translate(66,146) scale(.68)">${f(C.ambarP, 8 / .68)}</g>`;
  s += idx + `<g transform="rotate(180 300 430)">${idx}</g></svg>`;
  cache.set(id, s);
  return s;
}
let _dorso;
export function dorso() {
  return _dorso ??= `<svg class="svg-carta" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect width="${W}" height="${H}" rx="30" fill="${C.dorso}"/>
    <rect x="26" y="26" width="${W - 52}" height="${H - 52}" rx="20" stroke="${C.ambar}" stroke-width="4" fill="none"/>
    <g transform="translate(300,430) scale(3.83)">${sol(C.ambar, 9 / 3.83)}</g>
    <text x="54" y="${H - 58}" font-family="Caveat, cursive" font-size="54" fill="${C.ambar}" fill-opacity=".85">truco</text></svg>`;
}
export const MAZO = (() => {
  const ids = [];
  for (const p of ["espada", "basto", "oro", "copa"]) for (const n of [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]) ids.push(`${n}-${p}`);
  return ids;
})();
