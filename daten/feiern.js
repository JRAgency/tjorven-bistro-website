// Feiern & Catering – die EINZIGE Stelle für Titel, Kurztext, Stichpunkte und Fotos dieser Angebote.
// Gelesen von: Monitor 4 (die drei Feiern, in der Verwaltung schaltbar – Bildausschnitt und QR-Code legt
// api/_lib/monitore/katalog.js fest) und der Startseite (Abschnitt „Feiern & Catering“, mit Link statt QR-Code).
// Stichpunkte wie auf Monitor 1 (Abholmonitor).
//
//   link      Seite auf der Website (auf Monitor 4 als QR-Code)
//   monitor4  false = nur auf der Website (Catering hat keine eigene Monitor-Kachel)

export const FEIERN = [
  { id: 'kindergeburtstag', titel: 'Kindergeburtstage', link: '/kindergeburtstag/',
    bild: { datei: '/images/kindergeburtstag-broschuere/seite-1-2400.webp', alt: 'Titelseite der Broschüre „Kindergeburtstag im Bistro Tjorven“' },
    unter: 'Das Tjorven Bistro als Dein fester Treffpunkt',
    punkte: ['Eigener Tischbereich für Eure Gruppe', 'Mehrfaches Kommen und Gehen möglich', 'Kuchen darf mitgebracht werden', 'Kindergeburtstags-Menüs auf Wunsch'] },
  { id: 'familienfeiern', titel: 'Familienfeiern', link: '/catering/broschuere/',
    bild: { datei: '/images/abholmonitor/32-tjorven-anton-eventflaeche-hochkant.jpeg', alt: 'Tjorven und Anton auf der Eventfläche der KLIMA ARENA' },
    unter: 'Tagsüber in der KLIMA ARENA',
    punkte: ['Eigener Raum', 'Kinder können die Ausstellung erkunden', 'Catering vom Tjorven Bistro', 'Brunch, Kaffee & Kuchen oder individuelles Catering'] },
  { id: 'feiern-im-bistro', titel: 'Feiern im Bistro', link: '/catering/broschuere/',
    bild: { datei: '/images/abholmonitor/31-tjorven-anton-bistro-quer.jpeg', alt: 'Tjorven und Anton im Tjorven Bistro' },
    unter: 'Abends ab 17 Uhr als geschlossene Gesellschaft',
    punkte: ['Eigener Bistrobereich', 'À-la-carte oder Buffet', 'Wein- und Getränkeservice', 'Auf Wunsch mit vorheriger Führung durch die KLIMA ARENA'] },
  { id: 'catering', titel: 'Catering', link: '/catering/', monitor4: false,
    bild: { datei: '/images/catering-broschuere/seite-1-2400.webp', alt: 'Titelseite der Catering-Broschüre des Tjorven Bistro' },
    unter: 'Von kleinen Firmenlunches bis zu besonderen Anlässen – wir bringen unsere Küche zu dir.',
    punkte: [] },
];

/** eine Feier nach Kennung */
export const feier = id => FEIERN.find(f => f.id === id);
