// Tagesabschluss – Bilderkennung des Kassenbons mit Claude (Anthropic API), nur serverseitig.
//
// Das Modell schreibt die relevanten Zeilen des Bons nur AB (als Text, genau wie gedruckt).
// Es rechnet nichts aus und ergänzt nichts. Ob ein Wert stimmt, entscheidet danach
// bon.js anhand der Kontrollrechnungen auf dem Bon.
//
// Benötigt die Umgebungsvariable ANTHROPIC_API_KEY. Ohne sie ist die Bilderkennung aus;
// der Tagesabschluss kann dann trotzdem von Hand eingetragen werden.

import Anthropic from '@anthropic-ai/sdk';

const MODELL = 'claude-opus-5-5';

export const kiEingerichtet = () => typeof process.env.ANTHROPIC_API_KEY === 'string' && process.env.ANTHROPIC_API_KEY.trim() !== '';

export class ErkennungsFehler extends Error {
  constructor(code, meldung) { super(meldung); this.code = code; }
}

const text = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const satz = {
  type: 'object', additionalProperties: false, required: ['netto', 'mwst', 'brutto'],
  properties: { netto: text, mwst: text, brutto: text },
};

/** Antwortschema: alle Werte als gedruckter Text, null = nicht auf dem Foto bzw. nicht sicher lesbar */
export const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ist_tagesabschluss', 'offen', 'schliessen', 'gedruckt', 'z_bericht_nummer', 'mwst_19', 'mwst_7',
             'mwst_gesamt', 'bargeld_gesamt_zahlungsuebersicht', 'kasse', 'unsicher'],
  properties: {
    ist_tagesabschluss: { type: 'boolean' },
    offen: text,
    schliessen: text,
    gedruckt: text,
    z_bericht_nummer: text,
    mwst_19: satz,
    mwst_7: satz,
    mwst_gesamt: satz,
    bargeld_gesamt_zahlungsuebersicht: text,
    kasse: {
      type: 'object', additionalProperties: false,
      required: ['startbetrag', 'eingenommenes_bargeld', 'bargeldauszahlung_karte', 'bargeld_hinzugefuegt',
                 'bargeld_entfernt', 'erwartetes_bargeld', 'gezaehlter_bargeldbestand', 'differenz'],
      properties: {
        startbetrag: text, eingenommenes_bargeld: text, bargeldauszahlung_karte: text, bargeld_hinzugefuegt: text,
        bargeld_entfernt: text, erwartetes_bargeld: text, gezaehlter_bargeldbestand: text, differenz: text,
      },
    },
    unsicher: { type: 'array', items: { type: 'string' } },
  },
};

