// Monitor 4 „Heute bei uns“ – alle Angebote, die in der Verwaltung (/monitor/admin/) an- und
// abgeschaltet werden können. Reihenfolge hier = Reihenfolge auf dem Monitor.
//
// Neues Angebot: Eintrag ergänzen (id nur Kleinbuchstaben, Ziffern und Bindestriche, nie
// wiederverwenden) und neu deployen. In der Verwaltung erscheint es sofort, aktiv ist es erst
// nach dem Einschalten (oder bei standard: true, solange noch nie gespeichert wurde).
//
//   art    'produkt' (Speise/Getränk), 'event' (Feier mit QR-Code) oder 'frei' (Text, Farbe und optional
//          ein hochgeladenes Bild aus der Verwaltung)
//   bild   vorhandenes Foto (keine KI-Bilder); ohne Bild zeigt der Monitor eine Textkarte
//   pos    Bildausschnitt (CSS object-position)
//   zoom   nur den oberen Teil des Bildes zeigen (Faktor; Kindergeburtstag: Deckblatt ohne dessen Schrift)
//   preis  genau wie auf der Karte geschrieben (eine Nachkommastelle, „2.0 | 3.0“)
//   unter  kurze Zeile unter dem Titel (optional)
//   punkte nur für die ganz große Darstellung (1 aktives Angebot)
//   qr     Schlüssel aus QRS
//
// Preise nur dort, wo sie bestätigt sind. Stichpunkte der Feiern 1:1 wie auf Monitor 1 (Abholmonitor).
// Lasagne ist hier ein normales, von Hand schaltbares Angebot – unabhängig von der Lasagne-Regel
// auf Monitor 2. Für Brezel | Butterbrezel gibt es noch kein Foto (Textkarte).

const BILD = '/images/abholmonitor/';

export const QRS = {
  catering: { bild: '/monitor/qr/qr-catering-broschuere.svg', text: 'tjorven-bistro.de/catering/broschuere' },
  kindergeburtstag: { bild: '/monitor/qr/qr-kindergeburtstag.svg', text: 'tjorven-bistro.de/kindergeburtstag' },
};

