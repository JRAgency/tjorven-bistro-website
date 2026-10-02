/* ============================================================
   TJORVEN BISTRO — Kindergeburtstag im Tjorven Bistro planen
   Definition für den Rechner-Kern (js/rechner-kern.js).

   Seit 01.10.2026 eine reine unverbindliche Anfrage: Die
   Kindergeburtstags-Menüs und das Angebot à la carte werden nur
   als Information gezeigt – nichts wird ausgewählt oder berechnet,
   deshalb gibt es auch keine Summe im Fuß. Texte und Menüpreise
   kommen aus data/kindergeburtstag-preise.json; der Server
   (inc/kindergeburtstag-preise.php) prüft die Gruppengrößen.
   ============================================================ */

(function () {
  'use strict';
  if (!window.TjRechner) return;
  var esc = TjRechner.esc;
  var TAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

  function pflicht() { return '<span class="pflicht" aria-hidden="true">*</span><span class="sr-only"> (Pflichtfeld)</span>'; }

  // Erlaubte Ankunftszeiten aus der Konfiguration: von … bis im festen Takt (z. B. 09:00–16:00, 15 Minuten).
  // Gleiche Regel wie tj_kg_ankunftszeiten() auf dem Server.
  function minuten(hhmm) {
    var m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm || '');
    return m ? +m[1] * 60 + +m[2] : -1;
  }
  function ankunftszeiten(cfg) {
    var a = cfg.ankunftszeit || {}, von = minuten(a.von), bis = minuten(a.bis), schritt = +a.schritt_minuten, liste = [];
    if (von < 0 || bis < von || !(schritt > 0)) return liste;
    for (var m = von; m <= bis; m += schritt) {
      liste.push((m < 600 ? '0' : '') + Math.floor(m / 60) + ':' + (m % 60 < 10 ? '0' : '') + (m % 60));
    }
    return liste;
  }

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

  function zeitfensterText(cfg) {
    var a = cfg.ankunftszeit || {};
    return 'Bitte wähle eine Ankunftszeit zwischen ' + a.von + ' und ' + a.bis + ' Uhr (im ' + a.schritt_minuten + '-Minuten-Takt).';
  }

  // Vor dem Absenden, gut sichtbar: Anfrage ist noch keine Reservierung
  var UNVERBINDLICH = 'Mit dem Absenden stellst du eine unverbindliche Anfrage. Dein Wunschtermin ist damit noch nicht reserviert: ' +
    'Wir prüfen deine Anfrage und melden uns bei dir – verbindlich wird die Reservierung erst mit unserer Bestätigung.';

  /* ---------- Schritte ---------- */

  var schritte = [
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
              '<input type="number" id="r-begleitung" name="begleitung" inputmode="numeric" min="' + cfg.begleitpersonen.min +
              '" max="' + cfg.begleitpersonen.max + '" step="1" placeholder="z. B. 2" required></div>' +
          '</div>' +
          // Ankunftszeit als native Auswahlliste: Die Zeit-Picker von iOS/Android halten sich nicht an
          // min/max/step – so sind nur die erlaubten Zeiten (09:00–16:00, 15-Minuten-Takt) wählbar.
          '<div class="rechner__reihe rechner__reihe--unten">' +
            '<div class="rechner__feld" data-feld="date"><label for="r-date">Datum ' + pflicht() + '</label>' +
              '<input type="date" id="r-date" name="date" required></div>' +
            '<div class="rechner__feld" data-feld="time"><label for="r-time">Voraussichtliche Ankunftszeit ' + pflicht() + '</label>' +
              '<select id="r-time" name="time" required><option value="">Bitte wählen</option>' +
              ankunftszeiten(cfg).map(function (z) { return '<option value="' + z + '">' + z + ' Uhr</option>'; }).join('') +
              '</select></div>' +
          '</div>' +
          '<div class="rechner__hinweis">' + esc(cfg.texte.tischbereich) + '</div>';
      },
      pruefe: function (api) {
        var cfg = api.cfg();
        if (!kinder(api)) return { feld: 'guests', text: 'Bitte gib eine Kinderzahl zwischen ' + cfg.kinder.min + ' und ' + cfg.kinder.max + ' an.' };
        // Mindestens eine Begleitperson – dieselben Meldungen wie auf dem Server
        var b = api.feldWert('begleitung');
        if (b === '') return { feld: 'begleitung', text: 'Bitte gib die Anzahl der Begleitpersonen an (mindestens 1).' };
        if (!/^\d+$/.test(b) || parseInt(b, 10) < cfg.begleitpersonen.min || parseInt(b, 10) > cfg.begleitpersonen.max) {
          return { feld: 'begleitung', text: 'Bitte gib zwischen ' + cfg.begleitpersonen.min + ' und ' + cfg.begleitpersonen.max + ' Begleitpersonen an.' };
        }
        var d = api.feldWert('date');
        if (!d) return { feld: 'date', text: 'Bitte ein Datum angeben.' };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { feld: 'date', text: 'Bitte ein gültiges Datum angeben.' };
        if (d < api.heute()) return { feld: 'date', text: 'Bitte ein Datum ab heute angeben.' };
        // Voraussichtliche Ankunftszeit ist Pflicht und nur im erlaubten Zeitfenster gültig
        var t = api.feldWert('time'), zeiten = ankunftszeiten(cfg);
        if (!t) return { feld: 'time', text: 'Bitte gib eine voraussichtliche Ankunftszeit an.' };
        if (zeiten.indexOf(t) < 0) return { feld: 'time', text: zeitfensterText(cfg) };
        return null;
      }
    },
    {
      // Nur Information: keine Mengen, keine Auswahl, keine Berechnung
      id: 'essen', titel: 'Essen & Trinken', statisch: true,
      html: function (api) {
        var cfg = api.cfg(), m = cfg.menues, alc = cfg.a_la_carte;
        return '<p class="rechner__intro">' + esc(cfg.essen_trinken.intro) + '</p>' +
          '<h4 class="rechner__label">' + esc(m.titel) + '</h4>' +
          '<ul class="rechner__infokarten">' + m.auswahl.map(function (x) {
            return '<li class="rechner__infokarte"><p class="rechner__infokarte-kopf"><strong>' + esc(x.titel) + '</strong>' +
              '<span>' + esc(x.preis_text) + '</span></p><p>' + x.inhalt.map(esc).join(' · ') + '</p></li>';
          }).join('') + '</ul>' +
          '<div class="rechner__info"><h4>' + esc(alc.titel) + '</h4><p>' + esc(alc.text) + '</p>' +
            '<p><a href="/speisekarte/" target="_blank" rel="noopener">' + esc(alc.link_text) +
            '<span class="sr-only"> (öffnet in neuem Tab)</span></a></p></div>';
      }
    },
    {
      id: 'kuchen', titel: 'Kuchen & Nachhaltigkeit', statisch: true,
      html: function (api) {
        var cfg = api.cfg();
        return '<div class="rechner__info"><h4>' + esc(cfg.kuchen.titel) + '</h4><p>' + esc(cfg.kuchen.text) + '</p></div>' +
          '<div class="rechner__info rechner__info--gruen" role="note"><h4>' + esc(cfg.nachhaltigkeit.titel) + '</h4><p>' +
            esc(cfg.nachhaltigkeit.text) + '</p></div>';
      }
    },
    {
      id: 'kontakt', titel: 'Deine Kontaktdaten', statisch: true,
      html: function () {
        return '<div class="rechner__feld" data-feld="name"><label for="r-name">Name ' + pflicht() + '</label>' +
            '<input type="text" id="r-name" name="name" autocomplete="name" required maxlength="150"></div>' +
          '<div class="rechner__feld" data-feld="email"><label for="r-email">E-Mail ' + pflicht() + '</label>' +
            '<input type="email" id="r-email" name="email" autocomplete="email" required maxlength="190"></div>' +
          '<div class="rechner__feld" data-feld="phone"><label for="r-phone">Telefon / WhatsApp <span class="opt">(optional)</span></label>' +
            '<input type="tel" id="r-phone" name="phone" autocomplete="tel" maxlength="60" aria-describedby="r-phone-hinweis">' +
            '<span class="rechner__feld-hinweis" id="r-phone-hinweis">Für schnelle Rückfragen empfehlen wir eine Mobil- bzw. WhatsApp-Nummer.</span></div>' +
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
      id: 'anfrage', titel: 'Anfrage senden', statisch: true,
      html: function () {
        return '<p class="rechner__eckdaten" id="r-gruppe-info"></p>' +
          TjRechner.unverbindlichHtml(UNVERBINDLICH) +
          TjRechner.gesundheitHtml() +
          '<p class="rechner__rechtlich">Mit dem Absenden werden deine Angaben zur Bearbeitung deiner Anfrage verarbeitet. ' +
            'Näheres in der <a href="/datenschutz/" target="_blank" rel="noopener">Datenschutzerklärung</a>.</p>' +
          '<p class="rechner__status" id="r-status" role="status" aria-live="polite" hidden></p>';
      }
    }
  ];

  // Eckdaten in der Zusammenfassung
  function nachAktualisieren(api) {
    var info = api.el('#r-gruppe-info');
    if (!info) return;
    var d = api.feldWert('date'), t = api.feldWert('time'), b = api.feldWert('begleitung'), tag = wochentag(d);
    info.textContent = kinder(api) + ' Kinder · ' + (b === '' ? '?' : b) + ' Begleitpersonen' +
      (tag ? ' · ' + TAGE[tag % 7] + ', ' + d.split('-').reverse().join('.') : '') +
      (t ? ' · voraussichtliche Ankunft ' + t + ' Uhr' : '');
  }

  TjRechner.starte({
    name: 'kindergeburtstag',
    configUrl: '/data/kindergeburtstag-preise.json',
    autoOeffnen: true,
    planenPfad: '/kindergeburtstag/planen/',
    broschuerePfad: '/kindergeburtstag/',
    ohneSumme: true,
    state: {},
    schritte: schritte,
    personen: kinder,
    ereignisse: {},
    nachAktualisieren: nachAktualisieren,
    sendenText: 'Kindergeburtstag unverbindlich anfragen',
    feldSchritt: { guests: 'gruppe', begleitung: 'gruppe', date: 'gruppe', time: 'gruppe',
                   name: 'kontakt', email: 'kontakt', phone: 'kontakt', message: 'kontakt', auswahl: 'anfrage' }
  });
})();
