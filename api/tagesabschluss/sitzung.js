// GET /api/tagesabschluss/sitzung – angemeldet? Plus Stand der Einrichtung (ohne Geheimnisse).

import { json, nurMethoden } from '../_lib/tagesabschluss/antwort.js';
import { brauchtSitzung, pruefeSitzung } from '../_lib/tagesabschluss/sitzung.js';
import { kiEingerichtet } from '../_lib/tagesabschluss/erkennung.js';
import { istEingerichtet as speicherEingerichtet } from '../_lib/tagesabschluss/speicher.js';

export default {
  async fetch(request) {
    if (request.method !== 'GET') return nurMethoden('GET');
    const verweigert = brauchtSitzung(request);
    if (verweigert) return verweigert;
    return json({
      angemeldet: true,
      ablauf: pruefeSitzung(request).ablauf,
      erkennung: kiEingerichtet(request),
      speicher: speicherEingerichtet(),
    });
  },
};
