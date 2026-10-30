// Monitor 2: Lasagne-Menüeintrag und Lasagne-Foto gemeinsam ein-/ausblenden.
// Eine einzige Entscheidung (lasagne.js) steuert alle Elemente mit data-nur-mit-lasagne – an Schultagen
// erscheint die Lasagne also weder in der Karte noch in der Bildfolge.
// Danach wird jeder zweite SICHTBARE Eintrag je Abschnitt fett gesetzt (mit Lasagne: Lasagne ist der
// erste fette Eintrag; ohne Lasagne läuft das Muster ohne Lücke weiter).
// Bildfolge: alle 8 Sekunden langsam zum nächsten Gericht. „Kleines Bistro“ kommt aus der Verwaltung
// von Monitor 4 (modus.js) und schaltet auf das reduzierte Layout um.
import { lasagneHeute } from '/monitor/lasagne.js';
import { diashow } from '/monitor/diashow.js';
import { beobachteModus } from '/monitor/modus.js';

const bilder = diashow(document.getElementById('diashow'), 8);

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
  document.documentElement.dataset.lasagne = verfuegbar ? 'ja' : 'nein';
  fettAbwechselnd();
  bilder.pruefen();
}
anwenden();
setInterval(anwenden, 5 * 60 * 1000);   // nach Mitternacht stimmt die Anzeige spätestens 5 Minuten später

beobachteModus(klein => {
  document.getElementById('normal').hidden = klein;
  document.getElementById('klein').hidden = !klein;
});
