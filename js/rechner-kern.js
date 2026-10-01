/* ============================================================
   TJORVEN BISTRO — gemeinsamer Kern der Preisrechner
   (Catering-Broschüre und Kindergeburtstag-Broschüre)

   Der Kern kümmert sich um Dialog, Schritte, Fortschritt,
   laufende Summe, Fehleranzeige und Versand. Was gefragt und
   wie gerechnet wird, legt die jeweilige Definition fest
   (js/catering-rechner.js bzw. js/kindergeburtstag-rechner.js).
   Maßgeblich ist immer die Berechnung auf dem Server.
   ============================================================ */

(function () {
  'use strict';

  var euroFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  function euro(cent) { return euroFmt.format(cent / 100); }
  function zahl(n) { return String(n).replace('.', ','); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // Beide Planer: Die Anfrage ist noch keine Reservierung oder Buchung
  var UNVERBINDLICH = 'Die angezeigte Kostenschätzung ist unverbindlich. Mit dem Absenden stellst du zunächst eine Anfrage. ' +
    'Eine Reservierung bzw. Buchung kommt erst nach ausdrücklicher Bestätigung durch das Tjorven Bistro zustande.';
  function unverbindlichHtml(text) {
    return '<div class="rechner__verbindlich" role="note"><strong>Noch keine Reservierung.</strong> ' + esc(text || UNVERBINDLICH) + '</div>';
  }

  function heute() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function starte(def) {
    var dialog  = document.getElementById('rechner');
    var openBtn = document.getElementById('rechner-oeffnen');
    var form    = document.getElementById('rechner-form');
    if (!dialog || !openBtn || !form || typeof dialog.showModal !== 'function') {
      // Sehr alte Browser ohne <dialog>: dann bleibt der Weg über PDF und Kontakt
      if (openBtn) openBtn.addEventListener('click', function () { window.location.href = 'kontakt.html'; });
      return;
    }

    function $(id) { return document.getElementById(id); }
    var inhalt       = $('rechner-inhalt');
    var fText        = $('rechner-fortschritt-text');
    var fBalken      = $('rechner-fortschritt-balken');
    var summeEl      = $('rechner-summe');
    var summeHinweis = $('rechner-summe-hinweis');
    var aufklapp     = $('rechner-aufklapp');
    var aufschl      = $('rechner-aufschluesselung');
    var liveEl       = $('rechner-live');
    var btnZurueck   = $('rechner-zurueck');
    var btnWeiter    = $('rechner-weiter');
    var btnSenden    = $('rechner-senden');
    var mehrBtn      = $('rechner-mehr');
    var sendeHinweis = $('rechner-sende-hinweis');
    // Planer ohne Preisberechnung (reine Anfrage): keine Summe, keine Aufschlüsselung im Fuß
    if (def.ohneSumme) {
      var summeZeile = form.querySelector('.rechner__summe');
      if (summeZeile) summeZeile.hidden = true;
      aufschl.hidden = true;
      form.classList.add('rechner__form--ohne-summe');
    }

    var cfg = null;
    var ladeVersprechen = null;
    var gesendet = false;
    var aktuell = def.schritte[0].id;
    var ZU_KEY = 'tj-rechner-geschlossen-' + def.name;

    /* ---------- Schnittstelle für die Definition ---------- */

    var api = {
      cfg: function () { return cfg; },
      state: def.state,
      euro: euro, zahl: zahl, esc: esc, heute: heute,
      feldWert: function (name) { var el = form.elements[name]; return el ? String(el.value).trim() : ''; },
      personen: function () { return cfg ? def.personen(api) : 0; },
      neuZeichnen: neuZeichnen,
      aktualisieren: aktualisieren,
      fehlerAn: fehlerAn,
      fehlerLoeschen: fehlerLoeschen,
      el: function (sel) { return inhalt.querySelector(sel); }
    };

    /* ---------- Schritte ---------- */

    function schrittDef(id) { for (var i = 0; i < def.schritte.length; i++) if (def.schritte[i].id === id) return def.schritte[i]; return null; }
    function sichtbare() { return def.schritte.filter(function (s) { return !s.sichtbar || s.sichtbar(api); }); }
    function position(id) { var l = sichtbare(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return i; return -1; }
    function schrittEl(id) { return inhalt.querySelector('.rechner__schritt[data-schritt="' + id + '"]'); }
    function koerper(id) { return schrittEl(id).querySelector('[data-schritt-koerper]'); }

    function aufbauen() {
      inhalt.innerHTML = def.schritte.map(function (s) {
        return '<section class="rechner__schritt" data-schritt="' + s.id + '" hidden>' +
          '<h3 class="rechner__schritt-titel" tabindex="-1" data-schritt-titel><span class="sr-only" data-schritt-nr></span>' +
          esc(s.titel) + '</h3><div data-schritt-koerper></div></section>';
      }).join('');
      // Schritte mit Formularfeldern (name-Attribut) nur einmal zeichnen, damit Eingaben erhalten bleiben
      def.schritte.forEach(function (s) { if (s.statisch) koerper(s.id).innerHTML = s.html(api); });
      var datum = form.querySelector('input[type="date"][name="date"]');
      if (datum) datum.min = heute();
      if (beobachter) inhalt.querySelectorAll('.rechner__schritt').forEach(function (s) { beobachter.observe(s); });
    }

    function neuZeichnen(id) {
      var s = schrittDef(id);
      if (!s || s.statisch || !cfg) return;
      var fokusId = document.activeElement && inhalt.contains(document.activeElement) ? document.activeElement.id : '';
      koerper(id).innerHTML = s.html(api);
      if (fokusId) { var f = document.getElementById(fokusId); if (f) f.focus({ preventScroll: true }); }
      neuMessen();
    }

    function knoepfe(letzter) {
      btnWeiter.hidden = letzter || gesendet;
      btnSenden.hidden = !letzter || gesendet;
      if (sendeHinweis) sendeHinweis.hidden = btnSenden.hidden;
      neuMessen();
    }

    function fortschritt() {
      var l = sichtbare(), i = position(aktuell);
      knoepfe(i === l.length - 1);
      var text = 'Schritt ' + (i + 1) + ' von ' + l.length;
      fText.textContent = text;
      fBalken.style.width = ((i + 1) / l.length * 100) + '%';
      var nr = schrittEl(aktuell).querySelector('[data-schritt-nr]');
      if (nr) nr.textContent = text + ': ';
    }

    function zeigeSchritt(id, fokus) {
      if (position(id) === -1) id = sichtbare()[0].id;
      aktuell = id;
      mehrAus();
      def.schritte.forEach(function (s) { schrittEl(s.id).hidden = s.id !== id; });
      neuZeichnen(id);
      fortschritt();
      btnZurueck.disabled = position(id) === 0 && !gesendet;
      inhalt.scrollTop = 0;
      aktualisieren();
      if (fokus !== false) {
        var t = schrittEl(id).querySelector('[data-schritt-titel]');
        if (t) t.focus({ preventScroll: true });
      }
    }

    function naechster(richtung) {
      var l = sichtbare(), i = position(aktuell) + richtung;
      return l[Math.max(0, Math.min(l.length - 1, i))].id;
    }

    function pruefe(id) {
      fehlerLoeschen(schrittEl(id));
      var s = schrittDef(id);
      var fehler = s && s.pruefe ? s.pruefe(api) : null;
      if (!fehler) return true;
      var el = fehlerAn(fehler.feld, fehler.text);
      if (el) el.focus();
      return false;
    }

    /* ---------- Hinweis „Weitere Optionen ↓“ ----------
       Nur sichtbar, wenn im aktuellen Schritt unterhalb des sichtbaren Bereichs
       tatsächlich noch Inhalt liegt – gemessen am echten Layout, nicht an festen
       Höhen. Nie bei geöffneter Aufschlüsselung. Der Hinweis sitzt auf der Ober-
       kante des Fußes und ragt höchstens MEHR_UEBERLAPPUNG px in den Inhalt
       (nicht mehr als dessen Innenabstand unten, siehe css/broschuere.css). */

    var fuss = form.querySelector('.rechner__fuss');
    var MEHR_UEBERLAPPUNG = 12;
    var inhaltEnde = 0;       // Unterkante des tiefsten sichtbaren Elements im Schritt, in Inhaltskoordinaten
    var messPlan = 0;

    function messeInhalt() {
      inhaltEnde = 0;
      var s = cfg ? schrittEl(aktuell) : null;
      if (!s || s.hidden) return;
      var oben = inhalt.getBoundingClientRect().top + inhalt.clientTop - inhalt.scrollTop;
      s.querySelectorAll('*').forEach(function (e) {
        if (!e.offsetParent || e.closest('.sr-only')) return;
        var r = e.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) inhaltEnde = Math.max(inhaltEnde, r.bottom - oben);
      });
    }

    function pruefeScroll() {
      if (fuss) form.style.setProperty('--fuss-h', fuss.offsetHeight + 'px');
      var zeigen = false;
      if (dialog.open && aufschl.hidden && inhaltEnde > 0) {
        var sichtbarBis = inhalt.scrollTop + inhalt.clientHeight - MEHR_UEBERLAPPUNG;
        var amEnde = inhalt.scrollHeight - inhalt.clientHeight - inhalt.scrollTop < 2;
        zeigen = !amEnde && inhaltEnde > sichtbarBis + 1;
      }
      if (mehrBtn.hidden === zeigen) mehrBtn.hidden = !zeigen;
    }

    // Layout neu messen – gebündelt auf den nächsten Frame, damit nichts flackert
    function neuMessen() {
      if (messPlan) return;
      messPlan = requestAnimationFrame(function () { messPlan = 0; messeInhalt(); pruefeScroll(); });
    }
    // Sofort ausblenden (z. B. beim Schrittwechsel) und danach neu bewerten
    function mehrAus() { mehrBtn.hidden = true; neuMessen(); }

    inhalt.addEventListener('scroll', pruefeScroll, { passive: true });
    window.addEventListener('resize', neuMessen);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', neuMessen);
    // Höhenänderungen von Inhalt, Fuß oder Schritt (z. B. Aufschlüsselung, höhere Karten)
    var beobachter = window.ResizeObserver ? new ResizeObserver(neuMessen) : null;
    if (beobachter) { beobachter.observe(inhalt); if (fuss) beobachter.observe(fuss); }
    mehrBtn.addEventListener('click', function () {
      inhalt.scrollBy({ top: inhalt.clientHeight * 0.7, behavior: 'smooth' });
    });

    /* ---------- Fehleranzeige direkt am Feld ---------- */

    function fehlerLoeschen(scope) {
      scope = scope || inhalt;
      scope.querySelectorAll('.rechner__fehler').forEach(function (e) { e.remove(); });
      scope.querySelectorAll('.rechner__feld--fehler').forEach(function (e) { e.classList.remove('rechner__feld--fehler'); });
      if (scope.classList && scope.classList.contains('rechner__feld--fehler')) scope.classList.remove('rechner__feld--fehler');
      scope.querySelectorAll('[aria-invalid]').forEach(function (e) {
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
      if (!box) { statusSetzen(text, 'error'); return null; }
      box.classList.add('rechner__feld--fehler');
      var hint = document.createElement('p');
      hint.className = 'rechner__fehler';
      hint.id = 'fehler-' + feldName;
      hint.textContent = text;
      box.appendChild(hint);
      var input = box.querySelector('input, select, textarea') || box;
      if (input !== box) {
        input.setAttribute('aria-invalid', 'true');
        if (!input.hasAttribute('data-describedby-orig')) input.setAttribute('data-describedby-orig', input.getAttribute('aria-describedby') || '');
        input.setAttribute('aria-describedby', (input.getAttribute('data-describedby-orig') + ' ' + hint.id).trim());
      } else if (!box.hasAttribute('tabindex')) {
        box.setAttribute('tabindex', '-1');
      }
      hint.scrollIntoView({ block: 'nearest' });
      return input;
    }

    /* ---------- Laufende Summe und Aufschlüsselung ---------- */

    function berechnung() {
      if (def.ohneSumme) return null;
      var p = def.personen(api);
      return def.berechne(cfg, def.auswahl(api, p), p, api.feldWert('date'));
    }

    function tabelle(calc, mitAendern) {
      if (!calc.positionen.length) return '<p class="rechner__leer">' + esc(def.leerText) + '</p>';
      var rows = calc.positionen.map(function (x) {
        var vor = x.ab ? 'ab ' : '';
        var aendern = mitAendern && x.schritt && !gesendet
          ? '<button type="button" class="rechner__aendern" data-geh-zu="' + x.schritt + '">Ändern<span class="sr-only">: ' + esc(x.titel) + '</span></button>'
          : '';
        var details = x.details && x.details.length
          ? '<ul class="rechner__details">' + x.details.map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('') + '</ul>'
          : '';
        return '<tr><td>' + esc(x.titel) + '<small>' + esc(def.mengenText(x)) + ' × ' + vor + esc(euro(x.einzel)) + '</small>' + details + aendern +
          '</td><td>' + vor + esc(euro(x.summe)) + '</td></tr>';
      }).join('');
      var hinw = calc.hinweise.length
        ? '<div class="rechner__hinweis rechner__hinweis--liste"><strong>' + esc(def.hinweiseTitel) + ':</strong><ul>' +
          calc.hinweise.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>'
        : '';
      return '<table class="rechner__tabelle"><tbody>' + rows + '</tbody>' +
        '<tfoot><tr><td>Voraussichtliche Kostenschätzung</td><td>' + esc(def.summeText(calc)) + '</td></tr></tfoot></table>' +
        '<p class="rechner__feld-hinweis">' + esc(def.summeHinweisLang(calc)) + '</p>' + hinw;
    }

    var liveTimer = null;
    function aktualisieren() {
      if (!cfg) return null;
      var calc = berechnung();
      if (calc) {
        var text = def.summeText(calc);
        summeEl.textContent = text;
        summeHinweis.textContent = def.summeHinweis(calc);
        if (!aufschl.hidden) aufschl.innerHTML = tabelle(calc, true);
        var zus = document.getElementById('r-zusammenfassung');
        if (zus && !gesendet) zus.innerHTML = tabelle(calc, true);
        clearTimeout(liveTimer);
        liveTimer = setTimeout(function () { liveEl.textContent = 'Voraussichtliche Kostenschätzung: ' + text; }, 700);
      }
      if (def.nachAktualisieren) def.nachAktualisieren(api, calc);
      if (position(aktuell) !== -1 && !gesendet) fortschritt();   // Menüwahl kann Schritte ein- oder ausblenden
      neuMessen();
      return calc;
    }

    aufklapp.addEventListener('click', function () {
      var offen = aufklapp.getAttribute('aria-expanded') === 'true';
      aufklapp.setAttribute('aria-expanded', String(!offen));
      aufschl.hidden = offen;
      if (!offen) aufschl.innerHTML = tabelle(berechnung(), true);
      // Geöffnet: Hinweis aus. Geschlossen: Layout neu messen und nur bei Bedarf wieder zeigen
      mehrAus();
    });

    /* ---------- Eingaben ---------- */

    function feldFehlerWeg(t) {
      var feld = t.closest('.rechner__feld--fehler');
      if (feld) fehlerLoeschen(feld);
    }
    inhalt.addEventListener('input', function (e) {
      if (def.ereignisse.input) def.ereignisse.input(e, api);
      feldFehlerWeg(e.target);
      aktualisieren();
    });
    inhalt.addEventListener('change', function (e) {
      if (def.ereignisse.change) def.ereignisse.change(e, api);
      feldFehlerWeg(e.target);
      aktualisieren();
    });
    function springe(e) {
      var b = e.target.closest('[data-geh-zu]');
      if (!b || gesendet) return false;
      if (aufklapp.getAttribute('aria-expanded') === 'true') aufklapp.click();
      zeigeSchritt(b.dataset.gehZu);
      return true;
    }
    inhalt.addEventListener('click', function (e) {
      // Datum/Uhrzeit: Tippen irgendwo ins Feld öffnet den nativen Picker (neuere Android-/Chrome-
      // Versionen reagieren sonst teils nur auf das kleine Symbol). Ohne showPicker() oder wenn der
      // Browser den Aufruf ablehnt, bleibt das normale Verhalten des Feldes.
      var t = e.target;
      if (t && t.matches && t.matches('input[type="date"]:not([disabled]):not([readonly]), input[type="time"]:not([disabled]):not([readonly])') && typeof t.showPicker === 'function') {
        try { t.showPicker(); } catch (err) { /* normales Verhalten */ }
      }
      if (springe(e)) return;
      if (def.ereignisse.click) def.ereignisse.click(e, api);
    });
    aufschl.addEventListener('click', springe);

    /* ---------- Navigation ---------- */

    btnWeiter.addEventListener('click', function () {
      if (!pruefe(aktuell)) return;
      zeigeSchritt(naechster(1));
    });
    btnZurueck.addEventListener('click', function () {
      if (gesendet) { schliessen(); return; }
      zeigeSchritt(naechster(-1));
    });

    /* ---------- Öffnen / Schließen ---------- */

    function laden() {
      if (!ladeVersprechen) {
        ladeVersprechen = fetch(def.configUrl, { headers: { 'Accept': 'application/json' } })
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (json) {
            cfg = json;
            // Schritte, die sich aus der Konfiguration ergeben (z. B. Kategorien der Speisekarte)
            if (def.schritteAusConfig) def.schritte = def.schritteAusConfig(cfg);
            aufbauen();
            zeigeSchritt(def.schritte[0].id, dialog.open);
          })
          .catch(function () {
            ladeVersprechen = null;
            inhalt.innerHTML = '<p class="rechner__status rechner__status--error">Die Angaben konnten gerade nicht geladen werden. ' +
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
        var t = schrittEl(aktuell).querySelector('[data-schritt-titel]');
        if (t) t.focus({ preventScroll: true });
        mehrAus();
      } else {
        inhalt.focus({ preventScroll: true });
        laden();
      }
    }
    function schliessen() { if (dialog.open) dialog.close(); }

    openBtn.addEventListener('click', oeffnen);
    dialog.querySelectorAll('[data-rechner-zu]').forEach(function (b) { b.addEventListener('click', schliessen); });
    // Klick neben das Panel schließt; alle Eingaben bleiben erhalten
    dialog.addEventListener('click', function (e) { if (e.target === dialog) schliessen(); });
    dialog.addEventListener('close', function () {
      document.documentElement.classList.remove('rechner-offen');
      try { sessionStorage.setItem(ZU_KEY, '1'); } catch (err) { /* ohne Speicher öffnet er beim Neuladen wieder */ }
      if (location.hash === '#rechner') history.replaceState(null, '', location.pathname + location.search);
      openBtn.focus({ preventScroll: true });
    });

    // Von selbst öffnet der Rechner nur auf großen Bildschirmen (Desktop, Tablet
    // quer): Dort liegt er ab 900px als Seitenpanel neben der Broschüre. Auf
    // Smartphones (auch quer) und Tablets hochkant füllt er den ganzen Bildschirm –
    // dort sieht man zuerst die Broschüre und öffnet den Planer über den Button.
    var AUTO_MEDIA = '(min-width: 900px) and (min-height: 600px)';
    function grosserBildschirm() {
      return !!(window.matchMedia && window.matchMedia(AUTO_MEDIA).matches);
    }

    // Beim Aufruf der Broschüre öffnet der Rechner von selbst – außer er wurde in
    // diesem Tab schon einmal geschlossen. Ist der Datenschutz-Hinweis noch offen,
    // wartet er, bis der Hinweis beantwortet ist.
    function automatisch() {
      if (!grosserBildschirm()) {
        if (location.hash === '#rechner') history.replaceState(null, '', location.pathname + location.search);
        return;
      }
      if (location.hash === '#rechner') { oeffnen(); return; }
      if (!def.autoOeffnen) return;
      var zu = false;
      try { zu = sessionStorage.getItem(ZU_KEY) === '1'; } catch (err) { zu = false; }
      if (zu) return;
      if (document.body.classList.contains('consent-open')) {
        var mo = new MutationObserver(function () {
          if (document.body.classList.contains('consent-open')) return;
          mo.disconnect();
          setTimeout(oeffnen, 400);
        });
        mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        return;
      }
      oeffnen();
    }
    automatisch();
    window.addEventListener('hashchange', function () { if (location.hash === '#rechner') oeffnen(); });

    /* ---------- Absenden ---------- */

    function statusSetzen(text, art) {
      var s = document.getElementById('r-status');
      if (!s) return;
      s.textContent = text;
      s.className = 'rechner__status rechner__status--' + art;
      s.hidden = false;
    }

    function sendenBereit() {
      btnSenden.disabled = false;
      btnSenden.textContent = def.sendenText;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!cfg || gesendet) return;
      fehlerLoeschen();
      var s = document.getElementById('r-status'); if (s) s.hidden = true;

      // Alle sichtbaren Schritte noch einmal prüfen; beim ersten Fehler dorthin springen
      var l = sichtbare();
      for (var i = 0; i < l.length; i++) {
        var f = l[i].pruefe ? l[i].pruefe(api) : null;
        if (f) { zeigeSchritt(l[i].id, false); pruefe(l[i].id); return; }
      }
      var calc = aktualisieren();
      var absendeFehler = def.pruefeAbsenden ? def.pruefeAbsenden(api, calc) : null;
      if (absendeFehler) { statusSetzen(absendeFehler, 'error'); return; }

      if (calc) {
        form.elements.auswahl.value = JSON.stringify(def.auswahl(api, def.personen(api)));
        form.elements.summe_anzeige.value = String(calc.summe);
      }

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
            var letzter = l[l.length - 1].id;
            koerper(letzter).innerHTML = '<div class="rechner__danke"><p class="rechner__danke-titel">Anfrage gesendet</p><p>' +
              esc(res.message) + '</p></div>' + (calc ? '<h4 class="rechner__label">Deine Auswahl</h4>' + tabelle(calc, false) : '');
            knoepfe(true);
            btnZurueck.textContent = 'Zurück zur Broschüre';
            btnZurueck.disabled = false;
            fText.textContent = 'Anfrage gesendet';
            fBalken.style.width = '100%';
            var t = schrittEl(letzter).querySelector('[data-schritt-titel]'); if (t) t.focus();
            return;
          }
          var errs = res.errors || {};
          var felder = Object.keys(errs);
          if (felder.length) {
            var ziel = def.feldSchritt[felder[0]] || l[l.length - 1].id;
            if (ziel !== aktuell) zeigeSchritt(ziel, false);
            var fokus = null;
            felder.forEach(function (fe) { var el = fehlerAn(fe, errs[fe]); fokus = fokus || el; });
            if (fokus) fokus.focus();
          }
          if (aktuell !== l[l.length - 1].id && !felder.length) zeigeSchritt(l[l.length - 1].id, false);
          statusSetzen(res.message || 'Bitte prüfe deine Eingaben.', 'error');
          sendenBereit();
        })
        .catch(function () {
          statusSetzen('Verbindung fehlgeschlagen. Bitte versuche es erneut oder schreib uns an kontakt@tjorven-bistro.de.', 'error');
          sendenBereit();
        });
    });

    // Für automatisierte Tests: reine Rechenfunktion ohne Oberfläche
    window.__tjRechner = window.__tjRechner || {};
    if (def.berechne) window.__tjRechner[def.name] = { berechne: def.berechne };
  }

  window.TjRechner = { starte: starte, euro: euro, zahl: zahl, esc: esc, unverbindlichHtml: unverbindlichHtml };
})();
