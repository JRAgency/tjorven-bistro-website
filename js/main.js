/* ============================================================
   TJORVEN BISTRO — Main JS v2
   ============================================================ */

/* --- Nav scroll --- */
const nav = document.getElementById('nav');

const onScroll = () => {
  nav?.classList.toggle('scrolled', window.scrollY > 30);
};
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* --- Mobile nav --- */
const navBurger = document.getElementById('navBurger');
const navDrawer = document.getElementById('navDrawer');

const setDrawer = (open) => {
  navDrawer.classList.toggle('open', open);
  navBurger.classList.toggle('open', open);
  navBurger.setAttribute('aria-expanded', String(open));
  navBurger.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
  document.body.style.overflow = open ? 'hidden' : '';
};

navBurger?.addEventListener('click', () => {
  setDrawer(!navDrawer.classList.contains('open'));
});

/* Escape schließt das Menü und gibt den Fokus zurück auf den Button */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && navDrawer?.classList.contains('open')) {
    setDrawer(false);
    navBurger?.focus();
  }
});

document.addEventListener('click', (e) => {
  if (!nav?.contains(e.target) && navDrawer?.classList.contains('open')) {
    navDrawer.classList.remove('open');
    navBurger?.classList.remove('open');
    document.body.style.overflow = '';
  }
});

/* close on link click */
navDrawer?.querySelectorAll('.nav__link').forEach(l => {
  l.addEventListener('click', () => {
    navDrawer.classList.remove('open');
    navBurger?.classList.remove('open');
    document.body.style.overflow = '';
  });
});

/* --- Active link --- */
(function () {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav__link').forEach(link => {
    const href = link.getAttribute('href') ?? '';
    link.classList.toggle('active', href === path || (path === '' && href === 'index.html'));
  });
})();

/* --- Scroll reveal --- */
const revealEls = document.querySelectorAll(
  '.reveal, .reveal-delay-1, .reveal-delay-2, .reveal-delay-3'
);

const prefersReducedMotion = window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : { matches: false };

if (!('IntersectionObserver' in window) || prefersReducedMotion.matches) {
  /* Ohne Observer bzw. bei reduzierter Bewegung alles sofort zeigen */
  revealEls.forEach(el => el.classList.add('visible'));
} else {
  const io = new IntersectionObserver(
    entries => entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        io.unobserve(e.target);
      }
    }),
    /* Positiver unterer rootMargin: Der Bereich startet, BEVOR er in den sichtbaren
       Bereich scrollt. Vorher lag hier -36px zusammen mit threshold 0.08 — ein Abschnitt
       musste also bereits zu 8 % im Bild sein, bevor die 0,65s-Animation überhaupt
       begann. Genau das ließ Inhalte beim Scrollen „verzögert" erscheinen. */
    { threshold: 0, rootMargin: '0px 0px 15% 0px' }
  );
  revealEls.forEach(el => io.observe(el));
}

/* --- Speisekarte sticky nav --- */
const menuBtns = document.querySelectorAll('.menu-nav__btn');
const menuSections = document.querySelectorAll('.menu-section[id]');

if (menuBtns.length && menuSections.length) {
  const menuNav = document.querySelector('.menu-nav');

  /* Sprungziel: unter der fixierten Kopfzeile UND unter der klebenden
     Tab-Leiste. Beides wird gemessen statt geraten, weil die Kopfhöhe
     inzwischen mit der Viewportbreite skaliert. */
  const stickyOffset = () => {
    const navH = document.getElementById('nav')?.offsetHeight ?? 0;
    const tabsH = menuNav?.offsetHeight ?? 0;
    return navH + tabsH + 12;
  };

  /* Aktiven Tab in der horizontal scrollbaren Leiste sichtbar halten */
  const revealActiveTab = () => {
    const active = [...menuBtns].find(b => b.classList.contains('active'));
    if (!active || !menuNav) return;
    const strip = menuNav.querySelector('.menu-nav__inner');
    if (!strip || strip.scrollWidth <= strip.clientWidth) return;
    const left = active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2;
    strip.scrollTo({ left: Math.max(0, left), behavior: prefersReducedMotion.matches ? 'auto' : 'smooth' });
  };

  const sectionIO = new IntersectionObserver(
    entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const id = e.target.id;
          menuBtns.forEach(b => b.classList.toggle('active', b.dataset.target === id));
          revealActiveTab();
        }
      });
    },
    { rootMargin: '-35% 0px -60% 0px', threshold: 0 }
  );

  menuSections.forEach(s => sectionIO.observe(s));

  menuBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      window.scrollTo({
        top: target.getBoundingClientRect().top + window.scrollY - stickyOffset(),
        behavior: prefersReducedMotion.matches ? 'auto' : 'smooth'
      });
    });
  });
}

