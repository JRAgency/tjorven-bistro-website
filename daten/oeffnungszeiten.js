// Öffnungszeiten des Tjorven Bistro – die EINZIGE Stelle, an der sie gepflegt werden.
// Gelesen von: Startseite (Öffnungsstatus, Wochenübersicht, Fußzeile) und Monitor 4 (Kachel
// „Öffnungszeiten“, erzeugt auf dem Server in api/_lib/monitore/katalog.js).
//
// Regel (Stand Oktober 2026, Vorgabe des Bistros): täglich 10–17 Uhr, in der Schulwoche Montag bis
// Freitag schon ab 9 Uhr. „Schulwoche“ = Montag bis Freitag, kein gesetzlicher Feiertag in
// Baden-Württemberg, keine Schulferien und kein landesweit schulfreier Tag – dieselben Kalenderdaten
// wie bei der Lasagne-Regel (monitor/kalender-bw.js).
//
// PFLEGE: Uhrzeiten unten ändern („HH:MM“). Einzelne Schließtage oder abweichende Zeiten in
// GESCHLOSSEN bzw. SONDERZEITEN eintragen (Datum „JJJJ-MM-TT“) – Startseite und Monitor 4 übernehmen
// das automatisch.

import { tagesInfo, wochentag, heuteInBerlin } from '../monitor/kalender-bw.js';

export const OEFFNUNGSZEITEN = {
  taeglich: { von: '10:00', bis: '17:00' },
  schulwoche: { von: '09:00' },                    // Montag–Freitag an Schultagen
  warmeKueche: { bis: '16:00' },
  kalt: { text: 'Kalte Getränke, Cookies und Eis', bis: '17:00' },
};

/** einzelne Tage, an denen das Bistro geschlossen ist, z. B. { datum: '2026-12-24', grund: 'Heiligabend' } */
export const GESCHLOSSEN = [];

/** einzelne Tage mit anderen Zeiten, z. B. { datum: '2026-12-31', von: '10:00', bis: '14:00', grund: 'Silvester' } */
export const SONDERZEITEN = [];

const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

/** „09:00“ → „9“, „17:30“ → „17:30“ (für kurze Texte wie „10–17 Uhr“) */
export const kurz = hhmm => (hhmm.endsWith(':00') ? String(Number(hhmm.slice(0, 2))) : hhmm.replace(/^0/, ''));
const minuten = hhmm => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Schultag in Baden-Württemberg? (Montag–Freitag, kein Feiertag, keine Ferien, nicht schulfrei) */
export function istSchultag(isoDatum) {
  const tag = wochentag(isoDatum);
  if (tag === 0 || tag === 6) return false;
  const info = tagesInfo(isoDatum);
  return !info.feiertag && !info.ferien && !info.schulfrei && !info.zusatz;
}

/**
 * Öffnung an einem Tag → { datum, wochentag, geoeffnet, von, bis, warmeKuecheBis, kaltBis, grund }
 * grund: kurzer Anlass, falls nicht die normale Regel gilt (Schließtag/Sonderzeit), sonst ''.
 */
export function oeffnungAm(isoDatum) {
  const basis = { datum: isoDatum, wochentag: WOCHENTAGE[wochentag(isoDatum)] };
  const zu = GESCHLOSSEN.find(g => g.datum === isoDatum);
  if (zu) return { ...basis, geoeffnet: false, von: null, bis: null, warmeKuecheBis: null, kaltBis: null, grund: zu.grund || '' };
  const sonder = SONDERZEITEN.find(s => s.datum === isoDatum);
  const von = sonder ? sonder.von : (istSchultag(isoDatum) ? OEFFNUNGSZEITEN.schulwoche.von : OEFFNUNGSZEITEN.taeglich.von);
  const bis = sonder ? sonder.bis : OEFFNUNGSZEITEN.taeglich.bis;
  const frueher = (a, b) => (minuten(a) <= minuten(b) ? a : b);
  return { ...basis, geoeffnet: true, von, bis, warmeKuecheBis: frueher(OEFFNUNGSZEITEN.warmeKueche.bis, bis), kaltBis: frueher(OEFFNUNGSZEITEN.kalt.bis, bis), grund: sonder ? sonder.grund || '' : '' };
}

/** Uhrzeit jetzt in Deutschland als „HH:MM“ */
export function uhrzeitInBerlin(jetzt = new Date()) {
  return new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(jetzt);
}

const plusTage = (isoDatum, n) => { const d = new Date(isoDatum + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/**
 * Status jetzt → { heute, phase, naechste }
 * phase: 'vorher' (öffnet heute noch), 'offen', 'danach' (heute schon zu) oder 'zu' (heute ganz geschlossen)
 * naechste: nächster Öffnungstag (ab morgen), falls heute nicht mehr geöffnet wird
 */
export function statusJetzt(jetzt = new Date()) {
  const heute = oeffnungAm(heuteInBerlin(jetzt));
  const uhr = minuten(uhrzeitInBerlin(jetzt));
  let phase = 'zu';
  if (heute.geoeffnet) phase = uhr < minuten(heute.von) ? 'vorher' : uhr < minuten(heute.bis) ? 'offen' : 'danach';
  let naechste = null;
  if (phase === 'danach' || phase === 'zu') {
    for (let i = 1; i <= 14 && !naechste; i++) { const t = oeffnungAm(plusTage(heute.datum, i)); if (t.geoeffnet) naechste = { ...t, morgen: i === 1 }; }
  }
  return { heute, phase, naechste };
}

/** allgemeine Regel als kurze Zeilen: „Täglich geöffnet 10–17 Uhr“, „In der Schulwoche Mo–Fr ab 9 Uhr“ */
export function regelZeilen() {
  const { taeglich, schulwoche } = OEFFNUNGSZEITEN;
  return [`Täglich geöffnet ${kurz(taeglich.von)}–${kurz(taeglich.bis)} Uhr`, `In der Schulwoche Mo–Fr ab ${kurz(schulwoche.von)} Uhr`];
}

/** Wochenübersicht für die Website → [{ tage, zeit, hinweis }] */
export function uebersicht() {
  const { taeglich, schulwoche, warmeKueche } = OEFFNUNGSZEITEN;
  return [
    { tage: 'Montag – Freitag in der Schulwoche', zeit: `${schulwoche.von} – ${taeglich.bis} Uhr` },
    { tage: 'Samstag, Sonntag, Feiertage & BW-Ferien', zeit: `${taeglich.von} – ${taeglich.bis} Uhr` },
    { tage: 'Warme Küche', zeit: `bis ${warmeKueche.bis} Uhr` },
  ];
}

/** Text der Monitor-4-Kachel „Öffnungszeiten“ für einen Tag → { zeilen, klein } */
export function monitorKachel(isoDatum) {
  const t = oeffnungAm(isoDatum);
  const zeilen = t.geoeffnet
    ? [`Heute geöffnet bis ${kurz(t.bis)} Uhr`, `Warme Küche bis ${kurz(t.warmeKuecheBis)} Uhr`, `${OEFFNUNGSZEITEN.kalt.text} bis ${kurz(t.kaltBis)} Uhr`]
    : ['Heute geschlossen'];
  return { zeilen, klein: regelZeilen() };
}
