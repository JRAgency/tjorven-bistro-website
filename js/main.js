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

navBurger?.addEventListener('click', () => {
  const open = navDrawer.classList.toggle('open');
  navBurger.classList.toggle('open', open);
  navBurger.setAttribute('aria-expanded', open);
  document.body.style.overflow = open ? 'hidden' : '';
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

if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    entries => entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        io.unobserve(e.target);
      }
    }),
    { threshold: 0.08, rootMargin: '0px 0px -36px 0px' }
  );
  revealEls.forEach(el => io.observe(el));
} else {
  revealEls.forEach(el => el.classList.add('visible'));
}

/* --- Speisekarte sticky nav --- */
const menuBtns = document.querySelectorAll('.menu-nav__btn');
const menuSections = document.querySelectorAll('.menu-section[id]');

if (menuBtns.length && menuSections.length) {
  const sectionIO = new IntersectionObserver(
    entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const id = e.target.id;
          menuBtns.forEach(b => b.classList.toggle('active', b.dataset.target === id));
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
      const offset = 120;
      window.scrollTo({
        top: target.getBoundingClientRect().top + window.scrollY - offset,
        behavior: 'smooth'
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
  var AUTOPLAY_MS = 5500;
  var GAP_PX      = 16;

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
    var startX = 0, isDrag = false, dragDx = 0;
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

    function calcOffset(idx) {
      var vw = viewport ? viewport.offsetWidth : root.offsetWidth;
      var sw = slideWidth();
      if (!sw) return 0;
      return (vw - sw) / 2 - idx * (sw + GAP_PX);
    }

    function updateCaption() {
      var s = slides[current];
      if (capTag)   capTag.textContent   = s.dataset.tag   || '';
      if (capTitle) capTitle.textContent = s.dataset.title || '';
      if (capDesc)  capDesc.textContent  = s.dataset.desc  || '';
    }

    function updateUI() {
      var offset = calcOffset(current);
      track.style.transform = 'translateX(' + offset.toFixed(1) + 'px)';

      slides.forEach(function (s, i) {
        s.classList.toggle('active', i === current);
      });

      var dots = dotsWrap
        ? Array.from(dotsWrap.querySelectorAll('.portrait-slider__dot'))
        : [];
      dots.forEach(function (d, i) { d.classList.toggle('active', i === current); });

      updateCaption();
    }

    function goTo(idx) {
      current = ((idx % total) + total) % total;
      updateUI();
      resetTimer();
    }

    function resetTimer() {
      clearInterval(timer);
      timer = setInterval(function () { goTo(current + 1); }, AUTOPLAY_MS);
    }

    // Buttons
    btnPrev && btnPrev.addEventListener('click', function () { goTo(current - 1); });
    btnNext && btnNext.addEventListener('click', function () { goTo(current + 1); });

    // Touch swipe
    viewport && viewport.addEventListener('touchstart', function (e) {
      startX = e.touches[0].clientX; isDrag = true; dragDx = 0;
    }, { passive: true });
    viewport && viewport.addEventListener('touchmove', function (e) {
      if (!isDrag) return;
      dragDx = e.touches[0].clientX - startX;
    }, { passive: true });
    viewport && viewport.addEventListener('touchend', function () {
      if (!isDrag) return; isDrag = false;
      if (Math.abs(dragDx) > 44) goTo(dragDx < 0 ? current + 1 : current - 1);
    });

    // Mouse drag
    viewport && viewport.addEventListener('mousedown', function (e) {
      startX = e.clientX; isDrag = true; dragDx = 0;
    });
    viewport && viewport.addEventListener('mousemove', function (e) {
      if (!isDrag) return; dragDx = e.clientX - startX;
    });
    viewport && viewport.addEventListener('mouseup', function () {
      if (!isDrag) return; isDrag = false;
      if (Math.abs(dragDx) > 44) goTo(dragDx < 0 ? current + 1 : current - 1);
    });
    viewport && viewport.addEventListener('mouseleave', function () { isDrag = false; });

    // Click on frame: inactive → navigate; active image → lightbox; active video → lightbox
    slides.forEach(function (slide, i) {
      var frame = slide.querySelector('.portrait-slider__frame');
      if (!frame) return;
      frame.addEventListener('click', function () {
        if (!slide.classList.contains('active')) {
          goTo(i);
        } else {
          openLightbox(slide);
        }
      });
    });

    // Keyboard
    document.addEventListener('keydown', function (e) {
      if (document.querySelector('.lb-overlay.open')) return;
      if (e.key === 'ArrowLeft')  goTo(current - 1);
      if (e.key === 'ArrowRight') goTo(current + 1);
    });

    // Pause on hover
    root.addEventListener('mouseenter', function () { clearInterval(timer); });
    root.addEventListener('mouseleave', function () { resetTimer(); });

    // Resize
    window.addEventListener('resize', function () {
      clearTimeout(resizeT);
      resizeT = setTimeout(function () { updateUI(); }, 80);
    });

    // Init — disable transition for first render
    track.style.transition = 'none';
    updateUI();
    requestAnimationFrame(function () {
      track.style.transition = '';
      resetTimer();
    });
  });

  /* ---- Shared Lightbox ---- */
  var lbEl = null;

  function buildLightbox() {
    lbEl = document.createElement('div');
    lbEl.className = 'lb-overlay';
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

  function openLightbox(slide) {
    if (!lbEl) buildLightbox();
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
      vid.muted    = false;
      vid.loop     = false;
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
  }

  function closeLightbox() {
    if (!lbEl) return;
    lbEl.classList.remove('open');
    document.body.style.overflow = '';
    var vid = lbEl.querySelector('video');
    if (vid) { vid.pause(); vid.currentTime = 0; }
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeLightbox();
  });
})();

