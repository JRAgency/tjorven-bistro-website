// GET /api/tagesabschluss/export – alle gespeicherten Tagesabschlüsse als .xlsx (nur mit Sitzung).

import { datei, nurMethoden } from '../_lib/tagesabschluss/antwort.js';
import { brauchtSitzung } from '../_lib/tagesabschluss/sitzung.js';
import { heuteInBerlin } from '../_lib/tagesabschluss/bon.js';
import { erzeugeXlsx } from '../_lib/tagesabschluss/xlsx.js';
import * as speicher from '../_lib/tagesabschluss/speicher.js';
import { speicherFehlt, unerwartet, eigeneAdresse } from '../_lib/tagesabschluss/gemeinsam.js';

export default {
  async fetch(request) {
    if (request.method !== 'GET') return nurMethoden('GET');
    const verweigert = brauchtSitzung(request);
    if (verweigert) return verweigert;
    const fehlt = speicherFehlt();
    if (fehlt) return fehlt;
    try {
      const eintraege = await speicher.liesEintraege();
      const basis = eigeneAdresse(request);
      // Foto-Link führt auf die geschützte Seite – das Foto erscheint erst nach der Anmeldung
      const xlsx = erzeugeXlsx(eintraege, datum => `${basis}/tagesabschluss/?foto=${datum}`);
      return datei(xlsx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', {
        'Content-Disposition': `attachment; filename="tagesabschluesse-${heuteInBerlin()}.xlsx"`,
      });
    } catch (f) {
      return unerwartet(f, 'Export');
    }
  },
};
