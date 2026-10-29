// Verwaltung Monitor 4: Angebote ein-/ausschalten, Texte der zwei freien Kacheln eingeben, speichern.
// Anmeldung und Sitzung wie beim Tagesabschluss (Cookie „__Host-tagesabschluss“, nur serverseitig
// lesbar). Jede Änderung geht mit dem Kopf „X-Tagesabschluss: 1“ an den Server (CSRF-Schutz).
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let stand = null;          // ETag des geladenen Stands (null = noch nie gespeichert)
  let geladen = new Map();   // id → aktiv (zuletzt vom Server)
  let geladenText = new Map();   // id → Text der freien Kachel (zuletzt vom Server)
  let angebote = [];
  let entwurf = null;        // Texte der freien Kacheln, falls die Sitzung beim Speichern abgelaufen war
  const MAX_ZEICHEN = 160, MAX_ZEILEN = 6;   // wie auf dem Server (api/_lib/monitore/katalog.js)

  async function api(pfad, optionen = {}) {
    const kopf = {};
    if (optionen.method && optionen.method !== 'GET') { kopf['X-Tagesabschluss'] = '1'; kopf['Content-Type'] = 'application/json'; }
    let antwort;
    try {
      antwort = await fetch(pfad, { credentials: 'same-origin', cache: 'no-store', ...optionen, headers: kopf });
    } catch {
      throw { status: 0, meldung: 'Keine Verbindung. Bitte Internet prüfen und erneut versuchen.' };
    }
    let daten = null;
    try { daten = await antwort.json(); } catch { /* keine JSON-Antwort */ }
    if (!antwort.ok) throw { status: antwort.status, meldung: (daten && daten.fehler) || 'Das hat leider nicht geklappt. Bitte erneut versuchen.', daten };
    return daten;
  }

  function zeigeAnmeldung(meldung = '') {
    $('verwaltung').hidden = true;
    $('abmelden').hidden = true;
    $('anmeldung').hidden = false;
    $('anmeldeMeldung').textContent = meldung;
    $('passwort').value = '';
    $('passwort').focus();
  }

  function el(tag, klasse, text) {
    const e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (text) e.textContent = text;
    return e;
  }

  function schalter(a, vorschau, artText) {
    const label = el('label', 'schalter');
    label.append(vorschau);
    const name = el('span', 'name');
    name.append(el('span', 'titel', a.titel), el('span', 'art', artText));
    const box = el('input');
    box.type = 'checkbox';
    box.setAttribute('role', 'switch');
    box.dataset.id = a.id;
    box.checked = a.aktiv;
    box.addEventListener('change', aktualisiere);
    label.append(name, box, el('span', 'regler'));
    return label;
  }

  function zeile(a) {
    const li = el('li');
    let vorschau;
    if (a.bild) {
      vorschau = el('img', 'vorschau');
      vorschau.src = a.bild; vorschau.alt = ''; vorschau.loading = 'lazy';
    } else {
      vorschau = el('span', 'vorschau ohne', a.titel.charAt(0));
    }
    const art = a.bild ? (a.art === 'event' ? 'mit Foto und QR-Code' : 'mit Foto') : 'als Textkarte';
    li.append(schalter(a, vorschau, a.preis ? `${art} · ${a.preis}` : art));
    return li;
  }

  // Freie Kachel: Schalter + Textfeld (reiner Text, jede Zeile = eine Zeile auf dem Monitor)
  function freiZeile(a) {
    const li = el('li', 'frei');
    li.append(schalter(a, el('span', 'vorschau ohne frei-symbol', a.titel.slice(-1)), 'eigener Text'));
    const feld = el('label', 'feld');
    feld.append(el('span', 'feld-name', `Text für ${a.titel}`));
    const ta = el('textarea');
    ta.dataset.id = a.id;
    ta.rows = 4;
    ta.maxLength = 400;
    ta.spellcheck = true;
    ta.placeholder = 'z. B.\nHerzlich willkommen\nFamilie Muster\nTisch 7';
    ta.value = a.text || '';
    ta.addEventListener('input', aktualisiere);
    const zaehler = el('span', 'zaehler');
    zaehler.dataset.fuer = a.id;
    feld.append(ta, zaehler);
    li.append(feld);
    return li;
  }

  function auswahl() {
    return Object.fromEntries([...document.querySelectorAll('#verwaltung input[type=checkbox]')].map(b => [b.dataset.id, b.checked]));
  }
  function texte() {
    return Object.fromEntries([...document.querySelectorAll('#verwaltung textarea')].map(t => [t.dataset.id, t.value]));
  }
  // grob wie der Server zählen: Zeichen ohne Zeilenumbrüche, Zeilen ohne Leerzeilen am Rand
  function messen(t) {
    const zeilen = t.replace(/\r\n?/g, '\n').split('\n').map(z => z.replace(/\s+/g, ' ').trim());
    while (zeilen.length && zeilen[0] === '') zeilen.shift();
    while (zeilen.length && zeilen[zeilen.length - 1] === '') zeilen.pop();
    return { zeichen: [...zeilen.join('')].length, zeilen: zeilen.length };
  }
  const geaendert = () => Object.entries(auswahl()).some(([id, an]) => geladen.get(id) !== an)
    || Object.entries(texte()).some(([id, t]) => (geladenText.get(id) || '') !== t);

  /** Fehler in den freien Kacheln (vor dem Speichern) oder '' */
  function freiFehler() {
    const an = auswahl();
    for (const [id, t] of Object.entries(texte())) {
      const titel = (angebote.find(a => a.id === id) || {}).titel || id;
      const m = messen(t);
      if (m.zeichen > MAX_ZEICHEN) return `${titel}: Der Text ist zu lang (höchstens ${MAX_ZEICHEN} Zeichen).`;
      if (m.zeilen > MAX_ZEILEN) return `${titel}: Der Text hat zu viele Zeilen (höchstens ${MAX_ZEILEN}).`;
      if (an[id] && m.zeichen === 0) return `${titel} ist eingeschaltet, hat aber keinen Text. Bitte Text eingeben oder die Kachel ausschalten.`;
    }
    return '';
  }

  function zeitText(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' }) + ' Uhr'; } catch { return ''; }
  }

  let zuletzt = null;
  function aktualisiere() {
    for (const z of document.querySelectorAll('#verwaltung .zaehler')) {
      const ta = document.querySelector(`#verwaltung textarea[data-id="${z.dataset.fuer}"]`);
      const m = messen(ta.value);
      z.textContent = `${m.zeichen} / ${MAX_ZEICHEN} Zeichen · ${m.zeilen} / ${MAX_ZEILEN} Zeilen`;
      z.classList.toggle('zu-viel', m.zeichen > MAX_ZEICHEN || m.zeilen > MAX_ZEILEN);
    }
    const an = Object.values(auswahl()).filter(Boolean).length;
    const offen = geaendert();
    $('speichern').disabled = !offen;
    $('status').textContent = (an === 0 ? 'Kein Angebot eingeschaltet – Monitor 4 zeigt dann „Herzlich Willkommen“.' : an === 1 ? '1 Angebot eingeschaltet.' : `${an} Angebote eingeschaltet.`)
      + (offen ? ' Noch nicht gespeichert.' : zuletzt ? ` Zuletzt gespeichert: ${zuletzt}.` : '');
    $('status').classList.toggle('offen', offen);
  }

  // eigeneTexte: Texte, die im Feld bleiben sollen statt des Server-Stands (Konflikt, abgelaufene Sitzung)
  function zeige(daten, eigeneTexte = null) {
    stand = daten.stand;
    angebote = daten.angebote;
    geladen = new Map(angebote.map(a => [a.id, a.aktiv]));
    geladenText = new Map(angebote.filter(a => a.art === 'frei').map(a => [a.id, a.text || '']));
    zuletzt = zeitText(daten.geaendert);
    $('listeFrei').replaceChildren(...angebote.filter(a => a.art === 'frei').map(a => freiZeile(eigeneTexte && typeof eigeneTexte[a.id] === 'string' ? { ...a, text: eigeneTexte[a.id] } : a)));
    $('listeProdukt').replaceChildren(...angebote.filter(a => a.art === 'produkt').map(zeile));
    $('listeEvent').replaceChildren(...angebote.filter(a => a.art === 'event').map(zeile));
    $('anmeldung').hidden = true;
    $('verwaltung').hidden = false;
    $('abmelden').hidden = false;
    $('startMeldung').textContent = '';
    aktualisiere();
  }

  async function laden() {
    try {
      zeige(await api('/api/monitore/verwaltung/'), entwurf);
      entwurf = null;
    } catch (f) {
      if (f.status === 401) return zeigeAnmeldung();
      $('startMeldung').textContent = f.meldung;
    }
  }

  $('anmeldeForm').addEventListener('submit', async e => {
    e.preventDefault();
    const knopf = e.submitter || $('anmeldeForm').querySelector('button');
    knopf.disabled = true;
    $('anmeldeMeldung').textContent = '';
    try {
      await api('/api/tagesabschluss/anmelden/', { method: 'POST', body: JSON.stringify({ passwort: $('passwort').value }) });
      await laden();
    } catch (f) {
      $('anmeldeMeldung').textContent = f.meldung;
    } finally { knopf.disabled = false; }
  });

  $('speichern').addEventListener('click', async () => {
    $('meldung').textContent = '';
    $('meldung').className = 'meldung';
    const problem = freiFehler();
    if (problem) { $('meldung').textContent = problem; return; }
    $('speichern').disabled = true;
    // nur Texte merken, die vom geladenen Stand abweichen (die übrigen kommen ohnehin vom Server)
    const eigene = Object.fromEntries(Object.entries(texte()).filter(([id, t]) => (geladenText.get(id) || '') !== t));
    try {
      const daten = await api('/api/monitore/verwaltung/', { method: 'PUT', body: JSON.stringify({ aktiv: auswahl(), frei: texte(), stand }) });
      zeige(daten);
      $('meldung').textContent = daten.monitor === false
        ? 'Gespeichert. Monitor 4 übernimmt die Auswahl spätestens in einer Stunde.'
        : 'Gespeichert. Monitor 4 zeigt die neue Auswahl innerhalb einer Minute.';
      $('meldung').className = 'meldung gut';
    } catch (f) {
      if (f.status === 401) {
        entwurf = eigene;
        return zeigeAnmeldung('Deine Sitzung ist abgelaufen. Bitte erneut anmelden. Eingegebene Texte bleiben erhalten, die Schalter bitte danach noch einmal prüfen.');
      }
      if (f.status === 409 && f.daten && Array.isArray(f.daten.angebote)) zeige(f.daten, eigene);   // Schalter vom anderen Gerät, eigene Texte bleiben stehen
      $('meldung').textContent = f.meldung;
      aktualisiere();
    }
  });

  $('abmelden').addEventListener('click', async () => {
    try { await api('/api/tagesabschluss/abmelden/', { method: 'POST', body: '{}' }); } catch { /* Cookie läuft ohnehin ab */ }
    zeigeAnmeldung();
  });

  window.addEventListener('beforeunload', e => { if (!$('verwaltung').hidden && geaendert()) { e.preventDefault(); e.returnValue = ''; } });

  laden();
})();
