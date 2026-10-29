// Monitor 4 – Speicher für die Auswahl „Heute bei uns“ (nur serverseitig).
//
// Eigene, klar getrennte Datei im privaten Vercel-Blob-Store des Projekts:
//
//   monitore/specials.json   { format: 2, aktiv: { <id>: true|false }, frei: { <id>: Text }, geaendert: ISO-Zeit }
//
// (format 1 hatte noch kein „frei“ – wird weiter gelesen, die freien Kacheln sind dann leer und aus.)
//
// Sonst nichts – kein Zugriff auf tagesabschluss/… und keinerlei Verbindung zu den Daten des
// Abholmonitors (der liegt in Firebase und wird hier nie angesprochen).
//
// Zwei Geräte gleichzeitig: Die Verwaltung schickt den Stand (ETag) mit, den sie geladen hat.
// Geschrieben wird nur, wenn die Datei seitdem unverändert ist (ifMatch) – sonst Hinweis statt
// stillem Überschreiben.

import { get, put, BlobError, BlobPreconditionFailedError } from '@vercel/blob';

process.env.VERCEL_BLOB_RETRIES ??= '2';

const PFAD = 'monitore/specials.json';
/** Cache-Tag der öffentlichen Antwort /api/monitore/specials/ (wird beim Speichern gelöscht) */
export const CACHE_TAG = 'monitor-specials';

export class SpeicherFehler extends Error {
  constructor(meldung, status, ursache) { super(meldung); this.status = status; this.ursache = ursache; }
}

export const istEingerichtet = () => typeof process.env.BLOB_READ_WRITE_TOKEN === 'string' && process.env.BLOB_READ_WRITE_TOKEN.trim() !== '';

function alsSpeicherFehler(f) {
  if (f instanceof SpeicherFehler) return f;
  const name = (f && f.constructor && f.constructor.name) || 'Fehler';
  const gesperrt = /StoreSuspended|StoreNotFound|AccessError|RateLimited|ServiceNotAvailable/.test(name);
  return new SpeicherFehler(gesperrt ? 'Der Speicher ist gerade nicht erreichbar.' : 'Der Speicher hat die Anfrage abgelehnt.', gesperrt ? 503 : 502, name);
}

/** → { daten: {…} | null (noch nie gespeichert), stand: ETag | null } */
export async function liesSpecials() {
  if (!istEingerichtet()) throw new SpeicherFehler('Der Speicher ist noch nicht eingerichtet.', 503, 'nicht_eingerichtet');
  let r;
  try { r = await get(PFAD, { access: 'private', useCache: false }); } catch (f) { throw alsSpeicherFehler(f); }
  if (!r) return { daten: null, stand: null };
  if (r.statusCode !== 200 || !r.stream) throw new SpeicherFehler('Die Auswahl konnte nicht gelesen werden.', 502, 'Lesen');
  let daten;
  try { daten = JSON.parse(await new Response(r.stream).text()); } catch { daten = null; }
  if (!daten || typeof daten !== 'object' || !daten.aktiv || typeof daten.aktiv !== 'object' || Array.isArray(daten.aktiv)) {
    throw new SpeicherFehler('Die gespeicherte Auswahl ist beschädigt.', 500, 'Format');
  }
  return { daten, stand: r.blob.etag || null };
}

/** neuer Stand (ETag) = geschrieben, null = inzwischen von einem anderen Gerät geändert */
export async function schreibeSpecials(daten, stand) {
  try {
    const r = await put(PFAD, JSON.stringify(daten), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: stand !== null,
      ...(stand ? { ifMatch: stand } : {}),
      cacheControlMaxAge: 60,
    });
    return r.etag || '';
  } catch (f) {
    if (f instanceof BlobPreconditionFailedError) return null;
    if (stand === null && f instanceof BlobError && /exist/i.test(f.message || '')) return null;
    throw alsSpeicherFehler(f);
  }
}
