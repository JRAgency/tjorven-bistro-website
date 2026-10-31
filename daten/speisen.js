// Speisekarte des Tjorven Bistro – die EINZIGE Stelle für Namen, Preise, Kategorien und Fotos der Speisen.
// Gelesen von: Monitor 2 (/monitor/speisen/), der Startseite (Abschnitt „Unsere Speisen“) und Monitor 4
// (Angebot „Lasagne“ übernimmt Preis und Foto von hier, siehe api/_lib/monitore/katalog.js).
// Namen und Preise wie auf der Original-Karte (downloads/speisekarte-getraenkekarte.pdf): Preise mit genau
// einer Nachkommastelle, zwei Preise mit „ | “.
//
// PFLEGE: Preis oder Name hier ändern → nach dem Deployment stimmen Monitor 2, Startseite und Monitor 4.
//   nurMitLasagne  erscheint nur an Lasagne-Tagen (Regel: monitor/lasagne.js) – auf Monitor 2 UND Website
//   kurz           kurzer Name für Monitor 4 („Lasagne“)
//   bild           Foto (nur vorhandene Fotos); alt = Bildbeschreibung, fokus = Mitte des Gerichts im Foto
//                  (CSS object-position), nah = leichte Vergrößerung auf Monitor 2

const ORDNER = '/images/abholmonitor/';

const BILD = {
  bowl: { datei: ORDNER + '13-saisonale-bowl-quer.jpeg', alt: 'Tjorvens saisonale Bowl', fokus: '42% 60%', nah: 1.04 },
  lasagne: { datei: ORDNER + '35-lasagne-neu-quer.jpeg', alt: 'Hausgemachte Lasagne mit Beilagensalat', fokus: '36% 55%', nah: 1 },
  focaccia: { datei: ORDNER + '12-focaccia-quer.jpeg', alt: 'Saisonales Focaccia', fokus: '50% 64%', nah: 1.1 },
  wrap: { datei: ORDNER + '09-wrap-gemuese-quer.jpeg', alt: 'Getoasteter Wrap', fokus: '52% 64%', nah: 1.08 },
  pommes: { datei: ORDNER + '23-pommes-service-hochkant.jpeg', alt: 'Knusprige Pommes mit Dips', fokus: '46% 88%', nah: 1.12 },
  waffel: { datei: ORDNER + '18-waffel-puderzucker-quer.jpeg', alt: 'Hausgemachte Belgische Waffel mit Puderzucker', fokus: '47% 60%', nah: 1.15 },
};

export const SPEISEN = {
  gruppen: [
    {
      id: 'herzhaft', titel: 'herzhaft', eintraege: [
        { id: 'bowl', name: 'Tjorvens saisonale Bowl', preis: '13.5', bild: BILD.bowl },
        { id: 'lasagne', name: 'Hausgemachte Lasagne & Beilagensalat', kurz: 'Lasagne', preis: '12.5', bild: BILD.lasagne, nurMitLasagne: true,
          hinweis: 'Es gibt unsere Lasagne samstags, sonntags, feiertags und in den Schulferien.' },
        { id: 'pommes', name: 'Knusprige Pommes', preis: '4.5', bild: BILD.pommes },
        { id: 'loaded-pommes', name: 'Loaded Pommes – Veggie oder BBQ', preis: '9.0' },
        { id: 'focaccia', name: 'Saisonales Focaccia', preis: '5.5', bild: BILD.focaccia },
        { id: 'blattsalat', name: 'Bunter Blattsalat', preis: '4.5' },
        { id: 'wrap', name: 'Getoasteter Wrap', preis: '8.0', bild: BILD.wrap },
      ],
    },
    {
      id: 'suess', titel: 'süß', eintraege: [
        { id: 'waffel', name: 'Hausgemachte Belgische Waffel', preis: '4.5', bild: BILD.waffel },
        { id: 'cookies', name: 'Homemade Cookies', preis: '2.0' },
        { id: 'eis', name: 'Eiscreme', preis: '2.2 | 3.0' },
      ],
    },
  ],
  /** Reihenfolge der Fotos in der Bildfolge von Monitor 2 (und der Fotos auf der Website) */
  bildfolge: ['bowl', 'lasagne', 'focaccia', 'wrap', 'pommes', 'waffel'],

  /** „Kleines Bistro / reduziertes Angebot“ (Schalter in der Verwaltung): nur diese Speisen.
   *  Einträge als Text = derselbe Eintrag wie oben (gleicher Name, gleicher Preis). */
  kleinesBistro: {
    gruppen: [
      {
        id: 'herzhaft', titel: 'herzhaft', eintraege: [
          { id: 'brezel', name: 'Brezel', preis: '2.0' },
          { id: 'butterbrezel', name: 'Butterbrezel', preis: '3.0' },
          { id: 'gemuese-wrap', name: 'Gemüse Wrap', preis: '6.0', bild: { ...BILD.wrap, alt: 'Gemüse Wrap' } },   // im Normalbetrieb 8.0
        ],
      },
      { id: 'suess', titel: 'süß', eintraege: ['cookies', 'eis'] },
    ],
    bildfolge: ['gemuese-wrap'],
  },
};

/** alle Einträge des Normalbetriebs nach Kennung */
const ALLE = new Map(SPEISEN.gruppen.flatMap(g => g.eintraege).map(e => [e.id, e]));

/** ein Eintrag des Normalbetriebs (z. B. 'lasagne') */
export const speise = id => ALLE.get(id);

/**
 * Karte für einen Modus → [{ id, titel, eintraege: [Eintrag] }] und die Fotos in Reihenfolge.
 * klein = „Kleines Bistro“; Verweise (Text) werden zum vollständigen Eintrag aufgelöst.
 */
export function karte(klein = false) {
  const quelle = klein ? SPEISEN.kleinesBistro : SPEISEN;
  const gruppen = quelle.gruppen.map(g => ({ ...g, eintraege: g.eintraege.map(e => (typeof e === 'string' ? ALLE.get(e) : e)) }));
  const nachId = new Map(gruppen.flatMap(g => g.eintraege).map(e => [e.id, e]));
  return { gruppen, bildfolge: quelle.bildfolge.map(id => nachId.get(id)) };
}
