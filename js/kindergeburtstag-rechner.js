/* ============================================================
   TJORVEN BISTRO — Kindergeburtstag im Tjorven Bistro planen
   Definition für den Rechner-Kern (js/rechner-kern.js).

   Grundlage ist data/kindergeburtstag-preise.json, die auch der
   Server liest (inc/kindergeburtstag-preise.php): die beiden
   Kindergeburtstags-Menüs aus der PDF „Kindergeburtstag im Bistro
   Tjorven“ und Speisen & Getränke à la carte aus der aktuellen
   Speisekarte. Die Rechenfunktion unten ist ein Spiegel von
   tj_kg_calculate; maßgeblich ist immer die Berechnung auf dem Server.
   ============================================================ */

(function () {
  'use strict';
  if (!window.TjRechner) return;
  var euro = TjRechner.euro, esc = TjRechner.esc;
  var TAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

  var state = { modus: '', menues: {}, artikel: {}, kuchen: false };

  function pflicht() { return '<span class="pflicht" aria-hidden="true">*</span><span class="sr-only"> (Pflichtfeld)</span>'; }

  function kinder(api) {
    var cfg = api.cfg(), roh = api.feldWert('guests');
    if (!/^\d+$/.test(roh)) return 0;
    var n = parseInt(roh, 10);
    return n >= cfg.kinder.min && n <= cfg.kinder.max ? n : 0;
  }

  // ISO-Wochentag (1 = Montag … 7 = Sonntag) eines Datums JJJJ-MM-TT, sonst 0 – wie tj_kg_wochentag
  function wochentag(datum) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datum || '');
    if (!m) return 0;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return 0;
    return d.getDay() || 7;
  }

  function alleArtikel(cfg) {
    var l = [];
    cfg.a_la_carte.schritte.forEach(function (s) { s.artikel.forEach(function (a) { l.push(a); }); });
    return l;
  }
  function findeArtikel(cfg, id) {
    var t = null; alleArtikel(cfg).forEach(function (a) { if (a.id === id) t = a; }); return t;
  }
  function artikelTitel(a) { return a.name + (a.menge_text ? ' (' + a.menge_text + ')' : ''); }

  /* ---------- Berechnung (Spiegel von tj_kg_calculate) ---------- */

  function berechne(cfg, auswahl, k, datum) {
    var positionen = [], hinweise = [];
    cfg.menues.auswahl.forEach(function (m) {
      var n = auswahl.menues[m.id] || 0;
      if (!n) return;
      positionen.push({ gruppe: 'Kindergeburtstags-Menüs', titel: m.titel + ' (' + m.inhalt.join(', ') + ')', menge: n, einheit: '×',
                        einzel: m.preis, summe: m.preis * n, ab: false, schritt: 'menues' });
    });
    var alc = cfg.a_la_carte, artikel = auswahl.modus === 'vorab' ? (auswahl.artikel || {}) : {}, gewaehlt = false;
    alc.schritte.forEach(function (s) {
      s.artikel.forEach(function (a) {
        var n = artikel[a.id] || 0;
        if (!n) return;
        gewaehlt = true;
        positionen.push(a.preis === null
          ? { gruppe: s.kategorie, titel: artikelTitel(a), menge: n, einheit: '×', einzel: null, summe: 0, preis_text: a.preis_text, ab: false, schritt: s.id }
          : { gruppe: s.kategorie, titel: artikelTitel(a), menge: n, einheit: '×', einzel: a.preis, summe: a.preis * n, ab: false, schritt: s.id });
        // Lasagne: Samstag & Sonntag laut Karte; an anderen Tagen nicht sperren, sondern prüfen
        if (a.verfuegbarkeit === 'wochenende') {
          var regel = alc.verfuegbarkeit.wochenende, tag = wochentag(datum);
          hinweise.push(regel.iso_tage.indexOf(tag) !== -1
            ? a.name + ': Wunschtermin ist ein ' + (tag === 6 ? 'Samstag' : 'Sonntag') + ' – laut Speisekarte im Angebot.'
            : a.name + ': ' + regel.text_pruefen);
        }
      });
    });
    if (auswahl.modus === 'spontan') {
      hinweise.unshift('Speisen & Getränke: spontan vor Ort nach unserer Speisekarte – nicht in der Kostenschätzung enthalten.');
    } else if (gewaehlt) {
      hinweise.unshift('Vorauswahl à la carte: ' + alc.vorab_hinweis);
    }
    if (auswahl.kuchen) hinweise.push('Geburtstagskuchen wird mitgebracht (Kuchen darf mitgebracht werden).');
    var summe = 0;
    positionen.forEach(function (x) { summe += x.summe; });
    return { positionen: positionen, hinweise: hinweise, summe: summe, ab: false };
  }

  // Auswahl in der Form, die an den Server geht: spontan = keine Vorauswahl à la carte
  function auswahl(api) {
    var cfg = api.cfg(), a = { modus: state.modus, menues: {}, artikel: {}, kuchen: !!state.kuchen };
    cfg.menues.auswahl.forEach(function (m) { if (state.menues[m.id]) a.menues[m.id] = state.menues[m.id]; });
    if (state.modus === 'vorab') {
      alleArtikel(cfg).forEach(function (x) { if (state.artikel[x.id]) a.artikel[x.id] = state.artikel[x.id]; });
    }
    return a;
  }

  /* ---------- Mengenwahl ---------- */

  // „✓ 2 × 12,50 € = 25,00 €“ unter einem gewählten Artikel
  function rechnung(preis, n, preisText) {
    if (!n) return '';
    return '<span aria-hidden="true">✓ </span>' + n + ' × ' +
      (preis === null ? esc(preisText) + ' – nicht in der Summe' : euro(preis) + ' = ' + euro(preis * n));
  }

  // Preiszeile eines Artikels: „0,33 l · 3,50 €“, gewählt „0,33 l · ✓ 4 × 3,50 € = 14,00 €“ –
  // die Rechnung steht in derselben Zeile, damit die Karte beim Auswählen nicht höher wird
  function artikelMeta(a, n) {
    var t = [];
    if (a.menge_text) t.push(esc(a.menge_text));
    if (n) t.push(rechnung(a.preis, n, a.preis_text));
    else t.push(a.preis === null ? esc(a.preis_text) : (a.zusatz_zu ? '+ ' : '') + euro(a.preis));
    if (a.hinweis && !n) t.push(esc(a.hinweis));
    return t.join(' · ');
  }

  // Kompakter Zähler [−] 2 [+]; art = 'menue' oder 'art'
  function stepper(art, id, n, max, name) {
    var d = 'data-kg-' + art;
    return '<div class="rechner__menge" role="group" aria-labelledby="r-' + art + '-' + id + '-t">' +
      '<button type="button" ' + d + '-minus="' + id + '" aria-label="' + esc(name) + ': eins weniger"' + (n <= 0 ? ' disabled' : '') + '>−</button>' +
      '<input type="number" id="r-' + art + '-' + id + '" ' + d + '="' + id + '" inputmode="numeric" min="0" max="' + max +
        '" step="1" value="' + n + '" aria-label="Anzahl ' + esc(name) + '" aria-describedby="r-' + art + '-' + id + '-z">' +
      '<button type="button" ' + d + '-plus="' + id + '" aria-label="' + esc(name) + ': eins mehr"' + (n >= max ? ' disabled' : '') + '>+</button>' +
    '</div>';
  }

  function setzeMenge(api, art, id, n) {
    var cfg = api.cfg(), max = art === 'menue' ? cfg.menues.max_je_menue : cfg.a_la_carte.max_je_artikel;
    var ziel = art === 'menue' ? state.menues : state.artikel;
    n = parseInt(n, 10);
    if (isNaN(n) || n < 0) n = 0;
    if (n > max) n = max;
    ziel[id] = n;
    var input = api.el('[data-kg-' + art + '="' + id + '"]');
    if (input && document.activeElement !== input) input.value = n;
    var minus = api.el('[data-kg-' + art + '-minus="' + id + '"]'); if (minus) minus.disabled = n <= 0;
    var plus = api.el('[data-kg-' + art + '-plus="' + id + '"]'); if (plus) plus.disabled = n >= max;
  }

  // Lasagne: Samstag & Sonntag laut Karte; sonst nicht sperren, sondern mit der Anfrage prüfen
  function verfuegbarkeit(api, a) {
    if (a.verfuegbarkeit !== 'wochenende') return '';
    var regel = api.cfg().a_la_carte.verfuegbarkeit.wochenende, tag = wochentag(api.feldWert('date'));
    return regel.iso_tage.indexOf(tag) !== -1
      ? '<p class="rechner__verfuegbar rechner__verfuegbar--ja">Dein Wunschtermin ist ein ' + TAGE[tag % 7] + ' – samstags &amp; sonntags gibt es die Lasagne.</p>'
      : '<p class="rechner__verfuegbar">' + esc(regel.text_pruefen) + '</p>';
  }

  /* ---------- Schritte ---------- */

  var schritteAnfang = [
    {
      id: 'gruppe', titel: 'Kinder & Termin', statisch: true,
      html: function (api) {
        var cfg = api.cfg();
        return '<p class="rechner__intro">Das Tjorven Bistro als Dein fester Treffpunkt während des Geburtstags.</p>' +
          '<div class="rechner__reihe">' +
            '<div class="rechner__feld" data-feld="guests"><label for="r-guests">Anzahl Kinder ' + pflicht() + '</label>' +
              '<input type="number" id="r-guests" name="guests" inputmode="numeric" min="' + cfg.kinder.min + '" max="' + cfg.kinder.max +
              '" step="1" placeholder="z. B. 8" required></div>' +
            '<div class="rechner__feld" data-feld="begleitung"><label for="r-begleitung">Begleitpersonen ' + pflicht() + '</label>' +
              '<input type="number" id="r-begleitung" name="begleitung" inputmode="numeric" min="0" max="' + cfg.begleitpersonen.max +
              '" step="1" placeholder="z. B. 2" required aria-describedby="r-begleitung-hinweis">' +
              '<span class="rechner__feld-hinweis" id="r-begleitung-hinweis">Auch 0 ist möglich.</span></div>' +
          '</div>' +
          '<div class="rechner__reihe">' +
            '<div class="rechner__feld" data-feld="date"><label for="r-date">Datum ' + pflicht() + '</label>' +
              '<input type="date" id="r-date" name="date" required></div>' +
            '<div class="rechner__feld" data-feld="time"><label for="r-time">Uhrzeit <span class="opt">(optional)</span></label>' +
              '<input type="time" id="r-time" name="time"></div>' +
          '</div>' +
          '<div class="rechner__hinweis">' + esc(cfg.texte.tischbereich) + '</div>';
      },
      pruefe: function (api) {
        var cfg = api.cfg();
        if (!kinder(api)) return { feld: 'guests', text: 'Bitte gib eine Kinderzahl zwischen ' + cfg.kinder.min + ' und ' + cfg.kinder.max + ' an.' };
        var b = api.feldWert('begleitung');
        if (b === '') return { feld: 'begleitung', text: 'Bitte gib die Anzahl der Begleitpersonen an – auch 0 ist möglich.' };
        if (!/^\d+$/.test(b) || parseInt(b, 10) > cfg.begleitpersonen.max) {
          return { feld: 'begleitung', text: 'Bitte eine ganze Zahl zwischen 0 und ' + cfg.begleitpersonen.max + ' angeben.' };
        }
        var d = api.feldWert('date');
        if (!d) return { feld: 'date', text: 'Bitte ein Datum angeben.' };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { feld: 'date', text: 'Bitte ein gültiges Datum angeben.' };
        if (d < api.heute()) return { feld: 'date', text: 'Bitte ein Datum ab heute angeben.' };
        return null;
      }
    },
    {
      id: 'planung', titel: 'Speisen & Getränke',
      html: function (api) {
        var pl = api.cfg().planung;
        var h = '<fieldset data-feld="modus"><legend class="rechner__frage">' + esc(pl.frage) + '</legend><div class="rechner__karten">';
        pl.optionen.forEach(function (o) {
          var id = 'r-modus-' + o.id;
          h += '<label class="rechner__karte rechner__karte--gross" for="' + id + '"><input type="radio" id="' + id + '" name="r-modus" value="' + o.id + '"' +
            (state.modus === o.id ? ' checked' : '') + '><span class="rechner__karte-text"><strong>' + esc(o.titel) + '</strong><small>' + esc(o.text) + '</small></span></label>';
        });
        return h + '</div></fieldset>';
      },
      pruefe: function () {
        return state.modus ? null : { feld: 'modus', text: 'Bitte wähle, wie ihr Speisen & Getränke planen möchtet.' };
      }
    },
    {
      id: 'menues', titel: 'Kindergeburtstags-Menüs',
      html: function (api) {
        var cfg = api.cfg(), k = kinder(api);
        var h = '<p class="rechner__intro">Kindergeburtstags-Menüs auf Wunsch – gerne auch gemischt oder ganz ohne Menü.</p>';
        cfg.menues.auswahl.forEach(function (m) {
          var n = state.menues[m.id] || 0, id = 'r-menue-' + m.id;
          h += '<div class="rechner__menue' + (n ? ' rechner__menue--aktiv' : '') + '" data-feld="menue-' + m.id + '">' +
            '<div class="rechner__menue-kopf"><strong id="' + id + '-t">' + esc(m.titel) + '</strong><span class="rechner__karte-preis">' + esc(m.preis_text) + '</span></div>' +
            '<p class="rechner__menue-inhalt">' + m.inhalt.map(esc).join(' · ') + '</p>' +
            '<div class="rechner__menue-steuerung">' + stepper('menue', m.id, n, cfg.menues.max_je_menue, m.titel) +
              '<button type="button" class="rechner__alle" data-kg-alle="' + m.id + '">Für alle ' + k + ' Kinder</button>' +
            '</div>' +
            '<p class="rechner__karte-rechnung" id="' + id + '-z" data-kg-zeile="menue-' + m.id + '">' + rechnung(m.preis, n) + '</p>' +
          '</div>';
        });
        return h + '<p class="rechner__feld-hinweis" data-kg-gesamt></p>';
      }
    }
  ];

  // Speisekarte: je Kategorie-Abschnitt ein kurzer Schritt, nur bei „Vorab auswählen / vormerken“
  function artikelSchritt(s) {
    return {
      id: s.id, titel: s.titel,
      sichtbar: function () { return state.modus === 'vorab'; },
      html: function (api) {
        var cfg = api.cfg(), max = cfg.a_la_carte.max_je_artikel;
        var h = s.intro ? '<p class="rechner__intro">' + esc(s.intro) + '</p>' : '';
        h += '<div class="rechner__artikel-liste">';
        s.artikel.forEach(function (a) {
          var n = state.artikel[a.id] || 0, id = 'r-art-' + a.id;
          h += '<div class="rechner__artikel' + (n ? ' rechner__artikel--aktiv' : '') + '" data-feld="artikel-' + a.id + '">' +
            '<div class="rechner__artikel-kopf">' +
              '<p class="rechner__artikel-text"><strong id="' + id + '-t">' + esc(a.name) + '</strong>' +
                '<span class="rechner__artikel-preis" id="' + id + '-z" data-kg-zeile="art-' + a.id + '">' + artikelMeta(a, n) + '</span></p>' +
              stepper('art', a.id, n, max, artikelTitel(a)) +
            '</div>' +
            (a.beschreibung ? '<p class="rechner__artikel-beschreibung">' + esc(a.beschreibung) + '</p>' : '') +
            verfuegbarkeit(api, a) +
          '</div>';
        });
        return h + '</div>';
      },
      pruefe: function (api) {
        // Aufpreis-Toppings nur zu ihrem Artikel (Waffel) – wie auf dem Server
        for (var i = 0; i < s.artikel.length; i++) {
          var a = s.artikel[i];
          if (a.zusatz_zu && state.artikel[a.id] && !state.artikel[a.zusatz_zu]) {
            return { feld: 'artikel-' + a.zusatz_zu, text: 'Die Toppings gibt es zu: ' + findeArtikel(api.cfg(), a.zusatz_zu).name +
              ' – bitte hier eine Anzahl angeben oder die Toppings auf 0 setzen.' };
          }
        }
        return null;
      }
    };
  }

  var schritteEnde = [
    {
      id: 'kuchen', titel: 'Geburtstagskuchen',
      html: function (api) {
        var cfg = api.cfg();
        return '<p class="rechner__intro">' + esc(cfg.texte.treffpunkt) + '</p>' +
          '<div class="rechner__karten">' +
          '<label class="rechner__karte" for="r-kuchen"><input type="checkbox" id="r-kuchen" data-kuchen' + (state.kuchen ? ' checked' : '') + '>' +
          '<span class="rechner__karte-text"><strong>' + esc(cfg.kuchen.auswahl_text) + '</strong><small>' + esc(cfg.kuchen.text) + '</small></span></label></div>';
      }
    },
    {
      id: 'kontakt', titel: 'Deine Kontaktdaten', statisch: true,
      html: function () {
        return '<div class="rechner__feld" data-feld="name"><label for="r-name">Name ' + pflicht() + '</label>' +
            '<input type="text" id="r-name" name="name" autocomplete="name" required maxlength="150"></div>' +
          '<div class="rechner__feld" data-feld="email"><label for="r-email">E-Mail ' + pflicht() + '</label>' +
            '<input type="email" id="r-email" name="email" autocomplete="email" required maxlength="190"></div>' +
          '<div class="rechner__feld" data-feld="phone"><label for="r-phone">Telefon <span class="opt">(optional)</span></label>' +
            '<input type="tel" id="r-phone" name="phone" autocomplete="tel" maxlength="60"></div>' +
          '<div class="rechner__feld" data-feld="message"><label for="r-message">Nachricht <span class="opt">(optional)</span></label>' +
            '<textarea id="r-message" name="message" rows="2" maxlength="5000" placeholder="z. B. Name und Alter des Geburtstagskindes, Allergien, Wünsche"></textarea></div>';
      },
      pruefe: function (api) {
        if (!api.feldWert('name')) return { feld: 'name', text: 'Bitte ausfüllen.' };
        var m = api.feldWert('email');
        if (!m || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m)) return { feld: 'email', text: 'Bitte eine gültige E-Mail-Adresse angeben.' };
        return null;
      }
    },
    {
      id: 'anfrage', titel: 'Zusammenfassung & Anfrage', statisch: true,
      html: function () {
        return '<p class="rechner__eckdaten" id="r-gruppe-info"></p><div id="r-zusammenfassung"></div>' +
          TjRechner.unverbindlichHtml() +
          '<p class="rechner__rechtlich">Die berechnete Summe dient als erste Kostenschätzung. Der endgültige Preis kann abhängig von den ' +
            'konkreten Anforderungen und der finalen Abstimmung abweichen.</p>' +
          '<p class="rechner__rechtlich">Mit dem Absenden werden deine Angaben zur Bearbeitung deiner Anfrage verarbeitet. ' +
            'Näheres in der <a href="datenschutz.html" target="_blank" rel="noopener">Datenschutzerklärung</a>.</p>' +
          '<p class="rechner__status" id="r-status" role="status" aria-live="polite" hidden></p>';
      }
    }
  ];

  /* ---------- Eingaben ---------- */

  var ereignisse = {
    click: function (e, api) {
      var b = e.target.closest('[data-kg-menue-plus], [data-kg-menue-minus], [data-kg-art-plus], [data-kg-art-minus], [data-kg-alle]');
      if (!b) return;
      var d = b.dataset;
      if (d.kgMenuePlus)  setzeMenge(api, 'menue', d.kgMenuePlus, (state.menues[d.kgMenuePlus] || 0) + 1);
      if (d.kgMenueMinus) setzeMenge(api, 'menue', d.kgMenueMinus, (state.menues[d.kgMenueMinus] || 0) - 1);
      if (d.kgArtPlus)    setzeMenge(api, 'art', d.kgArtPlus, (state.artikel[d.kgArtPlus] || 0) + 1);
      if (d.kgArtMinus)   setzeMenge(api, 'art', d.kgArtMinus, (state.artikel[d.kgArtMinus] || 0) - 1);
      if (d.kgAlle) {
        // „Für alle Kinder“: dieses Menü für jedes Kind, das andere auf 0
        api.cfg().menues.auswahl.forEach(function (m) { setzeMenge(api, 'menue', m.id, m.id === d.kgAlle ? kinder(api) : 0); });
      }
      api.fehlerLoeschen();
      api.aktualisieren();
    },
    input: function (e, api) {
      var t = e.target, n = parseInt(t.value, 10);
      n = isNaN(n) || n < 0 ? 0 : n;
      if (t.dataset.kgMenue) state.menues[t.dataset.kgMenue] = Math.min(n, api.cfg().menues.max_je_menue);
      if (t.dataset.kgArt) state.artikel[t.dataset.kgArt] = Math.min(n, api.cfg().a_la_carte.max_je_artikel);
    },
    change: function (e, api) {
      var t = e.target;
      if (t.dataset.kgMenue) { setzeMenge(api, 'menue', t.dataset.kgMenue, t.value); t.value = state.menues[t.dataset.kgMenue]; }
      if (t.dataset.kgArt) { setzeMenge(api, 'art', t.dataset.kgArt, t.value); t.value = state.artikel[t.dataset.kgArt]; }
      if (t.name === 'r-modus') state.modus = t.value;
      if (t.hasAttribute('data-kuchen')) state.kuchen = t.checked;
    }
  };

  function nachAktualisieren(api) {
    var cfg = api.cfg(), gesamt = 0;
    cfg.menues.auswahl.forEach(function (m) {
      var n = state.menues[m.id] || 0; gesamt += n;
      var z = api.el('[data-kg-zeile="menue-' + m.id + '"]'); if (z) z.innerHTML = rechnung(m.preis, n);
      var box = api.el('[data-feld="menue-' + m.id + '"]'); if (box) box.classList.toggle('rechner__menue--aktiv', n > 0);
    });
    alleArtikel(cfg).forEach(function (a) {
      var n = state.artikel[a.id] || 0;
      var z = api.el('[data-kg-zeile="art-' + a.id + '"]'); if (z) z.innerHTML = artikelMeta(a, n);
      var box = api.el('[data-feld="artikel-' + a.id + '"]'); if (box) box.classList.toggle('rechner__artikel--aktiv', n > 0);
    });
    var info = api.el('#r-gruppe-info');
    if (info) {
      var d = api.feldWert('date'), t = api.feldWert('time'), b = api.feldWert('begleitung'), tag = wochentag(d), modus = '';
      cfg.planung.optionen.forEach(function (o) { if (o.id === state.modus) modus = o.kurz; });
      info.textContent = kinder(api) + ' Kinder · ' + (b === '' ? '?' : b) + ' Begleitpersonen' +
        (tag ? ' · ' + TAGE[tag % 7] + ', ' + d.split('-').reverse().join('.') : '') + (t ? ' · ' + t + ' Uhr' : '') +
        (modus ? ' · Speisen & Getränke ' + modus : '');
    }
    var g = api.el('[data-kg-gesamt]');
    if (g) g.textContent = gesamt ? 'Zusammen ' + gesamt + (gesamt === 1 ? ' Menü' : ' Menüs') + ' für ' + kinder(api) + ' Kinder.' : '';
  }

  TjRechner.starte({
    name: 'kindergeburtstag',
    configUrl: 'data/kindergeburtstag-preise.json',
    autoOeffnen: true,
    state: state,
    // Die Speisekarten-Schritte stehen in der Konfiguration; der Kern setzt sie nach dem Laden ein
    schritte: schritteAnfang.concat(schritteEnde),
    schritteAusConfig: function (cfg) {
      return schritteAnfang.concat(cfg.a_la_carte.schritte.map(artikelSchritt), schritteEnde);
    },
    personen: kinder,
    auswahl: auswahl,
    berechne: berechne,
    ereignisse: ereignisse,
    nachAktualisieren: nachAktualisieren,
    gruppenZeilen: true,
    mengenText: function (x) { return String(x.menge); },
    summeText: function (c) { return euro(c.summe); },
    summeHinweis: function () { return 'laut Broschüre & Speisekarte · unverbindlich'; },
    summeHinweisLang: function (c) {
      var offen = c.positionen.some(function (x) { return x.einzel === null; });
      return 'Kindergeburtstags-Menüs laut Kindergeburtstag-Broschüre, Speisen & Getränke à la carte laut aktueller Speisekarte (inkl. MwSt.).' +
        (offen ? ' Positionen „auf Anfrage“ sind nicht in der Summe enthalten.' : '');
    },
    hinweiseTitel: 'Hinweise',
    leerText: 'Noch keine Menüs und keine Speisen oder Getränke ausgewählt.',
    sendenText: 'Kindergeburtstag unverbindlich anfragen',
    pruefeAbsenden: function (api, calc) {
      return state.modus === 'spontan' || calc.positionen.length ? null
        : 'Einen Tischbereich reservieren wir, wenn Speisen oder Getränke im Tjorven Bistro bestellt werden. ' +
          'Bitte wähle mindestens ein Menü oder etwas von der Speisekarte – oder entscheidet spontan vor Ort.';
    },
    feldSchritt: { guests: 'gruppe', begleitung: 'gruppe', date: 'gruppe', time: 'gruppe',
                   name: 'kontakt', email: 'kontakt', phone: 'kontakt', message: 'kontakt', auswahl: 'anfrage' }
  });
})();
