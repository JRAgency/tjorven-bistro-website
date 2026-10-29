// /api/monitore/verwaltung – Auswahl für Monitor 4 lesen (GET) und speichern (PUT).
//
// Nur mit gültiger Anmeldung (gleiches Passwort und gleiche Sitzung wie der Tagesabschluss);
// Speichern zusätzlich nur von der eigenen Seite (CSRF-Schutz wie beim Tagesabschluss).
// Angenommen werden ausschließlich die Kennungen aus dem Katalog mit true/false und für die zwei
// freien Kacheln je ein kurzer, reiner Text (serverseitig bereinigt und begrenzt). Kein Bild und
// keine Adresse kommt vom Browser.

import { json, fehler, nurMethoden, vonEigenerSeite, fremdeSeite, leseJson } from '../_lib/tagesabschluss/antwort.js';
import { brauchtSitzung } from '../_lib/tagesabschluss/sitzung.js';
import { KATALOG, IDS, FREI_IDS, zustand, freieTexte, bereinigeFreitext } from '../_lib/monitore/katalog.js';
import { liesSpecials, schreibeSpecials, CACHE_TAG } from '../_lib/monitore/speicher.js';
import { dangerouslyDeleteByTag } from '@vercel/functions';

function antwort(daten, stand, extra = {}) {
  const aktiv = new Map(zustand(daten).map(z => [z.id, z.aktiv]));
  const texte = freieTexte(daten);
  return {
    stand,
    geaendert: (daten && typeof daten.geaendert === 'string') ? daten.geaendert : null,
    angebote: KATALOG.map(k => ({
      id: k.id, titel: k.titel, art: k.art, bild: k.bild || null, preis: k.preis || null, aktiv: aktiv.get(k.id),
      ...(k.art === 'frei' ? { text: texte[k.id] } : {}),
    })),
    ...extra,
  };
}

const speicherFehler = f => fehler(f.status || 503, f.message || 'Der Speicher ist gerade nicht erreichbar.', { code: 'speicher' });

const titelVon = id => KATALOG.find(k => k.id === id).titel;

/** { aktiv: { id: bool, … }, frei: { id: Text, … }, stand } prüfen → { aktiv, frei, stand } | { fehler } | null */
function pruefe(eingabe) {
  if (!eingabe || typeof eingabe !== 'object' || Array.isArray(eingabe)) return null;
  const { aktiv, frei, stand } = eingabe;
  if (!aktiv || typeof aktiv !== 'object' || Array.isArray(aktiv)) return null;
  const schluessel = Object.keys(aktiv);
  if (schluessel.length !== IDS.size || !schluessel.every(id => IDS.has(id) && typeof aktiv[id] === 'boolean')) return null;
  if (!frei || typeof frei !== 'object' || Array.isArray(frei)) return null;
  const freiSchluessel = Object.keys(frei);
  if (freiSchluessel.length !== FREI_IDS.length || !FREI_IDS.every(id => Object.hasOwn(frei, id) && typeof frei[id] === 'string')) return null;
  if (stand !== null && (typeof stand !== 'string' || stand.length > 200)) return null;
  const texte = {};
  for (const id of FREI_IDS) {
    const r = bereinigeFreitext(frei[id]);
    if (r.fehler) return { fehler: `${titelVon(id)}: ${r.fehler}` };
    if (aktiv[id] && !r.text) return { fehler: `${titelVon(id)} ist eingeschaltet, hat aber keinen Text. Bitte Text eingeben oder die Kachel ausschalten.` };
    texte[id] = r.text;
  }
  return { aktiv: Object.fromEntries(KATALOG.map(k => [k.id, aktiv[k.id]])), frei: texte, stand };
}

export default {
  async fetch(request) {
    if (request.method !== 'GET' && request.method !== 'PUT') return nurMethoden('GET', 'PUT');
    if (request.method === 'PUT' && !vonEigenerSeite(request)) return fremdeSeite();
    const verweigert = brauchtSitzung(request);
    if (verweigert) return verweigert;

    if (request.method === 'GET') {
      try {
        const { daten, stand } = await liesSpecials();
        return json(antwort(daten, stand));
      } catch (f) { return speicherFehler(f); }
    }

    let eingabe;
    try { eingabe = pruefe(await leseJson(request, 8000)); } catch (f) { return fehler(f.status || 400, f.meldung || 'Die Anfrage ist ungültig.'); }
    if (!eingabe) return fehler(400, 'Die Anfrage ist ungültig.');
    if (eingabe.fehler) return fehler(400, eingabe.fehler, { code: 'eingabe' });

    try {
      const aktuell = await liesSpecials();
      if (aktuell.stand !== eingabe.stand) {
        return json(antwort(aktuell.daten, aktuell.stand, { fehler: 'Die Auswahl wurde inzwischen auf einem anderen Gerät geändert. Bitte prüfen und erneut speichern.', code: 'konflikt' }), 409);
      }
      const daten = { format: 2, aktiv: eingabe.aktiv, frei: eingabe.frei, geaendert: new Date().toISOString() };
      const neu = await schreibeSpecials(daten, aktuell.stand);
      if (neu === null) {
        const jetzt = await liesSpecials();
        return json(antwort(jetzt.daten, jetzt.stand, { fehler: 'Die Auswahl wurde inzwischen auf einem anderen Gerät geändert. Bitte prüfen und erneut speichern.', code: 'konflikt' }), 409);
      }
      // Monitor 4 sofort aktualisieren: zwischengespeicherte Antwort im Vercel-CDN löschen.
      // Klappt das ausnahmsweise nicht, gilt der neue Stand spätestens nach einer Stunde.
      let monitor = true;
      try { await dangerouslyDeleteByTag(CACHE_TAG); } catch { monitor = false; }
      return json(antwort(daten, neu, { ok: true, monitor }));
    } catch (f) { return speicherFehler(f); }
  },
};
