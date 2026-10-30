// Monitor 4: aktive Angebote laden und zeigen.
// Fragt einmal pro Minute nach (Antwort kommt meist aus dem Vercel-CDN) und baut die Seite nur
// neu, wenn sich etwas geändert hat. Bei einem Fehler bleibt der letzte Stand stehen.
// Alle Texte (auch die frei eingegebenen und die Überschrift) werden nur als reiner Text gesetzt (textContent).
//
// Aufteilung nach Anzahl der aktiven Einträge:
//   0      „Herzlich Willkommen“ mit Foto
//   1–3    Kacheln nebeneinander
//   ab 4   zwei Spalten – links eine ruhige Bildfolge (alle 7 s langsam überblenden, die einzige Bewegung
//          auf dieser Seite), rechts eine feste Liste ALLER aktiven Angebote mit Preis.
//          In die Liste kommen nur Produkte (feste und freie Kacheln vom Typ „Produkt“) und Feiern –
//          Freitexte und die Öffnungszeiten nie. Die Bildfolge zeigt alles mit Foto und zusätzlich alles,
//          was nicht in der Liste steht (Freitext, Öffnungszeiten); Produkte ohne Foto stehen nur in der Liste.
//          Steht nichts in der Liste (z. B. nur Freitexte), bleibt es bei Kacheln.
import { wechseln } from '/monitor/diashow.js';

const API = '/api/monitore/specials/';
const DIA_SEKUNDEN = 7;
const STANDARD_TITEL = 'Heute bei uns';
const angebote = document.getElementById('angebote');
const willkommen = document.getElementById('willkommen');
const titel = document.getElementById('titel');
let stand = null;
let diaTimer = null;

function el(tag, klasse, text) {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (text) e.textContent = text;
  return e;
}
const eigenesBild = s => typeof s === 'string' && s.startsWith('/') && !s.startsWith('//');
const text = s => (typeof s === 'string' ? s : '');
const zeilenVon = a => (Array.isArray(a.zeilen) ? a.zeilen.map(text) : []);
const inListe = a => a.art === 'produkt' || a.art === 'event';

function qrBild(qr) {
  const img = el('img');
  img.src = qr.bild;
  img.alt = 'QR-Code: ' + text(qr.text);
  return img;
}

/** Freitext zeilenweise; leere Zeile = kleiner Abstand */
function freiZeilen(ziel, a) {
  for (const z of zeilenVon(a)) ziel.append(z ? el('p', 'frei-zeile', z) : el('div', 'frei-luecke'));
}

/** Kachel mit Foto: Foto füllt die Kachel. Produkt/Feier: Name (+ Preis) im grünen (oder roten) Schild unten.
    Freitext: als eigene, gut lesbare Tafel in Grün oder Rot über dem Foto. */
function fotoKachel(a, k) {
  const img = el('img', 'kachel-foto');
  img.src = a.bild;
  img.alt = a.art === 'frei' ? zeilenVon(a).filter(Boolean).join(' ') : text(a.titel);
  if (a.pos) img.style.objectPosition = a.pos;
  if (typeof a.zoom === 'number' && a.zoom > 1 && a.zoom <= 4) img.style.height = a.zoom * 100 + '%';   // nur oberer Bildteil
  k.append(img);

  if (a.art === 'frei') {
    if (!zeilenVon(a).some(Boolean)) return;   // nur Foto
    const tafel = el('div', 'frei-tafel');
    freiZeilen(tafel, a);
    k.append(tafel);
    return;
  }

  const schild = el('div', 'schild');
  const zeile = el('div', 'titelzeile');
  zeile.append(el('h2', 'k-titel', text(a.titel)));
  if (a.preis) zeile.append(el('span', 'k-preis', text(a.preis)));
  schild.append(zeile);
  if (a.unter) schild.append(el('p', 'unter', text(a.unter)));
  if (Array.isArray(a.punkte) && a.punkte.length) {
    const ul = el('ul', 'punkte');
    for (const p of a.punkte) ul.append(el('li', '', text(p)));
    schild.append(ul);
  }
  if (a.qr && eigenesBild(a.qr.bild)) {
    const qz = el('div', 'qr-zeile');   // nur bei einer einzigen, großen Kachel: QR-Code mit Adresse im Schild
    qz.append(qrBild(a.qr), el('span', 'qr-text', text(a.qr.text)));
    schild.append(qz);
    const badge = el('div', 'qr');      // sonst: weißes Feld oben rechts im Foto
    badge.append(qrBild(a.qr));
    k.append(badge);
  }
  k.append(schild);
}