/* portrait-slider handles everything above — no legacy food-slider needed */

/* --- Newsletter Form (placeholder submit) --- */
(function () {
  var form = document.querySelector('.newsletter-form');
  if (!form) return;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = form.querySelector('button[type="submit"]');
    if (btn) {
      btn.textContent = 'Angemeldet ✓';
      btn.disabled = true;
      btn.style.opacity = '.6';
    }
  });
})();

/* --- Gallery strip — seamless infinite scroll ---
 *
 * Strategy:
 *  1. HTML holds ONE set of images (7 items, loading="eager").
 *  2. After images load we measure the exact set width via getBoundingClientRect —
 *     this is more reliable than scrollWidth and includes the trailing margin-right.
 *  3. We clone the set as many times as needed so the track is always wider than
 *     (viewport + one set).  Formula: copies = ceil(vw / setWidth) + 2
 *  4. `half` = measured setWidth.  When pos >= half we subtract half — the next
 *     set lines up pixel-perfectly because every copy is identical.
 *  5. rAF loop at 30 px/s — slow, editorial.
 *  6. Pause on hover / touch.
 */
(function () {
  const SPEED = 30 / 1000; // px per ms → 30 px/s

  document.querySelectorAll('.gallery-strip').forEach(strip => {
    const track = strip.querySelector('.gallery-strip__track');
    if (!track) return;

    let paused = false;
    let pos    = 0;
    let half   = 0;

    strip.addEventListener('mouseenter', () => { paused = true;  });
    strip.addEventListener('mouseleave', () => { paused = false; });
    strip.addEventListener('touchstart', () => { paused = true;  }, { passive: true });
    strip.addEventListener('touchend',   () => { paused = false; });

    function tick(ts, prev) {
      if (!paused && half > 0) {
        const dt = Math.min(ts - prev, 50); // cap delta — survives tab-switch
        pos += SPEED * dt;
        if (pos >= half) pos -= half;       // seamless wrap
        track.style.transform = `translateX(-${pos.toFixed(2)}px)`;
      }
      requestAnimationFrame(next => tick(next, ts));
    }

    function buildAndStart() {
      // One rAF guarantees the browser has reflowed after image load events
      requestAnimationFrame(() => {
        const origItems  = [...track.children];
        const origCount  = origItems.length;
        if (origCount === 0) return;

        // Measure the exact width of ONE set.
        // getBoundingClientRect().width on a flex container with width:max-content
        // includes every item's margin-right (unlike scrollWidth in some browsers).
        const setWidth = track.getBoundingClientRect().width;
        if (setWidth <= 0) return;

        half = setWidth; // this is our wrap distance

        // How many extra copies do we need?
        // Requirement: total_width >= viewport_width + setWidth
        //   (so at any pos in [0, half) the right edge pos+vw stays within track)
        // => (1 + copies) * setWidth >= vw + setWidth
        // => copies >= vw / setWidth
        const vw     = window.innerWidth;
        const copies = Math.ceil(vw / setWidth) + 1; // +1 safety buffer

        for (let c = 0; c < copies; c++) {
          for (let i = 0; i < origCount; i++) {
            track.appendChild(origItems[i].cloneNode(true));
          }
        }

        requestAnimationFrame(ts => tick(ts, ts));
      });
    }

    // Wait for every original image to have intrinsic dimensions before measuring
    const imgs    = [...track.querySelectorAll('img')];
    const pending = imgs.filter(img => !img.complete || img.naturalWidth === 0);

    if (pending.length === 0) {
      buildAndStart();
    } else {
      let loaded = 0;
      const done = () => { if (++loaded === pending.length) buildAndStart(); };
      pending.forEach(img => {
        img.addEventListener('load',  done, { once: true });
        img.addEventListener('error', done, { once: true });
      });
    }
  });
})();
