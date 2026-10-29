// Monitor 2: Lasagne-Menüeintrag und Lasagne-Foto gemeinsam ein-/ausblenden.
// Eine einzige Entscheidung (lasagne.js) steuert alle Elemente mit data-nur-mit-lasagne.
// Kein Bildwechsel, keine Animation – geprüft wird nur, ob ein neuer Tag begonnen hat.
import { lasagneHeute } from '/monitor/lasagne.js';

let zuletzt = null;
function anwenden() {
  const { verfuegbar } = lasagneHeute();
  if (verfuegbar === zuletzt) return;
  zuletzt = verfuegbar;
  for (const el of document.querySelectorAll('[data-nur-mit-lasagne]')) el.hidden = !verfuegbar;
  document.getElementById('bilder').classList.toggle('mit-lasagne', verfuegbar);
  document.documentElement.dataset.lasagne = verfuegbar ? 'ja' : 'nein';
}
anwenden();
setInterval(anwenden, 5 * 60 * 1000);   // nach Mitternacht stimmt die Anzeige spätestens 5 Minuten später
