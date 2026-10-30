// Monitor 4 „Heute bei uns“ – alle Angebote, die in der Verwaltung (/monitor/admin/) an- und
// abgeschaltet werden können. Reihenfolge hier = Reihenfolge auf dem Monitor und in der Liste.
//
// Neues Angebot: Eintrag ergänzen (id nur Kleinbuchstaben, Ziffern und Bindestriche, nie
// wiederverwenden) und neu deployen. In der Verwaltung erscheint es sofort, aktiv ist es erst
// nach dem Einschalten (oder bei standard: true, solange noch nie gespeichert wurde).
// Entfernt (Version 4, auf Wunsch des Bistros) und deshalb gesperrt: weihnachtswaffel, kuerbissuppe,
// gemuese-wrap, saisonangebot, brezel – alte gespeicherte Schalter dieser Kennungen werden ignoriert.
//
//   art    'produkt' (Speise/Getränk, steht mit Preis in der Liste), 'event' (Feier mit QR-Code, steht in
//          der Liste), 'info' (feste Information wie die Öffnungszeiten – nie in der Liste) oder 'frei'
//          (freie Kachel aus der Verwaltung: Freitext oder Produkt mit Preis, Farbe, optional ein Bild)
//   bild   vorhandenes Foto (keine KI-Bilder); ohne Bild zeigt der Monitor eine Textkarte
//   pos    Bildausschnitt (CSS object-position)
//   zoom   nur den oberen Teil des Bildes zeigen (Faktor; Kindergeburtstag: Deckblatt ohne dessen Schrift)
//   preis  genau wie auf der Karte geschrieben (eine Nachkommastelle, „2.0 | 3.0“)
//   unter  kurze Zeile unter dem Titel (optional)
//   punkte nur für die ganz große Darstellung (1 aktives Angebot)
//   qr     Schlüssel aus QRS
//   zeilen/klein  Text einer Info-Kachel (groß / darunter klein)
//
// Preise nur dort, wo sie bestätigt sind. Stichpunkte der Feiern 1:1 wie auf Monitor 1 (Abholmonitor).
// Lasagne ist hier ein normales, von Hand schaltbares Angebot – unabhängig von der Lasagne-Regel
// auf Monitor 2.

const BILD = '/images/abholmonitor/';

export const QRS = {
  catering: { bild: '/monitor/qr/qr-catering-broschuere.svg', text: 'tjorven-bistro.de/catering/broschuere' },
  kindergeburtstag: { bild: '/monitor/qr/qr-kindergeburtstag.svg', text: 'tjorven-bistro.de/kindergeburtstag' },
};

export const KATALOG = [
  { id: 'frei-1', titel: 'Freie Kachel 1', art: 'frei', standard: false },
  { id: 'frei-2', titel: 'Freie Kachel 2', art: 'frei', standard: false },
  { id: 'frei-3', titel: 'Freie Kachel 3', art: 'frei', standard: false },
  { id: 'frei-4', titel: 'Freie Kachel 4', art: 'frei', standard: false },
  { id: 'zimtschnecke', titel: 'Zimtschnecke', art: 'produkt', bild: BILD + '06-zimtschnecken-quer.jpeg', pos: '50% 60%', preis: '3.5', standard: false },
  { id: 'apfelkuchen', titel: 'Apfelkuchen', art: 'produkt', standard: false },
  { id: 'mousse-au-chocolat', titel: 'Mousse au Chocolat', art: 'produkt', preis: '2.0', standard: false },
  { id: 'lasagne', titel: 'Lasagne', art: 'produkt', bild: BILD + '35-lasagne-neu-quer.jpeg', pos: '45% 55%', preis: '12.5', standard: false },
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
  { id: 'oeffnungszeiten', titel: 'Öffnungszeiten', art: 'info',
    zeilen: ['Heute geöffnet bis 17 Uhr', 'Warme Küche bis 16 Uhr', 'Kalte Getränke, Cookies und Eis bis 17 Uhr'],
    klein: ['Täglich geöffnet 10–17 Uhr', 'In der Schulwoche Mo–Fr ab 9 Uhr'],
    standard: false },
];

