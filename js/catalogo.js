// La pulpería (2026-11-12): todo lo que se consigue con la gloria, mostrado como una tienda.
// Siguen siendo umbrales: «canjear» no descuenta nada, solo lo saca del estante y lo deja listo para ponértelo.
// Los 9 de la tanda 4C (gloria.js → UMBRALES) conservan su clave y su umbral. Lo nuevo es pinta: se guarda en
// perfil.estilo (cara, sombrero, ojos, boca, dorso, pano, tanteador, marco) y se ve siempre, también en la liga.
// Si se corre el SQL nuevo de supabase/esquema.sql, la base también controla estos umbrales.

const T = "#14171c";

export const SOMBREROS = {
  boina: () => `<g class="acc acc-sombrero" transform="rotate(-9 100 46)"><path d="M36 64Q30 26 100 22Q172 24 168 58Q152 70 100 68Q58 70 36 64Z" fill="#2c3b57" stroke="${T}" stroke-width="5" stroke-linejoin="round"/><path d="M38 62Q100 74 166 58" fill="none" stroke="${T}" stroke-width="4"/><path d="M98 23l3-12" stroke="${T}" stroke-width="6" stroke-linecap="round"/></g>`,
  galera: () => `<g class="acc acc-sombrero"><rect x="60" y="-22" width="80" height="82" rx="6" fill="#2a2d35" stroke="${T}" stroke-width="5"/><rect x="62" y="32" width="76" height="13" fill="#b8621b"/><path d="M26 62Q100 46 174 62Q176 74 100 74Q24 74 26 62Z" fill="#2a2d35" stroke="${T}" stroke-width="5" stroke-linejoin="round"/><path d="M72 -12v40" stroke="#555b67" stroke-width="4" stroke-linecap="round"/></g>`,
  corona: () => `<g class="acc acc-sombrero"><path d="M48 64L42 12L74 38L100 2L126 38L158 12L152 64Z" fill="#e8c35a" stroke="${T}" stroke-width="5" stroke-linejoin="round"/><path d="M50 52H150" stroke="${T}" stroke-width="3" opacity=".5"/><circle cx="100" cy="36" r="6" fill="#d6332a" stroke="${T}" stroke-width="3"/><circle cx="70" cy="48" r="4" fill="#7cc4ef" stroke="${T}" stroke-width="2.5"/><circle cx="130" cy="48" r="4" fill="#7cc4ef" stroke="${T}" stroke-width="2.5"/></g>`,
};
export const OJOS = {
  anteojos: () => `<g class="acc acc-ojos"><circle cx="76" cy="102" r="18" fill="rgba(255,255,255,.18)" stroke="${T}" stroke-width="4.5"/><circle cx="124" cy="102" r="18" fill="rgba(255,255,255,.18)" stroke="${T}" stroke-width="4.5"/><path d="M94 100Q100 93 106 100" fill="none" stroke="${T}" stroke-width="4"/><path d="M58 98L36 92M142 98L164 92" stroke="${T}" stroke-width="4" stroke-linecap="round"/></g>`,
  lentes: () => `<g class="acc acc-ojos"><rect x="52" y="88" width="44" height="28" rx="10" fill="${T}"/><rect x="104" y="88" width="44" height="28" rx="10" fill="${T}"/><path d="M96 98Q100 94 104 98" fill="none" stroke="${T}" stroke-width="4"/><path d="M52 96L34 90M148 96L166 90" stroke="${T}" stroke-width="4" stroke-linecap="round"/><path d="M60 95l10-3M112 95l10-3" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/></g>`,
};
export const BOCAS = {
  bigote: () => `<g class="acc acc-boca"><path d="M100 133C92 126 78 127 70 135C64 141 55 140 52 132C53 146 70 152 84 143C92 138 97 138 100 136C103 138 108 138 116 143C130 152 147 146 148 132C145 140 136 141 130 135C122 127 108 126 100 133Z" fill="${T}"/></g>`,
};

