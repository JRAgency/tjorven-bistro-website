// POST /api/tagesabschluss/analysieren – Foto des Bons lesen und Werte vorschlagen.
// Speichert NICHTS: Das Ergebnis geht nur zurück in die Prüfansicht. Gespeichert wird
// erst, wenn dort ausdrücklich „Tagesabschluss speichern“ gedrückt wird.

import { json, fehler, nurMethoden, vonEigenerSeite, fremdeSeite, leseJson } from '../_lib/tagesabschluss/antwort.js';
import { brauchtSitzung } from '../_lib/tagesabschluss/sitzung.js';
import { pruefeFoto, base64ZuPuffer, MAX_ANFRAGE_BYTES } from '../_lib/tagesabschluss/pruefung.js';
import { liesBon, kiEingerichtet, ErkennungsFehler } from '../_lib/tagesabschluss/erkennung.js';
import { bewerteBon } from '../_lib/tagesabschluss/bon.js';
import { barkassenInfo } from '../_lib/tagesabschluss/barkasse.js';
import * as speicher from '../_lib/tagesabschluss/speicher.js';
import { fuerAnzeige, unerwartet } from '../_lib/tagesabschluss/gemeinsam.js';

const MELDUNG = {
  zeit: 'Die Bilderkennung hat zu lange gedauert. Bitte erneut versuchen oder die Werte von Hand eintragen.',
  limit: 'Die Bilderkennung ist gerade ausgelastet. Bitte in einer Minute erneut versuchen oder die Werte von Hand eintragen.',
  schluessel: 'Die Bilderkennung ist falsch eingerichtet (Schlüssel ungültig). Bitte die Werte von Hand eintragen.',
};

export default {
  async fetch(request) {
    if (request.method !== 'POST') return nurMethoden('POST');
    if (!vonEigenerSeite(request)) return fremdeSeite();
    const verweigert = brauchtSitzung(request);
    if (verweigert) return verweigert;

    let daten;
    try { daten = await leseJson(request, MAX_ANFRAGE_BYTES); } catch (f) { return fehler(f.status || 400, f.meldung || 'Die Anfrage ist ungültig.'); }
    const puffer = base64ZuPuffer(daten.bild);
    if (!puffer) return fehler(422, 'Es wurde kein gültiges Foto übertragen.', { code: 'foto' });
    const foto = pruefeFoto(puffer);
    if (!foto.ok) return fehler(422, foto.meldung, { code: 'foto' });

    if (!kiEingerichtet()) {
      return fehler(503, 'Die automatische Erkennung ist noch nicht eingerichtet. Bitte die Werte von Hand eintragen.', { code: 'ki_fehlt' });
    }

    let roh;
    try {
      roh = await liesBon(puffer, foto.mime);
    } catch (f) {
      if (f instanceof ErkennungsFehler) {
        console.error(`[tagesabschluss] Erkennung: ${f.code}`);
        return fehler(f.code === 'zeit' ? 504 : 502, MELDUNG[f.code] || 'Das Bild konnte nicht analysiert werden. Bitte die Werte von Hand eintragen.', { code: 'erkennung' });
      }
      return unerwartet(f, 'Erkennung');
    }

    const ergebnis = bewerteBon(roh);
    if (!ergebnis.istTagesabschluss) {
      return fehler(422, 'Auf dem Foto wurde kein Tagesabschluss erkannt. Bitte ein Foto des Bons aufnehmen oder die Werte von Hand eintragen.', { code: 'kein_bon' });
    }

    // Früher Hinweis, falls für das erkannte Datum schon ein Tagesabschluss existiert
    let vorhanden = null;
    if (ergebnis.werte.datum && speicher.istEingerichtet()) {
      try { vorhanden = fuerAnzeige((await speicher.liesEintrag(ergebnis.werte.datum)).eintrag); } catch { vorhanden = null; }
    }

    return json({
      werte: ergebnis.werte,
      status: ergebnis.status,
      hinweise: ergebnis.hinweise,
      barkasse: barkassenInfo(),
      vorhanden,
    });
  },
};
