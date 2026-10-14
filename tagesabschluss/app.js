/* Tagesabschluss – Oberfläche (intern).
   Ablauf: Anmelden → Foto → analysieren (Server) → Prüfansicht → Speichern (nur auf Knopfdruck) → Tabelle.
   Keine Finanzdaten in die Konsole, keine Daten im Browser-Speicher. */
(function () {
  'use strict';

  const API = '/api/tagesabschluss/';
  const $ = id => document.getElementById(id);
  const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

  /* ---------------------------------------------------------------- Felder */
  const BON_FELDER = [
    { feld: 'datum', name: 'Datum', art: 'datum', pflicht: true },
    { feld: 'umsatz7', name: '7 % Umsatz', zusatz: 'Brutto unter „Rate: 7.0%“', pflicht: true },
    { feld: 'umsatz19', name: '19 % Umsatz', zusatz: 'Brutto unter „Rate: 19.0%“', pflicht: true },
    { feld: 'umsatzBar', name: 'Umsatz bar', zusatz: '„Eingenommenes Bargeld“', pflicht: true },
    { feld: 'bargeldEntfernt', name: 'Bargeld entfernt', zusatz: 'wie auf dem Bon, meist mit Minus', pflicht: true, vorzeichen: true },
    { feld: 'barkassenbestand', name: 'Barkassenbestand', zusatz: '„Gezählter Bargeldbestand“ unter KASSE', pflicht: true },
  ];
  const HAND_FELDER = [
    { feld: 'kassendifferenz', name: 'Kassendifferenz', pflicht: true, vorzeichen: true, zusatz: 'bitte von Hand eintragen' },
    { feld: 'barausgabe', name: 'Barausgabe' },
    { feld: 'bankeinzahlung', name: 'Bankeinzahlung' },
  ];
  const ALLE = BON_FELDER.concat(HAND_FELDER);
  const STATUS_TEXT = { sicher: 'automatisch erkannt', pruefen: 'Nicht sicher erkannt – bitte prüfen', fehlt: 'Nicht sicher erkannt – bitte prüfen', manuell: 'von Hand' };

  const zustand = {
    sitzung: null,          // Antwort von /sitzung
    foto: null,             // { base64, url, breite, hoehe, bytes }
    erkennung: {},          // Feld → Status aus der Analyse
    erkannteWerte: {},      // Feld → Wert aus der Analyse (zum Erkennen von Änderungen)
    dublette: null,         // bestehender Eintrag beim Konflikt
    eintraege: [],
  };

  /* ------------------------------------------------------------ Hilfen */
  function betragInCent(text) {
    if (typeof text !== 'string') return null;
    let t = text.replace(/[−–—]/g, '-').replace(/€|EUR/gi, '').replace(/[\s   ]/g, '');
    if (!t) return null;
    if (/^\d.*-$/.test(t)) t = '-' + t.slice(0, -1);
    const neg = t.startsWith('-');
    if (neg || t.startsWith('+')) t = t.slice(1);
    let m, e, c;
    if ((m = t.match(/^(\d{1,3}(?:\.\d{3})+|\d+),(\d{1,2})$/))) { e = m[1].replace(/\./g, ''); c = m[2].padEnd(2, '0'); }
    else if ((m = t.match(/^(\d+)$/))) { e = m[1]; c = '00'; }
    else if ((m = t.match(/^(\d{1,3}(?:\.\d{3})+)$/))) { e = m[1].replace(/\./g, ''); c = '00'; }
    else if ((m = t.match(/^(\d+)\.(\d{1,2})$/))) { e = m[1]; c = m[2].padEnd(2, '0'); }
    else return null;
    if (e.length > 9) return null;
    const w = Number(e) * 100 + Number(c);
    return neg ? -w : w;
  }
  const alsEuro = w => (typeof w === 'number' ? euro.format(w) : '–');
  const zahlFeld = w => (typeof w === 'number' ? euro.format(w).replace(/\s?€$/, '') : '');
  const deDatum = iso => (iso ? iso.split('-').reverse().join('.') : '');
  const el = (tag, klasse, text) => { const e = document.createElement(tag); if (klasse) e.className = klasse; if (text !== undefined) e.textContent = text; return e; };

  async function api(pfad, optionen = {}) {
    const kopf = Object.assign({}, optionen.headers || {});
    if (optionen.method && optionen.method !== 'GET') { kopf['X-Tagesabschluss'] = '1'; kopf['Content-Type'] = 'application/json'; }
    let antwort;
    try {
      antwort = await fetch(API + pfad, { credentials: 'same-origin', cache: 'no-store', ...optionen, headers: kopf });
    } catch {
      throw { status: 0, fehler: 'Keine Verbindung zum Server. Bitte Internetverbindung prüfen.' };
    }
    if (optionen.roh && antwort.ok) return antwort;
    let daten = null;
    try { daten = await antwort.json(); } catch { daten = null; }
    if (!antwort.ok) {
      const f = { status: antwort.status, ...(daten || {}), fehler: (daten && daten.fehler) || 'Es ist ein Fehler aufgetreten. Bitte erneut versuchen.' };
      if (antwort.status === 401 && f.code === 'sitzung' && !optionen.ohneHinweis) sitzungAbgelaufen();
      throw f;
    }
    return daten;
  }

  function zeige(meldungEl, text) { meldungEl.textContent = text || ''; }

  /* ---------------------------------------------------------- Anmeldung */
  function zeigeAnmeldung(text) {
    $('app').hidden = true;
    $('abmelden').hidden = true;
    $('anmeldung').hidden = false;
    zeige($('anmeldeMeldung'), text || '');
    $('passwort').value = '';
    setTimeout(() => $('passwort').focus(), 0);
  }

  let appAktiv = false;
  function sitzungAbgelaufen() {
    // Prüfansicht bleibt erhalten – nach erneuter Anmeldung geht es dort weiter
    zeigeAnmeldung('Deine Sitzung ist abgelaufen. Bitte erneut anmelden.');
  }

  async function start() {
    try {
      zustand.sitzung = await api('sitzung/', { ohneHinweis: true });
      await zeigeApp();
    } catch (f) {
      if (f.code === 'nicht_eingerichtet') {
        $('anmeldung').hidden = true;
        zeige($('startMeldung'), 'Der Tagesabschluss ist noch nicht eingerichtet (Passwort und Sitzungsschlüssel fehlen auf dem Server).');
        return;
      }
      zeigeAnmeldung(f.status === 401 ? '' : f.fehler);
    }
  }

  $('anmeldeForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const knopf = ev.submitter || $('anmeldeForm').querySelector('button');
    knopf.disabled = true;
    zeige($('anmeldeMeldung'), '');
    try {
      await api('anmelden/', { method: 'POST', body: JSON.stringify({ passwort: $('passwort').value }) });
      $('passwort').value = '';
      zustand.sitzung = await api('sitzung/');
      await zeigeApp();
    } catch (f) {
      zeige($('anmeldeMeldung'), f.fehler);
      $('passwort').select();
    } finally {
      knopf.disabled = false;
    }
  });

  $('abmelden').addEventListener('click', async () => {
    try { await api('abmelden/', { method: 'POST', body: '{}' }); } catch { /* Cookie läuft ohnehin ab */ }
    verwerfen();
    zustand.eintraege = [];
    $('tabelle').textContent = '';
    appAktiv = false;
    zeigeAnmeldung('Du bist abgemeldet.');
  });

  async function zeigeApp() {
    $('anmeldung').hidden = true;
    zeige($('startMeldung'), '');
    $('app').hidden = false;
    $('abmelden').hidden = false;
    const s = zustand.sitzung || {};
    const hinweise = [];
    if (!s.erkennung) hinweise.push('Die automatische Erkennung ist noch nicht eingerichtet – die Werte werden von Hand eingetragen.');
    if (!s.speicher) hinweise.push('Der Speicher ist noch nicht eingerichtet – Tagesabschlüsse können noch nicht gespeichert werden.');
    $('einrichtungsHinweis').hidden = hinweise.length === 0;
    $('einrichtungsHinweis').textContent = hinweise.join(' ');
    $('analysieren').hidden = !s.erkennung;
    if (!appAktiv) { appAktiv = true; await ladeListe(); }
    const foto = new URLSearchParams(location.search).get('foto');
    if (foto && /^\d{4}-\d{2}-\d{2}$/.test(foto)) {
      history.replaceState(null, '', location.pathname);
      zeigeFoto(foto);
    }
  }

  /* --------------------------------------------------------- Foto wählen */
  /** JPEG/PNG abgeschnitten? (Browser zeigen auch halbe Bilder an – das soll nicht als Bon durchgehen) */
  async function vollstaendig(datei) {
    const kopf = new Uint8Array(await datei.slice(0, 8).arrayBuffer());
    const ende = new Uint8Array(await datei.slice(Math.max(0, datei.size - 64)).arrayBuffer());
    if (kopf[0] === 0xff && kopf[1] === 0xd8) {                       // JPEG: Endmarke FF D9 (ggf. mit Nullen aufgefüllt)
      let i = ende.length - 1;
      while (i > 0 && ende[i] === 0) i--;
      return ende[i - 1] === 0xff && ende[i] === 0xd9;
    }
    if (kopf[0] === 0x89 && kopf[1] === 0x50 && kopf[2] === 0x4e && kopf[3] === 0x47) {   // PNG: IEND-Block am Ende
      const t = String.fromCharCode(...ende.slice(-8, -4));
      return t === 'IEND';
    }
    return true;                                                       // HEIC/WebP o. Ä.: Browser entscheidet beim Dekodieren
  }

  async function bildVorbereiten(datei) {
    if (datei.size > 30 * 1024 * 1024) throw new Error('Die Datei ist zu groß.');
    const typOk = /^image\//.test(datei.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(datei.name);
    if (!typOk) throw new Error('Das hochgeladene Dateiformat wird nicht unterstützt. Bitte ein Foto (JPEG oder PNG) wählen.');
    if (!(await vollstaendig(datei))) throw new Error('Die Datei ist beschädigt oder unvollständig. Bitte das Foto erneut aufnehmen.');
    let quelle;
    try {
      quelle = await createImageBitmap(datei, { imageOrientation: 'from-image' });
    } catch {
      quelle = await new Promise((ok, nein) => {
        const img = new Image();
        const url = URL.createObjectURL(datei);
        img.onload = () => { ok(img); setTimeout(() => URL.revokeObjectURL(url), 0); };
        img.onerror = () => { URL.revokeObjectURL(url); nein(new Error('Die Datei ist beschädigt oder kein lesbares Foto.')); };
        img.src = url;
      });
    }
    const w0 = quelle.width || quelle.naturalWidth, h0 = quelle.height || quelle.naturalHeight;
    if (!w0 || !h0) throw new Error('Die Datei ist beschädigt oder kein lesbares Foto.');
    // verkleinern (lange Seite höchstens 2400 px) und als JPEG neu speichern – entfernt auch Standortdaten (EXIF)
    let lang = 2400, qualitaet = 0.85, blob;
    for (let versuch = 0; versuch < 4; versuch++) {
      const faktor = Math.min(1, lang / Math.max(w0, h0));
      const w = Math.max(1, Math.round(w0 * faktor)), h = Math.max(1, Math.round(h0 * faktor));
      const leinwand = document.createElement('canvas');
      leinwand.width = w; leinwand.height = h;
      const ctx = leinwand.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(quelle, 0, 0, w, h);
      blob = await new Promise(ok => leinwand.toBlob(ok, 'image/jpeg', qualitaet));
      if (!blob) throw new Error('Das Foto konnte nicht verarbeitet werden.');
      if (blob.size <= 2.6 * 1024 * 1024) {
        const base64 = await new Promise((ok, nein) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = nein; r.readAsDataURL(blob); });
        if (quelle.close) quelle.close();
        return { base64, url: URL.createObjectURL(blob), breite: w, hoehe: h, bytes: blob.size };
      }
      lang = Math.round(lang * 0.8); qualitaet = Math.max(0.7, qualitaet - 0.05);
    }
    throw new Error('Die Datei ist zu groß.');
  }

  async function fotoGewaehlt(ev) {
    const datei = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!datei) return;
    zeige($('erfassenMeldung'), '');
    $('erfolg').hidden = true;
    verwerfen(true);
    try {
      const foto = await bildVorbereiten(datei);
      if (zustand.foto && zustand.foto.url) URL.revokeObjectURL(zustand.foto.url);
      zustand.foto = foto;
      $('auswahlBild').src = foto.url;
      $('auswahlInfo').textContent = `Foto bereit (${foto.breite} × ${foto.hoehe} Pixel, ${(foto.bytes / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB).`
        + (zustand.sitzung && zustand.sitzung.erkennung ? ' Jetzt analysieren oder die Werte von Hand eintragen.' : ' Bitte die Werte von Hand eintragen.');
      $('auswahl').hidden = false;
    } catch (f) {
      zustand.foto = null;
      $('auswahl').hidden = true;
      zeige($('erfassenMeldung'), f.message || 'Das Foto konnte nicht gelesen werden.');
    }
  }
  $('kamera').addEventListener('change', fotoGewaehlt);
  $('datei').addEventListener('change', fotoGewaehlt);

  /* ------------------------------------------------------------ Analyse */
  $('analysieren').addEventListener('click', async () => {
    if (!zustand.foto) return;
    $('analysieren').disabled = true; $('vonHand').disabled = true;
    $('analyseLaeuft').hidden = false;
    zeige($('erfassenMeldung'), '');
    try {
      const ergebnis = await api('analysieren/', { method: 'POST', body: JSON.stringify({ bild: zustand.foto.base64 }) });
      oeffnePruefung(ergebnis);
    } catch (f) {
      if (f.status === 401) return;
      zeige($('erfassenMeldung'), f.fehler || 'Das Bild konnte nicht analysiert werden. Bitte erneut versuchen oder die Werte von Hand eintragen.');
    } finally {
      $('analysieren').disabled = false; $('vonHand').disabled = false;
      $('analyseLaeuft').hidden = true;
    }
  });

  $('vonHand').addEventListener('click', () => { if (zustand.foto) oeffnePruefung(null); });

  /* -------------------------------------------------------- Prüfansicht */
  function feldBauen(def, wert, status, hinweis) {
    const label = el('label', 'feld');
    label.dataset.feld = def.feld;
    const kopf = el('span', 'feld-name', def.name);
    if (!def.pflicht) kopf.appendChild(el('span', 'optional', ' (freiwillig)'));
    label.appendChild(kopf);
    let input;
    if (def.art === 'datum') {
      input = el('input');
      input.type = 'date';
      input.max = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
      if (wert) input.value = wert;
    } else {
      input = el('input', 'betrag');
      input.type = 'text';
      input.inputMode = 'decimal';
      input.autocomplete = 'off';
      input.placeholder = '0,00';
      if (typeof wert === 'number') input.value = zahlFeld(wert);
    }
    input.id = 'f_' + def.feld;
    input.name = def.feld;
    if (def.vorzeichen) {
      const zeile = el('span', 'feld-zeile');
      zeile.appendChild(input);
      const pm = el('button', 'knopf klein vorzeichen', '±');
      pm.type = 'button';
      pm.title = 'Vorzeichen wechseln';
      pm.setAttribute('aria-label', 'Vorzeichen wechseln');
      pm.addEventListener('click', () => {
        const c = betragInCent(input.value);
        if (c !== null) { input.value = zahlFeld(-c / 100); input.dispatchEvent(new Event('input')); }
        else if (!input.value.trim().startsWith('-')) { input.value = '-' + input.value.trim(); }
        input.focus();
      });
      zeile.appendChild(pm);
      label.appendChild(zeile);
    } else {
      label.appendChild(input);
    }
    if (status) {
      label.classList.add(status);
      label.appendChild(el('span', 'marke ' + status, STATUS_TEXT[status]));
    }
    const h = hinweis || def.zusatz;
    if (h) label.appendChild(el('span', 'feld-hinweis', h));
    label.appendChild(el('span', 'feld-fehler'));
    if (def.art !== 'datum') {
      input.addEventListener('blur', () => { const c = betragInCent(input.value); if (c !== null) input.value = zahlFeld(c / 100); });
    }
    input.addEventListener('input', () => {
      label.classList.remove('fehler');
      label.querySelector('.feld-fehler').textContent = '';
      if (def.feld === 'datum') { pruefeDatumVorab(); }
    });
    return label;
  }

  function oeffnePruefung(ergebnis) {
    const werte = (ergebnis && ergebnis.werte) || {};
    const status = (ergebnis && ergebnis.status) || {};
    const hinweise = (ergebnis && ergebnis.hinweise) || {};
    zustand.erkennung = {};
    zustand.erkannteWerte = {};
    for (const def of BON_FELDER) {
      zustand.erkennung[def.feld] = ergebnis ? status[def.feld] || 'fehlt' : 'manuell';
      zustand.erkannteWerte[def.feld] = werte[def.feld] === undefined ? null : werte[def.feld];
    }

    $('bonFelder').textContent = '';
    for (const def of BON_FELDER) {
      $('bonFelder').appendChild(feldBauen(def, werte[def.feld], ergebnis ? status[def.feld] : null, ergebnis ? hinweise[def.feld] : null));
    }
    $('handFelder').textContent = '';
    for (const def of HAND_FELDER) $('handFelder').appendChild(feldBauen(def, null, null, null));
    $('bemerkung').value = '';

    const unsicher = ergebnis ? BON_FELDER.filter(d => status[d.feld] !== 'sicher') : [];
    if (ergebnis) {
      $('pruefTitel').textContent = 'Tagesabschluss erkannt';
      $('pruefInfo').textContent = unsicher.length
        ? `Bitte alle Werte mit dem Foto vergleichen. ${unsicher.length === 1 ? 'Ein Wert wurde' : unsicher.length + ' Werte wurden'} nicht sicher erkannt und ${unsicher.length === 1 ? 'ist' : 'sind'} markiert.`
        : 'Alle Werte vom Bon wurden erkannt und mit den Kontrollsummen des Bons abgeglichen. Bitte trotzdem kurz mit dem Foto vergleichen.';
    } else {
      $('pruefTitel').textContent = 'Tagesabschluss eintragen';
      $('pruefInfo').textContent = 'Bitte die Werte vom Bon abtippen.';
    }
    $('bonVorschau').src = zustand.foto.url;
    $('dublette').hidden = true;
    zustand.dublette = null;
    zeige($('speicherMeldung'), '');
    $('erfassen').hidden = true;
    $('pruefung').hidden = false;
    $('pruefung').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (ergebnis && ergebnis.vorhanden) zeigeDublette(ergebnis.vorhanden, 'vorhanden');
    else pruefeDatumVorab();
  }

  /** Formularwerte sammeln und im Browser vorprüfen (der Server prüft noch einmal) */
  function sammeln() {
    let ok = true;
    const eintrag = { erkennung: {} };
    for (const def of ALLE) {
      const label = document.querySelector(`.feld[data-feld="${def.feld}"]`);
      const input = $('f_' + def.feld);
      const fehlerEl = label.querySelector('.feld-fehler');
      fehlerEl.textContent = '';
      label.classList.remove('fehler');
      const roh = input.value.trim();
      let wert = null, meldung = '';
      if (def.art === 'datum') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(roh)) meldung = 'Bitte gib ein gültiges Datum ein.';
        else wert = roh;
      } else if (roh) {
        const c = betragInCent(roh);
        if (c === null) meldung = `Bitte als Betrag eingeben, z. B. 1.234,56.`;
        else wert = c / 100;
      } else if (def.pflicht) {
        meldung = def.feld === 'kassendifferenz' ? 'Bitte gib die Kassendifferenz ein.' : `Bitte gib den Wert für „${def.name}“ ein.`;
      }
      if (meldung) { ok = false; fehlerEl.textContent = meldung; label.classList.add('fehler'); }
      eintrag[def.feld] = wert;
    }
    for (const def of BON_FELDER) {
      const vorher = zustand.erkennung[def.feld];
      const geaendert = zustand.erkannteWerte[def.feld] !== eintrag[def.feld];
      eintrag.erkennung[def.feld] = vorher === 'sicher' && !geaendert ? 'sicher' : (vorher === 'manuell' ? 'manuell' : (geaendert ? 'manuell' : vorher));
    }
    eintrag.bemerkung = $('bemerkung').value.trim();
    return ok ? eintrag : null;
  }

  async function speichern(ueberschreiben) {
    zeige($('speicherMeldung'), '');
    const eintrag = sammeln();
    if (!eintrag) {
      zeige($('speicherMeldung'), 'Bitte prüfe die markierten Felder.');
      const erstes = document.querySelector('.feld.fehler input');
      if (erstes) erstes.focus();
      return;
    }
    const knopf = $('speichern');
    knopf.disabled = true; $('aktualisieren').disabled = true;
    try {
      const daten = await api('eintraege/', {
        method: 'POST',
        body: JSON.stringify({ eintrag, bild: zustand.foto.base64, ueberschreiben: Boolean(ueberschreiben), version: ueberschreiben && zustand.dublette ? zustand.dublette.geaendert : undefined }),
      });
      const datum = deDatum(daten.eintrag.datum);
      verwerfen();
      $('erfolg').textContent = daten.aktualisiert ? `Tagesabschluss vom ${datum} wurde aktualisiert.` : `Tagesabschluss vom ${datum} wurde gespeichert.`;
      $('erfolg').hidden = false;
      await ladeListe();
      $('erfolg').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (f) {
      if (f.status === 401) return;
      if (f.status === 409 && f.vorhanden) { zeigeDublette(f.vorhanden, f.code); return; }
      if (f.status === 422 && Array.isArray(f.felder)) {
        for (const { feld, meldung } of f.felder) {
          const label = document.querySelector(`.feld[data-feld="${feld}"]`);
          if (label) { label.classList.add('fehler'); label.querySelector('.feld-fehler').textContent = meldung; }
        }
      }
      zeige($('speicherMeldung'), f.fehler);
    } finally {
      knopf.disabled = false; $('aktualisieren').disabled = false;
    }
  }

  function zeigeDublette(vorhanden, code) {
    zustand.dublette = vorhanden;
    $('dubletteTitel').textContent = code === 'geaendert'
      ? 'Der bestehende Tagesabschluss wurde inzwischen geändert.'
      : `Für den ${deDatum(vorhanden.datum)} existiert bereits ein Tagesabschluss.`;
    const box = $('dubletteDaten');
    box.textContent = '';
    for (const [feld, name] of SPALTEN) box.appendChild(el('span', '', `${name}: ${alsEuro(vorhanden[feld])}`));
    if (vorhanden.bemerkung) box.appendChild(el('span', '', `Bemerkung: ${vorhanden.bemerkung}`));
    $('dubletteText').textContent = 'Er wird nicht automatisch überschrieben. Prüfe das Datum – oder ersetze den bestehenden Eintrag bewusst durch diese Angaben und dieses Foto.';
    $('aktualisieren').hidden = false;
    $('dublette').hidden = false;
    $('dublette').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  let datumPruefung = 0;
  async function pruefeDatumVorab() {
    const input = $('f_datum');
    if (!input || !zustand.sitzung || !zustand.sitzung.speicher) return;
    const datum = input.value;
    const nr = ++datumPruefung;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) { $('dublette').hidden = true; zustand.dublette = null; return; }
    try {
      const { eintrag } = await api('eintrag/?datum=' + encodeURIComponent(datum));
      if (nr !== datumPruefung) return;
      if (eintrag) zeigeDublette(eintrag, 'vorhanden');
      else { $('dublette').hidden = true; zustand.dublette = null; }
    } catch { /* Hinweis ist nur eine Hilfe – beim Speichern prüft der Server ohnehin */ }
  }

  $('pruefForm').addEventListener('submit', ev => { ev.preventDefault(); speichern(false); });
  $('aktualisieren').addEventListener('click', () => {
    if (!zustand.dublette) return;
    if (!window.confirm(`Den bestehenden Tagesabschluss vom ${deDatum(zustand.dublette.datum)} wirklich durch diese Angaben und dieses Foto ersetzen?`)) return;
    speichern(true);
  });

  function verwerfen(nurPruefung) {
    $('pruefung').hidden = true;
    $('erfassen').hidden = false;
    $('dublette').hidden = true;
    zustand.dublette = null;
    if (!nurPruefung) {
      $('auswahl').hidden = true;
      if (zustand.foto && zustand.foto.url) URL.revokeObjectURL(zustand.foto.url);
      zustand.foto = null;
    }
  }
  $('verwerfen').addEventListener('click', () => verwerfen());

  /* ------------------------------------------------------------ Tabelle */
  async function ladeListe() {
    zeige($('listeMeldung'), '');
    if (zustand.sitzung && !zustand.sitzung.speicher) {
      $('tabelle').textContent = '';
      $('tabelle').appendChild(el('p', 'leise', 'Noch keine Tagesabschlüsse – der Speicher ist noch nicht eingerichtet.'));
      return;
    }
    try {
      const { eintraege } = await api('eintraege/');
      zustand.eintraege = eintraege;
      zeichneListe();
    } catch (f) {
      if (f.status !== 401) zeige($('listeMeldung'), f.fehler);
    }
  }

  // \u00ad = weiche Trennstelle, damit die Tabelle auf Laptop-Breite ohne Scrollen passt
  const SPALTEN = [
    ['umsatz7', '7 % Umsatz'], ['umsatz19', '19 % Umsatz'], ['umsatzBar', 'Umsatz bar'], ['barausgabe', 'Bar\u00adausgabe'],
    ['bankeinzahlung', 'Bank\u00adeinzahlung'], ['bargeldEntfernt', 'Bargeld entfernt'], ['kassendifferenz', 'Kassen\u00addifferenz'], ['barkassenbestand', 'Barkassen\u00adbestand'],
  ];

  function fotoKnopf(e, text = 'Foto ansehen') {
    if (!e.hatFoto) return el('span', 'leer', '–');
    const k = el('button', 'knopf klein', text);
    k.type = 'button';
    k.setAttribute('aria-label', 'Foto vom ' + deDatum(e.datum) + ' ansehen');
    k.addEventListener('click', () => zeigeFoto(e.datum));
    return k;
  }

  function zeichneListe() {
    const ziel = $('tabelle');
    ziel.textContent = '';
    const liste = zustand.eintraege;
    if (!liste.length) { ziel.appendChild(el('p', 'leise', 'Noch keine Tagesabschlüsse gespeichert.')); return; }

    const huelle = el('div', 'tabelle-huelle');
    const tab = el('table');
    const kopf = el('tr');
    kopf.appendChild(el('th', '', 'Datum'));
    for (const [, name] of SPALTEN) kopf.appendChild(el('th', 'zahl', name));
    kopf.appendChild(el('th', '', 'Bemerkung'));
    kopf.appendChild(el('th', '', 'Tagesabschluss Foto'));
    const thead = el('thead'); thead.appendChild(kopf); tab.appendChild(thead);
    const tbody = el('tbody');
    for (const e of liste) {
      const tr = el('tr');
      tr.appendChild(el('td', '', deDatum(e.datum)));
      for (const [feld] of SPALTEN) {
        const td = el('td', 'zahl' + (typeof e[feld] === 'number' && e[feld] < 0 ? ' negativ' : '') + (typeof e[feld] !== 'number' ? ' leer' : ''), alsEuro(e[feld]));
        tr.appendChild(td);
      }
      tr.appendChild(el('td', 'bemerkung', e.bemerkung || ''));
      const tdFoto = el('td'); tdFoto.appendChild(fotoKnopf(e, 'Ansehen')); tr.appendChild(tdFoto);
      tbody.appendChild(tr);
    }
    tab.appendChild(tbody);
    huelle.appendChild(tab);
    ziel.appendChild(huelle);

    const karten = el('div', 'karten');
    for (const e of liste) {
      const k = el('article', 'eintrag-karte');
      k.appendChild(el('h3', '', deDatum(e.datum)));
      const dl = el('dl', 'eintrag-werte');
      for (const [feld, name] of SPALTEN) {
        dl.appendChild(el('dt', '', name));
        dl.appendChild(el('dd', typeof e[feld] === 'number' && e[feld] < 0 ? 'negativ' : '', alsEuro(e[feld])));
      }
      k.appendChild(dl);
      if (e.bemerkung) k.appendChild(el('p', '', 'Bemerkung: ' + e.bemerkung));
      k.appendChild(fotoKnopf(e));
      karten.appendChild(k);
    }
    ziel.appendChild(karten);
  }

  /* --------------------------------------------------------- Foto groß */
  let fotoUrl = null;
  async function zeigeFoto(datum) {
    const dialog = $('fotoDialog');
    $('fotoDialogTitel').textContent = 'Tagesabschluss vom ' + deDatum(datum);
    $('fotoDialogBild').removeAttribute('src');
    try {
      const antwort = await api('foto/?datum=' + encodeURIComponent(datum), { roh: true });
      if (fotoUrl) URL.revokeObjectURL(fotoUrl);
      fotoUrl = URL.createObjectURL(await antwort.blob());
      $('fotoDialogBild').src = fotoUrl;
      oeffneDialog();
    } catch (f) {
      if (f.status !== 401) zeige($('listeMeldung'), f.fehler);
    }
  }
  function oeffneDialog() {
    const dialog = $('fotoDialog');
    dialog.querySelector('.foto-dialog-bild').classList.remove('gross');
    $('fotoZoom').textContent = 'Vergrößern';
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }
  $('bonGross').addEventListener('click', () => {
    if (!zustand.foto) return;
    $('fotoDialogTitel').textContent = 'Foto des Tagesabschlusses';
    $('fotoDialogBild').src = zustand.foto.url;
    oeffneDialog();
  });
  $('fotoZoom').addEventListener('click', () => {
    const b = $('fotoDialog').querySelector('.foto-dialog-bild');
    b.classList.toggle('gross');
    $('fotoZoom').textContent = b.classList.contains('gross') ? 'Verkleinern' : 'Vergrößern';
  });
  $('fotoSchliessen').addEventListener('click', () => { const d = $('fotoDialog'); if (d.close) d.close(); else d.removeAttribute('open'); });

  /* --------------------------------------------------------------- Excel */
  $('excel').addEventListener('click', async () => {
    zeige($('listeMeldung'), '');
    $('excel').disabled = true;
    try {
      const antwort = await api('export/', { roh: true });
      const blob = await antwort.blob();
      const name = (/filename="([^"]+)"/.exec(antwort.headers.get('content-disposition') || '') || [])[1] || 'tagesabschluesse.xlsx';
      const a = el('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    } catch (f) {
      if (f.status !== 401) zeige($('listeMeldung'), f.fehler);
    } finally {
      $('excel').disabled = false;
    }
  });

  start();
})();
