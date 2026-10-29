// Display-Monitore: die 1920 × 1080-Bühne proportional in das Browserfenster einpassen
// (auf dem 32-Zoll-Monitor = Faktor 1). Nichts wird gescrollt oder abgeschnitten.
(function () {
  function einpassen() {
    const skala = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    document.documentElement.style.setProperty('--skala', String(skala));
  }
  einpassen();
  window.addEventListener('resize', einpassen);
})();
