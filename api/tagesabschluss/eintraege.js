// /api/tagesabschluss/eintraege
//   GET  – alle gespeicherten Tagesabschlüsse, neuestes Datum zuerst
//   POST – neuen, geprüften Tagesabschluss speichern (mit Foto). Gibt es das Datum schon, wird
//          NICHT überschrieben, sondern mit 409 und dem bestehenden Eintrag geantwortet.
//          Ersetzen nur mit ueberschreiben: true UND dem Stand (version) des bestehenden
//          Eintrags, den der Benutzer gesehen hat.
//   PUT  – gespeicherten Tagesabschluss bearbeiten: { datum (bisheriges), version, eintrag, bild? }.
//          Ohne neues Foto bleibt das gespeicherte. Das Datum darf geändert werden, aber nie
//          auf einen Tag, für den schon ein anderer Tagesabschluss gespeichert ist.
// Gespeichert wird immer nur auf ausdrücklichen Knopfdruck in der Prüfansicht.

import { json, fehler, nurMethoden, vonEigenerSeite, fremdeSeite, leseJson } from '../_lib/tagesabschluss/antwort.js';
import { brauchtSitzung } from '../_lib/tagesabschluss/sitzung.js';
import { pruefeEintrag, pruefeFoto, base64ZuPuffer, MAX_ANFRAGE_BYTES } from '../_lib/tagesabschluss/pruefung.js';
import { istIsoDatum } from '../_lib/tagesabschluss/bon.js';
import * as speicher from '../_lib/tagesabschluss/speicher.js';
import { fuerAnzeige, speicherFehlt, unerwartet } from '../_lib/tagesabschluss/gemeinsam.js';

const GEAENDERT = 'Der Tagesabschluss wurde inzwischen auf einem anderen Gerät geändert. Bitte die Angaben erneut prüfen.';
const deDatum = iso => iso.split('-').reverse().join('.');

async function liste() {
  const eintraege = await speicher.liesEintraege();
  return json({ eintraege: eintraege.map(fuerAnzeige) });
}

/** Anfrage lesen und prüfen → { daten, eintrag, puffer, foto } oder { antwort } */
async function lesen(request, fotoPflicht) {
  if (!vonEigenerSeite(request)) return { antwort: fremdeSeite() };
  let daten;
  try { daten = await leseJson(request, MAX_ANFRAGE_BYTES); } catch (f) { return { antwort: fehler(f.status || 400, f.meldung || 'Die Anfrage ist ungültig.') }; }
  const geprueft = pruefeEintrag(daten.eintrag);
  if (!geprueft.ok) return { antwort: fehler(422, 'Bitte prüfe die markierten Felder.', { code: 'eingabe', felder: geprueft.fehler }) };
  let puffer = null, foto = null;
  if (fotoPflicht || (daten.bild !== undefined && daten.bild !== null)) {
    puffer = base64ZuPuffer(daten.bild);
    if (!puffer) return { antwort: fehler(422, 'Zum Tagesabschluss fehlt das Foto.', { code: 'foto' }) };
    foto = pruefeFoto(puffer);
    if (!foto.ok) return { antwort: fehler(422, foto.meldung, { code: 'foto' }) };
  }
  return { daten, eintrag: geprueft.eintrag, puffer, foto };
}

const fotoAngaben = (pfad, puffer, foto) => ({ pfad, mime: foto.mime, bytes: puffer.length, breite: foto.breite, hoehe: foto.hoehe });