const ANWEISUNG = `Du liest das Foto eines deutschen Kassenbons „Tagesabschluss“ (Kassensystem FLATPAY POS) eines Bistros.
Deine einzige Aufgabe: die unten genannten Zeilen exakt so ABSCHREIBEN, wie sie gedruckt sind.

Regeln:
- Schreibe Beträge genau wie gedruckt ab, mit Vorzeichen, Tausenderpunkt, Dezimalkomma und €-Zeichen, z. B. "1.744,15 €" oder "-12,39 €".
- Rechne nichts aus, runde nichts und ergänze keine Werte aus anderen Zeilen. Kein Wert darf geschätzt werden.
- Ist eine Zeile nicht auf dem Foto, abgeschnitten, verdeckt oder nicht eindeutig lesbar: gib null zurück.
  Ist sie lesbar, du bist dir bei einzelnen Ziffern aber nicht sicher: schreibe ab, was du siehst, und trage den Pfad
  (z. B. "kasse.bargeld_entfernt" oder "mwst_19.brutto") in die Liste "unsicher" ein.
- Die Schrift des Bons druckt die Ziffer Null mit einem Punkt oder Strich in der Mitte – das ist eine 0, keine 8 und keine 9.
- Handschriftliche Zahlen, Häkchen, Unterstreichungen oder Markierungen gehören NICHT zum Bon – ignoriere sie.
- Ordne jeden Betrag der Bezeichnung in derselben gedruckten Zeile zu. Ist das Foto schräg, folge der Zeile des Bons, nicht der Bildwaagerechten.

Abzuschreiben:
- offen / schliessen / gedruckt: Datum mit Uhrzeit hinter „Offen:“, „Schließen:“ und „Gedruckt:“ im Kopf des Bons.
- z_bericht_nummer: Zahl hinter „Z-Bericht-Nummer:“.
- mwst_19 / mwst_7: im Abschnitt „MWST.-AUFSCHLÜSSELUNG“ die Zeilen „Netto“, „MwSt.“ und „Brutto“ unter „Rate: 19.0%“ bzw. „Rate: 7.0%“.
  (Die eingerückten Zeilen Bargeld/Karte/Andere unter Netto gehören nicht dazu.)
- mwst_gesamt: Netto, MwSt. und Brutto unter „Gesamt:“ in diesem Abschnitt.
- bargeld_gesamt_zahlungsuebersicht: im Abschnitt „ZAHLUNGSÜBERSICHT“ unter „Bargeld:“ die Zeile „Gesamt“.
- kasse: im Abschnitt „KASSE“ die Zeilen Startbetrag, Eingenommenes Bargeld, Bargeldauszahlung (Karte),
  Bargeld hinzugefügt, Bargeld entfernt, Erwartetes Bargeld, Gezählter Bargeldbestand und Differenz.
- ist_tagesabschluss: false, wenn das Foto keinen solchen Kassenbon zeigt.`;

/**
 * Bon lesen. bild: Buffer (JPEG/PNG/WebP), mime: Medientyp.
 * Rückgabe: Objekt gemäß SCHEMA. Wirft ErkennungsFehler mit deutscher Meldung.
 */
export async function liesBon(bild, mime) {
  if (!kiEingerichtet()) throw new ErkennungsFehler('ki_fehlt', 'Die Bilderkennung ist noch nicht eingerichtet.');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 50_000, maxRetries: 0 });
  let antwort;
  try {
    antwort = await client.beta.messages.create({
      model: MODELL,
      max_tokens: 16000,
      // bei einer Ablehnung durch die Sicherheitsfilter übernimmt serverseitig ein Ersatzmodell
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: ANWEISUNG,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data: bild.toString('base64') } },
          { type: 'text', text: 'Schreibe die Werte dieses Tagesabschluss-Bons gemäß Schema ab.' },
        ],
      }],
    });
  } catch (fehler) {
    if (fehler instanceof Anthropic.APIConnectionTimeoutError) throw new ErkennungsFehler('zeit', 'Die Bilderkennung hat zu lange gedauert.');
    if (fehler instanceof Anthropic.AuthenticationError) throw new ErkennungsFehler('schluessel', 'Der Schlüssel für die Bilderkennung ist ungültig.');
    if (fehler instanceof Anthropic.RateLimitError) throw new ErkennungsFehler('limit', 'Die Bilderkennung ist gerade ausgelastet.');
    if (fehler instanceof Anthropic.BadRequestError) throw new ErkennungsFehler('anfrage', 'Das Bild konnte nicht analysiert werden.');
    if (fehler instanceof Anthropic.APIError) throw new ErkennungsFehler('dienst', 'Die Bilderkennung ist gerade nicht erreichbar.');
    throw new ErkennungsFehler('dienst', 'Die Bilderkennung ist gerade nicht erreichbar.');
  }
  if (antwort.stop_reason === 'refusal') throw new ErkennungsFehler('abgelehnt', 'Das Bild konnte nicht analysiert werden.');
  if (antwort.stop_reason === 'max_tokens') throw new ErkennungsFehler('unvollstaendig', 'Das Bild konnte nicht analysiert werden.');
  const json = antwort.content.filter(b => b.type === 'text').map(b => b.text).join('');
  try {
    const daten = JSON.parse(json);
    if (!daten || typeof daten !== 'object' || Array.isArray(daten)) throw new Error('kein Objekt');
    return daten;
  } catch {
    throw new ErkennungsFehler('format', 'Das Bild konnte nicht analysiert werden.');
  }
}
