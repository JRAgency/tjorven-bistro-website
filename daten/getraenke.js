// Getränkekarte des Tjorven Bistro – die EINZIGE Stelle für Namen, Mengen, Preise, Kategorien und Fotos.
// Gelesen von: Monitor 3 (/monitor/getraenke/) und der Startseite (Abschnitt „Unsere Getränke“).
// Preise mit genau einer Nachkommastelle wie auf der Original-Karte (downloads/speisekarte-getraenkekarte.pdf).
//
// PFLEGE: Preis/Menge/Name hier ändern → nach dem Deployment stimmen Monitor 3 und Startseite.
//   bloecke        Einträge einer Kategorie in Gruppen; zwischen zwei Blöcken steht ein kleiner Abstand
//                  (abstand: 'gross' = eine ganze Leerzeile, z. B. nach dem Latte Macchiato)
//   hervorhebung   'eistee' = blassrotes Band wie auf der Original-Karte
//   kleinesBistro  false = beim „Kleinen Bistro“ nicht im Angebot
//   bildfolge      Fotos der Bildfolge; Preis aus dem genannten Eintrag (preisVon), damit er nur hier steht;
//                  fokus = wichtigster Bildteil (CSS object-position)

const ORDNER = '/images/abholmonitor/';
const FRITZ = '/images/monitore/';

