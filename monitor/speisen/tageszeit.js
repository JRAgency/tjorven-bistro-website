// Monitor 2: Welche Ansicht gilt gerade? – nach der Bistro-Zeit (Europe/Berlin; Sommer- und Winterzeit über
// Intl, nie aus der UTC-Stunde gerechnet) und den zentralen Öffnungszeiten (daten/oeffnungszeiten.js):
//
//   'karte'       normale Speisekarte – bis zum Ende der warmen Küche (warmeKueche.bis, 16 Uhr), außerdem vor der
//                 Öffnung, an Schließtagen und ab Mitternacht (neuer Tag)
//   'nach16'      ab dem Ende der warmen Küche bis „Kalte Getränke, Cookies und Eis bis …“ (kalt.bis, 17 Uhr):
//                 nur die Produkte aus NACH16 (daten/speisen.js), die in der Verwaltung eingeschaltet sind
//   'feierabend'  danach bis Mitternacht: Dankeschön-Ansicht (es ist nichts mehr erhältlich)
//
// Sonderzeit aus der Verwaltung („Ende der warmen Küche – Heute bis …“, { datum, bis }): gilt NUR, wenn ihr Datum
// heute ist (deutsche Zeit) – am nächsten Tag ist sie ohne Zutun abgelaufen. Sie verschiebt nur das Ende der
// warmen Küche: bis dahin die normale Karte, danach die Ansicht mit Cookies, Eis & Co. Endet sie vor dem Ende von
// Cookies und Eis (17 Uhr), gilt danach wie immer „bis 17 Uhr“ und anschließend das Dankeschön; endet sie um oder
// nach 17 Uhr (Catering, Veranstaltung), folgt die Ansicht ohne Endzeit (bis = null) bis Mitternacht – wie lange
// es an so einem Tag noch etwas gibt, steht nirgends fest.
// Sonderzeiten des Tages aus den Öffnungszeiten (z. B. Silvester bis 14 Uhr) gelten wie bisher automatisch.
// Relative Pfade, damit dieselbe Datei im Browser und in Tests (Node) läuft.
import { oeffnungAm, uhrzeitInBerlin, kurz } from '../../daten/oeffnungszeiten.js';
import { heuteInBerlin } from '../kalender-bw.js';

const minuten = hhmm => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const UHRZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;
const KARTE = { ansicht: 'karte', ab: null, bis: null };

/** Sonderzeit für die warme Küche, falls sie heute gilt → 'HH:MM', sonst null */
export function kuecheHeute(kueche, jetzt = new Date()) {
  return kueche && typeof kueche === 'object' && typeof kueche.bis === 'string' && UHRZEIT.test(kueche.bis) && kueche.datum === heuteInBerlin(jetzt) ? kueche.bis : null;
}

/**
 * → { ansicht: 'karte' | 'nach16' | 'feierabend', ab, bis } – ab/bis kurz wie „16“ bzw. „17“ (nur bei 'nach16';
 * bis = null: ohne Endzeit, nach einer Sonderzeit um oder nach 17 Uhr). kueche: Sonderzeit aus der Verwaltung oder null.
 */
export function ansichtJetzt(jetzt = new Date(), kueche = null) {
  const t = oeffnungAm(heuteInBerlin(jetzt));
  const sonder = kuecheHeute(kueche, jetzt);
  if (!t.geoeffnet && !sonder) return KARTE;
  const uhr = minuten(uhrzeitInBerlin(jetzt));
  const warmBis = sonder || t.warmeKuecheBis;
  if (uhr < minuten(warmBis)) return KARTE;
  if (sonder && (!t.kaltBis || minuten(sonder) >= minuten(t.kaltBis))) return { ansicht: 'nach16', ab: kurz(sonder), bis: null };
  if (uhr < minuten(t.kaltBis)) return { ansicht: 'nach16', ab: kurz(warmBis), bis: kurz(t.kaltBis) };
  return { ansicht: 'feierabend', ab: null, bis: null };
}
