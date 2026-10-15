// GET /api/tagesabschluss/foto?datum=JJJJ-MM-TT – Foto des Bons, nur mit gültiger Sitzung.
// Es gibt keine öffentliche Adresse für die Fotos; sie liegen nur im privaten Blob-Speicher.

import { fehler, datei, nurMethoden } from '../_lib/tagesabschluss/antwort.js';
import { brauchtSitzung } from '../_lib/tagesabschluss/sitzung.js';
import { istIsoDatum } from '../_lib/tagesabschluss/bon.js';
import * as speicher from '../_lib/tagesabschluss/speicher.js';
import { speicherFehlt, unerwartet } from '../_lib/tagesabschluss/gemeinsam.js';

const ENDUNG = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

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
      const eintrag = await speicher.liesEintrag(datum);
      const foto = eintrag && eintrag.foto;
      if (!foto || !ENDUNG[foto.mime]) return fehler(404, 'Zu diesem Tag gibt es kein Foto.');
      const inhalt = await speicher.liesFoto(foto.pfad);
      if (!inhalt) return fehler(404, 'Zu diesem Tag gibt es kein Foto.');
      return datei(inhalt, foto.mime, {
        'Content-Disposition': `inline; filename="tagesabschluss-${datum}.${ENDUNG[foto.mime]}"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      });
    } catch (f) {
      return unerwartet(f, 'Foto');
    }
  },
};
