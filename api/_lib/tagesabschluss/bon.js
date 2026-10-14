// Tagesabschluss – Auswertung eines gelesenen Kassenbons (FLATPAY POS „Tagesabschluss“).
//
// Die Bilderkennung liefert nur die ABGESCHRIEBENEN Texte des Bons (siehe erkennung.js).
// Hier werden sie in Zahlen/Datum umgewandelt und mit den Kontrollrechnungen geprüft,
// die der Bon selbst enthält. Ein Wert gilt nur als „sicher“, wenn eine dieser
// Rechnungen aufgeht – sonst bleibt das Feld leer und muss von Hand geprüft werden.
// Es wird nie ein Wert errechnet oder geraten, der nicht so auf dem Bon steht.
//
// Kontrollrechnungen (an beiden Referenzbons nachvollzogen):
//   Rate 19 % / 7 %:  Netto + MwSt. = Brutto, MwSt. ≈ Brutto × Satz / (100 + Satz)
//   Gesamt:           Brutto 19 % + Brutto 7 % = Gesamt Brutto
//   KASSE:            Startbetrag + Eingenommenes Bargeld + Bargeldauszahlung (Karte)
//                     + Bargeld hinzugefügt + Bargeld entfernt = Erwartetes Bargeld
//                     Gezählter Bargeldbestand − Erwartetes Bargeld = Differenz

/* ---------------------------------------------------------------- Beträge */

const MINUS = /[−–—]/g;            // −, –, — → "-"
const LEER = /[\s   ]/g;           // Leerzeichen inkl. geschützter/schmaler

/**
 * Deutschen Geldbetrag in Cent umwandeln. Gibt null zurück, wenn der Text kein
 * eindeutiger Betrag ist.
 *  streng = true  (Bon):     immer genau zwei Nachkommastellen mit Komma, z. B. „1.744,15 €“, „-12,39 €“
 *  streng = false (Eingabe): zusätzlich „12“, „12,5“, „1744.15“, „1.744“ (Tausenderpunkt)
 */
export function betragInCent(text, { streng = true } = {}) {
  if (typeof text !== 'string') return null;
  let t = text.replace(MINUS, '-').replace(/€|EUR/gi, '').replace(LEER, '');
  if (!t) return null;
  // nachgestelltes Minus („12,39-“) wie auf manchen Bons
  if (/^\d.*-$/.test(t)) t = '-' + t.slice(0, -1);
  const neg = t.startsWith('-');
  if (neg || t.startsWith('+')) t = t.slice(1);
  let euro, cent;
  let m = t.match(/^(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})$/);            // 1.744,15 | 266,30
  if (m) { euro = m[1].replace(/\./g, ''); cent = m[2]; }
  else if (!streng) {
    if ((m = t.match(/^(\d{1,3}(?:\.\d{3})+|\d+),(\d)$/))) { euro = m[1].replace(/\./g, ''); cent = m[2] + '0'; }   // 12,5
    else if ((m = t.match(/^(\d+)$/))) { euro = m[1]; cent = '00'; }                                                // 12
    else if ((m = t.match(/^(\d{1,3}(?:\.\d{3})+)$/))) { euro = m[1].replace(/\./g, ''); cent = '00'; }             // 1.744
    else if ((m = t.match(/^(\d+)\.(\d{1,2})$/))) { euro = m[1]; cent = m[2].padEnd(2, '0'); }                     // 1744.15
    else return null;
  } else return null;
  if (euro.length > 9) return null;
  const wert = Number(euro) * 100 + Number(cent);
  return neg ? -wert : wert;
}

export const centInEuro = c => (c === null || c === undefined ? null : Math.round(c) / 100);

/* ----------------------------------------------------------------- Datum */

/** „01.10.2026“ oder „01.10.2026 17:01:04“ → „2026-10-01“; ungültige Kalenderdaten → null */
export function datumAusText(text) {
  if (typeof text !== 'string') return null;
  const m = text.replace(LEER, ' ').match(/(\d{1,2})[.,](\d{1,2})[.,](\d{4})/);
  if (!m) return null;
  return isoDatum(Number(m[3]), Number(m[2]), Number(m[1]));
}

export function isoDatum(jahr, monat, tag) {
  if (jahr < 2000 || jahr > 2100 || monat < 1 || monat > 12 || tag < 1 || tag > 31) return null;
  const d = new Date(Date.UTC(jahr, monat - 1, tag));
  if (d.getUTCFullYear() !== jahr || d.getUTCMonth() !== monat - 1 || d.getUTCDate() !== tag) return null;
  return `${jahr}-${String(monat).padStart(2, '0')}-${String(tag).padStart(2, '0')}`;
}

