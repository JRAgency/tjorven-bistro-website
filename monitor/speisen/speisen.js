// Monitor 2: Lasagne-Menüeintrag und Lasagne-Kachel gemeinsam ein-/ausblenden.
// Eine einzige Entscheidung (lasagne.js) steuert alle Elemente mit data-nur-mit-lasagne.
// Danach wird jeder zweite SICHTBARE Eintrag je Abschnitt fett gesetzt (mit Lasagne: Lasagne ist der
// erste fette Eintrag; ohne Lasagne läuft das Muster ohne Lücke weiter).
// Kein Bildwechsel, keine Animation – geprüft wird nur, ob ein neuer Tag begonnen hat.
import { lasagneHeute } from '/monitor/lasagne.js';

function fettAbwechselnd() {
  for (const gruppe of document.querySelectorAll('.karte .gruppe')) {
    [...gruppe.querySelectorAll('.zeile')].filter(z => !z.hidden).forEach((z, i) => z.classList.toggle('fett', i % 2 === 1));
  }
}

let zuletzt = null;
function anwenden() {
  const { verfuegbar } = lasagneHeute();
  if (verfuegbar === zuletzt) return;
  zuletzt = verfuegbar;
  for (const el of document.querySelectorAll('[data-nur-mit-lasagne]')) el.hidden = !verfuegbar;
  document.getElementById('bilder').classList.toggle('mit-lasagne', verfuegbar);
  document.documentElement.dataset.lasagne = verfuegbar ? 'ja' : 'nein';
  fettAbwechselnd();
}
anwenden();
setInterval(anwenden, 5 * 60 * 1000);   // nach Mitternacht stimmt die Anzeige spätestens 5 Minuten später
