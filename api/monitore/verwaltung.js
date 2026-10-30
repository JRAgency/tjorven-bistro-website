// /api/monitore/verwaltung – Auswahl für Monitor 4 lesen (GET), speichern (PUT) und ein Bild für eine
// freie Kachel hochladen (POST).
//
// Nur mit gültiger Anmeldung (gleiches Passwort und gleiche Sitzung wie der Tagesabschluss);
// Speichern und Hochladen zusätzlich nur von der eigenen Seite (CSRF-Schutz wie beim Tagesabschluss).
// Angenommen werden ausschließlich die Kennungen aus dem Katalog mit true/false und für die zwei
// freien Kacheln je ein kurzer, reiner Text (serverseitig bereinigt und begrenzt), eine der zwei
// Farben und optional die Kennung eines zuvor hochgeladenen Bildes. Keine Adresse kommt vom Browser.
//
// Bilder: Die Verwaltung verkleinert das Foto im Browser (längste Seite 1920 px, JPEG) und schickt es
// hierher. Geprüft wird Art (JPEG/PNG/WebP am Dateianfang, nicht nur die Angabe des Browsers) und Größe
// (höchstens 3 MB). Gespeichert wird privat unter monitore/bilder/<SHA-256>.<Endung>. Öffentlich sichtbar
// wird ein Bild erst, wenn es mit „Speichern“ einer eingeschalteten freien Kachel zugeordnet ist.
// Nicht mehr verwendete Bilder werden beim Speichern gelöscht (nie gespeicherte nach 24 Stunden).

import crypto from 'node:crypto';
import { json, fehler, nurMethoden, vonEigenerSeite, fremdeSeite, leseJson } from '../_lib/tagesabschluss/antwort.js';
import { brauchtSitzung } from '../_lib/tagesabschluss/sitzung.js';
import { KATALOG, IDS, FREI_IDS, FREI_FARBEN, BILD_MUSTER, zustand, freieKacheln, bereinigeFreitext, bildAdresse } from '../_lib/monitore/katalog.js';
import { liesSpecials, schreibeSpecials, speichereBild, listeBilder, loescheBilder, CACHE_TAG } from '../_lib/monitore/speicher.js';
import { dangerouslyDeleteByTag } from '@vercel/functions';

