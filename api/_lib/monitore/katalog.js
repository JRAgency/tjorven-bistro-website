// Monitor 4 „Heute bei uns“ – alle Angebote, die in der Verwaltung (/monitor/admin/) an- und
// abgeschaltet werden können. Reihenfolge hier = Reihenfolge auf dem Monitor.
//
// Neues Angebot: Eintrag ergänzen (id nur Kleinbuchstaben, Ziffern und Bindestriche, nie
// wiederverwenden) und neu deployen. In der Verwaltung erscheint es sofort, aktiv ist es erst
// nach dem Einschalten (oder bei standard: true, solange noch nie gespeichert wurde).
//
//   art    'produkt' (Speise/Getränk) oder 'event' (Feier mit QR-Code)
//   bild   vorhandenes Foto (keine KI-Bilder); ohne Bild zeigt der Monitor eine Textkarte
//   pos    Bildausschnitt (CSS object-position)
//   zoom   nur den oberen Teil des Bildes zeigen (Faktor; Kindergeburtstag: Deckblatt ohne dessen Schrift)
//   unter  kurze Zeile unter dem Titel (optional)
//   punkte nur für große Darstellungen (1–2 aktive Angebote)
//   qr     Schlüssel aus QRS
//
// Preise stehen bewusst nicht dabei: Keines dieser Angebote hat einen bestätigten Preis auf der
// Speisekarte. Stichpunkte der Feiern 1:1 wie auf Monitor 1 (Abholmonitor).

const BILD = '/images/abholmonitor/';

export const QRS = {
  catering: { bild: '/monitor/qr/qr-catering-broschuere.svg', text: 'tjorven-bistro.de/catering/broschuere' },
  kindergeburtstag: { bild: '/monitor/qr/qr-kindergeburtstag.svg', text: 'tjorven-bistro.de/kindergeburtstag' },
};

export const KATALOG = [
  { id: 'zimtschnecke', titel: 'Zimtschnecke', art: 'produkt', bild: BILD + '06-zimtschnecken-quer.jpeg', pos: '50% 60%', standard: false },
  { id: 'apfelkuchen', titel: 'Apfelkuchen', art: 'produkt', standard: false },
  { id: 'mousse-au-chocolat', titel: 'Mousse au Chocolat', art: 'produkt', standard: false },
  { id: 'weihnachtswaffel', titel: 'Weihnachtswaffel', art: 'produkt', bild: BILD + '18-waffel-puderzucker-quer.jpeg', pos: '35% 55%', standard: false },
  { id: 'kuerbissuppe', titel: 'Kürbissuppe', art: 'produkt', standard: false },
  { id: 'saisonangebot', titel: 'Saisonangebot', art: 'produkt', unter: 'Fragt uns an der Theke', standard: false },
  { id: 'kindergeburtstag', titel: 'Kindergeburtstage', art: 'event', bild: '/images/kindergeburtstag-broschuere/seite-1-2400.webp', pos: '45% 0%', zoom: 2.1,
    unter: 'Das Tjorven Bistro als Dein fester Treffpunkt',
    punkte: ['Eigener Tischbereich für Eure Gruppe', 'Mehrfaches Kommen und Gehen möglich', 'Kuchen darf mitgebracht werden', 'Kindergeburtstags-Menüs auf Wunsch'],
    qr: 'kindergeburtstag', standard: true },
  { id: 'familienfeiern', titel: 'Familienfeiern', art: 'event', bild: BILD + '32-tjorven-anton-eventflaeche-hochkant.jpeg', pos: '50% 30%',
    unter: 'Tagsüber in der KLIMA ARENA',
    punkte: ['Eigener Raum', 'Kinder können die Ausstellung erkunden', 'Catering vom Tjorven Bistro', 'Brunch, Kaffee & Kuchen oder individuelles Catering'],
    qr: 'catering', standard: true },
  { id: 'feiern-im-bistro', titel: 'Feiern im Bistro', art: 'event', bild: BILD + '31-tjorven-anton-bistro-quer.jpeg', pos: '50% 40%',
    unter: 'Abends ab 17 Uhr als geschlossene Gesellschaft',
    punkte: ['Eigener Bistrobereich', 'À-la-carte oder Buffet', 'Wein- und Getränkeservice', 'Auf Wunsch mit vorheriger Führung durch die KLIMA ARENA'],
    qr: 'catering', standard: true },
];

export const IDS = new Set(KATALOG.map(k => k.id));

/** aktiv-Zustand je Angebot: gespeicherter Wert, sonst Standard aus dem Katalog */
export function zustand(gespeichert) {
  const aktiv = (gespeichert && gespeichert.aktiv) || {};
  return KATALOG.map(k => ({ id: k.id, aktiv: typeof aktiv[k.id] === 'boolean' ? aktiv[k.id] : k.standard }));
}

/** nur die Anzeigedaten der aktiven Angebote (für den öffentlichen Monitor) */
export function anzeige(gespeichert) {
  const an = new Set(zustand(gespeichert).filter(z => z.aktiv).map(z => z.id));
  return KATALOG.filter(k => an.has(k.id)).map(({ standard, qr, ...k }) => (qr ? { ...k, qr: QRS[qr] } : k));
}
