// Tagesabschluss – serverseitige Prüfung von Fotos und Datensätzen.
// Fehlermeldungen sind für die Oberfläche bestimmt (Deutsch, ohne technische Details).

import { istIsoDatum, heuteInBerlin } from './bon.js';

/* --------------------------------------------------------------- Fotos */

export const MAX_FOTO_BYTES = 3 * 1024 * 1024;          // nach dem Verkleinern im Browser deutlich kleiner
export const MAX_ANFRAGE_BYTES = 4_400_000;             // Vercel-Grenze für Anfragen: 4,5 MB

/**
 * Bilddatei anhand ihres Inhalts prüfen (nicht anhand von Dateiname/Typangabe).
 * Erlaubt: JPEG, PNG, WebP – vollständig, mit plausiblen Abmessungen.
 * Rückgabe { ok: true, mime, breite, hoehe } oder { ok: false, meldung }.
 */
export function pruefeFoto(puffer) {
  if (!Buffer.isBuffer(puffer) || puffer.length === 0) return { ok: false, meldung: 'Es wurde kein Foto übertragen.' };
  if (puffer.length > MAX_FOTO_BYTES) return { ok: false, meldung: 'Die Datei ist zu groß (höchstens 3 MB nach dem Verkleinern).' };
  const art = bildArt(puffer);
  if (!art) return { ok: false, meldung: 'Das hochgeladene Dateiformat wird nicht unterstützt. Bitte ein Foto (JPEG oder PNG) wählen.' };
  const masse = art.masse(puffer);
  if (!masse) return { ok: false, meldung: 'Die Datei ist beschädigt oder kein vollständiges Bild.' };
  const { breite, hoehe } = masse;
  if (breite < 200 || hoehe < 200) return { ok: false, meldung: 'Das Foto ist zu klein, um den Bon zu lesen.' };
  if (breite > 10000 || hoehe > 10000) return { ok: false, meldung: 'Das Foto ist zu groß.' };
  return { ok: true, mime: art.mime, breite, hoehe };
}

function bildArt(b) {
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', masse: jpegMasse };
  if (b.length > 24 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', masse: pngMasse };
  if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', masse: webpMasse };
  return null;
}

function jpegMasse(b) {
  // Ende-Marker (FF D9) muss vorhanden sein – sonst abgeschnitten
  let ende = b.length - 1;
  while (ende > 2 && b[ende] === 0x00) ende--;          // manche Kameras füllen mit Nullen auf
  if (!(b[ende - 1] === 0xff && b[ende] === 0xd9)) return null;
  let i = 2, masse = null;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) { i++; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) break;     // Bilddaten beginnen
    const laenge = b.readUInt16BE(i + 2);
    if (laenge < 2 || i + 2 + laenge > b.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (laenge < 7) return null;
      masse = { hoehe: b.readUInt16BE(i + 5), breite: b.readUInt16BE(i + 7) };
    }
    i += 2 + laenge;
  }
  return masse && masse.breite > 0 && masse.hoehe > 0 ? masse : null;
}

function pngMasse(b) {
  if (b.toString('ascii', 12, 16) !== 'IHDR') return null;
  if (b.length < 45 || b.toString('ascii', b.length - 8, b.length - 4) !== 'IEND') return null;   // vollständig?
  return { breite: b.readUInt32BE(16), hoehe: b.readUInt32BE(20) };
}

