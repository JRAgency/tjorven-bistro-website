// Lasagne-Regel – die EINZIGE Stelle, die entscheidet, ob die Lasagne heute angeboten wird.
// Monitor 2 blendet damit Menüeintrag UND Foto gemeinsam ein oder aus (nie getrennt).
//
// Regel laut Speisekarte: „Es gibt unsere Lasagne samstags, sonntags, feiertags und in den Schulferien.“
// → Samstag, Sonntag, gesetzlicher Feiertag in Baden-Württemberg, Schulferien BW (inkl. landesweit
//   schulfreier Einzeltage) oder ein in kalender-bw.js zusätzlich eingetragener Tag.
// Zeitzone: Europe/Berlin.

import { tagesInfo, wochentag, heuteInBerlin } from './kalender-bw.js';

/** Datum „JJJJ-MM-TT“ → { verfuegbar, grund } */
export function lasagneAm(isoDatum) {
  const tag = wochentag(isoDatum);
  if (tag === 6) return { verfuegbar: true, grund: 'Samstag' };
  if (tag === 0) return { verfuegbar: true, grund: 'Sonntag' };
  const info = tagesInfo(isoDatum);
  if (info.feiertag) return { verfuegbar: true, grund: `Feiertag: ${info.feiertag}` };
  if (info.ferien) return { verfuegbar: true, grund: `Schulferien: ${info.ferien}` };
  if (info.schulfrei) return { verfuegbar: true, grund: info.schulfrei };
  if (info.zusatz) return { verfuegbar: true, grund: info.zusatz };
  return { verfuegbar: false, grund: 'Schultag (Montag bis Freitag)' };
}

/** heute in Deutschland */
export function lasagneHeute(jetzt = new Date()) {
  return lasagneAm(heuteInBerlin(jetzt));
}
