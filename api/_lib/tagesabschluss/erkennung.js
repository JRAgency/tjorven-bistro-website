// Tagesabschluss – Bilderkennung des Kassenbons mit Claude über das Vercel AI Gateway, nur serverseitig.
//
// Das Modell schreibt die relevanten Zeilen des Bons nur AB (als Text, genau wie gedruckt).
// Es rechnet nichts aus und ergänzt nichts. Ob ein Wert stimmt, entscheidet danach
// bon.js anhand der Kontrollrechnungen auf dem Bon.
//
// Zugang: Auf Vercel automatisch über das OIDC-Token des Projekts (kein eigener API-Schlüssel,
// abgerechnet über das AI-Gateway-Guthaben des Vercel-Kontos). Alternativ AI_GATEWAY_API_KEY.
// Ohne Zugang ist die Bilderkennung aus; der Tagesabschluss kann trotzdem von Hand eingetragen werden.

import Anthropic from '@anthropic-ai/sdk';

const MODELL = 'anthropic/claude-opus-5.5';
const GATEWAY = 'https://ai-gateway.vercel.sh';

/** Zugangstoken fürs AI Gateway oder null */
function zugang(request) {
  const schluessel = (process.env.AI_GATEWAY_API_KEY || '').trim();
  if (schluessel) return schluessel;
  const oidc = (process.env.VERCEL_OIDC_TOKEN || (request && request.headers && request.headers.get('x-vercel-oidc-token')) || '').trim();
  return oidc || null;
}

export const kiEingerichtet = request => zugang(request) !== null;

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

const ANWEISUNG = `Du liest das Foto eines deutschen Kassenberichts „Tagesabschluss“ (Kassensystem FLATPAY POS) eines Bistros –
entweder den gedruckten Bon oder den digitalen Bericht (Bildschirm/PDF).
Deine einzige Aufgabe: die unten genannten Zeilen exakt so ABSCHREIBEN, wie sie gedruckt sind.

Regeln:
- Schreibe Beträge genau wie gedruckt ab, mit Vorzeichen, Tausenderpunkt, Dezimalkomma und Währung, z. B. "1.744,15 €", "-12,39 €" oder "2.473,10 EUR".
  Fehlt auf dem Bericht ein Minus, ergänze keines.
- Rechne nichts aus, runde nichts und ergänze keine Werte aus anderen Zeilen. Kein Wert darf geschätzt werden.
- Ist eine Zeile nicht auf dem Foto, abgeschnitten, verdeckt oder nicht eindeutig lesbar: gib null zurück.
  Ist sie lesbar, du bist dir bei einzelnen Ziffern aber nicht sicher: schreibe ab, was du siehst, und trage den Pfad
  (z. B. "kasse.bargeld_entfernt" oder "mwst_19.brutto") in die Liste "unsicher" ein.
- Die Schrift des Bons druckt die Ziffer Null mit einem Punkt oder Strich in der Mitte – das ist eine 0, keine 8 und keine 9.
- Handschriftliche Zahlen, Häkchen, Unterstreichungen oder Markierungen gehören NICHT zum Bericht – ignoriere sie.
- Ordne jeden Betrag der Bezeichnung in derselben gedruckten Zeile zu. Ist das Foto schräg, folge der Zeile des Berichts, nicht der Bildwaagerechten.

Abzuschreiben:
- offen / schliessen / gedruckt: Datum mit Uhrzeit hinter „Offen:“, „Schließen:“ und „Gedruckt:“ (gedruckter Bon)
  bzw. hinter „Startdatum“, „Abschlussdatum“ und „Bericht erstellt“ (digitaler Bericht), genau wie gedruckt, z. B. "01.10.2026 17:01:04" oder "31/07/2026, 17:25".
- z_bericht_nummer: Zahl hinter „Z-Bericht-Nummer:“ bzw. „Dokumentennummer“.
- mwst_19 / mwst_7: Netto, MwSt. und Brutto des Steuersatzes 19 % bzw. 7 %.
  Gedruckter Bon: Abschnitt „MWST.-AUFSCHLÜSSELUNG“, Zeilen „Netto“, „MwSt.“ und „Brutto“ unter „Rate: 19.0%“ bzw. „Rate: 7.0%“
  (die eingerückten Zeilen Bargeld/Karte/Andere unter Netto gehören nicht dazu).
  Digitaler Bericht: Tabelle „MWST.-ÜBERSICHT“, Zeile „19.00 %“ bzw. „7.00 %“, Spalten „Netto-Betrag“, „MwSt.-Betrag“ und „Brutto-Betrag“
  (die Spalten Bargeld/Karte/Sonstiges gehören nicht dazu).
- mwst_gesamt: Netto, MwSt. und Brutto der Gesamt-Zeile in diesem Abschnitt.
- bargeld_gesamt_zahlungsuebersicht: im Abschnitt „ZAHLUNGSÜBERSICHT“ unter „Bargeld“ die Zeile „Gesamt“.
- kasse: im Abschnitt „KASSE“ die Zeilen Startbetrag, Eingenommenes Bargeld, Bargeldauszahlung (Karte) bzw. Bargeldauszahlung,
  Bargeld hinzugefügt, Bargeld entfernt, Erwartetes Bargeld bzw. Erwarteter Kassenbestand, Gezählter Bargeldbestand und Differenz.
- ist_tagesabschluss: false, wenn das Foto keinen solchen Tagesabschluss zeigt.`;

