// Tagesabschluss – Passwort, Sitzung und Schutz gegen wiederholte Fehlversuche.
//
// Umgebungsvariablen:
//   TAGESABSCHLUSS_PASSWORD        das Passwort (steht nirgends im Code oder im Browser)
//   TAGESABSCHLUSS_SESSION_SECRET  zufälliger Schlüssel (mind. 32 Zeichen) zum Signieren der Sitzung
//
// Sitzung = signiertes Cookie „__Host-tagesabschluss“ (HttpOnly, Secure, SameSite=Strict,
// Path=/, 12 Stunden). Der Signaturschlüssel hängt auch vom Passwort ab: Wird das Passwort
// geändert, sind alle bestehenden Sitzungen sofort ungültig.

import crypto from 'node:crypto';
import { fehler, kekse } from './antwort.js';

const KEKS = '__Host-tagesabschluss';
export const SITZUNG_SEKUNDEN = 12 * 60 * 60;

function konfiguration() {
  const passwort = process.env.TAGESABSCHLUSS_PASSWORD;
  const geheimnis = process.env.TAGESABSCHLUSS_SESSION_SECRET;
  const ok = typeof passwort === 'string' && passwort.length > 0 && typeof geheimnis === 'string' && geheimnis.length >= 32;
  return ok ? { passwort, geheimnis } : null;
}

export const istEingerichtet = () => konfiguration() !== null;

const sha256 = t => crypto.createHash('sha256').update(String(t), 'utf8').digest();
const b64url = buf => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

function signierSchluessel(k) {
  return crypto.createHmac('sha256', k.geheimnis).update('tagesabschluss-sitzung-v1|').update(sha256(k.passwort)).digest();
}

export function passwortStimmt(eingabe) {
  const k = konfiguration();
  if (!k || typeof eingabe !== 'string') return false;
  return crypto.timingSafeEqual(sha256(eingabe), sha256(k.passwort));
}

export function neueSitzung() {
  const k = konfiguration();
  const ablauf = Math.floor(Date.now() / 1000) + SITZUNG_SEKUNDEN;
  const inhalt = `v1.${ablauf}.${b64url(crypto.randomBytes(18))}`;
  const sig = b64url(crypto.createHmac('sha256', signierSchluessel(k)).update(inhalt).digest());
  return {
    keks: `${KEKS}=${inhalt}.${sig}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SITZUNG_SEKUNDEN}`,
    ablauf,
  };
}

export const abmeldeKeks = () => `${KEKS}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

/** gültige Sitzung → { ablauf }, sonst null */
export function pruefeSitzung(request) {
  const k = konfiguration();
  if (!k) return null;
  const wert = kekse(request)[KEKS];
  if (!wert) return null;
  const teile = wert.split('.');
  if (teile.length !== 4 || teile[0] !== 'v1') return null;
  const inhalt = teile.slice(0, 3).join('.');
  const soll = crypto.createHmac('sha256', signierSchluessel(k)).update(inhalt).digest();
  let ist;
  try { ist = Buffer.from(teile[3].replace(/-/g, '+').replace(/_/g, '/'), 'base64'); } catch { return null; }
  if (ist.length !== soll.length || !crypto.timingSafeEqual(ist, soll)) return null;
  const ablauf = Number(teile[1]);
  if (!Number.isInteger(ablauf) || ablauf <= Math.floor(Date.now() / 1000)) return null;
  return { ablauf };
}

/** Für geschützte Endpunkte: null = angemeldet, sonst fertige Fehlerantwort */
export function brauchtSitzung(request) {
  if (!istEingerichtet()) return fehler(503, 'Der Tagesabschluss ist noch nicht eingerichtet.', { code: 'nicht_eingerichtet' });
  if (!pruefeSitzung(request)) return fehler(401, 'Deine Sitzung ist abgelaufen. Bitte erneut anmelden.', { code: 'sitzung' });
  return null;
}

/* ---------------------------------------------------------------------------
   Fehlversuche: höchstens 5 je Gerät/IP und 30 insgesamt in 15 Minuten, danach Sperre bis
   zum Ende des Zeitfensters, dazu eine Wartezeit nach jedem Fehlversuch (anmelden.js).
   Gezählt wird im Arbeitsspeicher der Server-Instanz (Vercel verwendet Instanzen wieder) –
   bewusst NICHT im Blob-Speicher: Jeder Schreibvorgang dort zählt gegen das Monatskontingent,
   ein Angreifer könnte es mit Fehlversuchen sonst gezielt aufbrauchen. */

const FENSTER_MS = 15 * 60 * 1000;
const MAX_JE_IP = 5;
const MAX_GESAMT = 30;
const zaehler = new Map();

function ipVon(request) {
  const h = request.headers;
  const ip = (h.get('x-real-ip') || h.get('x-forwarded-for') || '').split(',')[0].trim();
  return ip || 'unbekannt';
}

function zaehlerSchluessel(request) {
  const k = konfiguration();
  return b64url(crypto.createHmac('sha256', k.geheimnis).update('ip|' + ipVon(request)).digest()).slice(0, 32);
}

function aktuell(schluessel) {
  const z = zaehler.get(schluessel);
  if (z && Date.now() - z.seit < FENSTER_MS) return z;
  zaehler.delete(schluessel);
  return null;
}

function aufraeumen() {
  if (zaehler.size < 500) return;
  for (const s of [...zaehler.keys()]) aktuell(s);
}

/** Sperre prüfen → null oder verbleibende Minuten */
export function anmeldungGesperrt(request) {
  const ip = aktuell(zaehlerSchluessel(request)), alle = aktuell('_alle');
  for (const z of [ip && ip.anzahl >= MAX_JE_IP ? ip : null, alle && alle.anzahl >= MAX_GESAMT ? alle : null]) {
    if (z) return Math.max(1, Math.ceil((z.seit + FENSTER_MS - Date.now()) / 60000));
  }
  return null;
}

export function fehlversuchMerken(request) {
  aufraeumen();
  for (const s of [zaehlerSchluessel(request), '_alle']) {
    const z = aktuell(s);
    zaehler.set(s, z ? { anzahl: z.anzahl + 1, seit: z.seit } : { anzahl: 1, seit: Date.now() });
  }
}

export function fehlversucheLoeschen(request) { zaehler.delete(zaehlerSchluessel(request)); }
