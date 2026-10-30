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
