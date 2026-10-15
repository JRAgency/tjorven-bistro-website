// Tagesabschluss – dauerhafter, privater Speicher in Vercel Blob (nur serverseitig).
//
// Blob-Store „tagesabschluss“ (Zugriff „private“, Region Frankfurt), mit dem Vercel-Projekt
// verbunden. Den Schlüssel BLOB_READ_WRITE_TOKEN legt Vercel beim Verbinden selbst als
// Umgebungsvariable an. Ohne ihn ist nichts lesbar – es gibt keine öffentlichen Adressen;
// Daten und Fotos liefern ausschließlich die angemeldeten API-Funktionen aus.
//
//   tagesabschluss/daten.json             alle Tagesabschlüsse (Schlüssel = Datum → keine Dubletten)
//   tagesabschluss/fotos/{uuid}.{jpg|png|webp}   Originalfoto je Tag
//
// Zwei Geräte gleichzeitig: Jede Änderung liest daten.json samt ETag und schreibt nur, wenn
// die Datei inzwischen unverändert ist (ifMatch). Sonst wird neu gelesen und die Änderung am
// aktuellen Stand erneut geprüft – nichts geht verloren, nichts wird still überschrieben.
//
// Sparsam mit Vorgängen (Hobby-Tarif: 2.000 Schreib- und 10.000 Lesevorgänge im Monat):
// Speichern = 2 Schreibvorgänge (Foto + daten.json), Tabelle oder Excel = 1 Lesevorgang.

import crypto from 'node:crypto';
import { get, put, del, BlobError, BlobPreconditionFailedError } from '@vercel/blob';

// Das SDK wiederholt fehlgeschlagene Anfragen sonst bis zu zehnmal – zu lange für eine Anfrage
process.env.VERCEL_BLOB_RETRIES ??= '2';

const DATEN = 'tagesabschluss/daten.json';
const FOTOS = 'tagesabschluss/fotos/';
const ENDUNG = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const FOTO_PFAD = /^tagesabschluss\/fotos\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

export class SpeicherFehler extends Error {
  constructor(meldung, status, ursache) { super(meldung); this.status = status; this.ursache = ursache; }
}

export const istEingerichtet = () => typeof process.env.BLOB_READ_WRITE_TOKEN === 'string' && process.env.BLOB_READ_WRITE_TOKEN.trim() !== '';

/** Fehler des SDK übersetzen – weiter geht nur der Fehlername, nie ein Inhalt */
function alsSpeicherFehler(f) {
  if (f instanceof SpeicherFehler) return f;
  const name = (f && f.constructor && f.constructor.name) || 'Fehler';
  const gesperrt = /StoreSuspended|StoreNotFound|AccessError|RateLimited|ServiceNotAvailable/.test(name);
  return new SpeicherFehler(gesperrt ? 'Der Speicher ist gerade nicht erreichbar.' : 'Der Speicher hat die Anfrage abgelehnt.', gesperrt ? 503 : 502, name);
}

const warte = ms => new Promise(r => setTimeout(r, ms));

/* ------------------------------------------------------------ daten.json */

async function liesDaten() {
  let r;
  try { r = await get(DATEN, { access: 'private', useCache: false }); } catch (f) { throw alsSpeicherFehler(f); }
  if (!r) return { daten: { format: 1, eintraege: {} }, etag: null };            // noch nie gespeichert
  if (r.statusCode !== 200 || !r.stream) throw new SpeicherFehler('Die Daten konnten nicht gelesen werden.', 502, 'Lesen');
  let daten;
  try { daten = JSON.parse(await new Response(r.stream).text()); } catch { daten = null; }
  // Beschädigte Datei NIE als leer behandeln – sonst würde der nächste Speichervorgang alles überschreiben
  if (!daten || typeof daten !== 'object' || !daten.eintraege || typeof daten.eintraege !== 'object' || Array.isArray(daten.eintraege)) {
    throw new SpeicherFehler('Die gespeicherten Daten sind beschädigt.', 500, 'Format');
  }
  return { daten, etag: r.blob.etag || null };
}

/** true = geschrieben, false = inzwischen von einem anderen Gerät geändert */
async function schreibeDaten(daten, etag) {
  try {
    await put(DATEN, JSON.stringify(daten), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: etag !== null,
      ...(etag ? { ifMatch: etag } : {}),
      cacheControlMaxAge: 60,
    });
    return true;
  } catch (f) {
    if (f instanceof BlobPreconditionFailedError) return false;
    // zwei Geräte legen die Datei gleichzeitig zum allerersten Mal an
    if (etag === null && f instanceof BlobError && /exist/i.test(f.message || '')) return false;
    throw alsSpeicherFehler(f);
  }
}

/** alle Tagesabschlüsse, neuestes Datum zuerst */
export async function liesEintraege() {
  const { daten } = await liesDaten();
  return Object.values(daten.eintraege)
    .filter(e => e && typeof e === 'object' && typeof e.datum === 'string')
    .sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0));
}

/** Tagesabschluss eines Tages oder null */
export async function liesEintrag(datum) {
  const { daten } = await liesDaten();
  return daten.eintraege[datum] || null;
}

/**
 * Änderung sicher schreiben. aendern(eintraege) prüft den AKTUELLEN Stand, ändert ihn direkt
 * und gibt { schreiben: true|false, … } zurück. Hat ein anderes Gerät inzwischen gespeichert,
 * wird neu gelesen und aendern() am neuen Stand erneut aufgerufen.
 */
export async function aendere(aendern) {
  for (let versuch = 0; versuch < 5; versuch++) {
    const { daten, etag } = await liesDaten();
    const ergebnis = aendern(daten.eintraege);
    if (!ergebnis || !ergebnis.schreiben) return ergebnis;
    daten.format = 1;
    if (await schreibeDaten(daten, etag)) return ergebnis;
    await warte(80 + Math.random() * 150 * (versuch + 1));
  }
  throw new SpeicherFehler('Der Speicher ist gerade stark beschäftigt.', 503, 'Konflikt');
}

/* ------------------------------------------------------------- Fotos */

/** Foto ablegen → interner Pfad (zufälliger Name, nicht erratbar) */
export async function speichereFoto(puffer, mime) {
  const pfad = `${FOTOS}${crypto.randomUUID()}.${ENDUNG[mime]}`;
  try {
    await put(pfad, puffer, { access: 'private', contentType: mime, addRandomSuffix: false, allowOverwrite: false, cacheControlMaxAge: 60 });
  } catch (f) { throw alsSpeicherFehler(f); }
  return pfad;
}

/** Foto lesen → ReadableStream oder null */
export async function liesFoto(pfad) {
  if (typeof pfad !== 'string' || !FOTO_PFAD.test(pfad)) return null;
  let r;
  try { r = await get(pfad, { access: 'private' }); } catch (f) { throw alsSpeicherFehler(f); }
  return r && r.statusCode === 200 && r.stream ? r.stream : null;
}

export async function loescheFoto(pfad) {
  if (typeof pfad !== 'string' || !FOTO_PFAD.test(pfad)) return;
  try { await del(pfad); } catch (f) { throw alsSpeicherFehler(f); }
}