/** Fehler des AI Gateways als Kennwort – ohne Inhalte, nur Status und Art */
function protokolliere(f) {
  const art = (f && f.error && f.error.error && f.error.error.type) || (f && f.error && f.error.type) || '';
  console.error(`[tagesabschluss] AI Gateway: ${f && f.status ? f.status : 'ohne Status'} ${art}`.trim());
}

const KEIN_GUTHABEN = /credit|balance|insufficient|top.?up|payment|billing|free.?tier/i;

/**
 * Bon lesen. bild: Buffer (JPEG/PNG/WebP), mime: Medientyp, request: eingehende Anfrage (für das OIDC-Token).
 * Rückgabe: Objekt gemäß SCHEMA. Wirft ErkennungsFehler mit deutscher Meldung.
 */
export async function liesBon(bild, mime, request) {
  const token = zugang(request);
  if (!token) throw new ErkennungsFehler('ki_fehlt', 'Die Bilderkennung ist noch nicht eingerichtet.');
  const client = new Anthropic({
    apiKey: token,
    baseURL: process.env.TAGESABSCHLUSS_KI_URL || GATEWAY,
    timeout: 50_000,
    maxRetries: 0,
  });
  let antwort;
  try {
    antwort = await client.messages.create({
      model: MODELL,
      max_tokens: 16000,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: ANWEISUNG,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data: bild.toString('base64') } },
          { type: 'text', text: 'Schreibe die Werte dieses Tagesabschlusses gemäß Schema ab.' },
        ],
      }],
    });
  } catch (fehler) {
    if (fehler instanceof Anthropic.APIConnectionTimeoutError) throw new ErkennungsFehler('zeit', 'Die Bilderkennung hat zu lange gedauert.');
    protokolliere(fehler);
    const text = `${fehler && fehler.message ? fehler.message : ''}`;
    if (fehler instanceof Anthropic.APIError && (fehler.status === 402 || ((fehler.status === 403 || fehler.status === 400) && KEIN_GUTHABEN.test(text)))) {
      throw new ErkennungsFehler('guthaben', 'Für die Bilderkennung fehlt Guthaben im Vercel AI Gateway.');
    }
    if (fehler instanceof Anthropic.AuthenticationError || fehler instanceof Anthropic.PermissionDeniedError) throw new ErkennungsFehler('zugang', 'Der Zugang zur Bilderkennung wurde abgelehnt.');
    if (fehler instanceof Anthropic.RateLimitError) throw new ErkennungsFehler('limit', 'Die Bilderkennung ist gerade ausgelastet.');
    if (fehler instanceof Anthropic.BadRequestError) throw new ErkennungsFehler('anfrage', 'Das Bild konnte nicht analysiert werden.');
    throw new ErkennungsFehler('dienst', 'Die Bilderkennung ist gerade nicht erreichbar.');
  }
  if (antwort.stop_reason === 'refusal') throw new ErkennungsFehler('abgelehnt', 'Das Bild konnte nicht analysiert werden.');
  if (antwort.stop_reason === 'max_tokens') throw new ErkennungsFehler('unvollstaendig', 'Das Bild konnte nicht analysiert werden.');
  const json = (antwort.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  try {
    const daten = JSON.parse(json);
    if (!daten || typeof daten !== 'object' || Array.isArray(daten)) throw new Error('kein Objekt');
    return daten;
  } catch {
    throw new ErkennungsFehler('format', 'Das Bild konnte nicht analysiert werden.');
  }
}