/* --- Forms (placeholder handler) --- */
document.querySelectorAll('.form').forEach(form => {
  form.addEventListener('submit', e => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    if (btn) {
      btn.textContent = 'Nachricht gesendet ✓';
      btn.disabled = true;
      btn.style.opacity = '.65';
      btn.style.pointerEvents = 'none';
    }
  });
});

/* --- Dynamic footer year --- */
document.querySelectorAll('.footer-year').forEach(el => {
  el.textContent = new Date().getFullYear();
});

/* --- Portrait Slider (Food Story — Instagram/Story style) --- */
(function () {
  var AUTOPLAY_MS     = 5500;   // Standzeit eines Fotos
  var VIDEO_MIN_MS    = 7000;   // Videos bekommen mindestens so lange Zeit …
  var VIDEO_MAX_MS    = 14000;  // … und höchstens so lange
  var FALLBACK_GAP_PX = 16;     // nur falls die Lücke nicht auslesbar ist

  // Nutzer mit reduzierter Bewegung bekommen weder Auto-Weiterschaltung
  // noch automatisch startende Videos.
  var reducedMotion = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false, addEventListener: null };

  // Angemeldete Slider — die Lightbox hält sie beim Öffnen an
  var sliders = [];

  document.querySelectorAll('.portrait-slider').forEach(function (root) {
    var viewport  = root.querySelector('.portrait-slider__viewport');
    var track     = root.querySelector('.portrait-slider__track');
    var slides    = Array.from(root.querySelectorAll('.portrait-slider__slide'));
    var dotsWrap  = root.querySelector('.portrait-slider__dots');
    var btnPrev   = root.querySelector('.portrait-slider__btn--prev');
    var btnNext   = root.querySelector('.portrait-slider__btn--next');
    var capTag    = root.querySelector('.portrait-slider__tag');
    var capTitle  = root.querySelector('.portrait-slider__title');
    var capDesc   = root.querySelector('.portrait-slider__desc');

    if (!slides.length) return;

    var current = 0;
    var total   = slides.length;
    var timer   = null;
    var startX = 0, startY = 0, isDrag = false, dragDx = 0, dragDy = 0;
    var suppressClick = false;   // nach einem Drag darf kein Klick durchschlagen
    var hovering = false;        // Zeiger liegt auf dem Slider → nicht weiterschalten
    var inView = true;           // Slider im Sichtbereich? sonst Video + Timer anhalten
    var resizeT = null;

    // Build dots
    slides.forEach(function (_, i) {
      var d = document.createElement('button');
      d.className = 'portrait-slider__dot';
      d.setAttribute('aria-label', 'Slide ' + (i + 1));
      d.addEventListener('click', function () { goTo(i); });
      dotsWrap && dotsWrap.appendChild(d);
    });

    function slideWidth() {
      return slides[0] ? slides[0].offsetWidth : 0;
    }

    /* Lücke aus dem CSS lesen, damit Track-Gap und Rechnung nicht auseinanderlaufen */
    function gapPx() {
      if (!track) return FALLBACK_GAP_PX;
      var g = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap);
      return isNaN(g) ? FALLBACK_GAP_PX : g;
    }

    function calcOffset(idx) {
      var vw = viewport ? viewport.offsetWidth : root.offsetWidth;
      var sw = slideWidth();
      if (!sw) return 0;
      return (vw - sw) / 2 - idx * (sw + gapPx());
    }

    function updateCaption() {
      var s = slides[current];
      if (capTag)   capTag.textContent   = s.dataset.tag   || '';
      if (capTitle) capTitle.textContent = s.dataset.title || '';
      if (capDesc)  capDesc.textContent  = s.dataset.desc  || '';
    }

    /* Nur das Video des aktiven Slides läuft — stumm, in Schleife, inline.
       Alle anderen werden angehalten und zurückgesetzt. */
    function syncVideos() {
      slides.forEach(function (slide, i) {
        var video = slide.querySelector('video');
        if (!video) return;
        var badge  = slide.querySelector('.portrait-slider__play-badge');
        var isLive = i === current && inView && !reducedMotion.matches &&
                     !document.hidden && !lightboxOpen();

        if (isLive) {
          /* Erst wenn das Video wirklich gebraucht wird, darf es laden */
          if (video.preload !== 'auto') video.preload = 'auto';
          video.muted = true;          // Voraussetzung für Autoplay ohne Geste
          video.playsInline = true;
          var played = video.play();
          if (played && played.catch) {
            played.catch(function () {
              /* Browser hat Autoplay blockiert — Play-Hinweis bleibt sichtbar */
              if (badge) badge.classList.remove('is-playing');
            });
          }
          if (badge) badge.classList.add('is-playing');
        } else {
          video.pause();
          if (i !== current) {
            try { video.currentTime = 0; } catch (e) {}
          }
          if (badge) badge.classList.remove('is-playing');
        }
      });
    }

    function updateUI(instant) {
      /* instant = Sprung ohne Animation (Wrap-around und erste Darstellung) */
      if (instant) track.style.transition = 'none';

      var offset = calcOffset(current);
      track.style.transform = 'translateX(' + offset.toFixed(1) + 'px)';

      slides.forEach(function (s, i) {
        s.classList.toggle('active', i === current);
        var f = s.querySelector('.portrait-slider__frame');
        if (f) f.tabIndex = i === current ? 0 : -1;   // nur der aktive Rahmen ist Tab-Stopp
      });

      var dots = dotsWrap
        ? Array.from(dotsWrap.querySelectorAll('.portrait-slider__dot'))
        : [];
      dots.forEach(function (d, i) { d.classList.toggle('active', i === current); });

      if (instant) {
        void track.offsetWidth;      // Reflow erzwingen, bevor die Animation zurückkommt
        track.style.transition = '';
      }

      updateCaption();
      syncVideos();
    }

    function goTo(idx) {
      var next = ((idx % total) + total) % total;
      /* Beim Sprung vom letzten zum ersten Slide (und umgekehrt) würde der Track
         sonst sichtbar über alle neun Bilder zurückfahren. */
      var wrapped = (current === total - 1 && next === 0) ||
                    (current === 0 && next === total - 1);
      current = next;
      updateUI(wrapped);
      resetTimer();
    }

    /* Videos bekommen ungefähr eine volle Laufzeit, Fotos die kürzere Standzeit */
    function dwellMs() {
      var video = slides[current] && slides[current].querySelector('video');
      if (!video) return AUTOPLAY_MS;
      var dur = video.duration;
      if (!dur || isNaN(dur) || !isFinite(dur)) return VIDEO_MIN_MS;
      return Math.min(Math.max(dur * 1000, VIDEO_MIN_MS), VIDEO_MAX_MS);
    }

    function stopTimer() {
      clearTimeout(timer);
      timer = null;
    }

    function resetTimer() {
      stopTimer();
      if (reducedMotion.matches || document.hidden || hovering || !inView || lightboxOpen()) return;
      timer = setTimeout(function () { goTo(current + 1); }, dwellMs());
    }

    // Buttons
    btnPrev && btnPrev.addEventListener('click', function () { goTo(current - 1); });
    btnNext && btnNext.addEventListener('click', function () { goTo(current + 1); });

    /* Wischgeste. Nur auslösen, wenn die Bewegung überwiegend waagerecht war —
       sonst wechselt der Slider beim senkrechten Scrollen die Bilder. */
    function swipeEnd() {
      if (!isDrag) return;
      isDrag = false;
      var horizontal = Math.abs(dragDx) > 44 && Math.abs(dragDx) > Math.abs(dragDy) * 1.5;
      if (horizontal) {
        suppressClick = true;
        goTo(dragDx < 0 ? current + 1 : current - 1);
      }
    }

    // Touch swipe
    viewport && viewport.addEventListener('touchstart', function (e) {
      startX = e.touches[0].clientX; startY = e.touches[0].clientY;
      isDrag = true; dragDx = 0; dragDy = 0;
    }, { passive: true });
    viewport && viewport.addEventListener('touchmove', function (e) {
      if (!isDrag) return;
      dragDx = e.touches[0].clientX - startX;
      dragDy = e.touches[0].clientY - startY;
    }, { passive: true });
    viewport && viewport.addEventListener('touchend', swipeEnd);
    viewport && viewport.addEventListener('touchcancel', function () { isDrag = false; });

    // Mouse drag
    viewport && viewport.addEventListener('mousedown', function (e) {
      startX = e.clientX; startY = e.clientY;
      isDrag = true; dragDx = 0; dragDy = 0;
    });
    viewport && viewport.addEventListener('mousemove', function (e) {
      if (!isDrag) return;
      dragDx = e.clientX - startX;
      dragDy = e.clientY - startY;
    });
    viewport && viewport.addEventListener('mouseup', swipeEnd);
    viewport && viewport.addEventListener('mouseleave', function () { isDrag = false; });

    // Klick/Tastatur auf dem Rahmen: inaktiv → hinspringen; aktiv → Lightbox
    slides.forEach(function (slide, i) {
      var frame = slide.querySelector('.portrait-slider__frame');
      if (!frame) return;

      /* Der Rahmen wird per JS zum Bedienelement — kein Markup-Umbau nötig.
         Nur der aktive Slide ist ein Tab-Stopp (roving tabindex), sonst müsste
         man sich durch neun Rahmen hindurchtabben. */
      frame.setAttribute('role', 'button');
      frame.setAttribute('aria-label', 'Bild vergrößern: ' + (slide.dataset.title || ''));
      frame.tabIndex = i === 0 ? 0 : -1;

      function activate() {
        if (!slide.classList.contains('active')) goTo(i);
        else openLightbox(slide);
      }

      frame.addEventListener('click', function () {
        /* Ein Klick direkt nach einer Wischgeste würde sonst die Lightbox öffnen */
        if (suppressClick) { suppressClick = false; return; }
        activate();
      });
      frame.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
        e.preventDefault();   // Leertaste darf die Seite nicht scrollen
        activate();
      });
    });

    // Tastatur — greift nur, solange der Slider im Blickfeld ist und
    // keine Lightbox offen ist, damit die Pfeiltasten sonst frei bleiben.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (lightboxOpen()) return;
      /* Nicht eingreifen, während jemand in einem Formularfeld tippt */
      var t = e.target;
      if (t && (t.closest('input, textarea, select, [contenteditable]'))) return;
      var box = root.getBoundingClientRect();
      if (box.bottom <= 0 || box.top >= (window.innerHeight || 0)) return;
      goTo(e.key === 'ArrowLeft' ? current - 1 : current + 1);
    });

    // Pause on hover — hovering blockiert auch ein resetTimer() aus Klicks heraus
    root.addEventListener('mouseenter', function () { hovering = true;  stopTimer(); });
    root.addEventListener('mouseleave', function () { hovering = false; resetTimer(); });

    /* Resize — nur bei echter Breitenaenderung.
       Chrome auf Android feuert beim Ein-/Ausblenden der URL-Leiste waehrend des
       Scrollens ein resize-Event. Ohne diese Pruefung wuerde der Slider mitten im
       Scrollen Layout lesen und schreiben (Layout Thrashing) — genau dort, wo es
       am meisten weh tut. */
    var lastW = window.innerWidth;
    window.addEventListener('resize', function () {
      if (window.innerWidth === lastW) return;   // nur Hoehe: URL-Leiste, ignorieren
      lastW = window.innerWidth;
      clearTimeout(resizeT);
      resizeT = setTimeout(function () { updateUI(true); }, 120);
    }, { passive: true });

    // Im Hintergrund-Tab weder weiterschalten noch Video abspielen
    document.addEventListener('visibilitychange', function () {
      syncVideos();
      if (document.hidden) stopTimer(); else resetTimer();
    });

    /* Scrollt der Slider aus dem Bild, wird das Video angehalten und die
       Auto-Weiterschaltung gestoppt — ein 1080×1920-Video ausserhalb des
       Sichtbereichs weiterlaufen zu lassen kostet auf dem Smartphone spürbar
       Rechenzeit, ohne dass jemand es sieht. */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        syncVideos();
        if (inView) resetTimer(); else stopTimer();
      }, { threshold: 0 }).observe(root);
    }

    // Reagiert live, wenn die Systemeinstellung „Bewegung reduzieren“ wechselt
    if (reducedMotion.addEventListener) {
      reducedMotion.addEventListener('change', function () {
        syncVideos();
        resetTimer();
      });
    }

    // Damit die Lightbox den Slider anhalten kann
    sliders.push({
      pause:  function () { stopTimer(); syncVideos(); },
      resume: function () { syncVideos(); resetTimer(); }
    });

    // Init — erste Darstellung ohne Animation
    updateUI(true);
    resetTimer();
  });

  /* ---- Shared Lightbox ---- */
  var lbEl = null;

  function lightboxOpen() {
    return !!(lbEl && lbEl.classList.contains('open'));
  }

  function buildLightbox() {
    lbEl = document.createElement('div');
    lbEl.className = 'lb-overlay';
    lbEl.setAttribute('role', 'dialog');
    lbEl.setAttribute('aria-modal', 'true');
    lbEl.setAttribute('aria-label', 'Bildansicht');
    lbEl.innerHTML =
      '<div class="lb-overlay__inner">' +
        '<button class="lb-overlay__close" aria-label="Schließen">&#215;</button>' +
        '<div class="lb-overlay__media"></div>' +
        '<p class="lb-overlay__caption"></p>' +
      '</div>';
    lbEl.querySelector('.lb-overlay__close').addEventListener('click', closeLightbox);
    lbEl.addEventListener('click', function (e) {
      if (e.target === lbEl) closeLightbox();
    });
    document.body.appendChild(lbEl);
  }

  var lastTrigger = null;

  function openLightbox(slide) {
    if (!lbEl) buildLightbox();
    lastTrigger = slide.querySelector('.portrait-slider__frame');
    var mediaEl   = lbEl.querySelector('.lb-overlay__media');
    var captionEl = lbEl.querySelector('.lb-overlay__caption');
    mediaEl.innerHTML = '';
    captionEl.textContent = slide.dataset.title || '';

    if (slide.dataset.type === 'video') {
      var srcVid = slide.querySelector('video');
      var vid    = document.createElement('video');
      vid.src      = srcVid ? srcVid.src : '';
      vid.controls = true;
      vid.autoplay = true;
      vid.muted    = true;   /* Ton standardmäßig aus — Nutzer kann per Controls aktivieren */
      vid.loop     = false;
      vid.playsInline = true;
      vid.preload  = 'auto';
      vid.style.maxHeight = '80vh';
      mediaEl.appendChild(vid);
    } else {
      var img = slide.querySelector('img').cloneNode(true);
      img.loading = 'eager';
      mediaEl.appendChild(img);
    }

    lbEl.classList.add('open');
    document.body.style.overflow = 'hidden';
    // Slider anhalten, damit im Hintergrund kein zweites Video läuft
    sliders.forEach(function (s) { s.pause(); });
    var closeBtn = lbEl.querySelector('.lb-overlay__close');
    if (closeBtn) closeBtn.focus();
  }

  function closeLightbox() {
    if (!lbEl || !lbEl.classList.contains('open')) return;
    lbEl.classList.remove('open');
    document.body.style.overflow = '';
    var vid = lbEl.querySelector('video');
    if (vid) { vid.pause(); vid.currentTime = 0; }
    sliders.forEach(function (s) { s.resume(); });
    /* Fokus zurück auf das Bild, von dem aus geöffnet wurde — sonst landet er
       wieder am Seitenanfang und die Scrollposition geht gefühlt verloren. */
    if (lastTrigger) { lastTrigger.focus(); lastTrigger = null; }
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeLightbox();
  });
})();

