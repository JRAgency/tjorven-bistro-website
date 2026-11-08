// Monitor 2: baut Bildfolge und Karte aus den gemeinsamen Speisedaten (/daten/speisen.js – dieselben Daten
// wie die Startseite) und blendet Lasagne-Menüeintrag und Lasagne-Foto gemeinsam ein/aus.
// Eine einzige Entscheidung (lasagne.js) steuert alle Elemente mit data-nur-mit-lasagne – an Schultagen
// erscheint die Lasagne also weder in der Karte noch in der Bildfolge.
// Danach wird jeder zweite SICHTBARE Eintrag je Abschnitt fett gesetzt (mit Lasagne: Lasagne ist der
// erste fette Eintrag; ohne Lasagne läuft das Muster ohne Lücke weiter).
// Bildfolge: alle 8 Sekunden langsam zum nächsten Gericht, unter dem Foto der vollständige Name wie in
// der Karte. „Kleines Bistro“ kommt aus der Verwaltung von Monitor 4 (modus.js) und schaltet auf das
// reduzierte Layout um.
// Nach 16 Uhr (tageszeit.js): statt Karte bzw. Kleinem Bistro nur die noch erhältlichen Produkte (NACH16 aus
// /daten/speisen.js, je Produkt in der Verwaltung ein-/ausschaltbar – kommt mit derselben Antwort wie
// „Kleines Bistro“), ab Ladenschluss oder wenn keines eingeschaltet ist das Dankeschön. Geprüft wird alle
// 15 Sekunden; neu aufgebaut wird nur, wenn sich etwas ändert.
import { karte, NACH16 } from '/daten/speisen.js';
import { lasagneHeute } from '/monitor/lasagne.js';
import { diashow, folie, leistenEinpassen } from '/monitor/diashow.js';
import { beobachteModus } from '/monitor/modus.js';
import { ansichtJetzt } from '/monitor/speisen/tageszeit.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const nurMitLasagne = (node, e) => { if (e.nurMitLasagne) { node.setAttribute('data-nur-mit-lasagne', ''); node.hidden = true; } return node; };

/** Toppings unter einem Eintrag (Waffel): erst die kostenlose Wahl („Puderzucker oder Zimt & Zucker“), dann je
 *  Topping mit Aufpreis eine eigene Zeile mit Punktlinie und Preis in der Preisspalte – keine .zeile, zählt also
 *  nicht beim Fett-Muster */
function toppings(t) {
  const box = el('div', 'toppings');
  const wahl = t.inklusive.length > 1 ? `${t.inklusive.slice(0, -1).join(', ')} oder ${t.inklusive.at(-1)}` : t.inklusive.join('');
  box.append(el('p', 'toppings-wahl', wahl));
  for (const name of t.mitAufpreis) {
    const z = el('div', 'topping');
    z.append(el('span', 'name', name), el('span', 'fuell'), el('span', 'preis', t.aufpreis));
    box.append(z);
  }
  return box;
}

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
      if (e.toppings) abschnitt.append(toppings(e.toppings));
    }
    rahmenKarte.append(abschnitt);
  }
}

const rahmen = document.getElementById('diashow'), rahmenKlein = document.getElementById('diashowKlein');
aufbauen(false, rahmen, document.getElementById('karte'));
aufbauen(true, rahmenKlein, document.getElementById('karteKlein'));
const bilder = diashow(rahmen, 8);
diashow(rahmenKlein, 8);

const karten16 = () => document.querySelector('#angebot16 .karten');
function leisten() { leistenEinpassen(rahmen); leistenEinpassen(rahmenKlein); leistenEinpassen(karten16()); }
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

// ── Nach 16 Uhr ───────────────────────────────────────────────────────────────────────────────────────
// Bis zur ersten Antwort gelten alle Produkte als eingeschaltet (wie in der Verwaltung, solange nie gespeichert).
let nach16An = Object.fromEntries(NACH16.map(e => [e.id, true]));
let klein = false;
let zeit = ansichtJetzt();
let gezeichnet = '';

/** Karte eines Produkts: mit Foto wie die Bildfolge (Foto, darunter die grüne Leiste „Name Preis“),
 *  ohne Foto eine grüne Karte mit Name und Preis */
function produktKarte(e) {
  if (e.bild) return folie({ klasse: `p16-${e.id}`, datei: e.bild.datei, alt: e.bild.alt, fokus: e.bild.fokus, nah: e.bild.nah, name: e.name, preis: e.preis, artikel: e.name });
  const fig = el('figure', `dia ohne-foto p16-${e.id}`);
  const t = el('div', 'textkarte');
  const preis = el('span', 't-preis', e.preis);
  preis.dataset.artikel = e.name;
  t.append(el('span', 't-name', e.name), el('span', 't-linie'), preis);
  fig.append(t);
  return fig;
}

function nach16Zeichnen() {
  const produkte = zeit.ansicht === 'nach16' ? NACH16.filter(e => nach16An[e.id] !== false) : [];
  const schluessel = JSON.stringify([zeit, produkte.map(e => e.id)]);
  if (schluessel === gezeichnet) return;
  gezeichnet = schluessel;
  const angebot = document.getElementById('angebot16');
  angebot.hidden = !produkte.length;
  document.getElementById('feierabend').hidden = !!produkte.length;
  angebot.className = 'angebot anzahl-' + produkte.length;
  if (!produkte.length) { angebot.replaceChildren(); return; }
  const einleitung = el('div', 'einleitung');
  einleitung.append(el('h2', '', 'Für den kleinen Genuss danach'),
    el('p', '', `Unsere warme Küche ist für heute beendet. Diese Leckereien bekommst du weiterhin bis ${zeit.bis} Uhr.`));
  const karten = el('div', 'karten');
  karten.append(...produkte.map(produktKarte));
  angebot.replaceChildren(einleitung, karten);
}

/** zeigt Karte, Kleines Bistro oder die Nach-16-Uhr-Fläche (data-ansicht am <html> für Tests und Stil) */
function sichtbar() {
  const karteZeit = zeit.ansicht === 'karte';
  document.getElementById('normal').hidden = !karteZeit || klein;
  document.getElementById('klein').hidden = !karteZeit || !klein;
  document.getElementById('nach16').hidden = karteZeit;
  document.documentElement.dataset.ansicht = zeit.ansicht;
  if (!karteZeit) nach16Zeichnen();
  leisten();
}

function zeitPruefen() {
  const neu = ansichtJetzt();
  if (JSON.stringify(neu) === JSON.stringify(zeit)) return;
  zeit = neu;
  sichtbar();
}
setInterval(zeitPruefen, 15 * 1000);

beobachteModus(k => { klein = k; sichtbar(); }, d => {
  if (!d.nach16 || typeof d.nach16 !== 'object') return;   // ältere Antwort: alles bleibt eingeschaltet
  nach16An = Object.fromEntries(NACH16.map(e => [e.id, d.nach16[e.id] !== false]));
  if (zeit.ansicht !== 'karte') { nach16Zeichnen(); leisten(); }
});
sichtbar();
