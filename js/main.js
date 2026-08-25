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
    const active = href === path || (path === '' && href === 'index.html');
    link.classList.toggle('active', active);
    /* Die aktive Seite war bisher nur farblich markiert. aria-current sagt sie
       auch Screenreadern an, ohne die Darstellung zu verändern. */
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
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

/* --- Formulare (Kontakt & Catering) ---------------------------------------
 * Abgeschickt wird per fetch an form-handler.php. Der Vorteil gegenüber einem
 * normalen POST: Bei einem Validierungsfehler wird die Seite nicht neu geladen,
 * die Eingaben bleiben also vollständig erhalten.
 * Ohne JavaScript greift der normale POST — dann antwortet form-handler.php
 * mit einer eigenen Ergebnisseite.
 * -------------------------------------------------------------------------- */
document.querySelectorAll('.form[data-form]').forEach(form => {
  const statusEl = form.querySelector('.form-status');
  const submitBtn = form.querySelector('button[type="submit"]');
  const startedField = form.querySelector('input[name="form_started"]');
  const originalLabel = submitBtn ? submitBtn.textContent : '';

  // Zeitpunkt des Seitenaufrufs — der Server erkennt daran zu schnelle Bots
  if (startedField) startedField.value = String(Date.now());

  const setStatus = (text, kind) => {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = 'form-status form-status--' + kind;
    statusEl.hidden = false;
  };

  const clearFieldErrors = () => {
    form.querySelectorAll('.form-group--error').forEach(g => g.classList.remove('form-group--error'));
    form.querySelectorAll('.form-error').forEach(e => e.remove());
    form.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
  };

  const showFieldErrors = (errors) => {
    Object.keys(errors || {}).forEach(name => {
      const field = form.querySelector('[name="' + name + '"]');
      if (!field) return;
      const group = field.closest('.form-group') || field.parentElement;
      if (group) {
        group.classList.add('form-group--error');
        const hint = document.createElement('span');
        hint.className = 'form-error';
        hint.textContent = errors[name];
        group.appendChild(hint);
      }
      field.setAttribute('aria-invalid', 'true');
    });
    const first = form.querySelector('.form-group--error [name]');
    if (first && typeof first.focus === 'function') first.focus();
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors();

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Wird gesendet …';
    }
    setStatus('Deine Anfrage wird gesendet …', 'pending');

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' }
      });
      const result = await response.json();

      if (result.success) {
        form.reset();
        if (startedField) startedField.value = String(Date.now());
        setStatus(result.message, 'success');
        if (submitBtn) submitBtn.textContent = 'Gesendet ✓';
        return;   // Button bleibt bewusst deaktiviert — kein Doppelversand
      }

      showFieldErrors(result.errors);
      setStatus(result.message || 'Bitte prüfe deine Eingaben.', 'error');
    } catch (err) {
      setStatus('Verbindung fehlgeschlagen. Bitte versuche es erneut oder schreib uns an kontakt@tjorven-bistro.de.', 'error');
    }

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });
});

/* --- Dynamic footer year --- */
document.querySelectorAll('.footer-year').forEach(el => {
  el.textContent = new Date().getFullYear();
});

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
    /* Sachstand nach der Umstellung auf lokal gehostete Schriften: Beim Aufruf
       der Seite werden nachweislich keine Inhalte von Drittanbietern geladen.
       Die frühere Formulierung nannte Google Fonts und wäre jetzt unzutreffend.
       Endgültige Formulierung folgt über die IT-Recht-Kanzlei-Texte. */
    '<p class="cookie-banner__text">Wir verwenden nur technisch notwendige Speicherung. ' +
    'Es werden keine Tracking-Cookies gesetzt und beim Seitenaufruf keine Inhalte ' +
    'von Drittanbietern geladen. ' +
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
