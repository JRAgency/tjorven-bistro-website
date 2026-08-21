/* ============================================================
   ABHOLMONITOR — Anzeige aktuell halten
   Fragt den Serverstand regelmässig ab und zeichnet nur neu, wenn sich
   wirklich etwas geändert hat. Kein Framework, keine externen Aufrufe.
   ============================================================ */
(function () {
  'use strict';

  var POLL_MS     = 4000;   /* Abstand der Serverabfragen */
  var PAGE_MS     = 5000;   /* Seitenwechsel, wenn eine Spalte nicht auf eine Seite passt */
  var DENSITY_MAX = 7;      /* letzte Stufe der Dichteleiter = kleinste zugelassene Ziffern */
  var EPS         = 0.02;   /* Toleranz gegen Rundungsrauschen bei Bruchteil-Pixeln */
  var ZU_BREIT    = 1e9;    /* Kennzahl: Karte passt nicht einmal in die Spaltenbreite */

  var listPrep   = document.getElementById('list-prep');
  var listReady  = document.getElementById('list-ready');
  var emptyPrep  = document.getElementById('empty-prep');
  var emptyReady = document.getElementById('empty-ready');
  var statusEl   = document.getElementById('status');
  var clockEl    = document.getElementById('clock');

  if (!listPrep || !listReady) return;

  /* ---- Uhr ---- */
  function tickClock() {
    if (!clockEl) return;
    var d = new Date();
    clockEl.textContent = String(d.getHours()).padStart(2, '0') + ':' +
                          String(d.getMinutes()).padStart(2, '0');
  }
  tickClock();
  setInterval(tickClock, 20000);

  /* ============================================================
     Adaptive Verdichtung

     Der Normalfall bleibt unangetastet: Stufe 0 ist exakt die grosse
     Darstellung. Erst wenn die Nummern nicht mehr auf eine Seite passen,
     schaltet das Skript eine Stufe weiter — zuerst engere Abstaende, dann
     kleinere Ziffern (siehe Dichteleiter in monitor.css). Reicht auch die
     kleinste zugelassene Groesse nicht, wird geblaettert. Dauerhaft
     versteckt wird dabei keine einzige Bestellung.
     ============================================================ */

  function makeColumn(list, indicator) {
    return {
      list:  list,
      col:   list.parentNode,                              /* .mon__col */
      head:  list.parentNode.querySelector('.mon__colhead'),
      ind:   indicator,
      pages: [],
      page:  0
    };
  }

  var columns = [
    makeColumn(listPrep,  document.getElementById('pages-prep')),
    makeColumn(listReady, document.getElementById('pages-ready'))
  ];

  /* Auf schmalen Bildschirmen darf die Seite scrollen — dort wird weder
     verdichtet noch geblaettert. Die Entscheidung steht in monitor.css,
     damit es nur eine Quelle der Wahrheit gibt. */
  function adaptive() {
    return getComputedStyle(document.body).getPropertyValue('--am-adaptive').trim() === '1';
  }

  function itemsOf(c) { return c.list.querySelectorAll('.mon__nr'); }

  function setDensity(d) {
    if (d <= 0) document.body.removeAttribute('data-density');
    else        document.body.setAttribute('data-density', String(d));
  }

  /* Misst die aktuelle Stufe aus: Kartenbreiten, Kartenhoehe, verfuegbarer
     Platz. Die Hoehe wird aus der Spalte gerechnet und nicht aus der Liste
     selbst — die Liste ist ein schrumpfendes Flex-Element und meldet sonst
     ihre Inhaltshoehe statt des tatsaechlich freien Platzes. */
  function metrics(c) {
    var items  = itemsOf(c);
    var listSt = getComputedStyle(c.list);
    var rowGap = parseFloat(listSt.rowGap) || 0;
    var colGap = parseFloat(listSt.columnGap) || rowGap;

    /* Bewusst getBoundingClientRect statt offsetWidth: offsetWidth rundet auf
       ganze Pixel. Vier Karten zu je 151,313px passen nicht in 634px — mit
       gerundeten 151px sieht die Rechnung es aber so, und eine Zeile mehr
       faellt unter die Unterkante. */
    var widths = [], itemH = 0, maxW = 0, i, r;
    for (i = 0; i < items.length; i++) {
      r = items[i].getBoundingClientRect();
      widths.push(r.width);
      if (r.width  > maxW)  maxW  = r.width;
      if (r.height > itemH) itemH = r.height;
    }

    var colSt = getComputedStyle(c.col);
    var headH = 0;
    if (c.head) {
      headH = c.head.getBoundingClientRect().height +
              (parseFloat(getComputedStyle(c.head).marginBottom) || 0);
    }
    var availH = c.col.getBoundingClientRect().height
               - (parseFloat(colSt.borderTopWidth) || 0)
               - (parseFloat(colSt.borderBottomWidth) || 0)
               - (parseFloat(colSt.paddingTop) || 0)
               - (parseFloat(colSt.paddingBottom) || 0)
               - headH;
    if (availH < 0) availH = 0;

    return {
      widths:  widths,
      maxW:    maxW,
      availW:  c.list.getBoundingClientRect().width,
      colGap:  colGap,
      maxRows: itemH > 0 ? Math.max(1, Math.floor((availH + rowGap + EPS) / (itemH + rowGap))) : 1
    };
  }

  /* Passt die breiteste Karte ueberhaupt in die Spalte? Sonst wuerde sie
     seitlich abgeschnitten — dann muss eine Stufe weiter verdichtet werden. */
  function tooWide(m) { return m.maxW > m.availW + EPS; }

  /* Sortierschluessel fuer die Dichtesuche: benoetigte Seiten, oder ein
     unerreichbar hoher Wert, wenn schon die Breite nicht passt. */
  function pagesNeeded(m) {
    return tooWide(m) ? ZU_BREIT : Math.max(1, splitPages(m, Infinity).length);
  }

  /* Bildet den Zeilenumbruch von flex-wrap nach und teilt die Karten in
     Seiten auf. Rechnen statt probeweise rendern: das kostet keinen
     zusaetzlichen Layoutdurchlauf und liefert dasselbe Ergebnis.
     maxPerPage deckelt zusaetzlich die Anzahl je Seite (siehe splitBalanced). */
  function splitPages(m, maxPerPage) {
    var pages = [], page = [], rows = 1, used = 0, i, w;
    for (i = 0; i < m.widths.length; i++) {
      w = m.widths[i];
      if (page.length === 0) {                             /* erste Karte einer Seite */
        page.push(i); used = w; rows = 1;
      } else if (page.length >= maxPerPage) {              /* Seitendeckel erreicht */
        pages.push(page); page = [i]; used = w; rows = 1;
      } else if (used + m.colGap + w <= m.availW + EPS) {  /* passt noch in die Zeile */
        page.push(i); used += m.colGap + w;
      } else if (rows < m.maxRows) {                       /* naechste Zeile */
        page.push(i); used = w; rows++;
      } else {                                             /* Seite ist voll */
        pages.push(page); page = [i]; used = w; rows = 1;
      }
    }
    if (page.length) pages.push(page);
    return pages;
  }

  /* Wird geblaettert, sollen die Seiten gleich voll sein: 45 Nummern auf
     zwei Seiten ergeben 23 und 22 — nicht 40 und 5. Kommt die gleichmaessige
     Aufteilung wider Erwarten mit mehr Seiten heraus, gilt die urspruengliche. */
  function splitBalanced(m) {
    var pages = splitPages(m, Infinity);
    if (pages.length <= 1) return pages;
    var even = splitPages(m, Math.ceil(m.widths.length / pages.length));
    return even.length === pages.length ? even : pages;
  }

  function showPage(c) {
    var total = c.pages.length;
    if (c.page >= total) c.page = 0;
    var on = total ? c.pages[c.page] : [];
    var onPage = {}, items = itemsOf(c), i;
    for (i = 0; i < on.length; i++) onPage[on[i]] = true;
    for (i = 0; i < items.length; i++) items[i].hidden = total > 1 && !onPage[i];

    if (c.ind) {
      c.ind.textContent = total > 1 ? (c.page + 1) + ' / ' + total : '';
      c.ind.hidden = total <= 1;
    }
    /* Beim Blaettern nicht alle fuenf Sekunden die halbe Liste vorlesen lassen. */
    c.list.setAttribute('aria-live', total > 1 ? 'off' : 'polite');
  }

  /* Ragt eine sichtbare Karte ueber die Unterkante der Liste hinaus?
     Bewusst ueber die tatsaechliche Unterkante gemessen — scrollHeight
     weicht bei list-item-Boxen um ein paar Pixel ab und wuerde staendig
     falschen Alarm ausloesen. */
  function overflows(c) {
    var items = itemsOf(c), i, bottom = null, r;
    var box = c.list.getBoundingClientRect().top + c.list.clientHeight;
    for (i = 0; i < items.length; i++) {
      if (items[i].hidden) continue;
      r = items[i].getBoundingClientRect().bottom;
      if (bottom === null || r > bottom) bottom = r;
    }
    return bottom !== null && bottom > box + 1;
  }

  /* Blendet der Reihe nach jede Seite ein und meldet den Index der ersten,
     die unten ueberlaeuft — oder -1, wenn alle passen. Laeuft synchron in
     einem einzigen Task ab, es wird zwischendurch nichts gezeichnet. */
  function fullestPage(c) {
    if (c.pages.length <= 1) return overflows(c) ? 0 : -1;
    var saved = c.page, p, bad = -1;
    for (p = 0; p < c.pages.length; p++) {
      c.page = p;
      showPage(c);
      if (overflows(c)) { bad = p; break; }
    }
    c.page = saved;
    showPage(c);
    return bad;
  }

  var pageTimer = null;

  function stopRotation() {
    if (pageTimer) { clearInterval(pageTimer); pageTimer = null; }
  }

  function rotate() {
    var i, c, moved = false;
    for (i = 0; i < columns.length; i++) {
      c = columns[i];
      if (c.pages.length > 1) {
        c.page = (c.page + 1) % c.pages.length;
        showPage(c);
        moved = true;
      }
    }
    if (!moved) stopRotation();
  }

  var lastViewport = '';

  function viewport() { return window.innerWidth + 'x' + window.innerHeight; }

  function relayout() {
    var i, j, items;
    lastViewport = viewport();

    if (!adaptive()) {
      document.body.removeAttribute('data-density');
      stopRotation();
      for (i = 0; i < columns.length; i++) { columns[i].pages = []; columns[i].page = 0; showPage(columns[i]); }
      return;
    }

    /* Vor dem Messen alles einblenden, sonst misst man nur die aktuelle Seite. */
    for (i = 0; i < columns.length; i++) {
      items = itemsOf(columns[i]);
      for (j = 0; j < items.length; j++) items[j].hidden = false;
    }

    /* Schritt 1: die groesste Darstellung suchen, bei der noch alles auf
       eine Seite passt. Im Normalfall endet die Suche sofort bei Stufe 0. */
    var measured = null, needed = [], d;
    for (d = 0; d <= DENSITY_MAX; d++) {
      setDensity(d);
      measured = columns.map(metrics);
      needed[d] = measured.map(pagesNeeded);
      if (needed[d].every(function (n) { return n <= 1; })) break;
    }

    /* Schritt 2: Reicht auch die kleinste zugelassene Groesse nicht, wird
       geblaettert. Dann muessen die Ziffern aber nicht klein bleiben — es
       gilt die groesste Darstellung, die mit derselben Seitenzahl auskommt.
       45 Nummern brauchen so zwei Seiten in grosser Schrift statt zwei
       Seiten in der kleinsten. */
    if (d > DENSITY_MAX) {
      var floorPages = needed[DENSITY_MAX];
      /* Passt selbst auf der kleinsten Stufe eine Karte nicht in die Spalte,
         gibt es nichts abzuwaegen — dann gilt die kleinste Stufe. */
      if (floorPages.some(function (n) { return n >= ZU_BREIT; })) {
        d = DENSITY_MAX;
      } else {
        for (d = 0; d < DENSITY_MAX; d++) {
          var enough = true;
          for (i = 0; i < floorPages.length; i++) {
            if (needed[d][i] > floorPages[i]) { enough = false; break; }
          }
          if (enough) break;
        }
      }
      setDensity(d);
      measured = columns.map(metrics);
    }

    for (i = 0; i < columns.length; i++) {
      columns[i].pages = splitBalanced(measured[i]);
      showPage(columns[i]);
    }

    /* Sicherheitsnetz: nachmessen statt der Vorausberechnung vertrauen.
       Geprueft wird JEDE Seite, nicht nur die gerade sichtbare — sonst
       koennte eine spaetere Seite mit breiteren Nummern (z. B. dreistellige
       nach zweistelligen) unbemerkt unten ueberlaufen. Findet sich ein
       Ueberlauf, wird lieber eine Seite mehr gebildet. */
    for (i = 0; i < columns.length; i++) {
      var cc = columns[i], guard = 0, voll;
      while ((voll = fullestPage(cc)) !== -1 && guard++ < 25) {
        if (cc.pages[voll].length <= 1) break;
        cc.pages = splitPages(measured[i], cc.pages[voll].length - 1);
        if (cc.page >= cc.pages.length) cc.page = 0;
        showPage(cc);
      }
    }

    /* Die Blaetter-Uhr NICHT bei jeder Bestellaenderung neu starten: sonst
       beginnt der 5-Sekunden-Zaehler im Ansturm staendig von vorn und die
       zweite Seite bekaeme nie ihren Auftritt. */
    if (!columns.some(function (c) { return c.pages.length > 1; })) {
      stopRotation();
    } else if (!pageTimer) {
      pageTimer = setInterval(rotate, PAGE_MS);
    }
  }

  /* ---- Zustand zeichnen ---- */
  var lastSignature = null;

  function render(prep, ready) {
    var signature = JSON.stringify([prep.map(o => o.nr), ready.map(o => o.nr)]);
    if (signature === lastSignature) return;
    lastSignature = signature;

    listPrep.replaceChildren.apply(listPrep, prep.map(function (o) {
      var li = document.createElement('li');
      li.className = 'mon__nr';
      li.textContent = o.nr;
      return li;
    }));

    listReady.replaceChildren.apply(listReady, ready.map(function (o) {
      var li = document.createElement('li');
      li.className = 'mon__nr mon__nr--ready';
      li.textContent = o.nr;
      return li;
    }));

    if (emptyPrep)  emptyPrep.hidden  = prep.length > 0;
    if (emptyReady) emptyReady.hidden = ready.length > 0;

    relayout();
  }

  /* ---- Abfrage ---- */
  var failures = 0;
  function poll() {
    fetch('api.php?action=state', { headers: { 'Accept': 'application/json' }, cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.ok) throw new Error('ungueltige Antwort');
        failures = 0;
        if (statusEl) statusEl.textContent = '';
        render(data.prep || [], data.ready || []);
        /* Zweiter Weg neben resize/ResizeObserver: hat sich die Bildschirm-
           groesse seit dem letzten Einpassen geaendert, hier nachziehen.
           Ein Fernseher, der die Aufloesung wechselt, faellt so nie durch. */
        if (lastViewport !== viewport()) relayout();
      })
      .catch(function () {
        failures++;
        /* Erst nach mehreren Fehlschlägen melden — ein kurzer Aussetzer
           soll auf dem Fernseher keine Meldung erzeugen. */
        if (failures >= 3 && statusEl) {
          statusEl.textContent = 'Verbindung zum Server unterbrochen — Anzeige eventuell nicht aktuell.';
        }
      });
  }

  /* Der Server hat bereits alles gerendert — einmal einpassen, dann pollen. */
  relayout();
  poll();
  setInterval(poll, POLL_MS);

  /* Nach dem Aufwachen aus dem Hintergrund sofort aktualisieren */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) poll();
  });

  /* Bildschirmgroesse oder nachgeladene Schrift aendern die Kartenmasse. */
  var resizeTimer = null;
  function relayoutSoon() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(relayout, 200);
  }
  window.addEventListener('resize', relayoutSoon);
  /* ResizeObserver meldet auch Groessenaenderungen, bei denen kein
     resize-Ereignis am Fenster ankommt. Er reagiert bewusst nur auf eine
     wirklich andere Bildschirmgroesse — sonst koennte das Einpassen sich
     selbst immer wieder neu ausloesen. */
  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      if (lastViewport !== viewport()) relayoutSoon();
    }).observe(document.querySelector('.mon__grid') || document.body);
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(relayout).catch(function () {});
  }
})();
