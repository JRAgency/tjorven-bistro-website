// Verwaltung Monitor 4: Angebote ein-/ausschalten und speichern.
// Anmeldung und Sitzung wie beim Tagesabschluss (Cookie „__Host-tagesabschluss“, nur serverseitig
// lesbar). Jede Änderung geht mit dem Kopf „X-Tagesabschluss: 1“ an den Server (CSRF-Schutz).
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let stand = null;          // ETag des geladenen Stands (null = noch nie gespeichert)
  let geladen = new Map();   // id → aktiv (zuletzt vom Server)
  let angebote = [];

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

  function zeile(a) {
    const li = el('li');
    const label = el('label', 'schalter');
    if (a.bild) {
      const img = el('img', 'vorschau');
      img.src = a.bild; img.alt = ''; img.loading = 'lazy';
      label.append(img);
    } else {
      label.append(el('span', 'vorschau ohne', a.titel.charAt(0)));
    }
    const name = el('span', 'name');
    name.append(el('span', 'titel', a.titel), el('span', 'art', a.bild ? (a.art === 'event' ? 'mit Foto und QR-Code' : 'mit Foto') : 'als Textkarte'));
    const box = el('input');
    box.type = 'checkbox';
    box.setAttribute('role', 'switch');
    box.dataset.id = a.id;
    box.checked = a.aktiv;
    box.addEventListener('change', aktualisiere);
    label.append(name, box, el('span', 'regler'));
    li.append(label);
    return li;
  }

  function auswahl() {
    return Object.fromEntries([...document.querySelectorAll('#verwaltung input[type=checkbox]')].map(b => [b.dataset.id, b.checked]));
  }
  const geaendert = () => Object.entries(auswahl()).some(([id, an]) => geladen.get(id) !== an);

  function zeitText(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' }) + ' Uhr'; } catch { return ''; }
  }

  let zuletzt = null;
  function aktualisiere() {
    const an = Object.values(auswahl()).filter(Boolean).length;
    const offen = geaendert();
    $('speichern').disabled = !offen;
    $('status').textContent = (an === 0 ? 'Kein Angebot eingeschaltet – Monitor 4 zeigt dann „Herzlich Willkommen“.' : an === 1 ? '1 Angebot eingeschaltet.' : `${an} Angebote eingeschaltet.`)
      + (offen ? ' Noch nicht gespeichert.' : zuletzt ? ` Zuletzt gespeichert: ${zuletzt}.` : '');
    $('status').classList.toggle('offen', offen);
  }

  function zeige(daten) {
    stand = daten.stand;
    angebote = daten.angebote;
    geladen = new Map(angebote.map(a => [a.id, a.aktiv]));
    zuletzt = zeitText(daten.geaendert);
    $('listeProdukt').replaceChildren(...angebote.filter(a => a.art !== 'event').map(zeile));
    $('listeEvent').replaceChildren(...angebote.filter(a => a.art === 'event').map(zeile));
    $('anmeldung').hidden = true;
    $('verwaltung').hidden = false;
    $('abmelden').hidden = false;
    $('startMeldung').textContent = '';
    aktualisiere();
  }

  async function laden() {
    try {
      zeige(await api('/api/monitore/verwaltung/'));
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
    $('speichern').disabled = true;
    $('meldung').textContent = '';
    $('meldung').className = 'meldung';
    try {
      const daten = await api('/api/monitore/verwaltung/', { method: 'PUT', body: JSON.stringify({ aktiv: auswahl(), stand }) });
      zeige(daten);
      $('meldung').textContent = daten.monitor === false
        ? 'Gespeichert. Monitor 4 übernimmt die Auswahl spätestens in einer Stunde.'
        : 'Gespeichert. Monitor 4 zeigt die neue Auswahl innerhalb einer Minute.';
      $('meldung').className = 'meldung gut';
    } catch (f) {
      if (f.status === 401) return zeigeAnmeldung('Deine Sitzung ist abgelaufen. Bitte erneut anmelden – die Änderungen bitte danach noch einmal vornehmen.');
      if (f.status === 409 && f.daten && Array.isArray(f.daten.angebote)) zeige(f.daten);
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