const BILD_MAX_BYTES = 3 * 1024 * 1024;
const BILD_MAX_ANZAHL = 30;               // gespeicherte Bilder insgesamt (Schutz vor versehentlichem Vollladen)
const VERWAIST_NACH_MS = 24 * 60 * 60 * 1000;
const BILD_ARTEN = {
  'image/jpeg': { endung: 'jpg', passt: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { endung: 'png', passt: b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { endung: 'webp', passt: b => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
};

function antwort(daten, stand, extra = {}) {
  const aktiv = new Map(zustand(daten).map(z => [z.id, z.aktiv]));
  const frei = freieKacheln(daten);
  return {
    stand,
    geaendert: (daten && typeof daten.geaendert === 'string') ? daten.geaendert : null,
    angebote: KATALOG.map(k => ({
      id: k.id, titel: k.titel, art: k.art, bild: k.bild || null, preis: k.preis || null, aktiv: aktiv.get(k.id),
      ...(k.art === 'frei' ? { text: frei[k.id].text, farbe: frei[k.id].farbe, freiBild: frei[k.id].bild, freiBildAdresse: frei[k.id].bild ? bildAdresse(frei[k.id].bild) : null } : {}),
    })),
    ...extra,
  };
}

const speicherFehler = f => fehler(f.status || 503, f.message || 'Der Speicher ist gerade nicht erreichbar.', { code: 'speicher' });
const konflikt = (daten, stand) => json(antwort(daten, stand, { fehler: 'Die Auswahl wurde inzwischen auf einem anderen Gerät geändert. Bitte prüfen und erneut speichern.', code: 'konflikt' }), 409);
const titelVon = id => KATALOG.find(k => k.id === id).titel;
const genau = (o, schluessel) => o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length === schluessel.length && schluessel.every(s => Object.hasOwn(o, s));

/** { aktiv: { id: bool, … }, frei: { id: { text, farbe, bild }, … }, stand } prüfen → { aktiv, frei, stand } | { fehler, code } | null */
function pruefe(eingabe) {
  if (!eingabe || typeof eingabe !== 'object' || Array.isArray(eingabe)) return null;
  const { aktiv, frei, stand } = eingabe;
  if (!aktiv || typeof aktiv !== 'object' || Array.isArray(aktiv)) return null;
  const schluessel = Object.keys(aktiv);
  if (schluessel.length !== IDS.size || !schluessel.every(id => IDS.has(id) && typeof aktiv[id] === 'boolean')) return null;
  if (!genau(frei, FREI_IDS)) return null;
  // ältere Verwaltung (noch offen im Browser) schickte nur Texte
  if (FREI_IDS.some(id => typeof frei[id] === 'string')) return { fehler: 'Die Verwaltung wurde aktualisiert. Bitte die Seite neu laden und die Änderung noch einmal vornehmen.', code: 'veraltet' };
  if (!FREI_IDS.every(id => genau(frei[id], ['text', 'farbe', 'bild']))) return null;
  if (stand !== null && (typeof stand !== 'string' || stand.length > 200)) return null;
  const kacheln = {};
  for (const id of FREI_IDS) {
    const { text, farbe, bild } = frei[id];
    if (typeof text !== 'string' || !FREI_FARBEN.includes(farbe) || !(bild === null || (typeof bild === 'string' && BILD_MUSTER.test(bild)))) return null;
    const r = bereinigeFreitext(text);
    if (r.fehler) return { fehler: `${titelVon(id)}: ${r.fehler}`, code: 'eingabe' };
    if (aktiv[id] && !r.text && !bild) return { fehler: `${titelVon(id)} ist eingeschaltet, hat aber weder Text noch Bild. Bitte Text eingeben, ein Bild wählen oder die Kachel ausschalten.`, code: 'eingabe' };
    kacheln[id] = { text: r.text, farbe, bild };
  }
  return { aktiv: Object.fromEntries(KATALOG.map(k => [k.id, aktiv[k.id]])), frei: kacheln, stand };
}

const bilderIn = daten => new Set(Object.values(freieKacheln(daten)).map(k => k.bild).filter(Boolean));

/** Rohdaten lesen, höchstens maxBytes; wirft { status, meldung } */
async function leseBild(request) {
  const zuGross = { status: 413, meldung: 'Das Bild ist zu groß (höchstens 3 MB nach dem Verkleinern).' };
  if (Number(request.headers.get('content-length') || 0) > BILD_MAX_BYTES) throw zuGross;
  const puffer = Buffer.from(await request.arrayBuffer());
  if (puffer.length > BILD_MAX_BYTES) throw zuGross;
  return puffer;
}

async function hochladen(request) {
  const typ = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const art = BILD_ARTEN[typ];
  if (!art) return fehler(415, 'Bitte ein Foto als JPG, PNG oder WebP wählen.', { code: 'format' });
  let inhalt;
  try { inhalt = await leseBild(request); } catch (f) { return fehler(f.status || 400, f.meldung || 'Die Anfrage ist ungültig.', { code: 'groesse' }); }
  if (inhalt.length < 100 || !art.passt(inhalt)) return fehler(415, 'Die Datei ist kein gültiges JPG-, PNG- oder WebP-Bild.', { code: 'format' });
  const id = crypto.createHash('sha256').update(inhalt).digest('hex') + '.' + art.endung;
  try {
    const vorhanden = await listeBilder();
    if (!vorhanden.some(b => b.id === id)) {
      if (vorhanden.length >= BILD_MAX_ANZAHL) return fehler(409, 'Es sind gerade zu viele unbenutzte Bilder gespeichert. Bitte zuerst speichern und es morgen erneut versuchen.', { code: 'zu_viele' });
      await speichereBild(id, inhalt, typ);
    }
  } catch (f) { return speicherFehler(f); }
  return json({ ok: true, bild: id, adresse: bildAdresse(id) });
}

export default {
  async fetch(request) {
    if (!['GET', 'PUT', 'POST'].includes(request.method)) return nurMethoden('GET', 'PUT', 'POST');
    if (request.method !== 'GET' && !vonEigenerSeite(request)) return fremdeSeite();
    const verweigert = brauchtSitzung(request);
    if (verweigert) return verweigert;

    if (request.method === 'GET') {
      try {
        const { daten, stand } = await liesSpecials();
        return json(antwort(daten, stand));
      } catch (f) { return speicherFehler(f); }
    }

    if (request.method === 'POST') return hochladen(request);

    let eingabe;
    try { eingabe = pruefe(await leseJson(request, 8000)); } catch (f) { return fehler(f.status || 400, f.meldung || 'Die Anfrage ist ungültig.'); }
    if (!eingabe) return fehler(400, 'Die Anfrage ist ungültig.');
    if (eingabe.fehler) return fehler(400, eingabe.fehler, { code: eingabe.code });

    try {
      const aktuell = await liesSpecials();
      if (aktuell.stand !== eingabe.stand) return konflikt(aktuell.daten, aktuell.stand);
      const vorher = bilderIn(aktuell.daten);
      const nachher = new Set(Object.values(eingabe.frei).map(k => k.bild).filter(Boolean));
      // neu zugeordnete Bilder müssen tatsächlich hochgeladen sein
      let bilder = null;
      if ([...nachher].some(id => !vorher.has(id))) {
        bilder = await listeBilder();
        const da = new Set(bilder.map(b => b.id));
        const fehlt = FREI_IDS.find(id => eingabe.frei[id].bild && !da.has(eingabe.frei[id].bild));
        if (fehlt) return fehler(400, `${titelVon(fehlt)}: Das Bild ist nicht mehr vorhanden. Bitte erneut auswählen.`, { code: 'eingabe' });
      }
      const daten = { format: 3, aktiv: eingabe.aktiv, frei: eingabe.frei, geaendert: new Date().toISOString() };
      const neu = await schreibeSpecials(daten, aktuell.stand);
      if (neu === null) {
        const jetzt = await liesSpecials();
        return konflikt(jetzt.daten, jetzt.stand);
      }
      // Monitor 4 sofort aktualisieren: zwischengespeicherte Antwort im Vercel-CDN löschen.
      // Klappt das ausnahmsweise nicht, gilt der neue Stand spätestens nach einer Stunde.
      let monitor = true;
      try { await dangerouslyDeleteByTag(CACHE_TAG); } catch { monitor = false; }
      // aufräumen: ersetzte Bilder sofort, nie gespeicherte nach 24 Stunden (Fehler hier stören das Speichern nicht)
      try {
        bilder = bilder || await listeBilder();
        const jetzt = Date.now();
        const weg = bilder.filter(b => !nachher.has(b.id) && (vorher.has(b.id) || jetzt - new Date(b.hochgeladen).getTime() > VERWAIST_NACH_MS)).map(b => b.id);
        await loescheBilder(weg);
      } catch { /* beim nächsten Speichern erneut */ }
      return json(antwort(daten, neu, { ok: true, monitor }));
    } catch (f) { return speicherFehler(f); }
  },
};
