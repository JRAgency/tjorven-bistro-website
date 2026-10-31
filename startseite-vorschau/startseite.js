// Neue Startseite (Vorschau) – alle wechselnden Inhalte kommen aus denselben Quellen wie die Monitore:
//   Öffnungsstatus und Zeiten  → /daten/oeffnungszeiten.js (auch Monitor 4, Kachel „Öffnungszeiten“)
//   „Heute zusätzlich für Dich“ → /api/monitore/specials/ (genau der gespeicherte Stand von Monitor 4)
//   „Unsere Speisen“            → /daten/speisen.js + Lasagne-Regel /monitor/lasagne.js (wie Monitor 2)
//   „Unsere Getränke“           → /daten/getraenke.js (wie Monitor 3)
//   „Feiern & Catering“         → /daten/feiern.js (die Feiern auch auf Monitor 4)
// „Kleines Bistro“ aus der Verwaltung gilt auch hier. Alle Texte werden als reiner Text gesetzt (textContent),
// nie als HTML – auch nicht die freien Texte aus der Verwaltung.
import { karte as speisenKarte } from '/daten/speisen.js';
import { karte as getraenkeKarte } from '/daten/getraenke.js';
import { FEIERN } from '/daten/feiern.js';
import { statusJetzt, uebersicht, regelZeilen } from '/daten/oeffnungszeiten.js';
import { lasagneHeute } from '/monitor/lasagne.js';

const API = '/api/monitore/specials/';
const $ = id => document.getElementById(id);
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}
function bild(datei, alt, { pos, lazy = true } = {}) {
  const img = el('img');
  img.src = datei; img.alt = alt || '';
  if (lazy) img.loading = 'lazy';
  img.decoding = 'async';
  if (pos) img.style.objectPosition = pos;
  return img;
}
/** nur eigene Bildadressen (Website-Ordner oder hochgeladene Fotos von /api/monitore/specials/) */
const eigeneAdresse = a => typeof a === 'string' && a.startsWith('/') && !a.startsWith('//');

/* ---------------------------------------------------------------- Öffnungsstatus */
function oeffnung() {
  const { heute, phase, naechste } = statusJetzt();
  const live = $('statusLive');
  const texte = {
    offen: `Jetzt geöffnet – bis ${heute.bis} Uhr`,
    vorher: `Öffnet heute um ${heute.von} Uhr`,
    danach: naechste ? `Für heute geschlossen – ${naechste.morgen ? 'morgen' : naechste.wochentag} ab ${naechste.von} Uhr` : 'Für heute geschlossen',
    zu: naechste ? `${naechste.morgen ? 'Morgen' : naechste.wochentag} wieder ab ${naechste.von} Uhr` : '',
  };
  live.dataset.phase = phase;
  $('statusText').textContent = texte[phase];
  live.hidden = !texte[phase];
  $('heuteTitel').textContent = heute.geoeffnet ? 'Heute geöffnet' : 'Heute geschlossen';
  $('heuteZeit').textContent = heute.geoeffnet ? `${heute.von} – ${heute.bis} Uhr` : (heute.grund || '');
  $('heuteZeit').hidden = !$('heuteZeit').textContent;
  const chips = $('heuteDetails');
  chips.replaceChildren();
  if (heute.geoeffnet) chips.append(el('li', '', `Warme Küche bis ${heute.warmeKuecheBis} Uhr`), el('li', '', `Kalte Getränke, Cookies und Eis bis ${heute.kaltBis} Uhr`));
  $('regel').textContent = regelZeilen().join(' · ');
  for (const ziel of [$('wochenZeiten'), $('fussZeiten')]) {
    ziel.replaceChildren(...uebersicht().map(z => { const r = el('div', 'zeiten__zeile'); r.append(el('span', 'zeiten__tage', z.tage), el('span', 'zeiten__zeit', z.zeit)); return r; }));
  }
}

/* ---------------------------------------------------------------- Heute zusätzlich (Monitor 4) */
function heuteKarte(a) {
  const rot = a.farbe === 'rot';
  const karte = el('article', `tag-karte${rot ? ' tag-karte--rot' : ''}`);
  karte.dataset.id = a.id;
  const mitBild = eigeneAdresse(a.bild);
  if (mitBild) {
    const f = el('div', 'tag-karte__bild');
    f.append(bild(a.bild, a.art === 'frei' ? '' : a.titel, { pos: a.pos }));
    karte.append(f);
  } else karte.classList.add(a.farbe ? 'tag-karte--flaeche' : 'tag-karte--schlicht');   // farbige Fläche nur bei freien Kacheln (Farbe aus der Verwaltung)
  const text = el('div', 'tag-karte__text');
  if (a.art === 'frei') {
    karte.classList.add('tag-karte--freitext');
    for (const z of a.zeilen || []) text.append(z === '' ? el('span', 'tag-karte__leer') : el('p', 'tag-karte__zeile', z));
  } else {
    const kopf = el('div', 'tag-karte__kopf');
    kopf.append(el('h4', 'tag-karte__titel', a.titel));
    if (a.preis) kopf.append(el('span', 'tag-karte__preis', a.preis));
    text.append(kopf);
  }
  karte.append(text);
  return karte;
}

function heute(d) {
  // Feiern stehen dauerhaft im Abschnitt „Feiern & Catering“, die Öffnungszeiten ganz oben – sie werden hier
  // nicht doppelt gezeigt. Alles andere, was auf Monitor 4 eingeschaltet ist, erscheint hier.
  const angebote = (d && Array.isArray(d.angebote) ? d.angebote : []).filter(a => a && (a.art === 'produkt' || a.art === 'frei'));
  const liste = $('heuteListe');
  liste.replaceChildren(...angebote.map(heuteKarte));
  liste.dataset.anzahl = String(angebote.length);
  $('heuteZusatz').hidden = angebote.length === 0;
}

