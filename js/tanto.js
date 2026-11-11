// Elegir el número que se dice en el envido. Se puede mentir: si lo piden en mesa y no lo tenía, pierde.
// Lo usan la mesa de 1 contra 1 (app.js) y las de 4 y 6 (mesa.js).
let dicho = null, clave = null;

/** Mayor tanto dicho hasta ahora (el que hay que superar para «son mejores»). */
export function liderDicho(envido) {
  const t = (envido?.tantos || []).filter((x) => x != null);
  return t.length ? Math.max(...t) : -1;
}

/**
 * Arma en `fila` los botones − [Tengo N] + .
 * tipo: "tanto" o "son_mejores"; min: el número mínimo que se puede decir.
 */
export function selectorTanto(fila, { real, min = 0, tipo, enviar, alTocar = () => {} }) {
  const k = `${tipo}|${min}`;
  if (clave !== k) { clave = k; dicho = Math.max(real ?? 0, min); }
  dicho = Math.min(33, Math.max(min, dicho));

  const caja = document.createElement("div");
  caja.className = "tanto-sel";
  const boton = (txt, clase, fn, etiqueta) => {
    const b = document.createElement("button");
    b.className = "b " + clase; b.textContent = txt; b.type = "button";
    if (etiqueta) b.setAttribute("aria-label", etiqueta);
    b.onclick = () => { alTocar(); fn(); };
    caja.appendChild(b); return b;
  };
  const nota = document.createElement("span");
  nota.className = "tanto-nota";
  const pintar = () => {
    principal.textContent = tipo === "tanto" ? `Tengo ${dicho}` : `¡${dicho} son mejores!`;
    menos.disabled = dicho <= min; mas.disabled = dicho >= 33;
    nota.textContent = real != null && dicho !== real ? `tenés ${real}: si te piden en mesa, perdés` : "";
    caja.classList.toggle("miente", real != null && dicho !== real);
  };
  const menos = boton("−", "chico paso", () => { dicho--; pintar(); }, "Decir uno menos");
  const principal = boton("", "fuerte", () => { const n = dicho; clave = null; enviar({ t: tipo, n }); });
  const mas = boton("+", "chico paso", () => { dicho++; pintar(); }, "Decir uno más");
  caja.appendChild(nota);
  pintar();
  fila.appendChild(caja);
}