export const IDS = new Set(KATALOG.map(k => k.id));
/** freie Kacheln (Inhalt kommt aus der Verwaltung) */
export const FREI_IDS = KATALOG.filter(k => k.art === 'frei').map(k => k.id);

/** Grenzen (Verwaltung und Server prüfen dasselbe) */
export const FREI_MAX_ZEICHEN = 160;
export const FREI_MAX_ZEILEN = 6;
export const NAME_MAX_ZEICHEN = 40;
export const UEBERSCHRIFT_MAX_ZEICHEN = 40;
export const UEBERSCHRIFT_STANDARD = 'Heute bei uns';
/** Typ einer freien Kachel: Freitext (nie in der Preisliste) oder Produkt mit Preis (immer in der Preisliste) */
export const FREI_TYPEN = ['text', 'produkt'];
/** Hintergrund einer freien Kachel: Bistro-Grün (Standard) oder Markenrot */
export const FREI_FARBEN = ['gruen', 'rot'];
/** hochgeladenes Bild einer freien Kachel: SHA-256 des Inhalts + Endung (liegt privat unter monitore/bilder/) */
export const BILD_MUSTER = /^[0-9a-f]{64}\.(jpg|png|webp)$/;
/** öffentliche Adresse eines hochgeladenen Bildes (ausgeliefert von /api/monitore/specials/) */
export const bildAdresse = id => '/api/monitore/specials/?bild=' + id;

const ohneSteuerzeichen = t => t.replace(/[^\P{C}\n]/gu, '');   // Steuer-, Format- (z. B. Richtungswechsel), private und unbelegte Zeichen

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
  t = ohneSteuerzeichen(t);
  const zeilen = t.split('\n').map(z => z.replace(/\s+/g, ' ').trim());
  const sauber = [];
  for (const z of zeilen) if (z !== '' || (sauber.length && sauber[sauber.length - 1] !== '')) sauber.push(z);
  while (sauber.length && sauber[sauber.length - 1] === '') sauber.pop();
  const text = sauber.join('\n');
  if ([...text.replace(/\n/g, '')].length > FREI_MAX_ZEICHEN) return { fehler: `Der Text ist zu lang (höchstens ${FREI_MAX_ZEICHEN} Zeichen).` };
  if (sauber.length > FREI_MAX_ZEILEN) return { fehler: `Der Text hat zu viele Zeilen (höchstens ${FREI_MAX_ZEILEN}).` };
  return { text };
}

/** einzeiliger Text (Produktname, Überschrift): wie oben bereinigt, Zeilenumbrüche werden Leerzeichen → { text } | { fehler } */
export function bereinigeZeile(roh, max) {
  if (typeof roh !== 'string' || roh.length > 500) return { fehler: `Der Text ist zu lang (höchstens ${max} Zeichen).` };
  const text = ohneSteuerzeichen(roh.normalize('NFC').replace(/[\r\n\t\u2028\u2029\u0085]/g, ' ')).replace(/\s+/g, ' ').trim();
  if ([...text].length > max) return { fehler: `Der Text ist zu lang (höchstens ${max} Zeichen).` };
  return { text };
}

/**
 * Preis wie auf der Karte: eine Nachkommastelle, höchstens zwei Preise („2.0 | 3.0“).
 * Nimmt auch „3,50 €“, „3“ oder „2 / 3“ an → { preis } ('' = kein Preis) | { fehler }
 */
export function bereinigePreis(roh) {
  const hinweis = 'Den Preis bitte wie auf der Karte eingeben, z. B. 3.5 oder 2.0 | 3.0.';
  if (typeof roh !== 'string' || roh.length > 40) return { fehler: hinweis };
  const t = roh.normalize('NFKC').replace(/€|euro?/gi, '').replace(/\s+/g, '');
  if (t === '') return { preis: '' };
  const teile = t.split(/[|/]/);
  if (teile.length > 2) return { fehler: hinweis };
  const aus = [];
  for (const teil of teile) {
    const m = teil.match(/^(\d{1,3})(?:[.,](\d{1,2}))?$/);
    if (!m) return { fehler: hinweis };
    const nach = m[2] || '0';
    if (nach.length === 2 && nach[1] !== '0') return { fehler: 'Preise haben auf der Karte genau eine Nachkommastelle, z. B. 3.5.' };
    const preis = `${Number(m[1])}.${nach[0]}`;
    if (Number(preis) <= 0) return { fehler: hinweis };
    aus.push(preis);
  }
  return { preis: aus.join(' | ') };
}

