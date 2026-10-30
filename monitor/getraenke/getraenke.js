// Monitor 3: ruhige Bildfolge in der linken Spalte – alle 8 Sekunden langsam (1,5 s) zum nächsten Foto
// überblenden. Sonst bewegt sich auf dieser Seite nichts. „Kleines Bistro“ kommt aus der Verwaltung von
// Monitor 4 (modus.js) und schaltet auf die zweispaltige, reduzierte Karte um.
import { diashow } from '/monitor/diashow.js';
import { beobachteModus } from '/monitor/modus.js';

diashow(document.getElementById('diashow'), 8);
diashow(document.getElementById('diashowKlein'), 8);

beobachteModus(klein => {
  document.getElementById('normal').hidden = klein;
  document.getElementById('klein').hidden = !klein;
});