/* portrait-slider handles everything above — no legacy food-slider needed */

/* --- Cookie / Consent Banner (DSGVO) ---
 * The site sets NO tracking cookies and embeds no third-party iframes.
 * This banner records the visitor's choice in localStorage (not a cookie)
 * and is shown once until a choice is made. No optional scripts load before consent.
 */
(function () {
  var KEY = 'tjorven-consent';
  var choice;
  try { choice = localStorage.getItem(KEY); } catch (e) { choice = null; }
  if (choice) return; // already decided — nothing to show

  var banner = document.createElement('div');
  banner.className = 'cookie-banner';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-live', 'polite');
  banner.setAttribute('aria-label', 'Datenschutz-Hinweis');
  banner.innerHTML =
    '<p class="cookie-banner__title">Datenschutz &amp; Cookies</p>' +
    '<p class="cookie-banner__text">Wir verwenden nur technisch notwendige Speicherung und laden ' +
    'Google Fonts zur einheitlichen Darstellung. Es werden keine Tracking-Cookies gesetzt. ' +
    'Mehr dazu in unserer <a href="datenschutz.html">Datenschutzerklärung</a>.</p>' +
    '<div class="cookie-banner__actions">' +
      '<button type="button" class="cookie-banner__btn cookie-banner__btn--accept">Akzeptieren</button>' +
      '<button type="button" class="cookie-banner__btn cookie-banner__btn--decline">Nur notwendige</button>' +
    '</div>';

  document.body.appendChild(banner);
  document.body.classList.add('consent-open');
  // setTimeout (not rAF) so the slide-in reveal also fires when the tab is not focused
  setTimeout(function () { banner.classList.add('show'); }, 60);

  function decide(value) {
    try { localStorage.setItem(KEY, value); } catch (e) {}
    banner.classList.remove('show');
    document.body.classList.remove('consent-open');
    setTimeout(function () { banner.remove(); }, 480);
  }

  banner.querySelector('.cookie-banner__btn--accept').addEventListener('click', function () { decide('accepted'); });
  banner.querySelector('.cookie-banner__btn--decline').addEventListener('click', function () { decide('declined'); });
})();
