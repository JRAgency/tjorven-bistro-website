// Kalender Baden-Württemberg für die Display-Monitore: Schulferien und gesetzliche Feiertage.
//
// PFLEGE: Neue Schulferien einfach unten in FERIEN_BW ergänzen (Quelle: Kultusministerium BW,
// https://km.baden-wuerttemberg.de/de/service/ferien). Datumsangaben als „JJJJ-MM-TT“, „bis“ einschließlich.
// Die gesetzlichen Feiertage werden nach den festen Regeln berechnet (auch die beweglichen um Ostern) –
// sie müssen nicht jedes Jahr nachgetragen werden. Sondertage, an denen das Bistro zusätzlich wie an
// einem Feiertag öffnet, können in ZUSAETZLICHE_TAGE eingetragen werden.
//
// Nicht enthalten: die „beweglichen Ferientage“ – die legt jede Schule selbst fest (nicht landesweit).

/** Schulferien Baden-Württemberg (Stand: Kultusministerium BW, abgerufen am 29.10.2026) */
export const FERIEN_BW = [
  { name: 'Sommerferien 2026', von: '2026-07-30', bis: '2026-09-12' },
  { name: 'Herbstferien 2026', von: '2026-10-26', bis: '2026-10-30' },
  { name: 'Weihnachtsferien 2026/27', von: '2026-12-23', bis: '2027-01-09' },
  { name: 'Osterferien 2027', von: '2027-03-30', bis: '2027-04-03' },
  { name: 'Pfingstferien 2027', von: '2027-05-18', bis: '2027-05-29' },
  { name: 'Sommerferien 2027', von: '2027-07-29', bis: '2027-09-11' },
  { name: 'Herbstferien 2027', von: '2027-11-02', bis: '2027-11-06' },
  { name: 'Weihnachtsferien 2027/28', von: '2027-12-23', bis: '2028-01-08' },
  { name: 'Osterferien 2028', von: '2028-04-18', bis: '2028-04-22' },
  { name: 'Pfingstferien 2028', von: '2028-06-06', bis: '2028-06-17' },
  { name: 'Sommerferien 2028', von: '2028-07-27', bis: '2028-09-09' },
  { name: 'Herbstferien 2028', von: '2028-10-30', bis: '2028-11-03' },
  { name: 'Weihnachtsferien 2028/29', von: '2028-12-23', bis: '2029-01-05' },
  { name: 'Osterferien 2029', von: '2029-03-26', bis: '2029-04-07' },
  { name: 'Pfingstferien 2029', von: '2029-05-22', bis: '2029-06-01' },
  { name: 'Sommerferien 2029', von: '2029-07-26', bis: '2029-09-08' },
  { name: 'Herbstferien 2029', von: '2029-10-29', bis: '2029-11-02' },
  { name: 'Weihnachtsferien 2029/30', von: '2029-12-22', bis: '2030-01-05' },
  { name: 'Osterferien 2030', von: '2030-04-15', bis: '2030-04-26' },
  { name: 'Pfingstferien 2030', von: '2030-06-11', bis: '2030-06-21' },
];

/** Landesweit unterrichtsfreie Einzeltage laut Kultusministerium (zählen hier wie Schulferien).
 *  Wer das nicht möchte, löscht die Zeilen einfach. */
export const SCHULFREI_BW = [
  { name: 'Reformationsfest (schulfrei)', datum: '2026-10-31' },
  { name: 'Gründonnerstag (schulfrei)', datum: '2027-03-25' },
  { name: 'Gründonnerstag (schulfrei)', datum: '2028-04-13' },
  { name: 'Reformationsfest (schulfrei)', datum: '2028-10-31' },
  { name: 'Reformationsfest (schulfrei)', datum: '2029-10-31' },
];

/** Optional: weitere Tage, die wie ein Feiertag gelten sollen, z. B. { name: 'Brückentag', datum: '2027-05-07' } */
export const ZUSAETZLICHE_TAGE = [];

/* ------------------------------------------------------------- Berechnung */

const iso = (j, m, t) => `${j}-${String(m).padStart(2, '0')}-${String(t).padStart(2, '0')}`;
const plusTage = (isoDatum, n) => {
  const d = new Date(isoDatum + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Ostersonntag (gregorianisch, Anonymer Algorithmus nach Meeus/Jones/Butcher) */
export function ostersonntag(jahr) {
  const a = jahr % 19, b = Math.floor(jahr / 100), c = jahr % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31), tag = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(jahr, monat, tag);
}

/** Gesetzliche Feiertage in Baden-Württemberg für ein Jahr → Map Datum → Name */
export function feiertageBW(jahr) {
  const ostern = ostersonntag(jahr);
  const liste = [
    [iso(jahr, 1, 1), 'Neujahr'],
    [iso(jahr, 1, 6), 'Heilige Drei Könige'],
    [plusTage(ostern, -2), 'Karfreitag'],
    [plusTage(ostern, 1), 'Ostermontag'],
    [iso(jahr, 5, 1), 'Tag der Arbeit'],
    [plusTage(ostern, 39), 'Christi Himmelfahrt'],
    [plusTage(ostern, 50), 'Pfingstmontag'],
    [plusTage(ostern, 60), 'Fronleichnam'],
    [iso(jahr, 10, 3), 'Tag der Deutschen Einheit'],
    [iso(jahr, 11, 1), 'Allerheiligen'],
    [iso(jahr, 12, 25), '1. Weihnachtstag'],
    [iso(jahr, 12, 26), '2. Weihnachtstag'],
  ];
  return new Map(liste);
}

/** Datum „JJJJ-MM-TT“ → { feiertag, ferien, schulfrei, zusatz } (jeweils Name oder null) */
export function tagesInfo(isoDatum) {
  const jahr = Number(isoDatum.slice(0, 4));
  const ferien = FERIEN_BW.find(f => f.von <= isoDatum && isoDatum <= f.bis);
  return {
    feiertag: feiertageBW(jahr).get(isoDatum) || null,
    ferien: ferien ? ferien.name : null,
    schulfrei: (SCHULFREI_BW.find(s => s.datum === isoDatum) || {}).name || null,
    zusatz: (ZUSAETZLICHE_TAGE.find(s => s.datum === isoDatum) || {}).name || null,
  };
}

/** heutiges Datum in Deutschland (Europe/Berlin) als „JJJJ-MM-TT“ */
export function heuteInBerlin(jetzt = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(jetzt);
}

/** Wochentag 0 = Sonntag … 6 = Samstag für ein ISO-Datum (kalendarisch, ohne Zeitzonen-Effekte) */
export function wochentag(isoDatum) {
  return new Date(isoDatum + 'T12:00:00Z').getUTCDay();
}
