// Monitor 3: baut Bildfolge und Getränkekarte aus den gemeinsamen Getränkedaten (/daten/getraenke.js –
// dieselben Daten wie die Startseite). Normalbetrieb: Bildfolge | kalt (mit alkoholisch) | heiß (mit Foto).
// „Kleines Bistro“: Bildfolge | eine Spalte mit kalt, alkoholisch und heiß (nur Filterkaffee).
// Ruhige Bildfolge: alle 8 Sekunden langsam (1,5 s) zum nächsten Foto überblenden – sonst bewegt sich nichts.
// „Kleines Bistro“ kommt aus der Verwaltung von Monitor 4 (modus.js).
import { karte } from '/daten/getraenke.js';
import { diashow, folie } from '/monitor/diashow.js';
import { beobachteModus } from '/monitor/modus.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

function zeile(e) {
  const z = el('div', 'zeile');
  z.append(el('span', 'name', e.name), el('span', 'fuell'));
  if (e.menge) z.append(el('span', 'menge', e.menge));
  const preis = el('span', 'preis', e.preis);
  preis.dataset.artikel = e.name;
  z.append(preis);
  return z;
}

function aufbauen(klein, ziel, rahmenBilder) {
  const { gruppen, bildfolge } = karte(klein);
  bildfolge.forEach((f, i) => rahmenBilder.append(folie({
    klasse: `d-${f.id}${f.freigestellt ? ' freigestellt' : ''}${i === 0 ? ' aktiv' : ''}`, datei: f.bild.datei, alt: f.bild.alt, fokus: f.bild.fokus, name: f.name, preis: f.preis,
  })));
  let spalte = null;
  for (const g of gruppen) {
    if (g.unterkategorie) spalte.append(el('h3', '', g.titel));   // „alkoholisch“ unter „kalt“
    else if (klein && spalte) spalte.append(el('h2', 'h-' + g.id, g.titel));   // kleines Bistro: alles in einer Spalte
    else {
      spalte = el('section', 'spalte gruppe');
      if (g.bild && !klein) {
        const bild = el('img', 'foto bildfeld');
        bild.src = g.bild.datei; bild.alt = g.bild.alt;
        if (g.bild.fokus) bild.style.objectPosition = g.bild.fokus;
        spalte.append(bild);
      }
      spalte.append(el('h2', '', g.titel));
      ziel.append(spalte);
    }
    g.bloecke.forEach((b, i) => {
      if (i > 0) spalte.append(el('div', b.abstand === 'gross' ? 'leerzeile' : 'abstand'));
      const zeilen = b.eintraege.map(zeile);
      if (b.hervorhebung) { const band = el('div', 'hervorhebung ' + b.hervorhebung); band.append(...zeilen); spalte.append(band); }
      else spalte.append(...zeilen);
      if (b.zusatz) spalte.append(el('div', 'zusatz', b.zusatz));
    });
  }
}

aufbauen(false, document.getElementById('normal'), document.getElementById('diashow'));
aufbauen(true, document.getElementById('klein'), document.getElementById('diashowKlein'));
diashow(document.getElementById('diashow'), 8);
diashow(document.getElementById('diashowKlein'), 8);

beobachteModus(klein => {
  document.getElementById('normal').hidden = klein;
  document.getElementById('klein').hidden = !klein;
});