/** „2026-10-13“ prüfen: echtes Kalenderdatum */
export function istIsoDatum(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [j, m, t] = s.split('-').map(Number);
  return isoDatum(j, m, t) === s;
}

/** heutiges Datum in Deutschland (Europe/Berlin) als ISO */
export function heuteInBerlin(jetzt = new Date()) {
  const teile = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(jetzt);
  return teile; // en-CA liefert YYYY-MM-DD
}

const tageZwischen = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

/* ------------------------------------------------------- Auswertung Bon */

const SICHER = 'sicher', PRUEFEN = 'pruefen', FEHLT = 'fehlt';

/** Ziel-Felder der Erkennung (Schlüssel = Feldname im Formular) */
export const ERKANNTE_FELDER = ['datum', 'umsatz19', 'umsatz7', 'umsatzBar', 'bargeldEntfernt', 'gezaehlterBargeldbestand'];

/** Schema-Pfade der Erkennung → Formularfeld */
const UNSICHER_ZU_FELD = {
  'mwst_19.brutto': 'umsatz19', 'mwst_7.brutto': 'umsatz7', 'kasse.eingenommenes_bargeld': 'umsatzBar',
  'kasse.bargeld_entfernt': 'bargeldEntfernt', 'kasse.gezaehlter_bargeldbestand': 'gezaehlterBargeldbestand',
  offen: 'datum', schliessen: 'datum',
};

const gleich = (a, b, toleranz = 1) => a !== null && b !== null && Math.abs(a - b) <= toleranz;

/** MwSt.-Plausibilität: Steuer aus Brutto zurückgerechnet, Abweichung höchstens 10 Cent bzw. 2 % */
function steuerPasst(brutto, mwst, satz) {
  if (brutto === null || mwst === null) return false;
  const soll = brutto * satz / (100 + satz);
  return Math.abs(soll - mwst) <= Math.max(10, Math.abs(soll) * 0.02);
}

/**
 * Gelesene Bon-Texte (Schema aus erkennung.js) auswerten.
 * Ergebnis:
 *   werte   – Zahlen in Euro bzw. ISO-Datum; null, wenn nicht sicher
 *   status  – je Feld 'sicher' | 'pruefen' | 'fehlt'
 *   hinweise – je Feld ein kurzer Satz für die Prüfansicht (nur bei pruefen/fehlt)
 */
