// /api/tagesabschluss/eintraege
//   GET  – alle gespeicherten Tagesabschlüsse, neuestes Datum zuerst
//   POST – einen geprüften Tagesabschluss speichern (mit Foto). Gibt es das Datum schon,
//          wird NICHT überschrieben, sondern mit 409 und dem bestehenden Eintrag geantwortet.
//          Aktualisieren nur mit ueberschreiben: true UND dem Stand (version) des
//          bestehenden Eintrags, den der Benutzer gesehen hat.

import crypto from 'node:crypto';
import { json, fehler, nurMethoden, vonEigenerSeite, fremdeSeite, leseJson } from '../_lib/tagesabschluss/antwort.js';
import { brauchtSitzung } from '../_lib/tagesabschluss/sitzung.js';
import { pruefeEintrag, pruefeFoto, base64ZuPuffer, MAX_ANFRAGE_BYTES } from '../_lib/tagesabschluss/pruefung.js';
import * as speicher from '../_lib/tagesabschluss/speicher.js';
import { fuerAnzeige, speicherFehlt, unerwartet } from '../_lib/tagesabschluss/gemeinsam.js';

async function liste() {
  const eintraege = await speicher.liesEintraege();
  return json({ eintraege: eintraege.map(fuerAnzeige) });
}

async function speichern(request) {
  if (!vonEigenerSeite(request)) return fremdeSeite();
  let daten;
  try { daten = await leseJson(request, MAX_ANFRAGE_BYTES); } catch (f) { return fehler(f.status || 400, f.meldung || 'Die Anfrage ist ungültig.'); }

  const geprueft = pruefeEintrag(daten.eintrag);
  if (!geprueft.ok) return fehler(422, 'Bitte prüfe die markierten Felder.', { code: 'eingabe', felder: geprueft.fehler });
  const eintrag = geprueft.eintrag;

  const puffer = base64ZuPuffer(daten.bild);
  if (!puffer) return fehler(422, 'Zum Tagesabschluss fehlt das Foto.', { code: 'foto' });
  const foto = pruefeFoto(puffer);
  if (!foto.ok) return fehler(422, foto.meldung, { code: 'foto' });

  const { eintrag: vorhanden, etag } = await speicher.liesEintrag(eintrag.datum);
  if (vorhanden && daten.ueberschreiben !== true) {
    return fehler(409, 'Für dieses Datum existiert bereits ein Tagesabschluss.', { code: 'vorhanden', vorhanden: fuerAnzeige(vorhanden) });
  }
  if (vorhanden && daten.version !== vorhanden.geaendert) {
    return fehler(409, 'Der bestehende Tagesabschluss wurde inzwischen geändert. Bitte die Angaben erneut prüfen.', { code: 'geaendert', vorhanden: fuerAnzeige(vorhanden) });
  }

  const fotoId = crypto.randomUUID();
  const jetzt = new Date().toISOString();
  await speicher.speichereFoto(fotoId, {
    mime: foto.mime, breite: foto.breite, hoehe: foto.hoehe, bytes: puffer.length,
    daten: puffer.toString('base64'), erstellt: jetzt,
  });
  const neu = { ...eintrag, fotoId, erstellt: vorhanden ? vorhanden.erstellt || jetzt : jetzt, geaendert: jetzt };
  const ergebnis = await speicher.schreibeEintrag(eintrag.datum, neu, vorhanden ? etag : 'null_etag');
  if (!ergebnis.ok) {
    await speicher.loescheFoto(fotoId).catch(() => {});
    return fehler(409, vorhanden
      ? 'Der bestehende Tagesabschluss wurde inzwischen geändert. Bitte die Angaben erneut prüfen.'
      : 'Für dieses Datum existiert bereits ein Tagesabschluss.',
      { code: vorhanden ? 'geaendert' : 'vorhanden', vorhanden: fuerAnzeige(ergebnis.aktuell) });
  }
  if (vorhanden && vorhanden.fotoId) await speicher.loescheFoto(vorhanden.fotoId).catch(() => {});
  return json({ ok: true, aktualisiert: Boolean(vorhanden), eintrag: fuerAnzeige(neu) }, vorhanden ? 200 : 201);
}

export default {
  async fetch(request) {
    if (request.method !== 'GET' && request.method !== 'POST') return nurMethoden('GET', 'POST');
    const verweigert = brauchtSitzung(request);
    if (verweigert) return verweigert;
    const fehlt = speicherFehlt();
    if (fehlt) return fehlt;
    try {
      return request.method === 'GET' ? await liste() : await speichern(request);
    } catch (f) {
      return unerwartet(f, request.method === 'GET' ? 'Liste' : 'Speichern');
    }
  },
};