export const DORSOS = { clasico: "El de siempre", rayado: "Rayado", luna: "Luna", celeste: "Celeste y blanco", oro: "De oro" };
export const PANOS = { madera: "Madera de bodegón", verde: "Paño verde", rojo: "Paño de cantina", azul: "Paño de medianoche", marmol: "Mármol negro" };

/**
 * El catálogo, de menor a mayor. cat: cara | mesa | poder | nombre.
 * uso: elegir (abre opciones) · poner (se pone y se saca) · solo (se usa solo en la mesa) · ir (abre otra pantalla).
 * slot: dónde va en la cara (un sombrero a la vez, unos anteojos a la vez).
 */
export const CATALOGO = [
  { k: "cara", p: 0, cat: "cara", uso: "elegir", nombre: "Tu cara", que: "Regalo de la casa: elegí entre seis caras de recorte. Es la que te ven en la mesa." },
  { k: "dorso_rayado", p: 3, cat: "mesa", uso: "poner", nombre: "Dorso rayado", que: "El dorso de tus cartas con rayas ámbar. Lo ve tu rival en cada reparto." },
  { k: "pano_verde", p: 5, cat: "mesa", uso: "poner", nombre: "Paño verde", que: "Tu mesa con paño verde de boliche." },
  { k: "anteojos", p: 8, cat: "cara", uso: "poner", slot: "ojos", nombre: "Anteojos redondos", que: "Para leer las señas de lejos." },
  { k: "titulo", p: 10, cat: "nombre", uso: "elegir", nombre: "Título honorable", que: "Un título de la corte bajo tu nombre." },
  { k: "dorso_luna", p: 12, cat: "mesa", uso: "poner", nombre: "Dorso luna", que: "Luna y estrellas sobre azul de noche en el dorso de tus cartas." },
  { k: "mate", p: 15, cat: "poder", uso: "solo", nombre: "El mate", que: "Si tomás al menos uno por partida, +1 de gloria (ganes o pierdas). El botón aparece arriba en la mesa." },
  { k: "pano_rojo", p: 18, cat: "mesa", uso: "poner", nombre: "Paño de cantina", que: "Tu mesa con paño rojo, como en la cantina del barrio." },
  { k: "gorra", p: 20, cat: "cara", uso: "poner", slot: "sombrero", nombre: "Gorrita de la Selección", que: "Celeste y blanca, con la 10 y la firma. En la clasificatoria se ve desde Oro 4." },
  { k: "bigote", p: 22, cat: "cara", uso: "poner", slot: "boca", nombre: "Bigote de bodegón", que: "Un bigote tupido, de los que imponen respeto al cantar retruco." },
  { k: "peluca", p: 25, cat: "poder", uso: "elegir", nombre: "Peluca de color", que: "Una vez por partida, irte al mazo una ronda sin perder el punto. Y la peluca se ve en tu cara." },
  { k: "boina", p: 28, cat: "cara", uso: "poner", slot: "sombrero", nombre: "Boina", que: "La boina del que sabe de memoria cuánto vale cada carta." },
  { k: "estilo", p: 30, cat: "nombre", uso: "elegir", nombre: "Color y tipografía", que: "Tu nombre y tu título con el color y la letra que elijas." },
  { k: "dorso_celeste", p: 33, cat: "mesa", uso: "poner", nombre: "Dorso celeste y blanco", que: "Franjas celestes y blancas con el sol en el medio." },
  { k: "libre", p: 35, cat: "nombre", uso: "elegir", nombre: "Título libre", que: "Escribí el título que quieras (hasta 32 letras)." },
  { k: "porotos", p: 38, cat: "mesa", uso: "poner", nombre: "Tanteador con porotos", que: "Los tantos se anotan con porotos en vez de fósforos, como en la casa de los abuelos." },
  { k: "clasif", p: 40, cat: "poder", uso: "ir", nombre: "Clasificatoria", que: "Partidas por liga, de Bronce 1 a Oro 1. Se juega desde la pestaña Liga." },
  { k: "lentes", p: 42, cat: "cara", uso: "poner", slot: "ojos", nombre: "Lentes negros", que: "Que nadie te lea la cara cuando tenés las dos bravas." },
  { k: "trampa", p: 45, cat: "poder", uso: "solo", nombre: "La trampa", que: "Una vez por partida, en tu turno: le cambiás al rival una carta por una al azar del mazo." },
  { k: "pano_azul", p: 48, cat: "mesa", uso: "poner", nombre: "Paño de medianoche", que: "Tu mesa con paño azul oscuro, para las partidas de madrugada." },
  { k: "insignia", p: 50, cat: "nombre", uso: "solo", nombre: "Insignia de ganador", que: "La insignia junto a tu nombre y tu estilo de juego en el perfil." },
  { k: "galera", p: 55, cat: "cara", uso: "poner", slot: "sombrero", nombre: "Galera", que: "Para jugar de etiqueta." },
  { k: "dorso_oro", p: 60, cat: "mesa", uso: "poner", nombre: "Dorso de oro", que: "El sol en negro sobre dorado. El rival lo ve brillar en cada reparto." },
  { k: "marco", p: 70, cat: "cara", uso: "poner", nombre: "Marco de oro", que: "Un marco dorado alrededor de tu cara, arriba en la cabecera y en tu perfil." },
  { k: "pano_marmol", p: 80, cat: "mesa", uso: "poner", nombre: "Mármol negro", que: "La mesa de café de mármol negro, con vetas claras." },
  { k: "corona", p: 100, cat: "cara", uso: "poner", slot: "sombrero", nombre: "Corona del Vale Cuatro", que: "Para quien llegó a 100 de gloria. No hay nada más arriba." },
];
export const CATS = { todo: "Todo", cara: "Tu cara", mesa: "Tu mesa", poder: "Poderes", nombre: "Tu nombre" };
export const producto = (k) => CATALOGO.find((x) => x.k === k);
/** ¿Llegó a la gloria de ese producto? */
export const alcanza = (perfil, k) => { const x = producto(k); return !!perfil && !!x && (perfil.puntos || 0) >= x.p; };
export const proximoProducto = (puntos) => CATALOGO.find((x) => x.p > (puntos || 0)) || null;

