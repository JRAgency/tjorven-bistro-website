// Monitor 2: Welche Ansicht gilt gerade? – nach der Bistro-Zeit (Europe/Berlin; Sommer- und Winterzeit über
// Intl, nie aus der UTC-Stunde gerechnet) und den zentralen Öffnungszeiten (daten/oeffnungszeiten.js):
//
//   'karte'       normale Speisekarte – bis zum Ende der warmen Küche (warmeKueche.bis, 16 Uhr), außerdem vor der
//                 Öffnung, an Schließtagen und ab Mitternacht (neuer Tag)
//   'nach16'      ab dem Ende der warmen Küche bis „Kalte Getränke, Cookies und Eis bis …“ (kalt.bis, 17 Uhr):
//                 nur die Produkte aus NACH16 (daten/speisen.js), die in der Verwaltung eingeschaltet sind
//   'feierabend'  danach bis Mitternacht: Dankeschön-Ansicht (es ist nichts mehr erhältlich)
//
// Sonderzeiten (z. B. Silvester bis 14 Uhr) gelten automatisch: Ende der warmen Küche und der kalten Produkte
// sind nie später als der Ladenschluss des Tages.
// Relative Pfade, damit dieselbe Datei im Browser und in Tests (Node) läuft.
import { oeffnungAm, uhrzeitInBerlin, kurz } from '../../daten/oeffnungszeiten.js';
import { heuteInBerlin } from '../kalender-bw.js';

const minuten = hhmm => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** → { ansicht: 'karte' | 'nach16' | 'feierabend', ab, bis } – ab/bis kurz wie „16“ bzw. „17“ (nur bei 'nach16') */
export function ansichtJetzt(jetzt = new Date()) {
  const t = oeffnungAm(heuteInBerlin(jetzt));
  if (!t.geoeffnet) return { ansicht: 'karte', ab: null, bis: null };
  const uhr = minuten(uhrzeitInBerlin(jetzt));
  if (uhr < minuten(t.warmeKuecheBis)) return { ansicht: 'karte', ab: null, bis: null };
  if (uhr < minuten(t.kaltBis)) return { ansicht: 'nach16', ab: kurz(t.warmeKuecheBis), bis: kurz(t.kaltBis) };
  return { ansicht: 'feierabend', ab: null, bis: null };
}