function webpMasse(b) {
  if (b.readUInt32LE(4) + 8 > b.length) return null;                                              // abgeschnitten
  const art = b.toString('ascii', 12, 16);
  if (art === 'VP8 ' && b.length >= 30) return { breite: b.readUInt16LE(26) & 0x3fff, hoehe: b.readUInt16LE(28) & 0x3fff };
  if (art === 'VP8L' && b.length >= 25) {
    const bits = b.readUInt32LE(21);
    return { breite: (bits & 0x3fff) + 1, hoehe: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (art === 'VP8X' && b.length >= 30) return { breite: 1 + b.readUIntLE(24, 3), hoehe: 1 + b.readUIntLE(27, 3) };
  return null;
}

/** Base64 (ohne data:-Präfix) → Buffer, nur gültige Zeichen */
export function base64ZuPuffer(text) {
  if (typeof text !== 'string') return null;
  const t = text.replace(/^data:[^,]*,/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(t)) return null;
  return Buffer.from(t, 'base64');
}

/* ----------------------------------------------------------- Datensatz */

/** Pflicht-Geldfelder (Kassendifferenz wird laut Vorgabe immer von Hand abgefragt,
 *  Barkassenbestand = „Gezählter Bargeldbestand“ vom Bon) */
const PFLICHT = {
  umsatz7: '7 % Umsatz',
  umsatz19: '19 % Umsatz',
  umsatzBar: 'Umsatz bar',
  bargeldEntfernt: 'Bargeld entfernt',
  kassendifferenz: 'Kassendifferenz',
  barkassenbestand: 'Barkassenbestand',
};
const FREIWILLIG = {
  barausgabe: 'Barausgabe',
  bankeinzahlung: 'Bankeinzahlung',
};
const NICHT_NEGATIV = new Set(['umsatz7', 'umsatz19', 'umsatzBar', 'barausgabe', 'bankeinzahlung', 'barkassenbestand']);
const STATUS_WERTE = new Set(['sicher', 'pruefen', 'fehlt', 'manuell']);

function geldwert(wert, name, fehlerliste, feld, pflicht) {
  if (wert === null || wert === undefined || wert === '') {
    if (pflicht) fehlerliste.push({ feld, meldung: feld === 'kassendifferenz' ? 'Bitte gib die Kassendifferenz ein.' : `Bitte gib den Wert für „${name}“ ein.` });
    return null;
  }
  if (typeof wert !== 'number' || !Number.isFinite(wert)) { fehlerliste.push({ feld, meldung: `„${name}“ ist keine gültige Zahl.` }); return null; }
  const cent = Math.round(wert * 100);
  if (Math.abs(wert * 100 - cent) > 1e-6) { fehlerliste.push({ feld, meldung: `„${name}“ darf höchstens zwei Nachkommastellen haben.` }); return null; }
  if (Math.abs(cent) > 100_000_000) { fehlerliste.push({ feld, meldung: `„${name}“ ist unplausibel hoch.` }); return null; }
  if (cent < 0 && NICHT_NEGATIV.has(feld)) { fehlerliste.push({ feld, meldung: `„${name}“ darf nicht negativ sein.` }); return null; }
  return (cent / 100) || 0;   // ohne „-0“
}

/**
 * Eingabe aus der Prüfansicht prüfen und in einen sauberen Datensatz überführen.
 * Rückgabe { ok, fehler: [{ feld, meldung }], eintrag }
 */
export function pruefeEintrag(eingabe, { heute = heuteInBerlin() } = {}) {
  const e = eingabe && typeof eingabe === 'object' ? eingabe : {};
  const fehlerliste = [];
  const eintrag = {};

  if (!istIsoDatum(e.datum)) fehlerliste.push({ feld: 'datum', meldung: 'Bitte gib ein gültiges Datum ein.' });
  else if (e.datum > heute) fehlerliste.push({ feld: 'datum', meldung: 'Das Datum liegt in der Zukunft.' });
  else eintrag.datum = e.datum;

  for (const [feld, name] of Object.entries(PFLICHT)) eintrag[feld] = geldwert(e[feld], name, fehlerliste, feld, true);
  // „Bargeld entfernt“ ist immer eine Entnahme und wird einheitlich als Minusbetrag gespeichert (siehe bon.js)
  if (typeof eintrag.bargeldEntfernt === 'number') eintrag.bargeldEntfernt = -Math.abs(eintrag.bargeldEntfernt) || 0;
  for (const [feld, name] of Object.entries(FREIWILLIG)) eintrag[feld] = geldwert(e[feld], name, fehlerliste, feld, false);

  let bemerkung = typeof e.bemerkung === 'string' ? e.bemerkung : '';
  if (e.bemerkung !== undefined && e.bemerkung !== null && typeof e.bemerkung !== 'string') fehlerliste.push({ feld: 'bemerkung', meldung: 'Die Bemerkung ist ungültig.' });
  bemerkung = bemerkung.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (bemerkung.length > 500) fehlerliste.push({ feld: 'bemerkung', meldung: 'Die Bemerkung ist zu lang (höchstens 500 Zeichen).' });
  eintrag.bemerkung = bemerkung;

  // Herkunft der Werte (automatisch erkannt / von Hand) – nur bekannte Felder und Werte
  const erkennung = {};
  if (e.erkennung && typeof e.erkennung === 'object') {
    for (const feld of ['datum', 'umsatz19', 'umsatz7', 'umsatzBar', 'bargeldEntfernt', 'barkassenbestand']) {
      if (STATUS_WERTE.has(e.erkennung[feld])) erkennung[feld] = e.erkennung[feld];
    }
  }
  eintrag.erkennung = erkennung;

  return { ok: fehlerliste.length === 0, fehler: fehlerliste, eintrag };
}