/* ---------------------------------------------------------------- Speisen und Getränke */
function preisZeile(e, mitMenge = false) {
  const z = el('div', 'karte-zeile');
  z.append(el('span', 'karte-zeile__name', e.name), el('span', 'karte-zeile__fuell'));
  if (mitMenge && e.menge) z.append(el('span', 'karte-zeile__menge', e.menge));
  z.append(el('span', 'karte-zeile__preis', e.preis));
  return z;
}

function fotoKarte(e, { freigestellt = false } = {}) {
  const k = el('figure', `foto-karte${freigestellt ? ' foto-karte--freigestellt' : ''}`);
  const f = el('div', 'foto-karte__bild');
  f.append(bild(e.bild.datei, e.bild.alt, { pos: e.bild.fokus }));
  const unter = el('figcaption', 'foto-karte__text');
  unter.append(el('span', 'foto-karte__name', e.name), el('span', 'foto-karte__preis', e.preis));
  k.append(f, unter);
  return k;
}

function speisen(klein) {
  const lasagne = lasagneHeute().verfuegbar;
  const sichtbar = e => e && (!e.nurMitLasagne || lasagne);
  const { gruppen, bildfolge } = speisenKarte(klein);
  const fotos = bildfolge.filter(sichtbar);
  $('speisenBilder').replaceChildren(...fotos.map(e => fotoKarte(e)));
  $('speisenInhalt').classList.toggle('karte-inhalt--wenig', fotos.length <= 2);   // z. B. Kleines Bistro: Foto neben der Karte
  $('speisenListe').replaceChildren(...gruppen.map(g => {
    const spalte = el('div', 'karte-gruppe');
    spalte.append(el('h3', 'karte-gruppe__titel', g.titel));
    for (const e of g.eintraege.filter(sichtbar)) {
      const z = preisZeile(e);
      if (e.nurMitLasagne) {
        const band = el('div', 'karte-band karte-band--lasagne');
        band.append(z);
        if (e.hinweis) band.append(el('p', 'karte-band__hinweis', e.hinweis));
        spalte.append(band);
      } else spalte.append(z);
    }
    return spalte;
  }));
}

function getraenke(klein) {
  const { gruppen, bildfolge } = getraenkeKarte(klein);
  $('getraenkeBilder').replaceChildren(...bildfolge.map(f => fotoKarte(f, { freigestellt: f.freigestellt })));
  const spalten = [];
  for (const g of gruppen) {
    let spalte = g.unterkategorie ? spalten[spalten.length - 1] : null;
    if (!spalte) { spalte = el('div', 'karte-gruppe'); spalten.push(spalte); }
    spalte.append(el(g.unterkategorie ? 'h4' : 'h3', g.unterkategorie ? 'karte-gruppe__unter' : 'karte-gruppe__titel', g.titel));
    g.bloecke.forEach((b, i) => {
      const block = el('div', `karte-block${i > 0 ? (b.abstand === 'gross' ? ' karte-block--luft' : ' karte-block--abstand') : ''}`);
      const ziel = b.hervorhebung ? el('div', `karte-band karte-band--${b.hervorhebung}`) : block;
      ziel.append(...b.eintraege.map(e => preisZeile(e, true)));
      if (ziel !== block) block.append(ziel);
      if (b.zusatz) block.append(el('p', 'karte-zusatz', b.zusatz));
      spalte.append(block);
    });
  }
  $('getraenkeListe').replaceChildren(...spalten);
}

/* ---------------------------------------------------------------- Feiern & Catering */
function feiern() {
  $('feiernListe').replaceChildren(...FEIERN.map(f => {
    const k = el('article', 'feier-karte');
    k.dataset.id = f.id;
    const b = el('div', 'feier-karte__bild');
    b.append(bild(f.bild.datei, f.bild.alt));
    const t = el('div', 'feier-karte__text');
    t.append(el('h3', 'feier-karte__titel', f.titel), el('p', 'feier-karte__unter', f.unter));
    if (f.punkte.length) { const ul = el('ul', 'feier-karte__punkte'); ul.append(...f.punkte.map(p => el('li', '', p))); t.append(ul); }
    const a = el('a', 'feier-karte__link', 'Mehr erfahren');
    a.href = f.link;
    t.append(a);
    k.append(b, t);
    return k;
  }));
}

/* ---------------------------------------------------------------- Ablauf */
let kleinZuletzt = null, schluessel = '';
function karten(klein) {
  const neu = `${klein}/${lasagneHeute().verfuegbar}`;   // neu aufbauen bei anderem Modus oder neuem Lasagne-Tag
  if (neu === schluessel) return;
  schluessel = neu;
  kleinZuletzt = klein;
  speisen(klein);
  getraenke(klein);
  $('kleinHinweisSpeisen').hidden = !klein;
  $('kleinHinweisGetraenke').hidden = !klein;
}

async function laden() {
  try {
    const r = await fetch(API);   // dieselbe, im CDN zwischengespeicherte Antwort wie Monitor 4 (nach dem Speichern sofort neu)
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    heute(d);
    karten(d.kleinesBistro === true);
  } catch {
    if (kleinZuletzt === null) { heute(null); karten(false); }   // Speisen/Getränke trotzdem zeigen
  }
  document.documentElement.dataset.geladen = 'ja';
}

oeffnung();
feiern();
setTimeout(() => { if (kleinZuletzt === null) karten(false); }, 2500);
laden();
setInterval(oeffnung, 60 * 1000);
setInterval(() => { if (!document.hidden) laden(); }, 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { oeffnung(); laden(); } });