/** aktiv-Zustand je Angebot: gespeicherter Wert, sonst Standard aus dem Katalog */
export function zustand(gespeichert) {
  const aktiv = (gespeichert && gespeichert.aktiv) || {};
  return KATALOG.map(k => ({ id: k.id, aktiv: typeof aktiv[k.id] === 'boolean' ? aktiv[k.id] : k.standard }));
}

/**
 * gespeicherte freie Kacheln → { id: { typ, text, name, preis, farbe, bild } } (beim Lesen erneut geprüft;
 * fehlend/ungültig = leerer Freitext, grün, ohne Bild). Liest auch ältere Stände: format 2 (nur der Text
 * als Zeichenkette) und format 3 ({ text, farbe, bild } – damals gab es nur Freitext und zwei Kacheln).
 */
export function freieKacheln(gespeichert) {
  const frei = (gespeichert && gespeichert.frei && typeof gespeichert.frei === 'object') ? gespeichert.frei : {};
  return Object.fromEntries(FREI_IDS.map(id => {
    const k = frei[id];
    const roh = typeof k === 'string' ? { text: k } : (k && typeof k === 'object' ? k : {});
    return [id, {
      typ: FREI_TYPEN.includes(roh.typ) ? roh.typ : 'text',
      text: bereinigeFreitext(roh.text).text || '',
      name: bereinigeZeile(roh.name, NAME_MAX_ZEICHEN).text || '',
      preis: bereinigePreis(roh.preis).preis || '',
      farbe: FREI_FARBEN.includes(roh.farbe) ? roh.farbe : 'gruen',
      bild: typeof roh.bild === 'string' && BILD_MUSTER.test(roh.bild) ? roh.bild : null,
    }];
  }));
}

/** Einstellungen für alle Monitore: eigene Überschrift von Monitor 4 ('' = Standard) und „Kleines Bistro“ */
export function einstellungen(gespeichert) {
  const g = gespeichert && typeof gespeichert === 'object' ? gespeichert : {};
  return {
    ueberschrift: bereinigeZeile(g.ueberschrift, UEBERSCHRIFT_MAX_ZEICHEN).text || '',
    kleinesBistro: g.kleinesBistro === true,
  };
}

/** eine freie Kachel für den Monitor: Produkt wie ein festes Produkt (mit Farbe), Freitext als art 'frei'; leer → null */
function freiAnzeige(id, f) {
  const bild = f.bild ? { bild: bildAdresse(f.bild) } : {};
  if (f.typ === 'produkt') return f.name && f.preis ? { id, art: 'produkt', titel: f.name, preis: f.preis, farbe: f.farbe, frei: true, ...bild } : null;
  return f.text || f.bild ? { id, art: 'frei', zeilen: f.text ? f.text.split('\n') : [], farbe: f.farbe, ...bild } : null;   // leer: Verwaltung lässt das nicht zu
}

/** nur die Anzeigedaten der aktiven Angebote (für den öffentlichen Monitor) */
export function anzeige(gespeichert) {
  const an = new Set(zustand(gespeichert).filter(z => z.aktiv).map(z => z.id));
  const frei = freieKacheln(gespeichert);
  return KATALOG.filter(k => an.has(k.id)).flatMap(({ standard, qr, titel, ...k }) => {
    if (k.art === 'frei') { const a = freiAnzeige(k.id, frei[k.id]); return a ? [a] : []; }
    return [qr ? { ...k, titel, qr: QRS[qr] } : { ...k, titel }];
  });
}

/** öffentliche Antwort für die Monitore 2–4 */
export function oeffentlich(gespeichert) {
  const { ueberschrift, kleinesBistro } = einstellungen(gespeichert);
  return { angebote: anzeige(gespeichert), ueberschrift: ueberschrift || UEBERSCHRIFT_STANDARD, kleinesBistro };
}
