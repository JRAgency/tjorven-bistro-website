// Dashboard (intern, nur lesen): zeigt Monitor 2, 3 und 4 gleichzeitig als echte, eingebettete Monitorseiten.
// Anmeldung über dieselbe Schnittstelle und dasselbe Sitzungs-Cookie wie Verwaltung und Tagesabschluss
// (/api/tagesabschluss/sitzung|anmelden|abmelden) – keine eigene Function, kein weiteres Passwort.
// Die Vorschauen werden erst nach erfolgreicher Anmeldung eingefügt und beim Abmelden wieder entfernt.
'use strict';

(function () {
  const MONITORE = [
    { name: 'Monitor 2 – Speisekarte', pfad: '/monitor/speisen/' },
    { name: 'Monitor 3 – Getränkekarte', pfad: '/monitor/getraenke/' },
    { name: 'Monitor 4 – Heute bei uns', pfad: '/monitor/specials/' },
  ];
  const NEU_LADEN_MINUTEN = 10;   // ganze Vorschau gelegentlich neu laden (neue Version nach einem Deployment)
  const $ = id => document.getElementById(id);
  let zuletztGeladen = 0;

  async function api(pfad, optionen = {}) {
    const kopf = {};
    if (optionen.method && optionen.method !== 'GET') { kopf['X-Tagesabschluss'] = '1'; kopf['Content-Type'] = 'application/json'; }
    let antwort;
    try {
      antwort = await fetch(pfad, { credentials: 'same-origin', cache: 'no-store', method: optionen.method, body: optionen.body, headers: kopf });
    } catch {
      throw { status: 0, meldung: 'Keine Verbindung. Bitte die Internetverbindung prüfen.' };
    }
    let daten = null;
    try { daten = await antwort.json(); } catch { /* leer */ }
    if (!antwort.ok) throw { status: antwort.status, meldung: (daten && daten.fehler) || 'Das hat nicht geklappt.' };
    return daten;
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function vorschauenAufbauen() {
    const ziel = $('monitore');
    ziel.replaceChildren(...MONITORE.map(m => {
      const karte = el('article', 'monitor');
      const kopf = el('div', 'monitor-kopf');
      kopf.append(el('h2', '', m.name));
      const gross = el('a', 'monitor-link', 'Groß öffnen');
      gross.href = m.pfad; gross.target = '_blank'; gross.rel = 'noopener';
      kopf.append(gross);
      const rahmen = el('div', 'bildschirm');
      const frame = el('iframe');
      frame.src = m.pfad;
      frame.title = m.name + ' (Vorschau)';
      frame.tabIndex = -1;
      frame.setAttribute('referrerpolicy', 'no-referrer');
      const klick = el('a', 'bildschirm-klick');   // die ganze Vorschau ist anklickbar
      klick.href = m.pfad; klick.target = '_blank'; klick.rel = 'noopener';
      klick.setAttribute('aria-label', m.name + ' groß in neuem Tab öffnen');
      rahmen.append(frame, klick);
      karte.append(kopf, rahmen);
      return karte;
    }));
    zuletztGeladen = Date.now();
    $('stand').textContent = 'Geladen um ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr';
  }

  function zeigeAnmeldung(text) {
    $('monitore').replaceChildren();   // ohne Anmeldung keine Vorschauen
    $('uebersicht').hidden = true;
    $('anmeldung').hidden = false;
    for (const id of ['abmelden', 'neuLaden', 'zurVerwaltung']) $(id).hidden = true;
    $('anmeldeMeldung').textContent = text || '';
    $('passwort').value = '';
    $('passwort').focus();
  }

  function zeigeUebersicht() {
    $('anmeldung').hidden = true;
    $('startMeldung').textContent = '';
    $('uebersicht').hidden = false;
    for (const id of ['abmelden', 'neuLaden', 'zurVerwaltung']) $(id).hidden = false;
    vorschauenAufbauen();
  }

  async function sitzungPruefen(start) {
    try {
      await api('/api/tagesabschluss/sitzung/');
      if (start) zeigeUebersicht();
      return true;
    } catch (f) {
      if (f.status === 401) { zeigeAnmeldung(start ? '' : 'Deine Sitzung ist abgelaufen. Bitte erneut anmelden.'); return false; }
      if (start) $('startMeldung').textContent = f.meldung;
      return false;
    }
  }

  $('anmeldeForm').addEventListener('submit', async e => {
    e.preventDefault();
    const knopf = e.submitter || $('anmeldeForm').querySelector('button');
    knopf.disabled = true;
    $('anmeldeMeldung').textContent = '';
    try {
      await api('/api/tagesabschluss/anmelden/', { method: 'POST', body: JSON.stringify({ passwort: $('passwort').value }) });
      $('passwort').value = '';
      zeigeUebersicht();
    } catch (f) {
      $('anmeldeMeldung').textContent = f.meldung;
    } finally {
      knopf.disabled = false;
    }
  });

  $('abmelden').addEventListener('click', async () => {
    try { await api('/api/tagesabschluss/abmelden/', { method: 'POST', body: '{}' }); } catch { /* Cookie läuft ohnehin ab */ }
    zeigeAnmeldung('Abgemeldet.');
  });

  $('neuLaden').addEventListener('click', vorschauenAufbauen);

  // Sitzung regelmäßig prüfen; nach längerer Zeit (oder nach dem Zurückkehren in den Tab) Vorschauen neu laden
  setInterval(async () => {
    if ($('uebersicht').hidden) return;
    if (await sitzungPruefen(false) && Date.now() - zuletztGeladen > NEU_LADEN_MINUTEN * 60 * 1000) vorschauenAufbauen();
  }, 60 * 1000);
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden || $('uebersicht').hidden) return;
    if (await sitzungPruefen(false) && Date.now() - zuletztGeladen > NEU_LADEN_MINUTEN * 60 * 1000) vorschauenAufbauen();
  });

  sitzungPruefen(true);
})();
