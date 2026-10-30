// Monitor 3: ruhige Bildfolge in der linken Spalte – alle 8 Sekunden langsam (1,5 s) zum nächsten Foto
// überblenden. Sonst bewegt sich auf dieser Seite nichts.
(() => {
  const bilder = [...document.querySelectorAll('#diashow .dia')];
  if (bilder.length < 2) return;
  let i = 0;
  setInterval(() => {
    bilder[i].classList.remove('aktiv');
    i = (i + 1) % bilder.length;
    bilder[i].classList.add('aktiv');
  }, 8000);
})();
