// GET /api/tagesabschluss/eintrag?datum=JJJJ-MM-TT – vorhandener Tagesabschluss eines Tages (oder null).

import { json, fehler, nurMethoden } from '../_lib/tagesabschluss/antwort.js';
import { brauchtSitzung } from '../_lib/tagesabschluss/sitzung.js';
import { istIsoDatum } from '../_lib/tagesabschluss/bon.js';
import * as speicher from '../_lib/tagesabschluss/speicher.js';
import { fuerAnzeige, speicherFehlt, unerwartet } from '../_lib/tagesabschluss/gemeinsam.js';

export default {
  async fetch(request) {
    if (request.method !== 'GET') return nurMethoden('GET');
    const verweigert = brauchtSitzung(request);
    if (verweigert) return verweigert;
    const fehlt = speicherFehlt();
    if (fehlt) return fehlt;
    const datum = new URL(request.url).searchParams.get('datum');
    if (!istIsoDatum(datum)) return fehler(400, 'Bitte gib ein gültiges Datum an.');
    try {
      return json({ eintrag: fuerAnzeige(await speicher.liesEintrag(datum)) });
    } catch (f) {
      return unerwartet(f, 'Eintrag');
    }
  },
};