export function bewerteBon(roh, { heute = heuteInBerlin() } = {}) {
  const r = roh && typeof roh === 'object' ? roh : {};
  // Felder, die die Erkennung selbst als unsicher gemeldet hat (Pfade wie „kasse.bargeld_entfernt“)
  const unsicher = new Set((Array.isArray(r.unsicher) ? r.unsicher : []).map(x => UNSICHER_ZU_FELD[x]).filter(Boolean));
  const c = text => betragInCent(text, { streng: true });

  const s19 = r.mwst_19 || {}, s7 = r.mwst_7 || {}, sg = r.mwst_gesamt || {}, k = r.kasse || {};
  const b19 = c(s19.brutto), n19 = c(s19.netto), m19 = c(s19.mwst);
  const b7 = c(s7.brutto), n7 = c(s7.netto), m7 = c(s7.mwst);
  const bGes = c(sg.brutto);
  const start = c(k.startbetrag), ein = c(k.eingenommenes_bargeld), ausz = c(k.bargeldauszahlung_karte),
        hinzu = c(k.bargeld_hinzugefuegt), entf = c(k.bargeld_entfernt), erw = c(k.erwartetes_bargeld),
        gez = c(k.gezaehlter_bargeldbestand), diff = c(k.differenz);
  const barZahlung = c(r.bargeld_gesamt_zahlungsuebersicht);

  const werte = {}, status = {}, hinweise = {}, pruefungen = {};
  const setze = (feld, cent, ok, hinweisPruefen, hinweisFehlt) => {
    if (cent === null) { werte[feld] = null; status[feld] = FEHLT; hinweise[feld] = hinweisFehlt; return; }
    if (ok && !unsicher.has(feld)) { werte[feld] = centInEuro(cent); status[feld] = SICHER; return; }
    werte[feld] = null; status[feld] = PRUEFEN; hinweise[feld] = hinweisPruefen;
  };

  // --- Umsatz 19 % / 7 % (Brutto des jeweiligen Steuersatzes)
  const satz19 = gleich(add(n19, m19), b19) && steuerPasst(b19, m19, 19);
  const satz7 = gleich(add(n7, m7), b7) && steuerPasst(b7, m7, 7);
  // Gesamt-Brutto bestätigt einen Satz, wenn der andere für sich bestätigt ist
  const gesamt = gleich(add(b19, b7), bGes);
  pruefungen.rate19 = satz19; pruefungen.rate7 = satz7; pruefungen.gesamt = gesamt;
  setze('umsatz19', b19, satz19 || (gesamt && satz7),
    'Nicht sicher erkannt – bitte prüfen (Brutto unter „Rate: 19.0%“).',
    'Auf dem Foto nicht gefunden – bitte vom Bon abtippen (Brutto unter „Rate: 19.0%“).');
  setze('umsatz7', b7, satz7 || (gesamt && satz19),
    'Nicht sicher erkannt – bitte prüfen (Brutto unter „Rate: 7.0%“).',
    'Auf dem Foto nicht gefunden – bitte vom Bon abtippen (Brutto unter „Rate: 7.0%“).');

  // --- KASSE: Startbetrag + Bewegungen = Erwartetes Bargeld
  // Das Vorzeichen der „Bargeldauszahlung (Karte)“ ist auf den Referenzbons nicht
  // erkennbar (dort 0,00 €) – beide Lesarten werden geprüft.
  let kasse = false;
  if ([start, ein, hinzu, entf, erw].every(v => v !== null)) {
    const basis = start + ein + hinzu + entf;
    kasse = ausz === null ? false : (gleich(basis + ausz, erw) || gleich(basis - ausz, erw));
  }
  pruefungen.kasse = kasse;
  // Eingenommenes Bargeld zusätzlich über die Zahlungsübersicht („Bargeld … Gesamt“)
  const einZweitquelle = barZahlung !== null && gleich(barZahlung, ein, 0);
  pruefungen.bargeldZahlungsuebersicht = einZweitquelle;
  setze('umsatzBar', ein, kasse || einZweitquelle,
    'Nicht sicher erkannt – bitte prüfen („Eingenommenes Bargeld“ unter KASSE).',
    'Auf dem Foto nicht gefunden – bitte vom Bon abtippen („Eingenommenes Bargeld“ unter KASSE).');
  setze('bargeldEntfernt', entf, kasse,
    'Nicht sicher erkannt – bitte prüfen („Bargeld entfernt“ unter KASSE, meist mit Minus).',
    'Auf dem Foto nicht gefunden – bitte vom Bon abtippen („Bargeld entfernt“ unter KASSE).');

  // --- Gezählter Bargeldbestand: Differenz = Gezählt − Erwartet, Erwartet durch KASSE bestätigt
  const gezOk = kasse && gez !== null && diff !== null && gleich(gez - erw, diff);
  pruefungen.gezaehlt = gezOk;
  setze('gezaehlterBargeldbestand', gez, gezOk,
    'Nicht sicher erkannt – bitte prüfen („Gezählter Bargeldbestand“ unter KASSE).',
    'Auf dem Foto nicht gefunden („Gezählter Bargeldbestand“ unter KASSE).');

  // --- Datum: Tag der Kassenöffnung/-schließung, NICHT das Druckdatum
  const dOffen = datumAusText(r.offen), dSchl = datumAusText(r.schliessen), dDruck = datumAusText(r.gedruckt);
  let datum = null, datumOk = false, datumHinweis;
  if (dOffen && dSchl) {
    datum = dSchl;
    datumOk = dOffen === dSchl;
    if (!datumOk) datumHinweis = 'Öffnungs- und Schließdatum auf dem Bon unterscheiden sich – bitte Datum prüfen.';
  } else if (dSchl || dOffen) {
    datum = dSchl || dOffen;
    datumHinweis = 'Datum nur einmal lesbar – bitte prüfen („Offen:“ / „Schließen:“ oben auf dem Bon).';
  } else if (dDruck) {
    datumHinweis = 'Auf dem Foto ist nur das Druckdatum lesbar – das ist nicht unbedingt der Tag des Abschlusses. Bitte Datum eintragen.';
  }
  if (datum && datumOk) {
    const abstand = tageZwischen(datum, heute);
    if (abstand < -1) { datumOk = false; datumHinweis = 'Das erkannte Datum liegt in der Zukunft – bitte prüfen.'; }
    else if (abstand > 400) { datumOk = false; datumHinweis = 'Das erkannte Datum liegt über ein Jahr zurück – bitte prüfen.'; }
  }
  pruefungen.datum = datumOk;
  if (datum && datumOk && !unsicher.has('datum')) { werte.datum = datum; status.datum = SICHER; }
  else if (datum || dDruck) { werte.datum = null; status.datum = PRUEFEN; hinweise.datum = datumHinweis || 'Nicht sicher erkannt – bitte Datum prüfen.'; }
  else { werte.datum = null; status.datum = FEHLT; hinweise.datum = 'Kein Datum auf dem Foto gefunden – bitte Datum eintragen.'; }

  return { werte, status, hinweise, pruefungen, istTagesabschluss: r.ist_tagesabschluss !== false };
}

function add(a, b) { return a === null || b === null ? null : a + b; }