/** Kachel nur mit Text: Text so groß wie möglich (siehe einpassen) */
function textKachel(a, k) {
  const f = el('div', 'textflaeche');
  if (a.art === 'frei') {
    freiZeilen(f, a);
  } else if (a.art === 'info') {   // Öffnungszeiten: oben groß, darunter klein
    f.classList.add('info');
    zeilenVon(a).forEach((z, i) => f.append(el('p', i === 0 ? 'info-haupt' : 'info-zeile', z)));
    const klein = Array.isArray(a.klein) ? a.klein.map(text) : [];
    if (klein.length) { f.append(el('div', 'info-trenner')); for (const z of klein) f.append(el('p', 'info-klein', z)); }
  } else {
    f.append(el('h2', 'k-titel', text(a.titel)));
    if (a.preis) f.append(el('p', 'k-preis', text(a.preis)));
    if (a.unter) f.append(el('p', 'unter', text(a.unter)));
  }
  k.append(f);
}

function kachel(a) {
  const art = ['event', 'frei', 'info'].includes(a.art) ? a.art : 'produkt';
  const mitBild = eigenesBild(a.bild) && art !== 'info';
  const farbe = a.farbe === 'rot' ? ' farbe-rot' : '';
  const k = el('article', `kachel art-${art} ${mitBild ? 'mit-bild' : 'ohne-bild'}${farbe}`);
  k.dataset.id = text(a.id);
  if (mitBild) fotoKachel(a, k); else textKachel(a, k);
  return k;
}

// Raster nach Anzahl: [Spalten, Zeilen]. Ab 4 Einträgen nur, wenn nichts in die Liste gehört.
function raster(n) {
  if (n <= 3) return [Math.max(n, 1), 1];
  if (n === 4) return [2, 2];
  if (n <= 6) return [3, 2];
  if (n <= 8) return [4, 2];
  if (n === 9) return [3, 3];
  if (n <= 12) return [4, 3];
  if (n <= 15) return [5, 3];
  return [6, Math.ceil(n / 6)];
}

// Schrift einer Fläche so groß wie möglich wählen, ohne dass etwas übersteht (binäre Suche).
function passt(e) {
  if (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1) return false;
  for (const c of e.children) if (c.scrollWidth > c.clientWidth + 1) return false;
  return true;
}
function groesstePassende(e, min, max) {
  let lo = min, hi = max, beste = min;
  while (hi - lo > 0.5) {
    const mitte = (lo + hi) / 2;
    e.style.fontSize = mitte + 'px';
    if (passt(e)) { beste = mitte; lo = mitte; } else hi = mitte;
  }
  e.style.fontSize = Math.floor(beste) + 'px';
  return passt(e);
}

/** Überschrift: eine Zeile, notfalls kleiner (nur die Breite zählt; die Länge ist in der Verwaltung begrenzt) */
function titelEinpassen() {
  titel.style.fontSize = '';
  if (titel.scrollWidth <= titel.clientWidth + 1) return;
  let lo = 24, hi = 78;
  while (hi - lo > 0.5) {
    const mitte = (lo + hi) / 2;
    titel.style.fontSize = mitte + 'px';
    if (titel.scrollWidth <= titel.clientWidth + 1) lo = mitte; else hi = mitte;
  }
  titel.style.fontSize = Math.floor(lo) + 'px';
}

function einpassen() {
  titelEinpassen();

  const stil = getComputedStyle(angebote);
  const maxText = parseFloat(stil.getPropertyValue('--text-max')) || 120;
  for (const f of angebote.querySelectorAll('.textflaeche')) {
    f.classList.remove('umbrechen');
    if (!groesstePassende(f, 16, maxText)) { f.classList.add('umbrechen'); groesstePassende(f, 16, maxText); }   // sehr lange Wörter notfalls trennen
  }
  // Schilder auf Fotos: Größe aus dem Raster (--t), nur verkleinern, falls es nicht passt
  const basis = parseFloat(stil.getPropertyValue('--t')) || 44;
  for (const s of angebote.querySelectorAll('.schild')) {
    s.style.fontSize = basis + 'px';
    if (!passt(s)) groesstePassende(s, basis * 0.5, basis);
  }
  // Freitext-Tafel auf einem Foto: gut lesbar, aber nur so groß, dass das Foto sichtbar bleibt
  for (const t of angebote.querySelectorAll('.frei-tafel')) {
    t.classList.remove('umbrechen');
    if (!groesstePassende(t, 16, basis * 1.25)) { t.classList.add('umbrechen'); groesstePassende(t, 16, basis * 1.25); }
  }
  // rechte Liste: alle Einträge gleich groß, so groß wie möglich; wird sie lang, fallen die Zusatzzeilen weg
  const liste = angebote.querySelector('.preisliste');
  if (liste) {
    const max = parseFloat(stil.getPropertyValue('--liste-max')) || 62;
    liste.classList.remove('knapp');
    groesstePassende(liste, 24, max);
    if (liste.querySelector('.unter') && parseFloat(liste.style.fontSize) < 46) { liste.classList.add('knapp'); groesstePassende(liste, 24, max); }
  }
}

