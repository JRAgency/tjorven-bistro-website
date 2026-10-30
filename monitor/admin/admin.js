// Verwaltung Monitor 4: Angebote ein-/ausschalten, die zwei freien Kacheln gestalten (Text, Farbe,
// optional ein Foto) und speichern.
// Anmeldung und Sitzung wie beim Tagesabschluss (Cookie „__Host-tagesabschluss“, nur serverseitig
// lesbar). Jede Änderung geht mit dem Kopf „X-Tagesabschluss: 1“ an den Server (CSRF-Schutz).
// Fotos werden hier im Browser verkleinert (längste Seite 1920 px, JPEG) – dabei fallen auch die
// Kameradaten (z. B. GPS) weg – und dann hochgeladen. Sichtbar werden sie erst nach „Speichern“.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let stand = null;          // ETag des geladenen Stands (null = noch nie gespeichert)
  let geladen = new Map();   // id → aktiv (zuletzt vom Server)
  let geladenFrei = new Map();   // id → { text, farbe, bild } der freien Kachel (zuletzt vom Server)
  let angebote = [];
  let entwurf = null;        // geänderte freie Kacheln, falls die Sitzung beim Speichern abgelaufen war
  let laedtHoch = 0;         // laufende Bild-Uploads (solange nicht speichern)
  const MAX_ZEICHEN = 160, MAX_ZEILEN = 6;   // wie auf dem Server (api/_lib/monitore/katalog.js)
  const BILD_KANTE = 1920, BILD_MAX_BYTES = 3 * 1024 * 1024, DATEI_MAX_BYTES = 30 * 1024 * 1024;

  async function api(pfad, optionen = {}) {
    const kopf = {};
    if (optionen.method && optionen.method !== 'GET') { kopf['X-Tagesabschluss'] = '1'; kopf['Content-Type'] = optionen.typ || 'application/json'; }
    let antwort;
    try {
      antwort = await fetch(pfad, { credentials: 'same-origin', cache: 'no-store', method: optionen.method, body: optionen.body, headers: kopf });
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

  // Freie Kachel: Schalter, Text (jede Zeile = eine Zeile auf dem Monitor), Farbe, optional ein Foto
  function freiZeile(a) {
    const li = el('li', 'frei');
    li.dataset.id = a.id;
    li.dataset.bild = a.freiBild || '';
    li.append(schalter(a, el('span', 'vorschau ohne frei-symbol', a.titel.slice(-1)), 'eigener Text, wahlweise mit Foto'));

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

    const farben = el('fieldset', 'farben');
    farben.append(el('legend', 'feld-name', 'Hintergrund'));
    for (const [wert, name] of [['gruen', 'Bistro-Grün'], ['rot', 'Rot']]) {
      const l = el('label', 'farbe farbe-' + wert);
      const r = el('input');
      r.type = 'radio'; r.name = 'farbe-' + a.id; r.value = wert; r.checked = (a.farbe || 'gruen') === wert;
      r.addEventListener('change', () => { li.querySelector('.frei-symbol').classList.toggle('rot', r.value === 'rot' && r.checked); aktualisiere(); });
      l.append(r, el('span', 'farbfeld'), el('span', '', name));
      farben.append(l);
    }

    const bildBereich = el('div', 'bild-bereich');
    bildBereich.append(el('span', 'feld-name', 'Foto (optional)'));
    const reihe = el('div', 'bild-reihe');
    const vorschau = el('img', 'bild-vorschau');
    vorschau.alt = 'Vorschau des Fotos';
    vorschau.hidden = !a.freiBild;
    if (a.freiBildAdresse) vorschau.src = a.freiBildAdresse;
    const waehlen = el('label', 'knopf klein');
    const datei = el('input');
    datei.type = 'file'; datei.accept = 'image/jpeg,image/png,image/webp'; datei.className = 'datei';
    datei.addEventListener('change', () => { if (datei.files[0]) bildHochladen(li, datei.files[0]); datei.value = ''; });
    waehlen.append(datei, el('span', 'waehlen-text', a.freiBild ? 'Anderes Foto wählen' : 'Foto wählen'));
    const entfernen = el('button', 'knopf klein leise entfernen', 'Foto entfernen');
    entfernen.type = 'button';
    entfernen.hidden = !a.freiBild;
    entfernen.addEventListener('click', () => setzeBild(li, null, null));
    reihe.append(vorschau, waehlen, entfernen);
    const hinweis = el('p', 'bild-hinweis leise', 'Am besten Querformat 4:3, z. B. 1920 × 1440 px. JPG, PNG oder WebP. Das Foto wird automatisch verkleinert.');
    const bildStatus = el('p', 'bild-status');
    bildStatus.setAttribute('role', 'status');
    bildBereich.append(reihe, hinweis, bildStatus);

    li.append(feld, farben, bildBereich);
    if ((a.farbe || 'gruen') === 'rot') li.querySelector('.frei-symbol').classList.add('rot');
    return li;
  }

  function setzeBild(li, id, adresse) {
    li.dataset.bild = id || '';
    const v = li.querySelector('.bild-vorschau');
    v.hidden = !id;
    if (id) v.src = adresse; else v.removeAttribute('src');
    li.querySelector('.entfernen').hidden = !id;
    li.querySelector('.waehlen-text').textContent = id ? 'Anderes Foto wählen' : 'Foto wählen';
    li.querySelector('.bild-status').textContent = '';
    aktualisiere();
  }

  /** Foto im Browser verkleinern (JPEG, längste Seite höchstens 1920 px) → Blob */
  async function verkleinern(datei) {
    const bitmap = await createImageBitmap(datei, { imageOrientation: 'from-image' });
    const faktor = Math.min(1, BILD_KANTE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * faktor), h = Math.round(bitmap.height * faktor);
    const leinwand = document.createElement('canvas');
    leinwand.width = w; leinwand.height = h;
    leinwand.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close && bitmap.close();
    let blob = null;
    for (const q of [0.85, 0.75, 0.6]) {
      blob = await new Promise(ok => leinwand.toBlob(ok, 'image/jpeg', q));
      if (blob && blob.size <= BILD_MAX_BYTES) break;
    }
    return { blob, klein: Math.max(w, h) < 1000 };
  }

  async function bildHochladen(li, datei) {
    const status = li.querySelector('.bild-status');
    status.className = 'bild-status';
    if (datei.type && !/^image\//.test(datei.type)) { status.textContent = 'Bitte ein Foto wählen (JPG, PNG oder WebP).'; status.classList.add('fehler'); return; }
    if (datei.size > DATEI_MAX_BYTES) { status.textContent = 'Die Datei ist zu groß (höchstens 30 MB).'; status.classList.add('fehler'); return; }
    laedtHoch++; aktualisiere();
    status.textContent = 'Foto wird vorbereitet …';
    try {
      let fertig;
      try { fertig = await verkleinern(datei); } catch { throw { meldung: 'Dieses Foto kann der Browser nicht lesen. Bitte als JPG, PNG oder WebP wählen.' }; }
      if (!fertig.blob || fertig.blob.size > BILD_MAX_BYTES) throw { meldung: 'Das Foto ist auch verkleinert noch zu groß.' };
      status.textContent = 'Foto wird hochgeladen …';
      const d = await api('/api/monitore/verwaltung/', { method: 'POST', typ: 'image/jpeg', body: fertig.blob });
      setzeBild(li, d.bild, d.adresse);
      status.textContent = fertig.klein ? 'Hochgeladen. Hinweis: Das Foto ist recht klein und kann auf dem Monitor unscharf wirken.' : 'Hochgeladen – wird nach „Speichern“ angezeigt.';
      status.classList.add('gut');
    } catch (f) {
      if (f.status === 401) { laedtHoch = 0; return zeigeAnmeldung('Deine Sitzung ist abgelaufen. Bitte erneut anmelden und das Foto noch einmal wählen.'); }
      status.textContent = f.meldung || 'Das Hochladen hat nicht geklappt. Bitte erneut versuchen.';
      status.classList.add('fehler');
    } finally {
      laedtHoch = Math.max(0, laedtHoch - 1);
      aktualisiere();
    }
  }

  function auswahl() {
    return Object.fromEntries([...document.querySelectorAll('#verwaltung input[type=checkbox]')].map(b => [b.dataset.id, b.checked]));
  }
  function freieKacheln() {
    return Object.fromEntries([...document.querySelectorAll('#verwaltung li.frei')].map(li => [li.dataset.id, {
      text: li.querySelector('textarea').value,
      farbe: (li.querySelector('input[type=radio]:checked') || {}).value || 'gruen',
      bild: li.dataset.bild || null,
    }]));
  }
  const gleich = (a, b) => a.text === b.text && a.farbe === b.farbe && a.bild === b.bild;
  // grob wie der Server zählen: Zeichen ohne Zeilenumbrüche, Zeilen ohne Leerzeilen am Rand
  function messen(t) {
    const zeilen = t.replace(/\r\n?/g, '\n').split('\n').map(z => z.replace(/\s+/g, ' ').trim());
    while (zeilen.length && zeilen[0] === '') zeilen.shift();
    while (zeilen.length && zeilen[zeilen.length - 1] === '') zeilen.pop();
    return { zeichen: [...zeilen.join('')].length, zeilen: zeilen.length };
  }
  const geaendert = () => Object.entries(auswahl()).some(([id, an]) => geladen.get(id) !== an)
    || Object.entries(freieKacheln()).some(([id, k]) => !gleich(k, geladenFrei.get(id) || { text: '', farbe: 'gruen', bild: null }));

  /** Fehler in den freien Kacheln (vor dem Speichern) oder '' */
  function freiFehler() {
    const an = auswahl();
    for (const [id, k] of Object.entries(freieKacheln())) {
      const titel = (angebote.find(a => a.id === id) || {}).titel || id;
      const m = messen(k.text);
      if (m.zeichen > MAX_ZEICHEN) return `${titel}: Der Text ist zu lang (höchstens ${MAX_ZEICHEN} Zeichen).`;
      if (m.zeilen > MAX_ZEILEN) return `${titel}: Der Text hat zu viele Zeilen (höchstens ${MAX_ZEILEN}).`;
      if (an[id] && m.zeichen === 0 && !k.bild) return `${titel} ist eingeschaltet, hat aber weder Text noch Foto. Bitte Text eingeben, ein Foto wählen oder die Kachel ausschalten.`;
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
    $('speichern').disabled = !offen || laedtHoch > 0;
    $('status').textContent = (an === 0 ? 'Kein Angebot eingeschaltet – Monitor 4 zeigt dann „Herzlich Willkommen“.' : an === 1 ? '1 Angebot eingeschaltet.'
      : an === 4 ? '4 Angebote eingeschaltet – Monitor 4 zeigt sie links als Bildfolge und rechts als Liste.' : `${an} Angebote eingeschaltet.`)
      + (laedtHoch ? ' Foto wird hochgeladen …' : offen ? ' Noch nicht gespeichert.' : zuletzt ? ` Zuletzt gespeichert: ${zuletzt}.` : '');
    $('status').classList.toggle('offen', offen);
  }

  // eigene: geänderte freie Kacheln, die statt des Server-Stands stehen bleiben (Konflikt, abgelaufene Sitzung)
  function zeige(daten, eigene = null) {
    stand = daten.stand;
    angebote = daten.angebote;
    geladen = new Map(angebote.map(a => [a.id, a.aktiv]));
    geladenFrei = new Map(angebote.filter(a => a.art === 'frei').map(a => [a.id, { text: a.text || '', farbe: a.farbe || 'gruen', bild: a.freiBild || null }]));
    zuletzt = zeitText(daten.geaendert);
    $('listeFrei').replaceChildren(...angebote.filter(a => a.art === 'frei').map(a => {
      const e = eigene && eigene[a.id];
      return freiZeile(e ? { ...a, text: e.text, farbe: e.farbe, freiBild: e.bild, freiBildAdresse: e.bildAdresse } : a);
    }));
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
    const frei = freieKacheln();
    // nur freie Kacheln merken, die vom geladenen Stand abweichen (die übrigen kommen ohnehin vom Server)
    const eigene = Object.fromEntries([...document.querySelectorAll('#verwaltung li.frei')]
      .filter(li => !gleich(frei[li.dataset.id], geladenFrei.get(li.dataset.id) || { text: '', farbe: 'gruen', bild: null }))
      .map(li => [li.dataset.id, { ...frei[li.dataset.id], bildAdresse: li.querySelector('.bild-vorschau').getAttribute('src') }]));
    try {
      const daten = await api('/api/monitore/verwaltung/', { method: 'PUT', body: JSON.stringify({ aktiv: auswahl(), frei, stand }) });
      zeige(daten);
      $('meldung').textContent = daten.monitor === false
        ? 'Gespeichert. Monitor 4 übernimmt die Auswahl spätestens in einer Stunde.'
        : 'Gespeichert. Monitor 4 zeigt die neue Auswahl innerhalb einer Minute.';
      $('meldung').className = 'meldung gut';
    } catch (f) {
      if (f.status === 401) {
        entwurf = eigene;
        return zeigeAnmeldung('Deine Sitzung ist abgelaufen. Bitte erneut anmelden. Die freien Kacheln bleiben erhalten, die Schalter bitte danach noch einmal prüfen.');
      }
      if (f.status === 409 && f.daten && Array.isArray(f.daten.angebote)) zeige(f.daten, eigene);   // Schalter vom anderen Gerät, eigene freie Kacheln bleiben stehen
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