export const KATALOG = [
  { id: 'frei-1', titel: 'Freie Kachel 1', art: 'frei', standard: false },
  { id: 'frei-2', titel: 'Freie Kachel 2', art: 'frei', standard: false },
  { id: 'zimtschnecke', titel: 'Zimtschnecke', art: 'produkt', bild: BILD + '06-zimtschnecken-quer.jpeg', pos: '50% 60%', preis: '3.5', standard: false },
  { id: 'apfelkuchen', titel: 'Apfelkuchen', art: 'produkt', standard: false },
  { id: 'mousse-au-chocolat', titel: 'Mousse au Chocolat', art: 'produkt', preis: '2.0', standard: false },
  { id: 'weihnachtswaffel', titel: 'Weihnachtswaffel', art: 'produkt', bild: BILD + '18-waffel-puderzucker-quer.jpeg', pos: '40% 55%', standard: false },
  { id: 'kuerbissuppe', titel: 'Kürbissuppe', art: 'produkt', standard: false },
  { id: 'lasagne', titel: 'Lasagne', art: 'produkt', bild: BILD + '35-lasagne-neu-quer.jpeg', pos: '45% 55%', preis: '12.5', standard: false },
  { id: 'gemuese-wrap', titel: 'Gemüse Wrap', art: 'produkt', bild: BILD + '09-wrap-gemuese-quer.jpeg', pos: '50% 62%', preis: '8.0', standard: false },
  { id: 'brezel', titel: 'Brezel | Butterbrezel', art: 'produkt', preis: '2.0 | 3.0', standard: false },
  { id: 'saisonangebot', titel: 'Saisonangebot', art: 'produkt', unter: 'Fragt uns an der Theke', standard: false },
  { id: 'kindergeburtstag', titel: 'Kindergeburtstage', art: 'event', bild: '/images/kindergeburtstag-broschuere/seite-1-2400.webp', pos: '45% 0%', zoom: 2.3,
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
/** Kacheln, deren Text in der Verwaltung frei eingegeben wird */
export const FREI_IDS = KATALOG.filter(k => k.art === 'frei').map(k => k.id);

/** Grenzen für den Text einer freien Kachel (Verwaltung und Server prüfen dasselbe) */
export const FREI_MAX_ZEICHEN = 160;
export const FREI_MAX_ZEILEN = 6;
/** Hintergrund einer freien Kachel: Bistro-Grün (Standard) oder Markenrot */
export const FREI_FARBEN = ['gruen', 'rot'];
/** hochgeladenes Bild einer freien Kachel: SHA-256 des Inhalts + Endung (liegt privat unter monitore/bilder/) */
export const BILD_MUSTER = /^[0-9a-f]{64}\.(jpg|png|webp)$/;
/** öffentliche Adresse eines hochgeladenen Bildes (ausgeliefert von /api/monitore/specials/) */
export const bildAdresse = id => '/api/monitore/specials/?bild=' + id;

/**
 * Text einer freien Kachel vereinheitlichen: Zeilenumbrüche, keine Steuer- oder unsichtbaren
 * Formatzeichen, Leerzeichen zusammengefasst, Zeilen ohne Rand, höchstens eine Leerzeile am Stück.
 * → { text } oder { fehler } (zu lang / zu viele Zeilen). Kein HTML: der Monitor setzt den Text
 * ausschließlich als reinen Text (textContent).
 */
export function bereinigeFreitext(roh) {
  if (typeof roh !== 'string') return { fehler: 'Der Text ist ungültig.' };
  if (roh.length > 2000) return { fehler: `Der Text ist zu lang (höchstens ${FREI_MAX_ZEICHEN} Zeichen).` };
  let t = roh.normalize('NFC').replace(/\r\n?|[\u2028\u2029\u0085]/g, '\n').replace(/\t/g, ' ');
  t = t.replace(/[^\P{C}\n]/gu, '');   // Steuer-, Format- (z. B. Richtungswechsel), private und unbelegte Zeichen
  const zeilen = t.split('\n').map(z => z.replace(/\s+/g, ' ').trim());
  const sauber = [];
  for (const z of zeilen) if (z !== '' || (sauber.length && sauber[sauber.length - 1] !== '')) sauber.push(z);
  while (sauber.length && sauber[sauber.length - 1] === '') sauber.pop();
  const text = sauber.join('\n');
  if ([...text.replace(/\n/g, '')].length > FREI_MAX_ZEICHEN) return { fehler: `Der Text ist zu lang (höchstens ${FREI_MAX_ZEICHEN} Zeichen).` };
  if (sauber.length > FREI_MAX_ZEILEN) return { fehler: `Der Text hat zu viele Zeilen (höchstens ${FREI_MAX_ZEILEN}).` };
  return { text };
}

/** aktiv-Zustand je Angebot: gespeicherter Wert, sonst Standard aus dem Katalog */
export function zustand(gespeichert) {
  const aktiv = (gespeichert && gespeichert.aktiv) || {};
  return KATALOG.map(k => ({ id: k.id, aktiv: typeof aktiv[k.id] === 'boolean' ? aktiv[k.id] : k.standard }));
}

/**
 * gespeicherte freie Kacheln → { id: { text, farbe, bild } } (beim Lesen erneut geprüft; fehlend/ungültig =
 * leer, grün, ohne Bild). Liest auch format 2, in dem nur der Text als Zeichenkette stand.
 */
export function freieKacheln(gespeichert) {
  const frei = (gespeichert && gespeichert.frei && typeof gespeichert.frei === 'object') ? gespeichert.frei : {};
  return Object.fromEntries(FREI_IDS.map(id => {
    const k = frei[id];
    const roh = typeof k === 'string' ? { text: k } : (k && typeof k === 'object' ? k : {});
    return [id, {
      text: bereinigeFreitext(roh.text).text || '',
      farbe: FREI_FARBEN.includes(roh.farbe) ? roh.farbe : 'gruen',
      bild: typeof roh.bild === 'string' && BILD_MUSTER.test(roh.bild) ? roh.bild : null,
    }];
  }));
}

/** nur die Anzeigedaten der aktiven Angebote (für den öffentlichen Monitor) */
export function anzeige(gespeichert) {
  const an = new Set(zustand(gespeichert).filter(z => z.aktiv).map(z => z.id));
  const frei = freieKacheln(gespeichert);
  return KATALOG.filter(k => an.has(k.id)).flatMap(({ standard, qr, titel, ...k }) => {
    if (k.art === 'frei') {
      const f = frei[k.id];
      if (!f.text && !f.bild) return [];   // leer: Verwaltung lässt das nicht zu
      return [{ id: k.id, art: 'frei', zeilen: f.text ? f.text.split('\n') : [], farbe: f.farbe, ...(f.bild ? { bild: bildAdresse(f.bild) } : {}) }];
    }
    return [qr ? { ...k, titel, qr: QRS[qr] } : { ...k, titel }];
  });
}
