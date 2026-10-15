// Tagesabschluss – kleine Hilfen, die mehrere Endpunkte brauchen.

import { fehler } from './antwort.js';
import { SpeicherFehler, istEingerichtet as speicherEingerichtet } from './speicher.js';

export const DATUM_MUSTER = /^\d{4}-\d{2}-\d{2}$/;

/** Datensatz für den Browser: ohne interne Kennungen, Foto nur als Ja/Nein */
export function fuerAnzeige(e) {
  if (!e || typeof e !== 'object') return null;
  const { foto, ...rest } = e;
  return { ...rest, hatFoto: Boolean(foto && foto.pfad) };
}

export function speicherFehlt() {
  return speicherEingerichtet() ? null
    : fehler(503, 'Der Speicher für die Tagesabschlüsse ist noch nicht eingerichtet.', { code: 'speicher_fehlt' });
}

/** Unerwartete Fehler: nur ein Kennwort ins Protokoll, keine Finanzdaten */
export function unerwartet(f, wo) {
  console.error(`[tagesabschluss] ${wo}: ${f && f.name ? f.name : 'Fehler'}${f && f.ursache ? ' ' + f.ursache : ''}${f && f.status ? ' ' + f.status : ''}`);
  if (f instanceof SpeicherFehler) {
    if (f.ursache === 'Format') return fehler(500, 'Die gespeicherten Daten sind beschädigt. Bitte nichts weiter speichern und Bescheid geben.', { code: 'speicher_format' });
    return fehler(f.status === 503 ? 503 : 502, f.status === 503
      ? 'Der Speicher ist gerade nicht erreichbar. Bitte später erneut versuchen.'
      : 'Die Daten konnten gerade nicht gespeichert oder geladen werden. Bitte erneut versuchen.', { code: 'speicher' });
  }
  return fehler(500, 'Es ist ein Fehler aufgetreten. Bitte erneut versuchen.');
}

/** öffentliche Adresse dieser Seite (für Links in der Excel-Datei) */
export function eigeneAdresse(request) {
  const host = request.headers.get('x-forwarded-host');
  if (host) return `${request.headers.get('x-forwarded-proto') || 'https'}://${host}`;
  return new URL(request.url).origin;
}
