// Monitor 2: baut Bildfolge und Karte aus den gemeinsamen Speisedaten (/daten/speisen.js – dieselben Daten
// wie die Startseite) und blendet Lasagne-Menüeintrag und Lasagne-Foto gemeinsam ein/aus.
// Eine einzige Entscheidung (lasagne.js) steuert alle Elemente mit data-nur-mit-lasagne – an Schultagen
// erscheint die Lasagne also weder in der Karte noch in der Bildfolge.
// Danach wird jeder zweite SICHTBARE Eintrag je Abschnitt fett gesetzt (mit Lasagne: Lasagne ist der
// erste fette Eintrag; ohne Lasagne läuft das Muster ohne Lücke weiter).
// Bildfolge: alle 8 Sekunden langsam zum nächsten Gericht, unter dem Foto der vollständige Name wie in
// der Karte. „Kleines Bistro“ kommt aus der Verwaltung von Monitor 4 (modus.js) und schaltet auf das
// reduzierte Layout um.
import { karte } from '/daten/speisen.js';
import { lasagneHeute } from '/monitor/lasagne.js';
import { diashow, folie, leistenEinpassen } from '/monitor/diashow.js';
import { beobachteModus } from '/monitor/modus.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const nurMitLasagne = (node, e) => { if (e.nurMitLasagne) { node.setAttribute('data-nur-mit-lasagne', ''); node.hidden = true; } return node; };

function aufbauen(klein, rahmenBilder, rahmenKarte) {
  const { gruppen, bildfolge } = karte(klein);
  bildfolge.forEach((e, i) => rahmenBilder.append(nurMitLasagne(folie({
    klasse: `d-${e.id}${i === 0 ? ' aktiv' : ''}`, datei: e.bild.datei, alt: e.bild.alt, fokus: e.bild.fokus, nah: e.bild.nah, name: e.name, preis: e.preis, artikel: e.name,
  }), e)));
  for (const g of gruppen) {
    const abschnitt = el('section', 'gruppe');
    abschnitt.append(el('h2', '', g.titel));
    for (const e of g.eintraege) {
      const zeile = el('div', e.nurMitLasagne ? 'zeile lasagne' : 'zeile');
      const preis = el('span', 'preis', e.preis);
      preis.dataset.artikel = e.name;
      zeile.append(el('span', 'name', e.name), el('span', 'fuell'), preis);
      abschnitt.append(nurMitLasagne(zeile, e));
    }
    rahmenKarte.append(abschnitt);
  }
}

const rahmen = document.getElementById('diashow'), rahmenKlein = document.getElementById('diashowKlein');
aufbauen(false, rahmen, document.getElementById('karte'));
aufbauen(true, rahmenKlein, document.getElementById('karteKlein'));
const bilder = diashow(rahmen, 8);
diashow(rahmenKlein, 8);

function leisten() { leistenEinpassen(rahmen); leistenEinpassen(rahmenKlein); }
if (document.fonts) document.fonts.ready.then(leisten);

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
  leisten();
}
anwenden();
setInterval(anwenden, 5 * 60 * 1000);   // nach Mitternacht stimmt die Anzeige spätestens 5 Minuten später

beobachteModus(klein => {
  document.getElementById('normal').hidden = klein;
  document.getElementById('klein').hidden = !klein;
  leisten();
});
