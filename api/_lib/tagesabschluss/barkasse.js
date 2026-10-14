// Tagesabschluss – Barkassenbestand: die EINZIGE Stelle für diese Geschäftsregel.
//
// STAND: Die Regel ist fachlich noch NICHT bestätigt. Deshalb wird hier bewusst nichts
// berechnet – der Barkassenbestand wird in der Prüfansicht von Hand eingetragen (oder
// leer gelassen). Die Oberfläche enthält keine eigene Barkassen-Formel.
//
// Was der Bon liefert (KASSE-Abschnitt, an beiden Referenzbons nachgerechnet):
//   Erwartetes Bargeld = Startbetrag + Eingenommenes Bargeld + Bargeldauszahlung (Karte)
//                        + Bargeld hinzugefügt + Bargeld entfernt
//   Differenz          = Gezählter Bargeldbestand − Erwartetes Bargeld
//
// Mögliche Regeln, zwischen denen noch entschieden werden muss:
//   A) Barkassenbestand = Gezählter Bargeldbestand laut Bon
//   B) Barkassenbestand = Barkassenbestand Vortag + Umsatz bar − Barausgabe − Bankeinzahlung
//                         + Bargeld entfernt (auf dem Bon negativ) + Kassendifferenz
//      (nur richtig, wenn Barausgaben/Bankeinzahlungen NICHT schon als „Bargeld entfernt“
//      in der Kasse gebucht werden – sonst würden sie doppelt abgezogen)
//
// Sobald die Regel bestätigt ist: BESTAETIGT auf true setzen und berechne() ausfüllen.
// Der Vortag (letzter gespeicherter Tag vor dem Datum) wird dann von der Funktion
// übergeben, die diese Datei nutzt.

export const BARKASSEN_REGEL = {
  bestaetigt: false,
  hinweis: 'Die Berechnungsregel für den Barkassenbestand ist noch nicht festgelegt – bitte den Wert prüfen und von Hand eintragen.',
};

/**
 * Vorschlag für den Barkassenbestand eines Tages.
 * @param {object} tag    Werte des Tages (umsatzBar, barausgabe, bankeinzahlung, bargeldEntfernt, kassendifferenz, gezaehlterBargeldbestand)
 * @param {object|null} vortag  letzter gespeicherter Datensatz vor diesem Tag
 * @returns {number|null}  null, solange die Regel nicht bestätigt ist
 */
export function berechneBarkassenbestand(tag, vortag) {
  if (!BARKASSEN_REGEL.bestaetigt) return null;
  return null;   // hier die bestätigte Regel eintragen
}

/** Für die Oberfläche: Stand der Regel (ohne Formel) */
export function barkassenInfo() {
  return { regelBestaetigt: BARKASSEN_REGEL.bestaetigt, hinweis: BARKASSEN_REGEL.hinweis };
}