export const GETRAENKE = {
  gruppen: [
    {
      id: 'kalt', titel: 'kalt', bloecke: [
        { eintraege: [
          { id: 'fritz-kola-original', name: 'Fritz Kola Original', menge: '0.33l', preis: '3.5' },
          { id: 'fritz-kola-superzero', name: 'Fritz Kola Superzero', menge: '0.33l', preis: '3.5' },
          { id: 'fritz-mischmasch', name: 'Fritz Mischmasch', menge: '0.33l', preis: '3.5' },
          { id: 'fritz-zitrone', name: 'Fritz Zitrone', menge: '0.33l', preis: '3.5' },
          { id: 'fritz-orange', name: 'Fritz Orange', menge: '0.33l', preis: '3.5' },
          { id: 'bio-rhabarberschorle', name: 'Bio Rhabarberschorle', menge: '0.33l', preis: '3.5' },
          { id: 'bio-traubenschorle', name: 'Bio Traubenschorle', menge: '0.33l', preis: '3.5' },
          { id: 'bio-apfelschorle', name: 'Bio Apfelschorle', menge: '0.33l', preis: '3.5' },
        ] },
        { hervorhebung: 'eistee', kleinesBistro: false, eintraege: [
          { id: 'eistee-gesuesst', name: 'Hagebutten-Eistee gesüßt', menge: '0.40l', preis: '3.5' },
          { id: 'eistee-ungesuesst', name: 'Hagebutten-Eistee ungesüßt', menge: '0.40l', preis: '3.5' },
        ] },
        { eintraege: [
          { id: 'black-forest-still', name: 'Black Forest Still', menge: '0.25l | 0.75l', preis: '2.5 | 4.5' },
          { id: 'peterstaler-classic', name: 'Peterstaler Classic', menge: '0.25l | 0.75l', preis: '2.5 | 4.5' },
        ] },
      ],
    },
    {
      id: 'alkoholisch', titel: 'alkoholisch', unterkategorie: true, bloecke: [
        { eintraege: [
          { id: 'lammsbraeu-pils', name: 'Lammsbräu Bio Pils', menge: '0.33l', preis: '4.0' },
          { id: 'lammsbraeu-radler', name: 'Lammsbräu Bio Radler', menge: '0.33l', preis: '4.0' },
          { id: 'lammsbraeu-alkoholfrei', name: 'Lammsbräu Bio alkoholfrei', menge: '0.33l', preis: '4.0' },
        ] },
      ],
    },
    {
      id: 'heiss', titel: 'heiß', kleinesBistro: false,
      bild: { datei: ORDNER + '24-kaffee-cappuccino-barista-hochkant.jpeg', alt: 'Espressomaschine', fokus: '50% 58%' },
      bloecke: [
        { eintraege: [
          { id: 'espresso', name: 'Espresso | Doppio', preis: '2.5 | 3.5' },
          { id: 'espresso-macchiato', name: 'Espresso Macchiato', preis: '3.0' },
          { id: 'cortado', name: 'Cortado', preis: '3.2' },
          { id: 'americano', name: 'Americano', preis: '3.5' },
          { id: 'cappuccino', name: 'Cappuccino', preis: '4.0' },
          { id: 'milchkaffee', name: 'Milchkaffee', preis: '4.0' },
          { id: 'latte-macchiato', name: 'Latte Macchiato', preis: '4.5' },
        ] },
        { abstand: 'gross', zusatz: 'Kräuter | Früchte | Grün | Schwarz', eintraege: [
          { id: 'heisse-schokolade', name: 'Heiße Schokolade', preis: '3.5' },
          { id: 'bio-tee', name: 'Bio Tee', preis: '3.5' },
        ] },
      ],
    },
  ],

  bildfolge: [
    { id: 'eistee', name: 'Hagebutten-Eistee', preisVon: 'eistee-gesuesst', kleinesBistro: false,
      bild: { datei: ORDNER + '30-hagebutten-eistee-hochkant.jpeg', alt: 'Hausgemachter Hagebutten-Eistee', fokus: '50% 56%' } },
    { id: 'fritz-kola', name: 'fritz-kola', preisVon: 'fritz-kola-original', freigestellt: true,
      bild: { datei: FRITZ + 'fritz-kola-original-superzero-mischmasch.jpg', alt: 'fritz-kola Super Zero, Original und Mischmasch' } },
    { id: 'cappuccino', name: 'Cappuccino', preisVon: 'cappuccino', kleinesBistro: false,
      bild: { datei: ORDNER + '27-herzlich-willkommen-tjorven-bistro.jpeg', alt: 'Cappuccino', fokus: '50% 72%' } },
    { id: 'fritz-limo', name: 'fritz-limo', preisVon: 'fritz-zitrone', freigestellt: true,
      bild: { datei: FRITZ + 'fritz-limo-zitrone-orange.jpg', alt: 'fritz-limo Zitrone und Orange' } },
    { id: 'fritz-spritz', name: 'fritz-spritz Bio-Schorlen', preisVon: 'bio-rhabarberschorle', freigestellt: true,
      bild: { datei: FRITZ + 'fritz-spritz-bio-schorlen-apfel-rhabarber-traube.jpg', alt: 'fritz-spritz Bio-Schorlen Apfel, Rhabarber und Traube' } },
  ],

  /** „Kleines Bistro“: alles oben ohne kleinesBistro: false – dazu als einziges Heißgetränk der Filterkaffee */
  kleinesBistro: {
    heiss: { id: 'heiss', titel: 'heiß', bloecke: [{ eintraege: [{ id: 'filterkaffee', name: 'Filterkaffee', preis: '2.5' }] }] },
  },
};

const ALLE = new Map(GETRAENKE.gruppen.flatMap(g => g.bloecke.flatMap(b => b.eintraege)).map(e => [e.id, e]));

/** ein Getränk nach Kennung */
export const getraenk = id => ALLE.get(id);

/**
 * Karte für einen Modus → { gruppen, bildfolge } mit aufgelösten Preisen der Fotos.
 * klein = „Kleines Bistro“: ohne alles mit kleinesBistro: false, heiß nur Filterkaffee.
 */
export function karte(klein = false) {
  const passt = x => !klein || x.kleinesBistro !== false;
  const gruppen = GETRAENKE.gruppen.filter(passt).map(g => ({ ...g, bloecke: g.bloecke.filter(passt) }));
  if (klein) gruppen.push(GETRAENKE.kleinesBistro.heiss);
  const bildfolge = GETRAENKE.bildfolge.filter(passt).map(f => ({ ...f, preis: ALLE.get(f.preisVon).preis }));
  return { gruppen, bildfolge };
}
