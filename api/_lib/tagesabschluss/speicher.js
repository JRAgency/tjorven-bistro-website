// Tagesabschluss – dauerhafter Speicher in der Firebase Realtime Database (nur serverseitig).
//
// Zugriff über die REST-Schnittstelle mit einem Dienstkonto (Umgebungsvariable
// FIREBASE_SERVICE_ACCOUNT = Inhalt der JSON-Schlüsseldatei aus der Firebase-Konsole).
// Alles liegt unter /tagesabschluss – getrennt vom Abholmonitor (/orders), der hier nie
// gelesen oder geschrieben wird. Die Datenbankregeln geben /tagesabschluss für Browser
// nicht frei (geprüft: unangemeldeter Lesezugriff → 401 „Permission denied“).
//
//   /tagesabschluss/eintraege/{JJJJ-MM-TT}   ein Datensatz je Tag (Schlüssel = Datum → keine Dubletten)
//   /tagesabschluss/fotos/{uuid}             Foto des Bons (Base64-JPEG), nur über /api/tagesabschluss/foto
//   /tagesabschluss/sicherheit/anmeldung/…   Zähler für Fehlversuche bei der Anmeldung

import crypto from 'node:crypto';

const STANDARD_DATENBANK = 'https://abholmonitor-default-rtdb.europe-west1.firebasedatabase.app';
const WURZEL = 'tagesabschluss';
const SCOPES = 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email';

export class SpeicherFehler extends Error {
  constructor(meldung, status) { super(meldung); this.status = status; }
}

let kontoCache = { roh: undefined, konto: null };
function dienstkonto() {
  const roh = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (roh === kontoCache.roh) return kontoCache.konto;
  let konto = null;
  if (typeof roh === 'string' && roh.trim()) {
    try {
      const t = roh.trim();
      const json = JSON.parse(t.startsWith('{') ? t : Buffer.from(t, 'base64').toString('utf8'));
      if (json.client_email && json.private_key) {
        konto = { email: json.client_email, schluessel: json.private_key.replace(/\\n/g, '\n'), tokenUri: json.token_uri || 'https://oauth2.googleapis.com/token' };
      }
    } catch { konto = null; }
  }
  kontoCache = { roh, konto };
  return konto;
}

export const istEingerichtet = () => dienstkonto() !== null;

function datenbankUrl() {
  const url = (process.env.TAGESABSCHLUSS_DATABASE_URL || STANDARD_DATENBANK).replace(/\/+$/, '');
  return url;
}

/* ------------------------------------------------ OAuth-Zugriffstoken */

const b64url = buf => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
let tokenCache = { token: null, gueltigBis: 0, email: null };

async function zugriffstoken() {
  const konto = dienstkonto();
  if (!konto) throw new SpeicherFehler('Der Speicher ist noch nicht eingerichtet.', 503);
  const jetzt = Math.floor(Date.now() / 1000);
  if (tokenCache.token && tokenCache.email === konto.email && tokenCache.gueltigBis - 120 > jetzt) return tokenCache.token;
  const kopf = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const inhalt = b64url(JSON.stringify({ iss: konto.email, scope: SCOPES, aud: konto.tokenUri, iat: jetzt, exp: jetzt + 3600 }));
  const signatur = b64url(crypto.sign('RSA-SHA256', Buffer.from(`${kopf}.${inhalt}`), konto.schluessel));
  const antwort = await fetch(konto.tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${kopf}.${inhalt}.${signatur}` }),
  });
  if (!antwort.ok) throw new SpeicherFehler('Anmeldung beim Speicher fehlgeschlagen.', 503);
  const daten = await antwort.json();
  tokenCache = { token: daten.access_token, gueltigBis: jetzt + (Number(daten.expires_in) || 3600), email: konto.email };
  return tokenCache.token;
}

/* ------------------------------------------------------ REST-Zugriff */

const PFAD_TEIL = /^[A-Za-z0-9_-]+$/;

async function anfrage(methode, teile, { daten, wennEtag, etagLesen } = {}) {
  if (!teile.every(t => PFAD_TEIL.test(t))) throw new SpeicherFehler('Ungültiger Speicherpfad.', 400);
  const token = await zugriffstoken();
  const kopf = { Authorization: `Bearer ${token}` };
  if (daten !== undefined) kopf['Content-Type'] = 'application/json';
  if (wennEtag) kopf['if-match'] = wennEtag;
  if (etagLesen) kopf['X-Firebase-ETag'] = 'true';
  const antwort = await fetch(`${datenbankUrl()}/${[WURZEL, ...teile].join('/')}.json`, {
    method: methode, headers: kopf, body: daten === undefined ? undefined : JSON.stringify(daten),
  });
  const textInhalt = await antwort.text();
  let json = null;
  try { json = textInhalt ? JSON.parse(textInhalt) : null; } catch { json = null; }
  if (antwort.status === 412) return { konflikt: true, daten: json, etag: antwort.headers.get('etag') };
  if (!antwort.ok) throw new SpeicherFehler('Der Speicher hat die Anfrage abgelehnt.', antwort.status === 401 || antwort.status === 403 ? 503 : 502);
  return { konflikt: false, daten: json, etag: antwort.headers.get('etag') };
}

/* ------------------------------------------------------ Tagesdatensätze */

export async function liesEintraege() {
  const { daten } = await anfrage('GET', ['eintraege']);
  const liste = daten && typeof daten === 'object' ? Object.values(daten).filter(e => e && typeof e === 'object') : [];
  return liste.sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0));   // neuestes Datum zuerst
}

/** Datensatz eines Tages samt ETag (für bedingtes Schreiben) */
export async function liesEintrag(datum) {
  const { daten, etag } = await anfrage('GET', ['eintraege', datum], { etagLesen: true });
  return { eintrag: daten, etag };
}

/**
 * Datensatz schreiben – nur wenn der Stand noch dem erwarteten ETag entspricht.
 * Neuer Tag: etag 'null_etag' (Firebase-Kennung für „noch nichts vorhanden“).
 * Rückgabe { ok: true } oder { ok: false, aktuell } bei zwischenzeitlicher Änderung.
 */
export async function schreibeEintrag(datum, eintrag, etag) {
  const r = await anfrage('PUT', ['eintraege', datum], { daten: eintrag, wennEtag: etag });
  return r.konflikt ? { ok: false, aktuell: r.daten } : { ok: true };
}

/* ------------------------------------------------------------- Fotos */

export async function speichereFoto(id, foto) { await anfrage('PUT', ['fotos', id], { daten: foto }); }
export async function liesFoto(id) { return (await anfrage('GET', ['fotos', id])).daten; }
export async function loescheFoto(id) { await anfrage('DELETE', ['fotos', id]); }

/* ------------------------------------------- Zähler für Anmeldeversuche */

export async function liesZaehler(schluessel) { return (await anfrage('GET', ['sicherheit', 'anmeldung', schluessel])).daten; }
export async function schreibeZaehler(schluessel, wert) {
  if (wert === null) await anfrage('DELETE', ['sicherheit', 'anmeldung', schluessel]);
  else await anfrage('PUT', ['sicherheit', 'anmeldung', schluessel], { daten: wert });
}
