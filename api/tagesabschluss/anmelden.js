// POST /api/tagesabschluss/anmelden – Passwort prüfen, Sitzungs-Cookie setzen.

import { json, fehler, nurMethoden, vonEigenerSeite, fremdeSeite, leseJson } from '../_lib/tagesabschluss/antwort.js';
import * as sitzung from '../_lib/tagesabschluss/sitzung.js';

const warte = ms => new Promise(r => setTimeout(r, ms));

export default {
  async fetch(request) {
    if (request.method !== 'POST') return nurMethoden('POST');
    if (!vonEigenerSeite(request)) return fremdeSeite();
    if (!sitzung.istEingerichtet()) return fehler(503, 'Der Tagesabschluss ist noch nicht eingerichtet.', { code: 'nicht_eingerichtet' });
    let daten;
    try { daten = await leseJson(request, 2000); } catch (f) { return fehler(f.status || 400, f.meldung || 'Die Anfrage ist ungültig.'); }

    const minuten = await sitzung.anmeldungGesperrt(request);
    if (minuten) return fehler(429, `Zu viele Fehlversuche. Bitte in ${minuten} ${minuten === 1 ? 'Minute' : 'Minuten'} erneut versuchen.`, { code: 'gesperrt' });
    if (!sitzung.passwortStimmt(daten.passwort)) {
      await sitzung.fehlversuchMerken(request);
      await warte(700);
      return fehler(401, 'Das Passwort ist falsch.', { code: 'passwort' });
    }
    await sitzung.fehlversucheLoeschen(request);
    const { keks, ablauf } = sitzung.neueSitzung();
    return json({ ok: true, ablauf }, 200, { 'Set-Cookie': keks });
  },
};
