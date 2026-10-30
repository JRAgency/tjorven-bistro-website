// Verwaltung der Monitore: Monitor 4 „Heute bei uns“ (Überschrift, feste Angebote, Öffnungszeiten und vier
// freie Kacheln – je Freitext oder Produkt mit Preis, Farbe, optional ein Foto) und der Schalter
// „Kleines Bistro“ für die Monitore 2 und 3. Alles wird gemeinsam mit „Speichern“ übernommen.
// Anmeldung und Sitzung wie beim Tagesabschluss (Cookie „__Host-tagesabschluss“, nur serverseitig
// lesbar). Jede Änderung geht mit dem Kopf „X-Tagesabschluss: 1“ an den Server (CSRF-Schutz).
// Fotos werden hier im Browser verkleinert (längste Seite 1920 px, JPEG) – dabei fallen auch die
// Kameradaten (z. B. GPS) weg – und dann hochgeladen. Sichtbar werden sie erst nach „Speichern“.
// Alle eingegebenen Texte werden nur als reiner Text gesetzt (textContent), auch in der Vorschau.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let stand = null;          // ETag des geladenen Stands (null = noch nie gespeichert)
  let geladen = new Map();   // id → aktiv (zuletzt vom Server)
  let geladenFrei = new Map();   // id → { typ, text, name, preis, farbe, bild } der freien Kachel (zuletzt vom Server)
  let geladenAllgemein = { ueberschrift: '', kleinesBistro: false };
  let angebote = [];
  let entwurf = null;        // eigene Eingaben, falls die Sitzung beim Speichern abgelaufen war
  let laedtHoch = 0;         // laufende Bild-Uploads (solange nicht speichern)
  const MAX_ZEICHEN = 160, MAX_ZEILEN = 6, NAME_MAX = 40, TITEL_MAX = 40;   // wie auf dem Server (api/_lib/monitore/katalog.js)
  const BILD_KANTE = 1920, BILD_MAX_BYTES = 3 * 1024 * 1024, DATEI_MAX_BYTES = 30 * 1024 * 1024;
  const LEER = { typ: 'text', text: '', name: '', preis: '', farbe: 'gruen', bild: null };

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

  // Öffnungszeiten: Schalter, darunter der feste Text
  function infoZeile(a) {
    const li = el('li', 'info');
    li.append(schalter(a, el('span', 'vorschau ohne', a.titel.charAt(0)), 'Infokachel – ohne Preis, nie in der Preisliste'));
    const t = el('div', 'info-text');
    for (const z of a.zeilen || []) t.append(el('p', '', z));
    for (const z of a.klein || []) t.append(el('p', 'klein', z));
    li.append(t);
    return li;
  }

  function auswahlFeld(klasse, legende, name, werte, gewaehlt) {
    const f = el('fieldset', 'wahl ' + klasse);
    f.append(el('legend', 'feld-name', legende));
    for (const [wert, text] of werte) {
      const l = el('label', `option option-${wert}`);
      const r = el('input');
      r.type = 'radio'; r.name = name; r.value = wert; r.checked = gewaehlt === wert;
      r.addEventListener('change', aktualisiere);
      l.append(r, el('span', 'farbfeld'), el('span', '', text));
      f.append(l);
    }
    return f;
  }

  // Freie Kachel: Schalter, Typ (Freitext / Produkt mit Preis), Text bzw. Name + Preis, Farbe, Foto, Vorschau
  function freiZeile(a) {
    const li = el('li', 'frei');
    li.dataset.id = a.id;
    li.dataset.bild = a.freiBild || '';
    li.dataset.typ = a.typ || 'text';
    li.append(schalter(a, el('span', 'vorschau ohne frei-symbol', a.titel.slice(-1)), ''));

    const typen = auswahlFeld('typen', 'Art der Kachel', 'typ-' + a.id, [['text', 'Freitext'], ['produkt', 'Produkt mit Preis']], a.typ || 'text');

    const textFeld = el('label', 'feld nur-text');
    textFeld.append(el('span', 'feld-name', 'Text – jede Zeile erscheint als eigene Zeile'));
    const ta = el('textarea', 'frei-text');
    ta.rows = 4;
    ta.maxLength = 400;
    ta.spellcheck = true;
    ta.placeholder = 'z. B.\nHerzlich willkommen\nFamilie Muster\nTisch 7';
    ta.value = a.text || '';
    ta.addEventListener('input', aktualisiere);
    textFeld.append(ta, el('span', 'zaehler text-zaehler'));

    const produkt = el('div', 'nur-produkt produkt-felder');
    const nameFeld = el('label', 'feld name-feld');
    const name = el('input', 'frei-name');
    name.type = 'text'; name.maxLength = 60; name.autocomplete = 'off'; name.spellcheck = true; name.placeholder = 'z. B. Käsekuchen'; name.value = a.name || '';
    name.addEventListener('input', aktualisiere);
    nameFeld.append(el('span', 'feld-name', 'Produktname'), name, el('span', 'zaehler name-zaehler'));
    const preisFeld = el('label', 'feld preis-feld');
    const preis = el('input', 'frei-preis');
    preis.type = 'text'; preis.inputMode = 'decimal'; preis.maxLength = 20; preis.autocomplete = 'off'; preis.placeholder = 'z. B. 3.5'; preis.value = a.preis || '';
    preis.addEventListener('input', aktualisiere);
    preisFeld.append(el('span', 'feld-name', 'Preis'), preis);
    produkt.append(nameFeld, preisFeld, el('p', 'leise klein hinweis-feld', 'Preis wie auf der Karte mit einer Nachkommastelle, z. B. 3.5 – oder zwei Preise: 2.0 | 3.0.'));

    const farben = auswahlFeld('farben', 'Hintergrund', 'farbe-' + a.id, [['gruen', 'Bistro-Grün'], ['rot', 'Rot']], a.farbe || 'gruen');

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

    // ungefähre Vorschau der Kachel auf Monitor 4
    const mini = el('div', 'mini');
    mini.setAttribute('aria-hidden', 'true');
    const miniFoto = el('img', 'mini-foto');
    miniFoto.alt = '';
    miniFoto.hidden = true;
    mini.append(miniFoto, el('div', 'mini-inhalt'));
    const vorschauBereich = el('div', 'mini-bereich');
    vorschauBereich.append(el('span', 'feld-name', 'Vorschau auf Monitor 4'), mini);

    li.append(typen, textFeld, produkt, farben, bildBereich, vorschauBereich);
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
    return Object.fromEntries([...document.querySelectorAll('#verwaltung input[type=checkbox][data-id]')].map(b => [b.dataset.id, b.checked]));
  }
  const gewaehlt = (li, gruppe, standard) => (li.querySelector(`.${gruppe} input:checked`) || {}).value || standard;
  function kachelDaten(li) {
    return {
      typ: gewaehlt(li, 'typen', 'text'),
      text: li.querySelector('.frei-text').value,
      name: li.querySelector('.frei-name').value,
      preis: li.querySelector('.frei-preis').value,
      farbe: gewaehlt(li, 'farben', 'gruen'),
      bild: li.dataset.bild || null,
    };
  }
  const freieKacheln = () => Object.fromEntries([...document.querySelectorAll('#listeFrei li.frei')].map(li => [li.dataset.id, kachelDaten(li)]));
  const gleich = (a, b) => ['typ', 'text', 'name', 'preis', 'farbe', 'bild'].every(f => a[f] === b[f]);

  // grob wie der Server zählen: Zeichen ohne Zeilenumbrüche, Zeilen ohne Leerzeilen am Rand
  function messen(t) {
    const zeilen = t.replace(/\r\n?/g, '\n').split('\n').map(z => z.replace(/\s+/g, ' ').trim());
    while (zeilen.length && zeilen[0] === '') zeilen.shift();
    while (zeilen.length && zeilen[zeilen.length - 1] === '') zeilen.pop();
    return { zeichen: [...zeilen.join('')].length, zeilen: zeilen.length };
  }
  const zeilenLaenge = t => [...t.replace(/\s+/g, ' ').trim()].length;

  /** Preis wie auf dem Server lesen: „3,50 €“ → „3.5“, „2 / 3“ → „2.0 | 3.0“ → { preis } | { fehler: true } */
  function preisLesen(roh) {
    const t = roh.normalize('NFKC').replace(/€|euro?/gi, '').replace(/\s+/g, '');
    if (t === '') return { preis: '' };
    const teile = t.split(/[|/]/);
    if (teile.length > 2) return { fehler: true };
    const aus = [];
    for (const teil of teile) {
      const m = teil.match(/^(\d{1,3})(?:[.,](\d{1,2}))?$/);
      if (!m) return { fehler: true };
      const nach = m[2] || '0';
      if (nach.length === 2 && nach[1] !== '0') return { fehler: true };
      const p = `${Number(m[1])}.${nach[0]}`;
      if (Number(p) <= 0) return { fehler: true };
      aus.push(p);
    }
    return { preis: aus.join(' | ') };
  }

  const titelVon = id => (angebote.find(a => a.id === id) || {}).titel || id;
  const geaendert = () => Object.entries(auswahl()).some(([id, an]) => geladen.get(id) !== an)
    || Object.entries(freieKacheln()).some(([id, k]) => !gleich(k, geladenFrei.get(id) || LEER))
    || $('ueberschrift').value !== geladenAllgemein.ueberschrift
    || $('kleinesBistro').checked !== geladenAllgemein.kleinesBistro;

  /** Eingabefehler vor dem Speichern (dieselben Regeln wie der Server) oder '' */
  function eingabeFehler() {
    if (zeilenLaenge($('ueberschrift').value) > TITEL_MAX) return `Überschrift Monitor 4: höchstens ${TITEL_MAX} Zeichen.`;
    const an = auswahl();
    for (const [id, k] of Object.entries(freieKacheln())) {
      const titel = titelVon(id);
      if (k.typ === 'produkt') {
        if (zeilenLaenge(k.name) > NAME_MAX) return `${titel}: Der Produktname ist zu lang (höchstens ${NAME_MAX} Zeichen).`;
        const p = preisLesen(k.preis);
        if (p.fehler) return `${titel}: Den Preis bitte wie auf der Karte eingeben, z. B. 3.5 oder 2.0 | 3.0.`;
        if (an[id] && (!zeilenLaenge(k.name) || !p.preis)) return `${titel} ist als Produkt eingeschaltet und braucht einen Produktnamen und einen Preis.`;
      } else {
        const m = messen(k.text);
        if (m.zeichen > MAX_ZEICHEN) return `${titel}: Der Text ist zu lang (höchstens ${MAX_ZEICHEN} Zeichen).`;
        if (m.zeilen > MAX_ZEILEN) return `${titel}: Der Text hat zu viele Zeilen (höchstens ${MAX_ZEILEN}).`;
        if (an[id] && m.zeichen === 0 && !k.bild) return `${titel} ist eingeschaltet, hat aber weder Text noch Foto. Bitte Text eingeben, ein Foto wählen oder die Kachel ausschalten.`;
      }
    }
    return '';
  }

  /** ungefähre Darstellung auf Monitor 4: Produkt mit Leiste „Name Preis“, Freitext als Tafel bzw. Textkarte */
  function zeichneVorschau(li, k) {
    const mini = li.querySelector('.mini');
    const foto = mini.querySelector('.mini-foto');
    const src = k.bild ? li.querySelector('.bild-vorschau').getAttribute('src') : null;
    mini.classList.toggle('rot', k.farbe === 'rot');
    mini.classList.toggle('mit-bild', !!src);
    mini.classList.toggle('produkt', k.typ === 'produkt');
    if (src) { if (foto.getAttribute('src') !== src) foto.src = src; foto.hidden = false; } else { foto.hidden = true; foto.removeAttribute('src'); }
    const inhalt = el('div', 'mini-inhalt');
    if (k.typ === 'produkt') {
      inhalt.append(el('span', 'mini-name', k.name.trim() || 'Produktname'), el('span', 'mini-preis', preisLesen(k.preis).preis || 'Preis'));
    } else {
      const zeilen = k.text.split('\n').map(z => z.trim()).filter(Boolean).slice(0, MAX_ZEILEN);
      if (zeilen.length) for (const z of zeilen) inhalt.append(el('p', '', z));
      else if (!src) inhalt.append(el('p', 'mini-leer', 'noch kein Text'));
      else inhalt.hidden = true;
    }
    mini.querySelector('.mini-inhalt').replaceWith(inhalt);
  }

  function zeitText(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' }) + ' Uhr'; } catch { return ''; }
  }

  let zuletzt = null;
  function aktualisiere() {
    const t = zeilenLaenge($('ueberschrift').value);
    $('ueberschriftZaehler').textContent = `${t} / ${TITEL_MAX} Zeichen`;
    $('ueberschriftZaehler').classList.toggle('zu-viel', t > TITEL_MAX);
    for (const li of document.querySelectorAll('#listeFrei li.frei')) {
      const k = kachelDaten(li);
      li.dataset.typ = k.typ;
      li.querySelector('.schalter .art').textContent = k.typ === 'produkt' ? 'Produkt mit Preis – steht in der Preisliste' : 'Freitext – nie in der Preisliste';
      li.querySelector('.frei-symbol').classList.toggle('rot', k.farbe === 'rot');
      const m = messen(k.text);
      const tz = li.querySelector('.text-zaehler');
      tz.textContent = `${m.zeichen} / ${MAX_ZEICHEN} Zeichen · ${m.zeilen} / ${MAX_ZEILEN} Zeilen`;
      tz.classList.toggle('zu-viel', m.zeichen > MAX_ZEICHEN || m.zeilen > MAX_ZEILEN);
      const nz = li.querySelector('.name-zaehler');
      nz.textContent = `${zeilenLaenge(k.name)} / ${NAME_MAX} Zeichen`;
      nz.classList.toggle('zu-viel', zeilenLaenge(k.name) > NAME_MAX);
      li.querySelector('.frei-preis').classList.toggle('falsch', !!preisLesen(k.preis).fehler);
      zeichneVorschau(li, k);
    }
    const an = Object.values(auswahl()).filter(Boolean).length;
    const offen = geaendert();
    $('speichern').disabled = !offen || laedtHoch > 0;
    $('status').textContent = (an === 0 ? 'Nichts eingeschaltet – Monitor 4 zeigt dann „Herzlich Willkommen“.'
      : an < 4 ? `${an} eingeschaltet – Monitor 4 zeigt ${an === 1 ? 'eine große Kachel' : 'die Kacheln nebeneinander'}.`
      : `${an} eingeschaltet – Monitor 4 zeigt links eine Bildfolge und rechts die Preisliste.`)
      + ($('kleinesBistro').checked ? ' Kleines Bistro ist an.' : '')
      + (laedtHoch ? ' Foto wird hochgeladen …' : offen ? ' Noch nicht gespeichert.' : zuletzt ? ` Zuletzt gespeichert: ${zuletzt}.` : '');
    $('status').classList.toggle('offen', offen);
  }

  // eigene: eigene Eingaben (freie Kacheln, Überschrift), die statt des Server-Stands stehen bleiben (Konflikt, abgelaufene Sitzung)
  function zeige(daten, eigene = null) {
    stand = daten.stand;
    angebote = daten.angebote;
    geladen = new Map(angebote.map(a => [a.id, a.aktiv]));
    geladenFrei = new Map(angebote.filter(a => a.art === 'frei').map(a => [a.id, { typ: a.typ || 'text', text: a.text || '', name: a.name || '', preis: a.preis || '', farbe: a.farbe || 'gruen', bild: a.freiBild || null }]));
    geladenAllgemein = { ueberschrift: typeof daten.ueberschrift === 'string' ? daten.ueberschrift : '', kleinesBistro: daten.kleinesBistro === true };
    zuletzt = zeitText(daten.geaendert);
    const eigeneFrei = (eigene && eigene.frei) || {};
    $('listeFrei').replaceChildren(...angebote.filter(a => a.art === 'frei').map(a => {
      const e = eigeneFrei[a.id];
      return freiZeile(e ? { ...a, typ: e.typ, text: e.text, name: e.name, preis: e.preis, farbe: e.farbe, freiBild: e.bild, freiBildAdresse: e.bildAdresse } : a);
    }));
    $('listeProdukt').replaceChildren(...angebote.filter(a => a.art === 'produkt').map(zeile));
    $('listeEvent').replaceChildren(...angebote.filter(a => a.art === 'event').map(zeile));
    $('listeInfo').replaceChildren(...angebote.filter(a => a.art === 'info').map(infoZeile));
    $('ueberschrift').value = eigene && typeof eigene.ueberschrift === 'string' ? eigene.ueberschrift : geladenAllgemein.ueberschrift;
    $('kleinesBistro').checked = geladenAllgemein.kleinesBistro;
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

  $('ueberschrift').addEventListener('input', aktualisiere);
  $('kleinesBistro').addEventListener('change', aktualisiere);

  $('speichern').addEventListener('click', async () => {
    $('meldung').textContent = '';
    $('meldung').className = 'meldung';
    const problem = eingabeFehler();
    if (problem) { $('meldung').textContent = problem; return; }
    $('speichern').disabled = true;
    const frei = freieKacheln();
    // nur eigene Eingaben merken, die vom geladenen Stand abweichen (die übrigen kommen ohnehin vom Server)
    const eigene = { frei: Object.fromEntries([...document.querySelectorAll('#listeFrei li.frei')]
      .filter(li => !gleich(frei[li.dataset.id], geladenFrei.get(li.dataset.id) || LEER))
      .map(li => [li.dataset.id, { ...frei[li.dataset.id], bildAdresse: li.querySelector('.bild-vorschau').getAttribute('src') }])) };
    if ($('ueberschrift').value !== geladenAllgemein.ueberschrift) eigene.ueberschrift = $('ueberschrift').value;
    try {
      const daten = await api('/api/monitore/verwaltung/', { method: 'PUT', body: JSON.stringify({ aktiv: auswahl(), frei, ueberschrift: $('ueberschrift').value, kleinesBistro: $('kleinesBistro').checked, stand }) });
      zeige(daten);
      $('meldung').textContent = daten.monitor === false
        ? 'Gespeichert. Die Monitore übernehmen die Änderung spätestens in einer Stunde.'
        : 'Gespeichert. Die Monitore zeigen die Änderung innerhalb einer Minute.';
      $('meldung').className = 'meldung gut';
    } catch (f) {
      if (f.status === 401) {
        entwurf = eigene;
        return zeigeAnmeldung('Deine Sitzung ist abgelaufen. Bitte erneut anmelden. Überschrift und freie Kacheln bleiben erhalten, die Schalter bitte danach noch einmal prüfen.');
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