/** Forma de cabeza (0 a 5): la elegida o una fija por usuario (así cada uno tiene su cara aunque no elija). */
export function formaDe(perfil, defecto = 0) {
  const f = perfil?.estilo?.cara;
  if (Number.isInteger(f) && f >= 0 && f < 6) return f;
  if (!perfil?.usuario) return defecto;
  let h = 0; for (const c of perfil.usuario) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h) % 6;
}
export const dorsoDe = (perfil) => { const d = perfil?.estilo?.dorso; return DORSOS[d] && alcanza(perfil, "dorso_" + d) ? d : "clasico"; };
export const panoDe = (perfil) => { const d = perfil?.estilo?.pano; return PANOS[d] && alcanza(perfil, "pano_" + d) ? d : "madera"; };
export const usaPorotos = (perfil) => perfil?.estilo?.tanteador === "porotos" && alcanza(perfil, "porotos");
export const tieneMarco = (perfil) => perfil?.estilo?.marco === "oro" && alcanza(perfil, "marco");
/** Sombrero, anteojos y bigote puestos (solo los alcanzados). */
export function pintaCara(perfil) {
  const e = perfil?.estilo || {};
  return {
    sombrero: SOMBREROS[e.sombrero] && alcanza(perfil, e.sombrero) ? e.sombrero : null,
    ojos: OJOS[e.ojos] && alcanza(perfil, e.ojos) ? e.ojos : null,
    boca: BOCAS[e.boca] && alcanza(perfil, e.boca) ? e.boca : null,
  };
}

