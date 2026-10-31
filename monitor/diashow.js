// Ruhige Bildfolge (Monitore 2 und 3): Die Folien liegen übereinander, sichtbar ist nur die mit „aktiv“.
// Alle n Sekunden wird langsam (CSS, 1,5 s) zur nächsten SICHTBAREN Folie übergeblendet; ausgeblendete
// Folien (hidden, z. B. die Lasagne an Schultagen) werden übersprungen. Eine einzelne Folie steht still.
// Die bisherige Folie bleibt als „vorher“ voll sichtbar darunter liegen, bis die neue ganz eingeblendet ist.
export function wechseln(rahmen, alt, neu) {
  for (const d of rahmen.querySelectorAll(':scope > .dia.vorher')) d.classList.remove('vorher');
  if (alt) { alt.classList.remove('aktiv'); alt.classList.add('vorher'); setTimeout(() => alt.classList.remove('vorher'), 1800); }
  neu.classList.add('aktiv');
}

export function diashow(rahmen, sekunden) {
  const sichtbare = () => [...rahmen.querySelectorAll(':scope > .dia')].filter(d => !d.hidden);

  /** nach dem Ein-/Ausblenden einzelner Folien: genau eine sichtbare Folie ist aktiv */
  function pruefen() {
    for (const d of rahmen.querySelectorAll(':scope > .dia.aktiv')) if (d.hidden) d.classList.remove('aktiv');
    const folien = sichtbare();
    if (folien.length && !folien.some(d => d.classList.contains('aktiv'))) folien[0].classList.add('aktiv');
  }

  pruefen();
  setInterval(() => {
    const folien = sichtbare();
    if (folien.length < 2) return;
    const i = folien.findIndex(d => d.classList.contains('aktiv'));
    wechseln(rahmen, folien[i], folien[(i + 1) % folien.length]);
  }, sekunden * 1000);
  return { pruefen };
}

/** eine Folie für Monitor 2/3: Foto, darunter die grüne Leiste „Name Preis“ (alles als reiner Text) */
export function folie({ klasse, datei, alt, name, preis, artikel, fokus, nah }) {
  const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
  const fig = el('figure', 'dia ' + klasse), bild = el('div', 'bild'), img = el('img', 'foto');
  if (fokus) fig.style.setProperty('--fokus', fokus);   // Bildausschnitt aus den gemeinsamen Daten (/daten/)
  if (nah) fig.style.setProperty('--nah', String(nah));
  img.src = datei; img.alt = alt;
  bild.append(img);
  const leiste = el('figcaption', 'beschriftung'), n = el('span', 'k-name'), p = el('span', 'k-preis');
  n.textContent = name; p.textContent = preis;
  if (artikel) p.dataset.artikel = artikel;
  leiste.append(n, p);
  fig.append(bild, leiste);
  return fig;
}

/**
 * Leisten einer Bildfolge einheitlich so groß wie möglich setzen: höchstens die CSS-Größe, nur so weit
 * verkleinern, bis der längste sichtbare Name in einer Zeile neben den Preis passt (nie abgeschnitten).
 * Ausgeblendete Folien (z. B. Lasagne an Schultagen) zählen nicht mit. Nur für sichtbare Bildfolgen.
 */
export function leistenEinpassen(rahmen, min = 28) {
  if (!rahmen || !rahmen.offsetParent) return;
  const leisten = [...rahmen.querySelectorAll(':scope > .dia:not([hidden]) .beschriftung')];
  if (!leisten.length) return;
  for (const l of leisten) { l.style.fontSize = ''; l.classList.remove('zweizeilig'); }
  const max = parseFloat(getComputedStyle(leisten[0]).fontSize);
  // passt: Name + Abstand + Preis + Innenabstand der Leiste ≤ Leistenbreite (Breiten ohne Umbruch gemessen)
  const passt = () => leisten.every(l => {
    const cs = getComputedStyle(l), n = l.querySelector('.k-name'), p = l.querySelector('.k-preis');
    const noetig = n.scrollWidth + p.scrollWidth + parseFloat(cs.columnGap || 0) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    return noetig <= l.clientWidth + 0.5;
  });
  let g = max;
  while (!passt() && g > min) { g -= 1; for (const l of leisten) l.style.fontSize = g + 'px'; }
  if (!passt()) for (const l of leisten) l.classList.add('zweizeilig');   // Notlösung: Name darf umbrechen
}
