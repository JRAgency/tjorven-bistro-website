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
import * as speicher from './speicher.js';

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
   Fehlversuche: höchstens 5 je Gerät/IP und 30 insgesamt in 15 Minuten, danach
   15 Minuten Sperre. Gezählt wird in der Datenbank (gilt für alle Server-Instanzen);
   ohne eingerichteten Speicher nur im Arbeitsspeicher der jeweiligen Instanz. */

const FENSTER_MS = 15 * 60 * 1000;
const MAX_JE_IP = 5;
const MAX_GESAMT = 30;
const lokal = new Map();

function ipVon(request) {
  const h = request.headers;
  const ip = (h.get('x-real-ip') || h.get('x-forwarded-for') || '').split(',')[0].trim();
  return ip || 'unbekannt';
}

function zaehlerSchluessel(request) {
  const k = konfiguration();
  return b64url(crypto.createHmac('sha256', k.geheimnis).update('ip|' + ipVon(request)).digest()).slice(0, 32);
}

// Ist die Datenbank nicht erreichbar, wird ersatzweise im Arbeitsspeicher gezählt –
// die Anmeldung bleibt dadurch möglich, der Schutz gilt dann je Server-Instanz.
async function lies(schluessel) {
  if (speicher.istEingerichtet()) {
    try { return await speicher.liesZaehler(schluessel); } catch { /* Ersatz unten */ }
  }
  return lokal.get(schluessel) || null;
}
async function schreib(schluessel, wert) {
  if (wert === null) lokal.delete(schluessel); else lokal.set(schluessel, wert);
  if (speicher.istEingerichtet()) {
    try { await speicher.schreibeZaehler(schluessel, wert); } catch { /* Ersatz: Arbeitsspeicher */ }
  }
}
const aktuell = z => (z && typeof z.seit === 'number' && Date.now() - z.seit < FENSTER_MS ? z : null);

/** Sperre prüfen → null oder verbleibende Minuten */
export async function anmeldungGesperrt(request) {
  const [ip, alle] = await Promise.all([lies(zaehlerSchluessel(request)), lies('_alle')]);
  for (const z of [aktuell(ip) && ip.anzahl >= MAX_JE_IP ? ip : null, aktuell(alle) && alle.anzahl >= MAX_GESAMT ? alle : null]) {
    if (z) return Math.max(1, Math.ceil((z.seit + FENSTER_MS - Date.now()) / 60000));
  }
  return null;
}

export async function fehlversuchMerken(request) {
  for (const s of [zaehlerSchluessel(request), '_alle']) {
    const z = aktuell(await lies(s));
    await schreib(s, z ? { anzahl: z.anzahl + 1, seit: z.seit } : { anzahl: 1, seit: Date.now() });
  }
}

export async function fehlversucheLoeschen(request) { await schreib(zaehlerSchluessel(request), null); }
