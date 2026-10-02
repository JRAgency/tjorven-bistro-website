/* ============================================================
   TJORVEN BISTRO — Catering in der KLIMA ARENA planen
   Definition für den Rechner-Kern (js/rechner-kern.js).

   Alle Preise und Regeln kommen aus data/catering-preise.json,
   die auch der Server liest (inc/catering-preise.php). Die
   Rechenfunktion unten ist ein Spiegel von tj_catering_calculate;
   maßgeblich ist immer die Berechnung auf dem Server.
   ============================================================ */

(function () {
  'use strict';
  if (!window.TjRechner) return;
  var euro = TjRechner.euro, zahl = TjRechner.zahl, esc = TjRechner.esc;
  var GAENGE = ['vorspeise', 'hauptspeise', 'dessert'];

  var state = {
    menue: { id: '', gangfolge: '', mehr: [], speisen: { vorspeise: ['', ''], hauptspeise: ['', ''], dessert: ['', ''] } },
    snacks: {},
    getraenke: {}
  };

  /* ---------- Hilfsfunktionen ---------- */

  function findeVariante(cfg, id) {
    var v = null; cfg.menues.varianten.forEach(function (x) { if (x.id === id) v = x; }); return v;
  }
  function findeGangfolge(v, id) {
    var f = null; if (v) v.gangfolgen.forEach(function (x) { if (x.id === id) f = x; }); return f;
  }
  // Eine Zusatzoption passt, wenn ihr Gang zur gewählten Gangfolge gehört
  function passt(o, f) { return !!f && o.gaenge.some(function (g) { return f.gaenge.indexOf(g) !== -1; }); }
  function zweiteErlaubt(v, f, mehr) {
    var erlaubt = {};
    if (!v || !f) return erlaubt;
    v.mehr_auswahl.optionen.forEach(function (o) {
      if (mehr.indexOf(o.id) === -1 || !passt(o, f)) return;
      o.gaenge.forEach(function (g) { erlaubt[g] = true; });
    });
    return erlaubt;
  }
  // Nur Optionen, die zur Gangfolge passen und ab der Mindestpersonenzahl gelten
  function mehrWirksam(cfg, p) {
    var v = findeVariante(cfg, state.menue.id), f = findeGangfolge(v, state.menue.gangfolge);
    if (!v || p < v.mehr_auswahl.min_personen) return [];
    return v.mehr_auswahl.optionen.filter(function (o) { return state.menue.mehr.indexOf(o.id) !== -1 && passt(o, f); })
      .map(function (o) { return o.id; });
  }
  function speiseName(cfg, g, id) {
    var n = '';
    cfg.speisen[g].auswahl.forEach(function (s) { if (s.id === id) n = s.name + (s.detail ? ' ' + s.detail : ''); });
    return n;
  }
  function leereSpeisen() { return { vorspeise: ['', ''], hauptspeise: ['', ''], dessert: ['', ''] }; }
  function pflicht() { return '<span class="pflicht" aria-hidden="true">*</span><span class="sr-only"> (Pflichtfeld)</span>'; }
  function karte(typ, name, wert, checked, text, preis, disabled, extra) {
    var id = name + '-' + (wert || 'leer');
    return '<label class="rechner__karte" for="' + id + '">' +
      '<input type="' + typ + '" id="' + id + '" name="' + name + '" value="' + esc(wert) + '"' +
        (checked ? ' checked' : '') + (disabled ? ' disabled' : '') + (extra || '') + '>' +
      '<span class="rechner__karte-text">' + text + '</span>' +
      (preis ? '<span class="rechner__karte-preis">' + preis + '</span>' : '') +
      '</label>';
  }

  /* ---------- Berechnung (Spiegel von tj_catering_calculate) ---------- */

  function berechne(cfg, auswahl, p) {
    var positionen = [], hinweise = [], ab = false;

    if (auswahl.menue) {
      var v = findeVariante(cfg, auswahl.menue.id);
      var f = findeGangfolge(v, auswahl.menue.gangfolge);
      if (v && f) {
        // Gewählte Speisen je Gang: [erste, zweite]
        var namen = {}, det = [];
        GAENGE.forEach(function (g) {
          namen[g] = (auswahl.menue.speisen[g] || []).map(function (id) { return speiseName(cfg, g, id); });
        });
        f.gaenge.forEach(function (g) { if (namen[g][0]) det.push(cfg.speisen[g].label + ': ' + namen[g][0]); });
        positionen.push({ titel: v.titel + ' (' + f.titel + ')', menge: p, einheit: 'Pers.',
                          einzel: v.preis_ab_pp, summe: v.preis_ab_pp * p, ab: !!v.preis_ist_ab, schritt: 'menue',
                          details: det });
        ab = ab || !!v.preis_ist_ab;
        if (p >= v.mehr_auswahl.min_personen) {
          v.mehr_auswahl.optionen.forEach(function (o) {
            if (auswahl.menue.mehr.indexOf(o.id) === -1 || !passt(o, f)) return;
            var d2 = [];
            o.gaenge.forEach(function (g) { if (namen[g][1]) d2.push(cfg.speisen[g].label_zweite + ': ' + namen[g][1]); });
            positionen.push({ titel: 'Mehr Auswahl: ' + o.titel, menge: p, einheit: 'Pers.',
                              einzel: o.aufpreis_pp, summe: o.aufpreis_pp * p, ab: false, schritt: 'menue-optionen',
                              details: d2 });
          });
        }
      }
    }

    // Jede gewählte Position gilt automatisch für alle Personen
    cfg.stueckartikel.gruppen.forEach(function (gr) {
      gr.artikel.forEach(function (art) {
        if (auswahl.snacks.indexOf(art.id) === -1) return;
        positionen.push({ titel: gr.titel + ': ' + art.name, menge: p, einheit: 'Pers.',
                          einzel: gr.preis, summe: gr.preis * p, ab: false, schritt: snackSchrittVon(gr, art.id) });
      });
    });

    var dauerTitel = {};
    cfg.getraenke.dauer.forEach(function (d) { dauerTitel[d.id] = d.titel; });
    cfg.getraenke.pauschalen.forEach(function (pa) {
      var d = auswahl.getraenke[pa.id];
      if (!d || pa.preise_pp[d] == null) return;
      positionen.push({ titel: pa.titel + ' (' + dauerTitel[d] + ')', menge: p, einheit: 'Pers.',
                        einzel: pa.preise_pp[d], summe: pa.preise_pp[d] * p, ab: false, schritt: 'getraenke-' + pa.id });
    });

    // Servicepersonal und Spülpauschale: nur Information, nie in der Summe
    var pers = cfg.service.personal;
    hinweise.push(pers.titel + ': nach tatsächlichem Aufwand (' + pers.preis_text + ') – nicht in der Kostenschätzung enthalten; die Einsatzzeit stimmen wir individuell ab.');
    hinweise.push(cfg.service.spuelpauschale.titel + ': ' + cfg.service.spuelpauschale.text);

    var summe = 0;
    positionen.forEach(function (x) { summe += x.summe; });
    return { positionen: positionen, hinweise: hinweise, summe: summe, ab: ab };
  }

  /* ---------- Auswahl in der Form, die an den Server geht ---------- */

  function auswahl(api, p) {
    var cfg = api.cfg();
    var a = { menue: null, snacks: [], getraenke: {} };
    if (!p) return a;   // ohne gültige Personenzahl lassen sich Pro-Person-Preise nicht rechnen
    if (state.menue.id) {
      var v = findeVariante(cfg, state.menue.id), f = findeGangfolge(v, state.menue.gangfolge);
      var mehr = mehrWirksam(cfg, p), erlaubt = zweiteErlaubt(v, f, mehr), speisen = {};
      GAENGE.forEach(function (g) {
        speisen[g] = f && f.gaenge.indexOf(g) !== -1 ? state.menue.speisen[g].slice(0, erlaubt[g] ? 2 : 1).filter(Boolean) : [];
      });
      a.menue = { id: state.menue.id, gangfolge: state.menue.gangfolge, mehr: mehr, speisen: speisen };
    }
    cfg.stueckartikel.gruppen.forEach(function (gr) {
      gr.artikel.forEach(function (art) { if (state.snacks[art.id]) a.snacks.push(art.id); });
    });
    Object.keys(state.getraenke).forEach(function (id) { if (state.getraenke[id]) a.getraenke[id] = state.getraenke[id]; });
    return a;
  }

  function personen(api) {
    var cfg = api.cfg(), roh = api.feldWert('guests');
    if (!/^\d+$/.test(roh)) return 0;
    var n = parseInt(roh, 10);
    return n >= cfg.personen.min && n <= cfg.personen.max ? n : 0;
  }

  /* ---------- Kontaktdaten: Felder und Prüfung (gleiche Regeln wie form-handler.php) ---------- */

  function feld(name, label, eingabe) {
    return '<div class="rechner__feld" data-feld="' + name + '"><label for="r-' + name + '">' + label + ' ' + pflicht() + '</label>' + eingabe + '</div>';
  }
  // Mindestens ein Buchstabe: alles außer Ziffern, Leerraum und ASCII-Satzzeichen (auch Umlaute, andere Schriften)
  var BUCHSTABE = /[^\s0-9\x21-\x2F\x3A-\x40\x5B-\x60\x7B-\x7E]/;
  var REGELN = {
    name:    { leer: 'Bitte gib eine Ansprechperson an.', min: 2, buchstabe: true, text: 'Bitte einen gültigen Namen angeben.' },
    company: { leer: 'Bitte gib eine Firma oder einen Verein an.', min: 2, zeichen: true, text: 'Bitte einen gültigen Namen für Firma oder Verein angeben.' },
    street:  { leer: 'Bitte gib Straße und Hausnummer an.', min: 3, buchstabe: true, ziffer: true, text: 'Bitte Straße und Hausnummer angeben (z. B. Musterstraße 12).' },
    zip:     { leer: 'Bitte gib die PLZ an.', muster: /^(?!00)\d{5}$/, text: 'Bitte eine gültige fünfstellige PLZ angeben.' },
    city:    { leer: 'Bitte gib den Ort an.', min: 2, buchstabe: true, ohneZiffer: true, text: 'Bitte einen gültigen Ort angeben.',
               zifferText: 'Bitte nur den Ort angeben – die PLZ hat ein eigenes Feld.' },
    email:   { leer: 'Bitte gib deine E-Mail-Adresse an.', muster: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, text: 'Bitte eine gültige E-Mail-Adresse angeben.' },
    phone:   { leer: 'Bitte gib eine Mobil- oder Telefonnummer an.', telefon: true, text: 'Bitte eine gültige Mobil- oder Telefonnummer angeben.' }
  };
  function feldFehler(name, v) {
    var r = REGELN[name];
    if (!v) return r.leer;
    if (r.ohneZiffer && /\d/.test(v)) return r.zifferText;
    if (r.min && v.length < r.min) return r.text;
    if (r.buchstabe && !BUCHSTABE.test(v)) return r.text;
    if (r.zeichen && !(BUCHSTABE.test(v) || /\d/.test(v))) return r.text;
    if (r.ziffer && !/\d/.test(v)) return r.text;
    if (r.muster && !r.muster.test(v)) return r.text;
    if (r.telefon) {
      var ziffern = v.replace(/\D/g, '').length;
      if (!/^\+?[0-9 ()\/.\-]+$/.test(v) || ziffern < 6 || ziffern > 20) return r.text;
    }
    return '';
  }
  function pruefeFelder(api, namen) {
    for (var i = 0; i < namen.length; i++) {
      var t = feldFehler(namen[i], api.feldWert(namen[i]));
      if (t) return { feld: namen[i], text: t };
    }
    return null;
  }

  // Zusammenfassung: Kontaktdaten kompakt, mit Sprung zum Ändern
  function angabenZeigen(api) {
    var box = api.el('#r-angaben');
    if (!box) return;
    var w = function (n) { return api.feldWert(n); };
    var zeile = function (teile) { return teile.filter(function (x) { return x; }).map(esc).join(' · '); };
    var n = w('message');
    box.innerHTML = '<h4 class="rechner__label">Deine Angaben</h4>' +
      '<p>' + zeile([w('name'), w('company')]) + '<br>' + zeile([w('street'), (w('zip') + ' ' + w('city')).trim()]) + '<br>' +
        zeile([w('email'), w('phone')]) + '</p>' +
      '<button type="button" class="rechner__aendern" data-geh-zu="kontakt">Ändern<span class="sr-only">: Ansprechpartner und Anschrift</span></button>' +
      '<p class="rechner__angaben-nachricht"><strong>Nachricht:</strong> ' + (n ? esc(n.length > 180 ? n.slice(0, 180) + ' …' : n) : 'keine') + '</p>' +
      '<button type="button" class="rechner__aendern" data-geh-zu="nachricht">Ändern<span class="sr-only">: Nachricht</span></button>';
  }

  /* ---------- Schritte ---------- */

  var schritte = [
    {
      id: 'personen', titel: 'Personenzahl', statisch: true,
      html: function (api) {
        var cfg = api.cfg();
        return '<p class="rechner__intro">' + esc(cfg.personen.intro) + '</p>' +
          '<div class="rechner__feld" data-feld="guests">' +
            '<label for="r-guests">Anzahl Personen ' + pflicht() + '</label>' +
            '<input type="number" id="r-guests" name="guests" inputmode="numeric" min="' + cfg.personen.min + '" max="' + cfg.personen.max +
              '" step="1" placeholder="z. B. 30" required aria-describedby="r-guests-hinweis">' +
            '<span class="rechner__feld-hinweis" id="r-guests-hinweis">' + esc(cfg.personen.text) + '</span>' +
          '</div>' +
          '<div class="rechner__feld" data-feld="date"><label for="r-date">Datum ' + pflicht() + '</label>' +
            '<input type="date" id="r-date" name="date" required></div>';
      },
      pruefe: function (api) {
        var cfg = api.cfg();
        if (!personen(api)) return { feld: 'guests', text: cfg.personen.text };
        var d = api.feldWert('date');
        if (!d) return { feld: 'date', text: 'Bitte ein Datum angeben.' };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { feld: 'date', text: 'Bitte ein gültiges Datum angeben.' };
        if (d < api.heute()) return { feld: 'date', text: 'Bitte ein Datum ab heute angeben.' };
        return null;
      }
    },
    {
      id: 'menue', titel: 'Menü',
      html: function (api) {
        var cfg = api.cfg();
        var h = '<p class="rechner__intro">' + esc(cfg.menues.text_speisenwahl) + '. Das Menü ist optional.</p>' +
          '<fieldset><legend class="sr-only">Menüvariante</legend><div class="rechner__karten">';
        h += karte('radio', 'r-menue', '', state.menue.id === '', '<strong>Kein Menü</strong>', '');
        cfg.menues.varianten.forEach(function (v) {
          h += karte('radio', 'r-menue', v.id, state.menue.id === v.id,
            '<strong>' + esc(v.titel) + '</strong><small>' + esc(v.gangfolgen_text) + '</small>', esc(v.preis_text));
        });
        h += '</div></fieldset>';
        var v = findeVariante(cfg, state.menue.id);
        if (v && !state.menue.gangfolge) {
          h += '<p class="rechner__feld-hinweis rechner__abstand">Die Gangfolge wählst du im nächsten Schritt – dann wird der Menüpreis eingerechnet.</p>';
        }
        return h;
      }
    },
    {
      id: 'menue-optionen', titel: 'Menü: Gangfolge & mehr Auswahl',
      sichtbar: function (api) {
        var v = api.cfg() ? findeVariante(api.cfg(), state.menue.id) : null;
        return !!v && (v.gangfolgen.length > 1 || v.mehr_auswahl.optionen.length > 0);
      },
      html: function (api) {
        var cfg = api.cfg(), p = api.personen(), v = findeVariante(cfg, state.menue.id);
        if (!v) return '';
        var h = '';
        if (v.gangfolgen.length > 1) {
          h += '<fieldset class="rechner__block" data-feld="gangfolge"><legend>Gangfolge (' + esc(v.titel) + ')</legend><div class="rechner__karten">';
          v.gangfolgen.forEach(function (g) {
            h += karte('radio', 'r-gangfolge', g.id, state.menue.gangfolge === g.id, '<strong>' + esc(g.titel) + '</strong>', '');
          });
          h += '</div></fieldset>';
        } else {
          h += '<p class="rechner__intro"><strong>' + esc(v.titel) + '</strong> – ' + esc(v.gangfolgen_text) + '</p>';
        }
        var mehr = v.mehr_auswahl, gesperrt = p < mehr.min_personen, f = findeGangfolge(v, state.menue.gangfolge);
        h += '<fieldset class="rechner__block"><legend>' + esc(mehr.titel) + '</legend>';
        if (!f) return h + '<p class="rechner__feld-hinweis">Wähle zuerst die Gangfolge – dann siehst du die passenden Optionen.</p></fieldset>';
        h += '<div class="rechner__karten">';
        mehr.optionen.forEach(function (o) {
          if (!passt(o, f)) return;
          h += karte('checkbox', 'r-mehr', o.id, !gesperrt && state.menue.mehr.indexOf(o.id) !== -1,
            '<strong>' + esc(o.titel) + '</strong>' + (gesperrt ? '<small>erst ab ' + mehr.min_personen + ' Personen möglich</small>' : ''),
            '+ ' + euro(o.aufpreis_pp) + ' p. P.', gesperrt);
        });
        return h + '</div><p class="rechner__feld-hinweis rechner__abstand">' + esc(cfg.menues.text_aufpreise) + '</p></fieldset>';
      },
      pruefe: function (api) {
        var v = findeVariante(api.cfg(), state.menue.id);
        if (v && !findeGangfolge(v, state.menue.gangfolge)) return { feld: 'gangfolge', text: 'Bitte wähle die Gangfolge des Menüs.' };
        return null;
      }
    }
  ];

  // Speisenwahl: je Gang ein eigener Schritt, nur für die Gänge der gewählten Gangfolge
  [['vorspeise', 'Vorspeise'], ['hauptspeise', 'Hauptspeise'], ['dessert', 'Dessert']].forEach(function (gt) {
    var g = gt[0];
    schritte.push({
      id: 'menue-' + g, titel: 'Menü: ' + gt[1],
      sichtbar: function (api) {
        if (!api.cfg()) return false;
        var f = findeGangfolge(findeVariante(api.cfg(), state.menue.id), state.menue.gangfolge);
        return !!f && f.gaenge.indexOf(g) !== -1;
      },
      html: function (api) {
        var cfg = api.cfg(), v = findeVariante(cfg, state.menue.id), f = findeGangfolge(v, state.menue.gangfolge);
        var erlaubt = zweiteErlaubt(v, f, mehrWirksam(cfg, api.personen())), gang = cfg.speisen[g];
        var h = '';
        for (var n = 0; n < (erlaubt[g] ? 2 : 1); n++) {
          var opt = null;
          v.mehr_auswahl.optionen.forEach(function (o) { if (n && o.gaenge.indexOf(g) !== -1) opt = o; });
          h += '<div class="rechner__feld" data-feld="speise-' + g + '-' + n + '"><label for="r-sp-' + g + '-' + n + '">' +
              esc(n ? gang.label_zweite : gang.label) + (opt ? ' <span class="opt">(+ ' + esc(euro(opt.aufpreis_pp)) + ' p. P.)</span>' : '') + '</label>' +
            '<select id="r-sp-' + g + '-' + n + '" data-speise-gang="' + g + '" data-speise-nr="' + n + '"><option value="">noch offen</option>' +
            gang.auswahl.map(function (s) {
              var txt = s.name + (s.detail ? ' ' + s.detail : '') + (s.hinweis ? ' (' + s.hinweis + ')' : '');
              return '<option value="' + s.id + '"' + (state.menue.speisen[g][n] === s.id ? ' selected' : '') + '>' + esc(txt) + '</option>';
            }).join('') + '</select></div>';
        }
        return h;
      },
      pruefe: function (api) {
        var cfg = api.cfg(), v = findeVariante(cfg, state.menue.id), f = findeGangfolge(v, state.menue.gangfolge);
        var s = state.menue.speisen[g];
        if (zweiteErlaubt(v, f, mehrWirksam(cfg, api.personen()))[g] && s[0] && s[0] === s[1]) {
          return { feld: 'speise-' + g + '-1', text: 'Bitte eine andere Speise als oben wählen.' };
        }
        return null;
      }
    });
  });

  // Frühstück & Snacks, Süße Kleinigkeiten, Wraps, Fingerfood – je ein eigener Schritt.
  // Gruppen mit mehr als SNACK_MAX Positionen werden auf zwei Schritte verteilt, damit
  // jeder Schritt auch auf kleinen Smartphones ohne Scrollen passt.
  var SNACK_MAX = 4;
  function snackTeile(gr) {
    if (gr.artikel.length <= SNACK_MAX) return [{ id: 'snack-' + gr.id, titel: gr.schritt_titel, artikel: gr.artikel }];
    var mitte = Math.ceil(gr.artikel.length / 2);
    return [{ id: 'snack-' + gr.id + '-1', titel: gr.schritt_titel + ' (1 von 2)', artikel: gr.artikel.slice(0, mitte) },
            { id: 'snack-' + gr.id + '-2', titel: gr.schritt_titel + ' (2 von 2)', artikel: gr.artikel.slice(mitte) }];
  }
  function snackSchrittVon(gr, artId) {
    var id = '';
    snackTeile(gr).forEach(function (t) { t.artikel.forEach(function (a) { if (a.id === artId) id = t.id; }); });
    return id;
  }
  // Rechenweg in der Preisspalte: gewählt „25 × 2,00 €“ über dem Betrag, sonst nur der Betrag
  function snackZeile(gr, p, gewaehlt) {
    return gewaehlt
      ? '<small aria-hidden="true">' + p + ' × ' + euro(gr.preis) + '</small><span aria-hidden="true">' + euro(gr.preis * p) + '</span>' +
        '<span class="sr-only">Ausgewählt: ' + p + ' Personen × ' + euro(gr.preis) + ' = ' + euro(gr.preis * p) + '</span>'
      : '<span aria-hidden="true">' + euro(gr.preis * p) + '</span><span class="sr-only">für ' + p + ' Personen: ' + euro(gr.preis * p) + '</span>';
  }
  function snackSchritt(gr, teil) {
    return {
      id: teil.id, titel: teil.titel,
      html: function (api) {
        var cfg = api.cfg(), p = api.personen();
        var h = '<div class="rechner__hinweis rechner__hinweis--oben"><strong>' + esc(cfg.stueckartikel.abrechnung_text) + '</strong> ' +
          'Aktuell: ' + p + ' Personen × ' + esc(gr.preis_text) + (gr.titel !== gr.schritt_titel ? ' (' + esc(gr.titel) + ')' : '') + '.</div>' +
          '<fieldset><legend class="sr-only">' + esc(gr.titel) + ' – ' + esc(gr.preis_text) + '</legend><div class="rechner__karten">';
        teil.artikel.forEach(function (a) {
          var id = 'r-sn-' + a.id, an = !!state.snacks[a.id];
          var zusatz = [a.detail, a.hinweis].filter(Boolean).join(' · ');
          h += '<label class="rechner__karte rechner__karte--snack" for="' + id + '">' +
            '<input type="checkbox" id="' + id + '" data-snack="' + a.id + '"' + (an ? ' checked' : '') + ' aria-describedby="' + id + '-z">' +
            '<span class="rechner__karte-text"><strong>' + esc(a.name) + '</strong>' + (zusatz ? '<small>' + esc(zusatz) + '</small>' : '') + '</span>' +
            '<span class="rechner__karte-preis rechner__karte-preis--rechnung" id="' + id + '-z" data-snack-zeile="' + a.id + '">' + snackZeile(gr, p, an) + '</span></label>';
        });
        return h + '</div></fieldset>';
      }
    };
  }
  function snackSchritte(cfg) {
    var l = [];
    cfg.stueckartikel.gruppen.forEach(function (gr) { snackTeile(gr).forEach(function (t) { l.push(snackSchritt(gr, t)); }); });
    return l;
  }
  var anzahlVorSnacks = schritte.length;   // Personen, Menü, Menü-Optionen, Gänge

  function paket(api, pa) {
    var cfg = api.cfg(), p = api.personen(), gew = state.getraenke[pa.id] || '';
    var zeilen = pa.zeilen.map(function (z, i) {
      return pa.betont.indexOf(i) !== -1 ? '<strong>' + esc(z) + '</strong>' : esc(z);
    }).join('<br>');
    var h = '<p class="rechner__intro">Die Pauschale gilt pro Person für die angegebene Personenzahl – aktuell <strong>' + p +
        ' Personen</strong> (ab ' + pa.min_personen + ' Personen).</p>' +
      '<fieldset class="rechner__paket"><legend class="sr-only">' + esc(pa.titel) + '</legend><p>' + zeilen + '</p>' +
      '<div class="rechner__segmente">' + segment(pa.id, '', gew === '', 'Nicht gewählt', '');
    cfg.getraenke.dauer.forEach(function (d) {
      h += segment(pa.id, d.id, gew === d.id, d.titel, euro(pa.preise_pp[d.id]) + ' p. P.');
    });
    return h + '</div><p class="rechner__feld-hinweis" data-gt-zeile="' + pa.id + '">' + paketZeile(cfg, pa, p) + '</p></fieldset>';
  }
  // „25 Personen × 6,00 € = 150,00 €“ unter den Preisknöpfen
  function paketZeile(cfg, pa, p) {
    var d = state.getraenke[pa.id];
    return d && pa.preise_pp[d] != null ? p + ' Personen × ' + euro(pa.preise_pp[d]) + ' = ' + euro(pa.preise_pp[d] * p) : '';
  }
  function segment(pid, wert, checked, titel, preis) {
    var id = 'r-gt-' + pid + '-' + (wert || 'keine');
    return '<label class="rechner__segment" for="' + id + '"><input type="radio" id="' + id + '" name="r-gt-' + pid +
      '" value="' + wert + '" data-getraenk="' + pid + '"' + (checked ? ' checked' : '') + '>' +
      '<span>' + esc(titel) + (preis ? '<b>' + esc(preis) + '</b>' : '') + '</span></label>';
  }
  function pauschale(cfg, id) { var p = null; cfg.getraenke.pauschalen.forEach(function (x) { if (x.id === id) p = x; }); return p; }

  // Erfrischungs-, Wasser- und Heißgetränkepauschale – je ein eigener Schritt
  [['erfrischung', 'Erfrischungspauschale'], ['wasser', 'Wasserpauschale'], ['heissgetraenke', 'Heißgetränkepauschale']].forEach(function (gp) {
    schritte.push({
      id: 'getraenke-' + gp[0], titel: 'Getränke: ' + gp[1],
      html: function (api) { return paket(api, pauschale(api.cfg(), gp[0])); }
    });
  });

  schritte.push(
    {
      id: 'service', titel: 'Servicepersonal & Spülpauschale', statisch: true,
      html: function (api) {
        var cfg = api.cfg(), pers = cfg.service.personal, sp = cfg.service.spuelpauschale;
        return '<div class="rechner__info"><h4>' + esc(pers.titel) + '</h4><p>' + esc(pers.text) + '</p>' +
            '<p class="rechner__info-preis">' + esc(pers.preis_text) + '</p></div>' +
          '<div class="rechner__info"><h4>' + esc(sp.titel) + '</h4><p>' + esc(sp.text) + '</p></div>';
      }
    },
    {
      // Für Angebot und Rechnung – Reihenfolge wie vorgegeben, auf zwei Schritte verteilt,
      // damit auch kleine Smartphones ohne Scrollen auskommen
      id: 'kontakt', titel: 'Ansprechpartner & Anschrift', statisch: true,
      html: function () {
        return '<p class="rechner__intro rechner__intro--kompakt-aus">Diese Angaben brauchen wir für Angebot und Rechnung.</p>' +
          feld('name', 'Ansprechpartner', '<input type="text" id="r-name" name="name" autocomplete="name" required maxlength="150">') +
          feld('company', 'Firma / Verein', '<input type="text" id="r-company" name="company" autocomplete="organization" required maxlength="150">') +
          feld('street', 'Straße & Hausnummer', '<input type="text" id="r-street" name="street" autocomplete="address-line1" required maxlength="150">') +
          '<div class="rechner__reihe rechner__reihe--plz">' +
            feld('zip', 'PLZ', '<input type="text" id="r-zip" name="zip" inputmode="numeric" autocomplete="postal-code" required maxlength="5" pattern="[0-9]{5}">') +
            feld('city', 'Ort', '<input type="text" id="r-city" name="city" autocomplete="address-level2" required maxlength="100">') +
          '</div>';
      },
      pruefe: function (api) {
        return pruefeFelder(api, ['name', 'company', 'street', 'zip', 'city']);
      }
    },
    {
      id: 'erreichbarkeit', titel: 'E-Mail & Telefon', statisch: true,
      html: function () {
        return feld('email', 'E-Mail-Adresse', '<input type="email" id="r-email" name="email" autocomplete="email" required maxlength="190">') +
          feld('phone', 'Mobil / WhatsApp oder Telefon', '<input type="tel" id="r-phone" name="phone" autocomplete="tel" required maxlength="60" aria-describedby="r-phone-hinweis">' +
            '<span class="rechner__feld-hinweis" id="r-phone-hinweis">Für schnelle Rückfragen empfehlen wir eine Mobil- bzw. WhatsApp-Nummer.</span>');
      },
      pruefe: function (api) {
        return pruefeFelder(api, ['email', 'phone']);
      }
    },
    {
      id: 'nachricht', titel: 'Nachricht & Hinweise', statisch: true,
      html: function () {
        return '<div class="rechner__feld" data-feld="message"><label for="r-message">Deine Nachricht an uns <span class="opt">(optional)</span></label>' +
          '<span class="rechner__feld-hinweis" id="r-message-hinweis">Gibt es noch etwas, das wir wissen sollten? Nenne uns hier gerne besondere Wünsche, ' +
            'Unverträglichkeiten, Allergien oder organisatorische Hinweise, die wir bei deiner Veranstaltung berücksichtigen dürfen. ' +
            'Für Angaben zu Allergien oder Unverträglichkeiten bitten wir im letzten Schritt um deine Einwilligung.</span>' +
          '<textarea id="r-message" name="message" rows="6" maxlength="5000" aria-describedby="r-message-hinweis" ' +
            'placeholder="z. B. Allergien, Unverträglichkeiten, Ablauf oder besondere Wünsche"></textarea></div>';
      }
    },
    {
      id: 'anfrage', titel: 'Zusammenfassung & Anfrage', statisch: true,
      html: function () {
        return '<div id="r-zusammenfassung"></div>' +
          '<div class="rechner__angaben" id="r-angaben"></div>' +
          TjRechner.unverbindlichHtml() +
          '<p class="rechner__rechtlich">Die berechnete Summe dient als erste Kostenschätzung. Der endgültige Preis kann abhängig von den ' +
            'konkreten Anforderungen und der finalen Abstimmung abweichen.</p>' +
          TjRechner.gesundheitHtml() +
          '<p class="rechner__rechtlich">Mit dem Absenden werden deine Angaben zur Bearbeitung deiner Anfrage verarbeitet. ' +
            'Näheres in der <a href="/datenschutz/" target="_blank" rel="noopener">Datenschutzerklärung</a>.</p>' +
          '<p class="rechner__status" id="r-status" role="status" aria-live="polite" hidden></p>';
      }
    }
  );

  /* ---------- Eingaben ---------- */

  var ereignisse = {
    change: function (e, api) {
      var t = e.target, cfg = api.cfg();
      if (t.name === 'r-menue') {
        state.menue.id = t.value;
        var v = findeVariante(cfg, t.value);
        state.menue.gangfolge = v && v.gangfolgen.length === 1 ? v.gangfolgen[0].id : '';
        state.menue.mehr = [];
        state.menue.speisen = leereSpeisen();
        api.neuZeichnen('menue');
      }
      if (t.name === 'r-gangfolge') {
        state.menue.gangfolge = t.value;
        state.menue.speisen = leereSpeisen();
        // Zusatzoptionen, die nicht zur neuen Gangfolge passen, fallen weg
        var v2 = findeVariante(cfg, state.menue.id), f2 = findeGangfolge(v2, t.value);
        state.menue.mehr = state.menue.mehr.filter(function (id) {
          return v2.mehr_auswahl.optionen.some(function (o) { return o.id === id && passt(o, f2); });
        });
        api.neuZeichnen('menue-optionen');
      }
      if (t.name === 'r-mehr') {
        var i = state.menue.mehr.indexOf(t.value);
        if (t.checked && i === -1) state.menue.mehr.push(t.value);
        if (!t.checked && i !== -1) state.menue.mehr.splice(i, 1);
        if (!t.checked) {
          // Zweite Speise eines Gangs verwerfen, wenn die Option wegfällt
          var v3 = findeVariante(cfg, state.menue.id), f3 = findeGangfolge(v3, state.menue.gangfolge);
          var erlaubt = zweiteErlaubt(v3, f3, mehrWirksam(cfg, api.personen()));
          GAENGE.forEach(function (g) { if (!erlaubt[g]) state.menue.speisen[g][1] = ''; });
        }
      }
      if (t.dataset.speiseGang) state.menue.speisen[t.dataset.speiseGang][parseInt(t.dataset.speiseNr, 10)] = t.value;
      if (t.dataset.snack) state.snacks[t.dataset.snack] = t.checked;
      if (t.dataset.getraenk !== undefined && t.type === 'radio') state.getraenke[t.dataset.getraenk] = t.value;
    }
  };

  function nachAktualisieren(api) {
    var cfg = api.cfg(), p = api.personen();
    angabenZeigen(api);
    // Rechenzeile an jeder Snack-Karte
    cfg.stueckartikel.gruppen.forEach(function (gr) {
      gr.artikel.forEach(function (a) {
        var z = api.el('[data-snack-zeile="' + a.id + '"]');
        if (z) z.innerHTML = snackZeile(gr, p, !!state.snacks[a.id]);
      });
    });
    cfg.getraenke.pauschalen.forEach(function (pa) {
      var z = api.el('[data-gt-zeile="' + pa.id + '"]');
      if (z) z.textContent = paketZeile(cfg, pa, p);
    });
  }

  TjRechner.starte({
    name: 'catering',
    configUrl: '/data/catering-preise.json',
    autoOeffnen: true,
    planenPfad: '/catering/planen/',
    broschuerePfad: '/catering/broschuere/',
    state: state,
    schritte: schritte,
    // Die Snack-Schritte ergeben sich aus der Preisliste; der Kern setzt sie nach dem Laden ein
    schritteAusConfig: function (cfg) {
      return schritte.slice(0, anzahlVorSnacks).concat(snackSchritte(cfg), schritte.slice(anzahlVorSnacks));
    },
    personen: personen,
    auswahl: auswahl,
    berechne: berechne,
    ereignisse: ereignisse,
    nachAktualisieren: nachAktualisieren,
    mengenText: function (x) { return zahl(x.menge) + ' ' + x.einheit; },
    summeText: function (c) { return (c.ab ? 'ab ' : '') + euro(c.summe); },
    summeHinweis: function () { return 'netto zzgl. MwSt. · unverbindlich'; },
    summeHinweisLang: function (c) {
      return 'Alle genannten Preise verstehen sich zzgl. der gesetzlichen Mehrwertsteuer.' + (c.ab ? ' Menüpreise sind Ab-Preise pro Person.' : '');
    },
    hinweiseTitel: 'Hinweise',
    leerText: 'Noch keine Leistung ausgewählt.',
    sendenText: 'Catering unverbindlich anfragen',
    pruefeAbsenden: function (api, calc) {
      return calc.positionen.length ? null : 'Bitte wähle mindestens eine Leistung aus – oder schreib uns über das Kontaktformular.';
    },
    feldSchritt: { guests: 'personen', date: 'personen',
                   name: 'kontakt', company: 'kontakt', street: 'kontakt', zip: 'kontakt', city: 'kontakt',
                   email: 'erreichbarkeit', phone: 'erreichbarkeit', message: 'nachricht', auswahl: 'anfrage' }
  });
})();
