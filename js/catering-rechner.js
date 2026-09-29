/* ============================================================
   TJORVEN BISTRO — Catering-Preisrechner

   Alle Leistungen, Preise und Regeln kommen aus
   data/catering-preise.json. Dieselbe Datei liest der Server
   (inc/catering-preise.php) und rechnet beim Absenden neu —
   der hier angezeigte Betrag ist nur die Live-Vorschau.

   Beträge durchgehend in Cent (ganze Zahlen).
   ============================================================ */
(function () {
  'use strict';

  var CONFIG_URL = 'data/catering-preise.json';

  var dialog   = document.getElementById('rechner');
  var openBtn  = document.getElementById('rechner-oeffnen');
  var form     = document.getElementById('rechner-form');
  if (!dialog || !openBtn || !form || typeof dialog.showModal !== 'function') {
    // Sehr alte Browser ohne <dialog>: dann bleibt der Weg über PDF und Kontakt
    if (openBtn) openBtn.addEventListener('click', function () { window.location.href = 'kontakt.html'; });
    return;
  }

  var inhalt    = document.getElementById('rechner-inhalt');
  var schritteOl = document.getElementById('rechner-schritte');
  var summeEl   = document.getElementById('rechner-summe');
  var summeHinweisEl = document.getElementById('rechner-summe-hinweis');
  var aufklapp  = document.getElementById('rechner-aufklapp');
  var aufschl   = document.getElementById('rechner-aufschluesselung');
  var liveEl    = document.getElementById('rechner-live');
  var btnZurueck = document.getElementById('rechner-zurueck');
  var btnWeiter  = document.getElementById('rechner-weiter');
  var btnSenden  = document.getElementById('rechner-senden');

  var SCHRITTE = [
    { id: 'anlass',    kurz: 'Anlass',    titel: 'Anlass & Personenzahl' },
    { id: 'menue',     kurz: 'Menü',      titel: 'Menü' },
    { id: 'snacks',    kurz: 'Snacks',    titel: 'Frühstück, Snacks & Fingerfood' },
    { id: 'getraenke', kurz: 'Getränke',  titel: 'Getränkepauschalen' },
    { id: 'service',   kurz: 'Service',   titel: 'Servicepersonal' },
    { id: 'anfrage',   kurz: 'Anfrage',   titel: 'Kontakt & Zusammenfassung' }
  ];

  var cfg = null;
  var ladeVersprechen = null;
  var gesendet = false;

  var state = {
    schritt: 0,
    maxErreicht: 0,
    menue: { id: '', gangfolge: '', mehr: [], speisen: { vorspeise: ['', ''], hauptspeise: ['', ''], dessert: ['', ''] } },
    stueck: {},
    getraenke: {},
    service: { kraefte: 0, stunden: 0 }
  };

  /* ---------- Hilfsfunktionen ---------- */

  var euroFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  function euro(cent) { return euroFmt.format(cent / 100); }
  function zahl(n) { return String(n).replace('.', ','); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function feldWert(name) {
    var f = form.elements[name];
    return f ? String(f.value || '').trim() : '';
  }
  function personen() {
    var v = feldWert('guests');
    return /^\d+$/.test(v) ? parseInt(v, 10) : NaN;
  }
  function personenGueltig() {
    var p = personen();
    return !isNaN(p) && p >= cfg.personen.min && p <= cfg.personen.max;
  }
  function findeVariante(id) {
    for (var i = 0; i < cfg.menues.varianten.length; i++) {
      if (cfg.menues.varianten[i].id === id) return cfg.menues.varianten[i];
    }
    return null;
  }
  function findeGangfolge(variante, id) {
    if (!variante) return null;
    for (var i = 0; i < variante.gangfolgen.length; i++) {
      if (variante.gangfolgen[i].id === id) return variante.gangfolgen[i];
    }
    return null;
  }
  function speiseName(gang, id) {
    var liste = cfg.speisen[gang].auswahl;
    for (var i = 0; i < liste.length; i++) if (liste[i].id === id) return liste[i].name;
    return '';
  }

  /* Welche Gänge dürfen eine zweite Speise haben? (gleiche Regel wie auf dem Server) */
  function zweiteErlaubt(variante, folge, mehr) {
    var erlaubt = {};
    if (!variante || !folge) return erlaubt;
    variante.mehr_auswahl.optionen.forEach(function (o) {
      if (mehr.indexOf(o.id) === -1) return;
      o.gaenge.forEach(function (g) { if (folge.gaenge.indexOf(g) !== -1) erlaubt[g] = true; });
    });
    return erlaubt;
  }

  /* Mehr-Auswahl zählt nur ab der Mindestpersonenzahl; der Zustand bleibt erhalten,
     damit beim Tippen einer Personenzahl (z. B. "1" auf dem Weg zu "150") nichts verloren geht */
  function mehrWirksam() {
    var v = findeVariante(state.menue.id);
    if (!v) return [];
    var p = personenGueltig() ? personen() : 0;
    return p >= v.mehr_auswahl.min_personen ? state.menue.mehr.slice() : [];
  }

  /* Auswahl in der Form, die an den Server geht */
  function auswahlObjekt() {
    var a = { menue: null, stueck: {}, getraenke: {}, service: { kraefte: state.service.kraefte, stunden: state.service.stunden } };
    if (state.menue.id) {
      var v = findeVariante(state.menue.id);
      var f = findeGangfolge(v, state.menue.gangfolge);
      var mehr = mehrWirksam();
      var erlaubt = zweiteErlaubt(v, f, mehr);
      var speisen = {};
      ['vorspeise', 'hauptspeise', 'dessert'].forEach(function (g) {
        if (!f || f.gaenge.indexOf(g) === -1) { speisen[g] = []; return; }
        var ids = state.menue.speisen[g].slice(0, erlaubt[g] ? 2 : 1).filter(Boolean);
        speisen[g] = ids;
      });
      a.menue = { id: state.menue.id, gangfolge: state.menue.gangfolge, mehr: mehr, speisen: speisen };
    }
    Object.keys(state.stueck).forEach(function (id) { if (state.stueck[id] > 0) a.stueck[id] = state.stueck[id]; });
    Object.keys(state.getraenke).forEach(function (id) { if (state.getraenke[id]) a.getraenke[id] = state.getraenke[id]; });
    return a;
  }

  /* ---------- Berechnung (Spiegel von tj_catering_calculate) ---------- */

  function berechne(auswahl, p) {
    var positionen = [], hinweise = [], ab = false;

    if (auswahl.menue) {
      var v = findeVariante(auswahl.menue.id);
      var f = findeGangfolge(v, auswahl.menue.gangfolge);
      if (v && f) {
        positionen.push({ titel: v.titel + ' (' + f.titel + ')', menge: p, einheit: 'Pers.',
                          einzel: v.preis_ab_pp, summe: v.preis_ab_pp * p, ab: !!v.preis_ist_ab });
        ab = ab || !!v.preis_ist_ab;
        if (p >= v.mehr_auswahl.min_personen) {
          v.mehr_auswahl.optionen.forEach(function (o) {
            if (auswahl.menue.mehr.indexOf(o.id) === -1) return;
            positionen.push({ titel: 'Mehr Auswahl: ' + o.titel, menge: p, einheit: 'Pers.',
                              einzel: o.aufpreis_pp, summe: o.aufpreis_pp * p, ab: false });
          });
        }
      }
    }

    cfg.stueckartikel.gruppen.forEach(function (gr) {
      gr.artikel.forEach(function (art) {
        var m = auswahl.stueck[art.id] || 0;
        if (m > 0) positionen.push({ titel: gr.titel + ': ' + art.name, menge: m, einheit: art.einheit || 'Stück',
                                     einzel: gr.preis, summe: gr.preis * m, ab: false });
      });
    });

    var dauerTitel = {};
    cfg.getraenke.dauer.forEach(function (d) { dauerTitel[d.id] = d.titel; });
    cfg.getraenke.pauschalen.forEach(function (pa) {
      var d = auswahl.getraenke[pa.id];
      if (!d || pa.preise_pp[d] == null) return;
      positionen.push({ titel: pa.titel + ' (' + dauerTitel[d] + ')', menge: p, einheit: 'Pers.',
                        einzel: pa.preise_pp[d], summe: pa.preise_pp[d] * p, ab: false });
    });

    var pers = cfg.service.personal;
    var kr = auswahl.service.kraefte, halbe = Math.round(auswahl.service.stunden * 2);
    if (kr > 0 && halbe > 0) {
      var ges = kr * halbe;
      positionen.push({ titel: pers.titel + ' (Schätzung: ' + kr + ' × ' + zahl(halbe / 2) + ' Std.)',
                        menge: ges / 2, einheit: 'Std.', einzel: pers.preis_pro_stunde,
                        summe: Math.floor(pers.preis_pro_stunde * ges / 2), ab: false });
      hinweise.push(pers.titel + ': deine eigene Schätzung ist in der Summe enthalten – abgerechnet wird nach tatsächlichem Aufwand, die Einsatzzeit wird individuell abgestimmt.');
    } else {
      hinweise.push(pers.titel + ': nach tatsächlichem Aufwand (' + pers.preis_text + ') – nicht in der Summe enthalten, die Einsatzzeit wird individuell abgestimmt.');
    }
    hinweise.push(cfg.service.spuelpauschale.titel + ': Preis auf Anfrage, nicht in der Summe enthalten – ' + cfg.service.spuelpauschale.text);

    var summe = 0;
    positionen.forEach(function (x) { summe += x.summe; });
    return { positionen: positionen, hinweise: hinweise, summe: summe, ab: ab };
  }

  function aktuelleBerechnung() {
    var p = personenGueltig() ? personen() : 0;
    var auswahl = auswahlObjekt();
    if (!p) {
      // Ohne gültige Personenzahl nur die Stückartikel rechnen
      auswahl.menue = null;
      auswahl.getraenke = {};
    }
    return berechne(auswahl, p);
  }

  /* ---------- Darstellung der Schritte ---------- */

  function renderSchrittleiste() {
    schritteOl.innerHTML = SCHRITTE.map(function (s, i) {
      var cur = i === state.schritt ? ' aria-current="step"' : '';
      var cls = 'rechner__schritt-btn' + (i < state.schritt ? ' erledigt' : '');
      return '<li><button type="button" class="' + cls + '" data-geh-zu="' + i + '"' + cur +
        ' aria-label="Schritt ' + (i + 1) + ': ' + esc(s.titel) + '">' +
        '<span class="nr">' + (i + 1) + '</span><span class="txt">' + esc(s.kurz) + '</span></button></li>';
    }).join('');
  }

  function kopf(i, intro) {
    return '<h3 class="rechner__schritt-titel" tabindex="-1" data-schritt-titel>Schritt ' + (i + 1) + ' von ' +
      SCHRITTE.length + ': ' + esc(SCHRITTE[i].titel) + '</h3>' + (intro ? '<p class="rechner__intro">' + intro + '</p>' : '');
  }

  function htmlAnlass() {
    var occ = [['firma', 'Firmenevent / Business Lunch'], ['privat', 'Private Feier'], ['kindergeburtstag', 'Kindergeburtstag'],
               ['verein', 'Vereinsevent'], ['schule', 'Schulausflug / Gruppe'], ['sonstiges', 'Sonstiges']];
    return kopf(0, 'Grundlage ist unser Cateringangebot für Veranstaltungen in der KLIMA ARENA. ' + esc(cfg.mwst_hinweis)) +
      '<div class="rechner__feld" data-feld="guests">' +
        '<label for="r-guests">Anzahl Personen *</label>' +
        '<input type="number" id="r-guests" name="guests" inputmode="numeric" min="' + cfg.personen.min + '" max="' + cfg.personen.max +
          '" step="1" placeholder="z. B. 30" required aria-describedby="r-guests-hinweis">' +
        '<span class="rechner__feld-hinweis" id="r-guests-hinweis">' + esc(cfg.personen.text) + '</span>' +
      '</div>' +
      '<div class="rechner__reihe">' +
        '<div class="rechner__feld" data-feld="date"><label for="r-date">Datum <span class="opt">(optional)</span></label>' +
          '<input type="date" id="r-date" name="date"></div>' +
        '<div class="rechner__feld" data-feld="time"><label for="r-time">Uhrzeit <span class="opt">(optional)</span></label>' +
          '<input type="time" id="r-time" name="time"></div>' +
      '</div>' +
      '<div class="rechner__feld" data-feld="occasion"><label for="r-occasion">Anlass <span class="opt">(optional)</span></label>' +
        '<select id="r-occasion" name="occasion"><option value="">Bitte wählen</option>' +
        occ.map(function (o) { return '<option value="' + o[0] + '">' + esc(o[1]) + '</option>'; }).join('') +
        '</select></div>';
  }

  function htmlMenue() {
    var p = personenGueltig() ? personen() : 0;
    var h = kopf(1, esc(cfg.menues.text_speisenwahl) + '. Die definitive Speisenauswahl treffen wir immer frisch und passend zur Jahreszeit für Dich.');
    h += '<fieldset class="rechner__block"><legend>Menüvariante</legend><div class="rechner__karten">';
    h += karte('radio', 'r-menue', '', state.menue.id === '', '<strong>Kein Menü</strong>', '');
    cfg.menues.varianten.forEach(function (v) {
      h += karte('radio', 'r-menue', v.id, state.menue.id === v.id,
        '<strong>' + esc(v.titel) + '</strong><small>' + esc(v.gangfolgen_text) + '</small>',
        esc(v.preis_text));
    });
    h += '</div></fieldset>';

    var v = findeVariante(state.menue.id);
    if (!v) return h;

    if (v.gangfolgen.length > 1) {
      h += '<fieldset class="rechner__block" data-feld="gangfolge"><legend>Gangfolge</legend><div class="rechner__karten">';
      v.gangfolgen.forEach(function (g) {
        h += karte('radio', 'r-gangfolge', g.id, state.menue.gangfolge === g.id, '<strong>' + esc(g.titel) + '</strong>', '');
      });
      h += '</div></fieldset>';
    }

    var mehr = v.mehr_auswahl, gesperrt = p < mehr.min_personen;
    h += '<fieldset class="rechner__block"><legend>' + esc(mehr.titel) + '</legend><div class="rechner__karten">';
    mehr.optionen.forEach(function (o) {
      h += karte('checkbox', 'r-mehr', o.id, !gesperrt && state.menue.mehr.indexOf(o.id) !== -1,
        '<strong>' + esc(o.titel) + '</strong>' + (gesperrt ? '<small>erst ab ' + mehr.min_personen + ' Personen möglich</small>' : ''),
        '+ ' + euro(o.aufpreis_pp) + ' p. P.', gesperrt);
    });
    h += '</div><p class="rechner__hinweis">' + esc(cfg.menues.text_aufpreise) + '</p></fieldset>';

    var f = findeGangfolge(v, state.menue.gangfolge);
    if (f) {
      var erlaubt = zweiteErlaubt(v, f, mehrWirksam());
      h += '<fieldset class="rechner__block"><legend>Speisenwahl <span class="opt">(optional)</span></legend>';
      f.gaenge.forEach(function (g) {
        var anzahl = erlaubt[g] ? 2 : 1;
        for (var n = 0; n < anzahl; n++) {
          var label = LABEL_GANG[g][n];
          h += '<div class="rechner__feld" data-feld="speise-' + g + '-' + n + '"><label for="r-sp-' + g + '-' + n + '">' + label + '</label>' +
            '<select id="r-sp-' + g + '-' + n + '" data-speise-gang="' + g + '" data-speise-nr="' + n + '">' +
            '<option value="">noch offen</option>' +
            cfg.speisen[g].auswahl.map(function (s) {
              var txt = s.name + (s.detail ? ' ' + s.detail : '') + (s.hinweis ? ' (' + s.hinweis + ')' : '');
              return '<option value="' + s.id + '"' + (state.menue.speisen[g][n] === s.id ? ' selected' : '') + '>' + esc(txt) + '</option>';
            }).join('') + '</select></div>';
        }
      });
      h += '</fieldset>';
    }
    return h;
  }

  var LABEL_GANG = {
    vorspeise:   ['Vorspeise', 'Zweite Vorspeise'],
    hauptspeise: ['Hauptspeise', 'Zweite Hauptspeise'],
    dessert:     ['Dessert', 'Zweites Dessert']
  };

  function karte(typ, name, wert, checked, text, preis, disabled) {
    var id = name + '-' + (wert || 'leer');
    return '<label class="rechner__karte" for="' + id + '">' +
      '<input type="' + typ + '" id="' + id + '" name="' + name + '" value="' + esc(wert) + '"' +
        (checked ? ' checked' : '') + (disabled ? ' disabled' : '') + '>' +
      '<span class="rechner__karte-text">' + text + '</span>' +
      (preis ? '<span class="rechner__karte-preis">' + preis + '</span>' : '') +
      '</label>';
  }

  function htmlSnacks() {
    var h = kopf(2, esc(cfg.stueckartikel.text) + '. Wähle die gewünschten Stückzahlen.');
    cfg.stueckartikel.gruppen.forEach(function (gr) {
      h += '<div class="rechner__gruppe"><div class="rechner__gruppe-kopf"><h4>' + esc(gr.titel) + '</h4><span>' +
        esc(gr.preis_text) + '</span></div>';
      gr.artikel.forEach(function (a) {
        var m = state.stueck[a.id] || 0, id = 'r-st-' + a.id;
        var zusatz = [a.detail, a.hinweis].filter(Boolean).join(' · ');
        h += '<div class="rechner__artikel">' +
          '<div class="rechner__artikel-text"><label for="' + id + '">' + esc(a.name) + '</label>' +
          (zusatz ? '<small>' + esc(zusatz) + '</small>' : '') + '</div>' +
          '<div class="rechner__menge">' +
            '<button type="button" data-stueck-minus="' + a.id + '" aria-label="' + esc(a.name) + ': eins weniger"' + (m <= 0 ? ' disabled' : '') + '>−</button>' +
            '<input type="number" id="' + id + '" inputmode="numeric" min="0" max="' + cfg.stueck_max + '" step="1" value="' + m + '" data-stueck="' + a.id + '"' +
              ' aria-label="' + esc(a.name) + ', Anzahl ' + esc(a.einheit || 'Stück') + '">' +
            '<button type="button" data-stueck-plus="' + a.id + '" aria-label="' + esc(a.name) + ': eins mehr">+</button>' +
          '</div></div>';
      });
      h += '</div>';
    });
    return h;
  }

  function htmlGetraenke() {
    var h = kopf(3, 'Die Pauschalen gelten pro Person für die angegebene Personenzahl.');
    cfg.getraenke.pauschalen.forEach(function (pa) {
      var gew = state.getraenke[pa.id] || '';
      h += '<fieldset class="rechner__paket"><legend class="sr-only">' + esc(pa.titel) + '</legend>' +
        '<h4>' + esc(pa.titel) + '</h4><p>' + pa.zeilen.map(esc).join('<br>') + '</p>' +
        '<div class="rechner__segmente">' +
          segment(pa.id, '', gew === '', 'Nicht gewählt', '');
      cfg.getraenke.dauer.forEach(function (d) {
        h += segment(pa.id, d.id, gew === d.id, d.titel, euro(pa.preise_pp[d.id]) + ' p. P.');
      });
      h += '</div></fieldset>';
    });
    return h;
  }

  function segment(pid, wert, checked, titel, preis) {
    var id = 'r-gt-' + pid + '-' + (wert || 'keine');
    return '<label class="rechner__segment" for="' + id + '"><input type="radio" id="' + id + '" name="r-gt-' + pid +
      '" value="' + wert + '" data-getraenk="' + pid + '"' + (checked ? ' checked' : '') + '>' +
      '<span>' + esc(titel) + (preis ? '<b>' + esc(preis) + '</b>' : '') + '</span></label>';
  }

  function htmlService() {
    var pers = cfg.service.personal;
    return kopf(4, esc(pers.text)) +
      '<div class="rechner__hinweis"><strong>' + esc(pers.preis_text) + '</strong> – abgerechnet nach tatsächlichem Aufwand. ' +
        'Wenn du magst, gib hier eine eigene Schätzung an; sonst bleibt das Servicepersonal außerhalb der Summe und wir stimmen es mit dir ab.</div>' +
      '<div class="rechner__reihe rechner__block">' +
        '<div class="rechner__feld" data-feld="kraefte"><label for="r-kraefte">Servicekräfte <span class="opt">(Schätzung)</span></label>' +
          '<input type="number" id="r-kraefte" inputmode="numeric" min="0" max="' + pers.kraefte_max + '" step="1" value="' +
          (state.service.kraefte || '') + '" placeholder="0" data-service="kraefte"></div>' +
        '<div class="rechner__feld" data-feld="stunden"><label for="r-stunden">Stunden je Kraft <span class="opt">(Schätzung)</span></label>' +
          '<input type="number" id="r-stunden" inputmode="decimal" min="0" max="' + pers.stunden_max + '" step="' + pers.stunden_schritt +
          '" value="' + (state.service.stunden ? String(state.service.stunden) : '') + '" placeholder="0" data-service="stunden"></div>' +
      '</div>' +
      '<p class="rechner__feld-hinweis" id="r-service-zeile"></p>' +
      '<div class="rechner__hinweis"><span class="rechner__anfrage-marke">Preis auf Anfrage</span> ' +
        '<strong>' + esc(cfg.service.spuelpauschale.titel) + '</strong> – ' + esc(cfg.service.spuelpauschale.text) + '</div>';
  }

  function htmlAnfrage() {
    return kopf(5, 'Fast geschafft. Wir melden uns mit einem individuellen Angebot.') +
      '<div class="rechner__reihe">' +
        '<div class="rechner__feld" data-feld="name"><label for="r-name">Name *</label>' +
          '<input type="text" id="r-name" name="name" autocomplete="name" required maxlength="150"></div>' +
        '<div class="rechner__feld" data-feld="email"><label for="r-email">E-Mail *</label>' +
          '<input type="email" id="r-email" name="email" autocomplete="email" required maxlength="190"></div>' +
      '</div>' +
      '<div class="rechner__feld" data-feld="phone"><label for="r-phone">Telefon <span class="opt">(optional)</span></label>' +
        '<input type="tel" id="r-phone" name="phone" autocomplete="tel" maxlength="60"></div>' +
      '<div class="rechner__feld" data-feld="message"><label for="r-message">Nachricht <span class="opt">(optional)</span></label>' +
        '<textarea id="r-message" name="message" rows="4" maxlength="5000" placeholder="z. B. Allergien, Unverträglichkeiten oder besondere Wünsche"></textarea></div>' +
      '<h4 class="rechner__label rechner__block">Deine Auswahl</h4>' +
      '<div id="r-zusammenfassung"></div>' +
      '<p class="rechner__rechtlich">Die berechnete Summe dient als erste Kostenschätzung. Der endgültige Preis kann abhängig von den ' +
        'konkreten Anforderungen und der finalen Abstimmung abweichen. Mit dem Absenden stellst du eine unverbindliche Anfrage – ' +
        'es entsteht keine Bestellung.</p>' +
      '<p class="rechner__rechtlich">Mit dem Absenden werden deine Angaben zur Bearbeitung deiner Anfrage verarbeitet. ' +
        'Näheres in der <a href="datenschutz.html" target="_blank" rel="noopener">Datenschutzerklärung</a>.</p>' +
      '<p class="rechner__status" id="r-status" role="status" aria-live="polite" hidden></p>';
  }

  /* Tabelle der Positionen — für Zusammenfassung und Aufklappbereich */
  function htmlTabelle(calc) {
    if (!calc.positionen.length) return '<p class="rechner__leer">Noch keine Leistung ausgewählt.</p>';
    var rows = calc.positionen.map(function (x) {
      var vor = x.ab ? 'ab ' : '';
      return '<tr><td>' + esc(x.titel) + '<small>' + esc(zahl(x.menge)) + ' ' + esc(x.einheit) + ' × ' + vor + esc(euro(x.einzel)) +
        '</small></td><td>' + vor + esc(euro(x.summe)) + '</td></tr>';
    }).join('');
    var hinw = calc.hinweise.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
    return '<table class="rechner__tabelle"><tbody>' + rows + '</tbody>' +
      '<tfoot><tr><td>Voraussichtliche Kostenschätzung</td><td>' + (calc.ab ? 'ab ' : '') + esc(euro(calc.summe)) + '</td></tr></tfoot></table>' +
      '<p class="rechner__feld-hinweis">' + esc(cfg.mwst_hinweis) + (calc.ab ? ' Menüpreise sind Ab-Preise pro Person.' : '') + '</p>' +
      '<div class="rechner__hinweis rechner__hinweis--liste"><strong>Hinweise &amp; Preise auf Anfrage:</strong><ul>' + hinw + '</ul></div>';
  }

  /* ---------- Aufbau und Schrittwechsel ---------- */

  var RENDER = [htmlAnlass, htmlMenue, htmlSnacks, htmlGetraenke, htmlService, htmlAnfrage];

  function aufbauen() {
    // Jeder Schritt bekommt einen festen Container; Felder mit name-Attribut
    // bleiben dadurch beim Wechseln erhalten (wichtig für das Absenden).
    inhalt.innerHTML = SCHRITTE.map(function (s, i) {
      return '<section class="rechner__schritt" data-schritt="' + i + '"' + (i ? ' hidden' : '') + '></section>';
    }).join('');
    // Statische Schritte (Anlass, Anfrage) nur einmal zeichnen, damit Eingaben erhalten bleiben
    schrittEl(0).innerHTML = htmlAnlass();
    schrittEl(5).innerHTML = htmlAnfrage();
    [1, 2, 3, 4].forEach(neuZeichnen);
  }

  function schrittEl(i) { return inhalt.querySelector('.rechner__schritt[data-schritt="' + i + '"]'); }
  function neuZeichnen(i) { if (i >= 1 && i <= 4) schrittEl(i).innerHTML = RENDER[i](); }

  function zeigeSchritt(i, fokus) {
    state.schritt = i;
    state.maxErreicht = Math.max(state.maxErreicht, i);
    for (var k = 0; k < SCHRITTE.length; k++) schrittEl(k).hidden = k !== i;
    if (i === 1) neuZeichnen(1); // Personenzahl kann sich geändert haben (Mehr Auswahl ab 20)
    renderSchrittleiste();
    btnZurueck.disabled = i === 0;
    btnWeiter.hidden = i === SCHRITTE.length - 1 || gesendet;
    btnSenden.hidden = i !== SCHRITTE.length - 1 || gesendet;
    inhalt.scrollTop = 0;
    aktualisieren();
    if (fokus !== false) {
      var t = schrittEl(i).querySelector('[data-schritt-titel]');
      if (t) t.focus({ preventScroll: true });
    }
  }

  /* ---------- Fehleranzeige ---------- */

  function fehlerLoeschen(scope) {
    (scope || inhalt).querySelectorAll('.rechner__fehler').forEach(function (e) { e.remove(); });
    (scope || inhalt).querySelectorAll('.rechner__feld--fehler').forEach(function (e) { e.classList.remove('rechner__feld--fehler'); });
    (scope || inhalt).querySelectorAll('[aria-invalid]').forEach(function (e) {
      e.removeAttribute('aria-invalid');
      if (e.hasAttribute('data-describedby-orig')) {
        var o = e.getAttribute('data-describedby-orig');
        if (o) e.setAttribute('aria-describedby', o); else e.removeAttribute('aria-describedby');
        e.removeAttribute('data-describedby-orig');
      }
    });
  }
  function fehlerAn(feldName, text) {
    var box = inhalt.querySelector('[data-feld="' + feldName + '"]');
    if (!box) return null;
    box.classList.add('rechner__feld--fehler');
    var hint = document.createElement('span');
    hint.className = 'rechner__fehler';
    hint.id = 'fehler-' + feldName;
    hint.textContent = text;
    box.appendChild(hint);
    var input = box.querySelector('input, select, textarea');
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      if (!input.hasAttribute('data-describedby-orig')) input.setAttribute('data-describedby-orig', input.getAttribute('aria-describedby') || '');
      input.setAttribute('aria-describedby', (input.getAttribute('data-describedby-orig') + ' ' + hint.id).trim());
    }
    return input;
  }

  function pruefeSchritt(i) {
    fehlerLoeschen(schrittEl(i));
    if (i === 0 && !personenGueltig()) {
      var el = fehlerAn('guests', cfg.personen.text);
      if (el) el.focus();
      return false;
    }
    if (i === 1 && state.menue.id) {
      var v = findeVariante(state.menue.id);
      if (!findeGangfolge(v, state.menue.gangfolge)) {
        var box = fehlerAn('gangfolge', 'Bitte wähle die Gangfolge des Menüs.');
        if (box) box.focus();
        return false;
      }
      var erl = zweiteErlaubt(v, findeGangfolge(v, state.menue.gangfolge), mehrWirksam());
      var doppelt = ['vorspeise', 'hauptspeise', 'dessert'].filter(function (g) {
        var s = state.menue.speisen[g]; return erl[g] && s[0] && s[0] === s[1];
      });
      if (doppelt.length) {
        var e2 = fehlerAn('speise-' + doppelt[0] + '-1', 'Bitte eine andere Speise als oben wählen.');
        if (e2) e2.focus();
        return false;
      }
    }
    return true;
  }

  /* ---------- Laufende Summe ---------- */

  var liveTimer = null;
  function aktualisieren() {
    if (!cfg) return;
    var calc = aktuelleBerechnung();
    var text = (calc.ab ? 'ab ' : '') + euro(calc.summe);
    summeEl.textContent = text;
    summeHinweisEl.textContent = 'netto, zzgl. gesetzl. MwSt. · unverbindlich' + (calc.ab ? ' · Menü ab-Preis' : '');
    aufschl.innerHTML = htmlTabelle(calc);
    var zus = document.getElementById('r-zusammenfassung');
    if (zus) zus.innerHTML = htmlTabelle(calc);
    var sz = document.getElementById('r-service-zeile');
    if (sz) {
      var kr = state.service.kraefte, st = state.service.stunden;
      sz.textContent = kr > 0 && st > 0
        ? kr + ' × ' + zahl(st) + ' Std. × ' + euro(cfg.service.personal.preis_pro_stunde) + ' = ' +
          euro(Math.floor(cfg.service.personal.preis_pro_stunde * kr * Math.round(st * 2) / 2))
        : 'Ohne Schätzung: nicht in der Summe enthalten.';
    }
    clearTimeout(liveTimer);
    liveTimer = setTimeout(function () { liveEl.textContent = 'Voraussichtliche Kostenschätzung: ' + text; }, 700);
    return calc;
  }

  /* ---------- Eingaben ---------- */

  function setzeMenge(id, wert) {
    var n = parseInt(wert, 10);
    if (isNaN(n) || n < 0) n = 0;
    if (n > cfg.stueck_max) n = cfg.stueck_max;
    state.stueck[id] = n;
    var input = inhalt.querySelector('[data-stueck="' + id + '"]');
    if (input && String(input.value) !== String(n)) input.value = n;
    var minus = inhalt.querySelector('[data-stueck-minus="' + id + '"]');
    if (minus) minus.disabled = n <= 0;
  }

  inhalt.addEventListener('click', function (e) {
    var plus = e.target.closest('[data-stueck-plus]');
    var minus = e.target.closest('[data-stueck-minus]');
    if (plus)  { setzeMenge(plus.dataset.stueckPlus, (state.stueck[plus.dataset.stueckPlus] || 0) + 1); aktualisieren(); }
    if (minus) { setzeMenge(minus.dataset.stueckMinus, (state.stueck[minus.dataset.stueckMinus] || 0) - 1); aktualisieren(); }
  });

  inhalt.addEventListener('input', function (e) {
    var t = e.target;
    if (t.dataset.stueck) {
      // Beim Tippen nur gültige Werte übernehmen, das Feld erst beim Verlassen bereinigen
      var n = parseInt(t.value, 10);
      state.stueck[t.dataset.stueck] = isNaN(n) || n < 0 ? 0 : Math.min(n, cfg.stueck_max);
      var mi = inhalt.querySelector('[data-stueck-minus="' + t.dataset.stueck + '"]');
      if (mi) mi.disabled = state.stueck[t.dataset.stueck] <= 0;
    }
    if (t.dataset.service) {
      var max = t.dataset.service === 'kraefte' ? cfg.service.personal.kraefte_max : cfg.service.personal.stunden_max;
      var v = parseFloat(String(t.value).replace(',', '.'));
      if (isNaN(v) || v < 0) v = 0;
      if (v > max) v = max;
      if (t.dataset.service === 'kraefte') v = Math.floor(v);
      else v = Math.round(v * 2) / 2; // halbe Stunden
      state.service[t.dataset.service] = v;
    }
    // Die Fehlermeldung eines Feldes verschwindet, sobald dort korrigiert wird
    var feld = t.closest('.rechner__feld--fehler');
    if (feld) { fehlerLoeschen(feld); feld.classList.remove('rechner__feld--fehler'); }
    aktualisieren();
  });

  inhalt.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.stueck) setzeMenge(t.dataset.stueck, t.value);
    if (t.dataset.service) t.value = state.service[t.dataset.service] ? String(state.service[t.dataset.service]) : '';
    if (t.name === 'r-menue') {
      state.menue.id = t.value;
      var v = findeVariante(t.value);
      state.menue.gangfolge = v && v.gangfolgen.length === 1 ? v.gangfolgen[0].id : '';
      state.menue.mehr = [];
      state.menue.speisen = { vorspeise: ['', ''], hauptspeise: ['', ''], dessert: ['', ''] };
      neuZeichnen(1);
      var fokusEl = inhalt.querySelector('#' + CSS.escape(t.id));
      if (fokusEl) fokusEl.focus();
    }
    if (t.name === 'r-gangfolge') {
      state.menue.gangfolge = t.value;
      state.menue.speisen = { vorspeise: ['', ''], hauptspeise: ['', ''], dessert: ['', ''] };
      neuZeichnen(1);
      var f2 = inhalt.querySelector('#' + CSS.escape(t.id)); if (f2) f2.focus();
    }
    if (t.name === 'r-mehr') {
      var i = state.menue.mehr.indexOf(t.value);
      if (t.checked && i === -1) state.menue.mehr.push(t.value);
      if (!t.checked && i !== -1) state.menue.mehr.splice(i, 1);
      if (!t.checked) {
        // Zweite Speise des Gangs verwerfen, wenn die Option wegfällt
        var v3 = findeVariante(state.menue.id), f3 = findeGangfolge(v3, state.menue.gangfolge);
        var erlaubt = zweiteErlaubt(v3, f3, mehrWirksam());
        ['vorspeise', 'hauptspeise', 'dessert'].forEach(function (g) { if (!erlaubt[g]) state.menue.speisen[g][1] = ''; });
      }
      neuZeichnen(1);
      var f4 = inhalt.querySelector('#' + CSS.escape(t.id)); if (f4) f4.focus();
    }
    if (t.dataset.speiseGang) {
      state.menue.speisen[t.dataset.speiseGang][parseInt(t.dataset.speiseNr, 10)] = t.value;
      fehlerLoeschen(schrittEl(1));
    }
    if (t.dataset.getraenk !== undefined && t.type === 'radio') {
      state.getraenke[t.dataset.getraenk] = t.value;
    }
    aktualisieren();
  });

  /* ---------- Navigation ---------- */

  btnWeiter.addEventListener('click', function () {
    if (!pruefeSchritt(state.schritt)) return;
    zeigeSchritt(Math.min(state.schritt + 1, SCHRITTE.length - 1));
  });
  btnZurueck.addEventListener('click', function () {
    if (gesendet) { schliessen(); return; }
    if (state.schritt > 0) zeigeSchritt(state.schritt - 1);
  });
  schritteOl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-geh-zu]');
    if (!b || gesendet) return;
    var ziel = parseInt(b.dataset.gehZu, 10);
    if (ziel === state.schritt) return;
    // Ohne gültige Personenzahl lassen sich die Pro-Person-Preise nicht rechnen
    if (ziel > 0 && !personenGueltig()) { zeigeSchritt(0, false); pruefeSchritt(0); return; }
    if (ziel > state.schritt && !pruefeSchritt(state.schritt)) return;
    zeigeSchritt(ziel);
  });

  aufklapp.addEventListener('click', function () {
    var offen = aufklapp.getAttribute('aria-expanded') === 'true';
    aufklapp.setAttribute('aria-expanded', String(!offen));
    aufschl.hidden = offen;
  });

  /* ---------- Öffnen / Schließen ---------- */

  function laden() {
    if (!ladeVersprechen) {
      ladeVersprechen = fetch(CONFIG_URL, { headers: { 'Accept': 'application/json' } })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (json) { cfg = json; aufbauen(); zeigeSchritt(0, dialog.open); })
        .catch(function () {
          ladeVersprechen = null;
          inhalt.innerHTML = '<p class="rechner__status rechner__status--error">Die Preise konnten gerade nicht geladen werden. ' +
            'Bitte versuche es gleich noch einmal oder schreib uns über das <a href="kontakt.html">Kontaktformular</a>.</p>';
        });
    }
    return ladeVersprechen;
  }

  function oeffnen() {
    if (!form.elements.form_started.value) form.elements.form_started.value = String(Date.now());
    document.documentElement.classList.add('rechner-offen');
    if (!dialog.open) dialog.showModal();
    if (cfg) {
      var t = schrittEl(state.schritt).querySelector('[data-schritt-titel]');
      if (t) t.focus({ preventScroll: true });
    } else {
      inhalt.focus({ preventScroll: true });
      laden();
    }
  }
  function schliessen() { if (dialog.open) dialog.close(); }

  openBtn.addEventListener('click', oeffnen);
  dialog.querySelectorAll('[data-rechner-zu]').forEach(function (b) { b.addEventListener('click', schliessen); });
  dialog.addEventListener('click', function (e) { if (e.target === dialog) schliessen(); });
  dialog.addEventListener('close', function () {
    document.documentElement.classList.remove('rechner-offen');
    if (location.hash === '#rechner') history.replaceState(null, '', location.pathname + location.search);
    openBtn.focus({ preventScroll: true });
  });

  // Direktaufruf mit #rechner öffnet den Rechner sofort
  if (location.hash === '#rechner') oeffnen();
  window.addEventListener('hashchange', function () { if (location.hash === '#rechner') oeffnen(); });

  /* ---------- Absenden ---------- */

  function statusSetzen(text, art) {
    var s = document.getElementById('r-status');
    if (!s) return;
    s.textContent = text;
    s.className = 'rechner__status rechner__status--' + art;
    s.hidden = false;
  }

  var FELD_SCHRITT = { guests: 0, date: 0, time: 0, occasion: 0, name: 5, email: 5, phone: 5, message: 5 };

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!cfg || gesendet) return;
    fehlerLoeschen();

    if (!personenGueltig()) { zeigeSchritt(0, false); pruefeSchritt(0); return; }
    var calc = aktualisieren();
    if (!calc.positionen.length) {
      statusSetzen('Bitte wähle mindestens eine Leistung aus – oder schreib uns über das Kontaktformular.', 'error');
      return;
    }
    var erster = null;
    if (!feldWert('name')) erster = erster || fehlerAn('name', 'Bitte ausfüllen.');
    var mail = feldWert('email');
    if (!mail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) erster = erster || fehlerAn('email', 'Bitte eine gültige E-Mail-Adresse angeben.');
    if (erster) { erster.focus(); statusSetzen('Bitte prüfe die markierten Felder.', 'error'); return; }

    form.elements.auswahl.value = JSON.stringify(auswahlObjekt());
    form.elements.summe_anzeige.value = String(calc.summe);

    btnSenden.disabled = true;
    btnSenden.textContent = 'Wird gesendet …';
    statusSetzen('Deine Anfrage wird gesendet …', 'pending');

    fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' }
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.success) {
          gesendet = true;
          var kopie = htmlTabelle(calc);
          schrittEl(5).innerHTML = '<div class="rechner__danke"><h3 tabindex="-1" data-schritt-titel>Vielen Dank!</h3><p>' +
            esc(res.message) + '</p></div><h4 class="rechner__label">Deine Auswahl</h4>' + kopie;
          btnSenden.hidden = true;
          btnWeiter.hidden = true;
          btnZurueck.textContent = 'Zurück zur Broschüre';
          btnZurueck.disabled = false;
          var d = schrittEl(5).querySelector('[data-schritt-titel]'); if (d) d.focus();
          return;
        }
        var errs = res.errors || {};
        var felder = Object.keys(errs);
        if (felder.length) {
          var ziel = FELD_SCHRITT.hasOwnProperty(felder[0]) ? FELD_SCHRITT[felder[0]] : 5;
          if (ziel !== state.schritt) zeigeSchritt(ziel, false);
          var fokus = null;
          felder.forEach(function (f) { var el = fehlerAn(f, errs[f]); fokus = fokus || el; });
          if (fokus) fokus.focus();
        }
        if (state.schritt !== 5 && !felder.length) zeigeSchritt(5, false);
        statusSetzen(res.message || 'Bitte prüfe deine Eingaben.', 'error');
        btnSenden.disabled = false;
        btnSenden.textContent = 'Catering unverbindlich anfragen';
      })
      .catch(function () {
        statusSetzen('Verbindung fehlgeschlagen. Bitte versuche es erneut oder schreib uns an kontakt@tjorven-bistro.de.', 'error');
        btnSenden.disabled = false;
        btnSenden.textContent = 'Catering unverbindlich anfragen';
      });
  });

  // Für automatisierte Tests: reine Rechenfunktion ohne Oberfläche
  window.__tjCateringRechner = { berechne: function (c, a, p) { var alt = cfg; cfg = c; try { return berechne(a, p); } finally { cfg = alt; } } };
})();
