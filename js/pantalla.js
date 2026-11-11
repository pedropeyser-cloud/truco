// Pantalla completa en la compu (en el celular el juego ya ocupa todo y no se toca).
export const esCompu = () => matchMedia("(pointer: fine)").matches && innerWidth >= 900;

/** Pide pantalla completa. Solo funciona dentro de un toque o clic del jugador. */
export function pantallaCompleta(forzar = false) {
  if ((!forzar && !esCompu()) || document.fullscreenElement || !document.fullscreenEnabled) return;
  document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
}
export function alternarPantalla() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else pantallaCompleta(true);
}
/** Botón para el menú (vacío si el navegador no deja). */
export const botonPantalla = () => (document.fullscreenEnabled
  ? `<button class="b claro" data-pantalla>${document.fullscreenElement ? "Salir de pantalla completa" : "Pantalla completa"}</button>` : "");

// al empezar a jugar desde la compu, se agranda sola
document.addEventListener("click", (e) => {
  if (e.target.closest?.("#btn-crear, #btn-practica, #btn-entrar, #btn-repartir")) pantallaCompleta();
}, true);