/** Eintrag der rechten Liste: Name ……… Preis (falls vorhanden), darunter klein die Zusatzzeile */
function listenEintrag(a) {
  const e = el('div', 'eintrag');
  e.dataset.id = text(a.id);
  const z = el('div', 'zeile');
  z.append(el('span', 'name', text(a.titel)));
  if (a.preis) z.append(el('span', 'fuell'), el('span', 'preis', text(a.preis)));
  e.append(z);
  if (a.unter) e.append(el('p', 'unter', text(a.unter)));
  return e;
}

function zeigeGeteilt(alle, liste) {
  angebote.className = 'angebote geteilt';
  angebote.style.removeProperty('--spuren');
  angebote.style.removeProperty('--zeilen');
  let auswahl = alle.filter(a => (eigenesBild(a.bild) && a.art !== 'info') || !inListe(a));
  if (!auswahl.length) auswahl = alle;   // nichts mit Foto: alle als Textfolien
  const rahmen = el('div', 'folien');
  const folien = auswahl.map(a => { const k = kachel(a); k.classList.add('dia'); return k; });
  folien[0].classList.add('aktiv');
  rahmen.append(...folien);
  const rechts = el('div', 'preisliste');
  rechts.append(...liste.map(listenEintrag));
  angebote.replaceChildren(rahmen, rechts);
  document.documentElement.dataset.dia = folien[0].dataset.id;
  if (folien.length < 2) return;
  let i = 0;
  diaTimer = setInterval(() => {
    const alt = folien[i];
    i = (i + 1) % folien.length;
    wechseln(rahmen, alt, folien[i]);
    document.documentElement.dataset.dia = folien[i].dataset.id;
  }, DIA_SEKUNDEN * 1000);
}

function zeigeRaster(liste) {
  const [spalten, zeilen] = raster(liste.length);
  angebote.className = 'angebote r-' + spalten + 'x' + zeilen;
  angebote.style.setProperty('--spuren', String(spalten * 2));   // zwei halbe Spalten je Kachel
  angebote.style.setProperty('--zeilen', String(zeilen));
  const karten = liste.map(kachel);
  // unvollständige letzte Reihe mittig setzen (jede Kachel belegt zwei halbe Spalten)
  const rest = liste.length - spalten * (zeilen - 1);
  if (zeilen > 1 && rest > 0 && rest < spalten) karten[spalten * (zeilen - 1)].style.gridColumn = `${spalten - rest + 1} / span 2`;
  angebote.replaceChildren(...karten);
}

function zeigen(d) {
  const liste = d.angebote;
  const leer = liste.length === 0;
  willkommen.hidden = !leer;
  angebote.hidden = leer;
  titel.textContent = leer ? 'Herzlich Willkommen im Tjorven Bistro' : (text(d.ueberschrift).trim() || STANDARD_TITEL);
  clearInterval(diaTimer);
  diaTimer = null;
  delete document.documentElement.dataset.dia;
  document.documentElement.dataset.anzahl = String(liste.length);
  const preisliste = liste.filter(inListe);
  const ansicht = leer ? 'leer' : liste.length >= 4 && preisliste.length ? 'geteilt' : 'raster';
  document.documentElement.dataset.ansicht = ansicht;
  if (ansicht === 'geteilt') zeigeGeteilt(liste, preisliste);
  else if (!leer) zeigeRaster(liste);
  einpassen();
}

async function laden() {
  try {
    // Standard-Cache-Modus: „no-store“ würde „Cache-Control: no-cache“ mitschicken und könnte das
    // CDN umgehen (dann jede Minute ein Blob-Lesevorgang). Der Browser prüft ohnehin jedes Mal neu (max-age=0).
    const r = await fetch(API);
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    if (!d || !Array.isArray(d.angebote)) throw new Error('Format');
    if (d.stand === stand) return;
    stand = d.stand;
    zeigen(d);
  } catch {
    if (stand === null && willkommen.hidden && !angebote.childElementCount) zeigen({ angebote: [] });   // noch nie geladen
  }
}

// Schriftgrößen erst endgültig, wenn die Schrift geladen ist
if (document.fonts) {
  document.fonts.ready.then(einpassen);
  document.fonts.addEventListener('loadingdone', einpassen);
}

laden();
setInterval(laden, 60 * 1000);
