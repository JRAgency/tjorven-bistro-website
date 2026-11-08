// Monitore 2 und 3: Schalter „Kleines Bistro / reduziertes Angebot“ (gesetzt in der Verwaltung von
// Monitor 4, nie automatisch) einmal pro Minute abfragen – dieselbe öffentliche, im Vercel-CDN
// zwischengespeicherte Antwort wie Monitor 4, keine eigene Schnittstelle.
// Bis zur ersten Antwort bleibt der Inhalt unsichtbar (höchstens 3 s, dann Normalbetrieb). Bei einem
// Fehler bleibt der zuletzt gezeigte Stand stehen.
// Monitor 2 liest aus derselben Antwort zusätzlich, welche Produkte er nach 16 Uhr zeigt (beiDaten).
const API = '/api/monitore/specials/';

/** anwenden(klein: boolean) wird beim Start und bei jeder Änderung aufgerufen; beiDaten(antwort) – optional,
 *  nur Monitor 2 – bekommt jede erfolgreiche Antwort, und zwar vor anwenden */
export function beobachteModus(anwenden, beiDaten) {
  let zuletzt = null;
  const setzen = klein => {
    if (klein === zuletzt) return;
    zuletzt = klein;
    anwenden(klein);
    document.documentElement.dataset.modus = klein ? 'klein' : 'normal';
  };
  document.documentElement.dataset.modus = 'laedt';
  setTimeout(() => { if (zuletzt === null) setzen(false); }, 3000);

  async function pruefen() {
    try {
      const r = await fetch(API);   // Standard-Cache-Modus, damit die Antwort aus dem CDN kommen kann (siehe Monitor 4)
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      if (beiDaten && d && typeof d === 'object') beiDaten(d);
      setzen(!!d && d.kleinesBistro === true);
    } catch {
      if (zuletzt === null) setzen(false);
    }
  }
  pruefen();
  setInterval(pruefen, 60 * 1000);
}