/** Porotos en vez de fósforos: grupos de cinco (cuatro en las esquinas y uno en el medio). */
export function porotos(p, meta, s = 22, gap = 10) {
  const grupos = meta / 5, alto = grupos * (s + gap) + (meta === 30 ? 16 : 0), w = s + 12;
  let svg = `<svg viewBox="-6 -4 ${w} ${alto + 4}" width="${w}" height="${alto + 4}" aria-hidden="true">`;
  const lug = [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9], [0.5, 0.5]];
  for (let g = 0; g < grupos; g++) {
    const oy = g * (s + gap) + (meta === 30 && g >= 3 ? 16 : 0);
    if (meta === 30 && g === 3) svg += `<line x1="-6" y1="${oy - 11}" x2="${s + 6}" y2="${oy - 11}" stroke="#b8621b" stroke-width="1.4" stroke-dasharray="3 3"/>`;
    for (let k = 0; k < 5; k++) {
      const i = g * 5 + k; if (i >= p) break;
      const [x, y] = lug[k], rot = (i * 47) % 70 - 35;
      svg += `<ellipse cx="${x * s}" cy="${oy + y * s}" rx="${s * 0.2}" ry="${s * 0.13}" transform="rotate(${rot} ${x * s} ${oy + y * s})" fill="#c99a5b" stroke="#5a3b1e" stroke-width="1.3"/>`;
    }
  }
  return svg + "</svg>";
}

// ---------- dibujos para el estante ----------
const svg = (vb, cont, px = 64) => `<svg viewBox="${vb}" width="${px}" height="${px}" aria-hidden="true">${cont}</svg>`;
export const ILUS = {
  titulo: () => svg("0 0 100 100", `<path d="M14 34h72v32H14z" fill="#ebe4d4" stroke="${T}" stroke-width="3"/><path d="M14 34l-8 16 8 16M86 34l8 16-8 16" fill="#d9cfb8" stroke="${T}" stroke-width="3" stroke-linejoin="round"/><text x="50" y="57" text-anchor="middle" font-family="Caveat, cursive" font-size="20" fill="#b8621b">Duque</text>`),
  libre: () => svg("0 0 100 100", `<path d="M14 34h72v32H14z" fill="#ebe4d4" stroke="${T}" stroke-width="3"/><path d="M26 54q8-8 16 0t16 0 16 0" fill="none" stroke="#b8621b" stroke-width="3" stroke-linecap="round"/><path d="M70 18l14 14-34 34-16 4 4-16z" fill="#f0a93b" stroke="${T}" stroke-width="3" stroke-linejoin="round"/>`),
  estilo: () => svg("0 0 100 100", `<text x="22" y="66" font-family="Georgia, serif" font-size="46" fill="#7cc4ef">A</text><text x="52" y="70" font-family="Caveat, cursive" font-size="52" fill="#f08cc0">a</text><circle cx="78" cy="28" r="7" fill="#6fbf73"/><circle cx="62" cy="20" r="5" fill="#e8c35a"/>`),
  clasif: () => svg("0 0 100 100", `<path d="M50 10l32 12v24c0 22-14 36-32 44C32 82 18 68 18 46V22z" fill="#2a2f39" stroke="#e8c35a" stroke-width="4" stroke-linejoin="round"/><path d="M50 30l6 12 13 2-9 9 2 13-12-6-12 6 2-13-9-9 13-2z" fill="#e8c35a"/>`),
  trampa: () => svg("0 0 100 100", `<rect x="16" y="22" width="34" height="50" rx="5" fill="#ebe4d4" stroke="${T}" stroke-width="3" transform="rotate(-10 33 47)"/><rect x="52" y="28" width="34" height="50" rx="5" fill="#1e222a" stroke="#f0a93b" stroke-width="3" transform="rotate(10 69 53)"/><path d="M34 84q16 10 32 0M66 16q-16-10-32 0" fill="none" stroke="#f0a93b" stroke-width="3.5" stroke-linecap="round"/><path d="M62 80l5 4-6 3M38 20l-5-4 6-3" fill="none" stroke="#f0a93b" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`),
  porotos: () => svg("0 0 100 100", [[30, 30], [70, 30], [30, 70], [70, 70], [50, 50]].map(([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="12" ry="8" transform="rotate(${i * 35 - 30} ${x} ${y})" fill="#c99a5b" stroke="#5a3b1e" stroke-width="2.5"/><path d="M${x - 5} ${y - 2}q5 3 10 0" stroke="#e8c79a" stroke-width="2" fill="none" transform="rotate(${i * 35 - 30} ${x} ${y})"/>`).join("")),
};
