// Monitor 4: aktive Angebote laden und alle gleichzeitig zeigen.
// Fragt einmal pro Minute nach (Antwort kommt meist aus dem Vercel-CDN) und baut die Seite nur
// neu, wenn sich die Auswahl geändert hat. Bei einem Fehler bleibt der letzte Stand stehen.
// Alle Texte (auch die frei eingegebenen) werden nur als reiner Text gesetzt (textContent).
//
// Sonderfall GENAU 4 Angebote: zwei Spalten – links eine ruhige Bildfolge der vier Angebote (alle 7 s
// langsam überblenden, die einzige Bewegung auf dieser Seite), rechts dieselben vier als feste Liste mit Preis.

const API = '/api/monitore/specials/';
const DIA_SEKUNDEN = 7;
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

function qrBild(qr) {
  const img = el('img');
  img.src = qr.bild;
  img.alt = 'QR-Code: ' + text(qr.text);
  return img;
}

const zeilenVon = a => (Array.isArray(a.zeilen) ? a.zeilen.map(text) : []);

/** Kachel mit Foto: Foto füllt die Kachel, Name (+ Preis) bzw. der freie Text im grünen (oder roten) Schild im Bild */
function fotoKachel(a, k) {
  const img = el('img', 'kachel-foto');
  img.src = a.bild;
  img.alt = a.art === 'frei' ? zeilenVon(a).filter(Boolean).join(' ') : text(a.titel);
  if (a.pos) img.style.objectPosition = a.pos;
  if (typeof a.zoom === 'number' && a.zoom > 1 && a.zoom <= 4) img.style.height = a.zoom * 100 + '%';   // nur oberer Bildteil
  k.append(img);

  if (a.art === 'frei') {   // freie Kachel mit Bild: Text (falls vorhanden) zeilenweise im Schild
    const zeilen = zeilenVon(a);
    if (!zeilen.some(Boolean)) return;
    const schild = el('div', 'schild');
    for (const z of zeilen) schild.append(z ? el('p', 'frei-zeile', z) : el('div', 'frei-luecke'));
    k.append(schild);
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
    for (const z of zeilenVon(a)) f.append(z ? el('p', 'frei-zeile', z) : el('div', 'frei-luecke'));
  } else {
    f.append(el('h2', 'k-titel', text(a.titel)));
    if (a.preis) f.append(el('p', 'k-preis', text(a.preis)));
    if (a.unter) f.append(el('p', 'unter', text(a.unter)));
  }
  k.append(f);
}

function kachel(a) {
  const art = a.art === 'event' ? 'event' : a.art === 'frei' ? 'frei' : 'produkt';
  const mitBild = eigenesBild(a.bild);
  const farbe = art === 'frei' && a.farbe === 'rot' ? ' farbe-rot' : '';
  const k = el('article', `kachel art-${art} ${mitBild ? 'mit-bild' : 'ohne-bild'}${farbe}`);
  k.dataset.id = text(a.id);
  if (mitBild) fotoKachel(a, k); else textKachel(a, k);
  return k;
}

// Raster nach Anzahl: [Spalten, Zeilen]. Mehr als 15 kommt mit dem heutigen Katalog (14) nicht vor,
// würde aber auch gezeigt (6 Spalten) – es wird nie etwas weggelassen.
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

function einpassen() {
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
  // rechte Liste bei genau 4: alle Einträge gleich groß, so groß wie möglich
  const liste = angebote.querySelector('.vier-liste');
  if (liste) groesstePassende(liste, 24, parseFloat(stil.getPropertyValue('--liste-max')) || 64);
}

/** Eintrag der rechten Liste (nur bei genau 4): Name ……… Preis, darunter klein die Zusatzzeile */
function listenEintrag(a) {
  let name = text(a.titel), unter = text(a.unter);
  if (a.art === 'frei') {   // freier Text: erste Zeile als Name, der Rest klein darunter
    const zeilen = zeilenVon(a).filter(Boolean);
    if (!zeilen.length) return null;   // nur Bild, kein Text → steht nur in der Bildfolge
    name = zeilen[0]; unter = zeilen.slice(1).join(' · ');
  }
  const e = el('div', 'eintrag');
  e.dataset.id = text(a.id);
  const z = el('div', 'zeile');
  z.append(el('span', 'name', name));
  if (a.preis) z.append(el('span', 'fuell'), el('span', 'preis', text(a.preis)));
  e.append(z);
  if (unter) e.append(el('p', 'unter', unter));
  return e;
}

function zeigeVier(liste) {
  angebote.className = 'angebote vier';
  angebote.style.removeProperty('--spuren');
  angebote.style.removeProperty('--zeilen');
  const dias = el('div', 'vier-dias');
  const folien = liste.map(a => { const k = kachel(a); k.classList.add('dia'); return k; });
  folien[0].classList.add('aktiv');
  dias.append(...folien);
  const rechts = el('div', 'vier-liste');
  rechts.append(...liste.map(listenEintrag).filter(Boolean));
  angebote.replaceChildren(dias, rechts);
  let i = 0;
  diaTimer = setInterval(() => {
    folien[i].classList.remove('aktiv');
    i = (i + 1) % folien.length;
    folien[i].classList.add('aktiv');
    document.documentElement.dataset.dia = folien[i].dataset.id;
  }, DIA_SEKUNDEN * 1000);
  document.documentElement.dataset.dia = folien[0].dataset.id;
}

function zeigen(liste) {
  const leer = liste.length === 0;
  willkommen.hidden = !leer;
  angebote.hidden = leer;
  titel.textContent = leer ? 'Herzlich Willkommen im Tjorven Bistro' : 'Heute bei uns';
  clearInterval(diaTimer);
  diaTimer = null;
  document.documentElement.dataset.anzahl = String(liste.length);
  if (liste.length === 4) { zeigeVier(liste); einpassen(); return; }
  const [spalten, zeilen] = raster(liste.length);
  angebote.className = 'angebote r-' + spalten + 'x' + zeilen;
  angebote.style.setProperty('--spuren', String(spalten * 2));   // zwei halbe Spalten je Kachel
  angebote.style.setProperty('--zeilen', String(zeilen));
  const karten = liste.map(kachel);
  // unvollständige letzte Reihe mittig setzen (jede Kachel belegt zwei halbe Spalten)
  const rest = liste.length - spalten * (zeilen - 1);
  if (zeilen > 1 && rest > 0 && rest < spalten) karten[spalten * (zeilen - 1)].style.gridColumn = `${spalten - rest + 1} / span 2`;
  angebote.replaceChildren(...karten);
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
    zeigen(d.angebote);
  } catch {
    if (stand === null && willkommen.hidden && !angebote.childElementCount) zeigen([]);   // noch nie geladen
  }
}

// Schriftgrößen erst endgültig, wenn die Schrift geladen ist
if (document.fonts) {
  document.fonts.ready.then(einpassen);
  document.fonts.addEventListener('loadingdone', einpassen);
}

laden();
setInterval(laden, 60 * 1000);