async function neu(request) {
  const r = await lesen(request, true);
  if (r.antwort) return r.antwort;
  const { daten, eintrag, puffer, foto } = r;

  // Vorab (spart das Hochladen): Datum schon belegt und nicht ausdrücklich ersetzen?
  const vorab = await speicher.liesEintrag(eintrag.datum);
  if (vorab && daten.ueberschreiben !== true) {
    return fehler(409, 'Für dieses Datum existiert bereits ein Tagesabschluss.', { code: 'vorhanden', vorhanden: fuerAnzeige(vorab) });
  }

  const pfad = await speicher.speichereFoto(puffer, foto.mime);
  const jetzt = new Date().toISOString();
  let ergebnis;
  try {
    ergebnis = await speicher.aendere(eintraege => {
      const alt = eintraege[eintrag.datum] || null;
      if (alt && daten.ueberschreiben !== true) return { schreiben: false, code: 'vorhanden', alt };
      if (alt && daten.version !== alt.geaendert) return { schreiben: false, code: 'geaendert', alt };
      const gespeichert = { ...eintrag, foto: fotoAngaben(pfad, puffer, foto), erstellt: alt ? alt.erstellt || jetzt : jetzt, geaendert: jetzt };
      eintraege[eintrag.datum] = gespeichert;
      return { schreiben: true, alt, gespeichert };
    });
  } catch (f) {
    await speicher.loescheFoto(pfad).catch(() => {});
    throw f;
  }
  if (!ergebnis.schreiben) {
    await speicher.loescheFoto(pfad).catch(() => {});
    return fehler(409, ergebnis.code === 'geaendert' ? GEAENDERT : 'Für dieses Datum existiert bereits ein Tagesabschluss.',
      { code: ergebnis.code, vorhanden: fuerAnzeige(ergebnis.alt) });
  }
  if (ergebnis.alt && ergebnis.alt.foto) await speicher.loescheFoto(ergebnis.alt.foto.pfad).catch(() => {});
  return json({ ok: true, aktualisiert: Boolean(ergebnis.alt), eintrag: fuerAnzeige(ergebnis.gespeichert) }, ergebnis.alt ? 200 : 201);
}

async function bearbeiten(request) {
  const r = await lesen(request, false);
  if (r.antwort) return r.antwort;
  const { daten, eintrag, puffer, foto } = r;
  const bisher = daten.datum;
  if (!istIsoDatum(bisher)) return fehler(400, 'Bitte gib an, welcher Tagesabschluss bearbeitet wird.');

  const pfad = puffer ? await speicher.speichereFoto(puffer, foto.mime) : null;
  const jetzt = new Date().toISOString();
  let ergebnis;
  try {
    ergebnis = await speicher.aendere(eintraege => {
      const alt = eintraege[bisher] || null;
      if (!alt) return { schreiben: false, code: 'fehlt' };
      if (daten.version !== alt.geaendert) return { schreiben: false, code: 'geaendert', alt };
      const belegt = eintrag.datum !== bisher ? eintraege[eintrag.datum] || null : null;
      if (belegt) return { schreiben: false, code: 'datum_belegt', belegt };
      const gespeichert = { ...eintrag, foto: pfad ? fotoAngaben(pfad, puffer, foto) : alt.foto, erstellt: alt.erstellt, geaendert: jetzt };
      if (eintrag.datum !== bisher) delete eintraege[bisher];
      eintraege[eintrag.datum] = gespeichert;
      return { schreiben: true, alt, gespeichert };
    });
  } catch (f) {
    if (pfad) await speicher.loescheFoto(pfad).catch(() => {});
    throw f;
  }
  if (!ergebnis.schreiben) {
    if (pfad) await speicher.loescheFoto(pfad).catch(() => {});
    if (ergebnis.code === 'fehlt') return fehler(404, 'Diesen Tagesabschluss gibt es nicht mehr.', { code: 'fehlt' });
    if (ergebnis.code === 'geaendert') return fehler(409, GEAENDERT, { code: 'geaendert', vorhanden: fuerAnzeige(ergebnis.alt) });
    return fehler(409, `Für den ${deDatum(eintrag.datum)} existiert bereits ein anderer Tagesabschluss. Bitte das Datum prüfen.`,
      { code: 'datum_belegt', felder: [{ feld: 'datum', meldung: 'Für dieses Datum gibt es schon einen Tagesabschluss.' }] });
  }
  if (pfad && ergebnis.alt.foto) await speicher.loescheFoto(ergebnis.alt.foto.pfad).catch(() => {});
  return json({ ok: true, bearbeitet: true, eintrag: fuerAnzeige(ergebnis.gespeichert) });
}

export default {
  async fetch(request) {
    if (!['GET', 'POST', 'PUT'].includes(request.method)) return nurMethoden('GET', 'POST', 'PUT');
    const verweigert = brauchtSitzung(request);
    if (verweigert) return verweigert;
    const fehlt = speicherFehlt();
    if (fehlt) return fehlt;
    try {
      if (request.method === 'GET') return await liste();
      return request.method === 'POST' ? await neu(request) : await bearbeiten(request);
    } catch (f) {
      return unerwartet(f, request.method === 'GET' ? 'Liste' : request.method === 'POST' ? 'Speichern' : 'Bearbeiten');
    }
  },
};
