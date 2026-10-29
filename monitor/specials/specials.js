// Monitor 4: aktive Angebote laden und alle gleichzeitig zeigen.
// Fragt einmal pro Minute nach (Antwort kommt meist aus dem Vercel-CDN) und baut die Seite nur
// neu, wenn sich die Auswahl geändert hat. Bei einem Fehler bleibt der letzte Stand stehen.

const API = '/api/monitore/specials/';
const angebote = document.getElementById('angebote');
const willkommen = document.getElementById('willkommen');
const titel = document.getElementById('titel');
let stand = null;

function el(tag, klasse, text) {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (text) e.textContent = text;
  return e;
}
const eigenesBild = s => typeof s === 'string' && s.startsWith('/') && !s.startsWith('//');

function karte(a) {
  const k = el('article', 'angebot art-' + (a.art === 'event' ? 'event' : 'produkt') + (eigenesBild(a.bild) ? ' mit-bild' : ' ohne-bild'));
  k.dataset.id = a.id;
  if (eigenesBild(a.bild)) {
    const bild = el('div', 'bild');
    const img = el('img');
    img.src = a.bild;
    img.alt = a.titel;
    if (a.pos) img.style.objectPosition = a.pos;
    if (typeof a.zoom === 'number' && a.zoom > 1 && a.zoom <= 4) img.style.height = a.zoom * 100 + '%';   // nur oberer Bildteil
    bild.append(img);
    k.append(bild);
  }
  const text = el('div', 'text');
  text.append(el('h2', '', a.titel));
  if (a.unter) text.append(el('p', 'unter', a.unter));
  if (Array.isArray(a.punkte) && a.punkte.length) {
    const ul = el('ul', 'punkte');
    for (const p of a.punkte) ul.append(el('li', '', p));
    text.append(ul);
  }
  if (a.qr && eigenesBild(a.qr.bild)) {
    const qr = el('div', 'qr');
    const img = el('img');
    img.src = a.qr.bild;
    img.alt = 'QR-Code: ' + a.qr.text;
    qr.append(img, el('span', 'qr-text', a.qr.text));
    k.append(qr);
  }
  k.append(text);
  return k;
}

// 1, 2, 3, 4 → eigene Aufteilung; 5–6 → 3 × 2; ab 7 → 3 × 3
const aufteilung = n => (n <= 4 ? n : n <= 6 ? 6 : 9);

function zeigen(liste) {
  const leer = liste.length === 0;
  willkommen.hidden = !leer;
  angebote.hidden = leer;
  titel.textContent = leer ? 'Herzlich Willkommen im Tjorven Bistro' : 'Heute bei uns';
  angebote.className = 'angebote n-' + aufteilung(liste.length);
  angebote.replaceChildren(...liste.slice(0, 9).map(karte));
  document.documentElement.dataset.anzahl = String(liste.length);
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

laden();
setInterval(laden, 60 * 1000);
