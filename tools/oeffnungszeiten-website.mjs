// Öffentliche Website: Öffnungszeiten aus der EINZIGEN Quelle daten/oeffnungszeiten.js in die statischen Seiten
// schreiben. ALL-INKL liefert nur fertiges HTML aus – deshalb stehen die Zeiten als Text in den Seiten, werden aber
// nur hier erzeugt und nie von Hand geändert.
//
//   node tools/oeffnungszeiten-website.mjs            → Seiten aktualisieren (nach jeder Änderung in daten/oeffnungszeiten.js)
//   node tools/oeffnungszeiten-website.mjs --pruefen  → nur prüfen; Exit-Code 1, wenn eine Seite nicht zur Regel passt
//
// Geschrieben wird nur zwischen den Markierungen <!-- oeffnungszeiten:NAME --> … <!-- /oeffnungszeiten:NAME -->
// (Fußzeilen aller Seiten, Startseite: Kasten im Kopfbereich und Tabelle, Kontakt, Instagram-Seite, Satz auf
// „Über uns“) und in „openingHoursSpecification“ der strukturierten Daten (Schema.org) von index.html und kontakt.html.
// Regel: Montag–Freitag ab schulwoche.von, Samstag, Sonntag, Feiertage und Schulferien in Baden-Württemberg ab
// taeglich.von, Schluss immer taeglich.bis. Welche Tage Ferien/Feiertage sind, entscheidet monitor/kalender-bw.js –
// auf den statischen Seiten steht dafür nur „BW-Ferien & Feiertage“.
// Nur für die Entwicklung – nicht auf ALL-INKL hochladen, nicht auf Vercel ausliefern (.vercelignore).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OEFFNUNGSZEITEN } from '../daten/oeffnungszeiten.js';

const WURZEL = fileURLToPath(new URL('../', import.meta.url));
const PRUEFEN = process.argv.includes('--pruefen');

const UHRZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;
const { taeglich, schulwoche } = OEFFNUNGSZEITEN;
const W = schulwoche.von, T = taeglich.von, B = taeglich.bis;   // z. B. '09:00', '10:00', '17:00'
if (![W, T, B].every(z => UHRZEIT.test(z)) || !(W <= T && T < B)) throw new Error(`Unerwartete Öffnungszeiten in daten/oeffnungszeiten.js: ${JSON.stringify({ W, T, B })} – Vorlagen hier anpassen.`);
const std = z => z.slice(0, 2);                     // '09:00' → '09' (Kasten im Kopfbereich)
const ohneNull = z => String(Number(z.slice(0, 2))) + (z.endsWith(':00') ? '' : z.slice(2));   // '09:00' → '9'

/** Vorlagen je Stelle: Liste von Zeilen (Einrückung kommt von der Markierung) */
const VORLAGEN = {
  fusszeile: [
    `<p>Mo–Fr: ${W}–${B} Uhr</p>`,
    `<p>Sa &amp; So: ${T}–${B} Uhr</p>`,
    `<p style="color:rgba(255,255,255,.4);font-size:11px;margin-top:2px">BW-Ferien &amp; Feiertage: ${T}–${B} Uhr</p>`,
  ],
  kopfkasten: [
    '<div class="hero__hours-row">',
    '  <span class="hero__hours-day">Mo – Fr</span>',
    `  <span class="hero__hours-time">${std(W)} – ${std(B)} Uhr</span>`,
    '</div>',
    '<div class="hero__hours-row">',
    '  <span class="hero__hours-day">Sa &amp; So</span>',
    `  <span class="hero__hours-time">${std(T)} – ${std(B)} Uhr</span>`,
    '</div>',
    '<div class="hero__hours-row">',
    '  <span class="hero__hours-day" style="color:var(--green)">Ferien &amp; Feiertage</span>',
    `  <span class="hero__hours-time" style="color:var(--green)">${std(T)} – ${std(B)} Uhr</span>`,
    '</div>',
  ],
  tabelle: [
    '<div class="hours-row">',
    '  <span class="hours-row__day">Montag – Freitag</span>',
    '  <span class="hours-row__fill"></span>',
    `  <span class="hours-row__time">${W} – ${B} Uhr</span>`,
    '</div>',
    '<div class="hours-row">',
    '  <span class="hours-row__day">Samstag &amp; Sonntag</span>',
    '  <span class="hours-row__fill"></span>',
    `  <span class="hours-row__time">${T} – ${B} Uhr</span>`,
    '</div>',
    '<div class="hours-row hours-row--holiday">',
    '  <span class="hours-row__day">BW-Ferien &amp; Feiertage</span>',
    '  <span class="hours-row__fill"></span>',
    `  <span class="hours-row__time">${T} – ${B} Uhr</span>`,
    '</div>',
  ],
  kontakt: [
    `Mo – Fr: ${W} – ${B} Uhr<br>`,
    `Sa &amp; So: ${T} – ${B} Uhr<br>`,
    `<span style="font-size:12.5px;color:var(--green)">BW-Ferien &amp; Feiertage: ${T} – ${B} Uhr</span>`,
  ],
  instagram: [
    `<strong>Mo – Fr</strong> ${W} – ${B} Uhr &nbsp;·&nbsp;`,
    `<strong>Sa &amp; So</strong> ${T} – ${B} Uhr<br>`,
    `<strong style="color:var(--green)">BW-Ferien &amp; Feiertage: ${ohneNull(T)}–${ohneNull(B)} Uhr</strong><br>`,
  ],
  // im Fließtext (eine Zeile, Markierungen in derselben Zeile)
  satz: [`Wir sind täglich für dich da – Montag bis Freitag ab ${ohneNull(W)} Uhr, am Wochenende, an Feiertagen und in den BW-Ferien ab ${ohneNull(T)} Uhr.`],
};

/** Schema.org: Montag–Freitag und Samstag/Sonntag (Ferien und Feiertage lassen sich als Wochenregel nicht ausdrücken) */
const SCHEMA = [
  { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: W, closes: B },
  { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Saturday', 'Sunday'], opens: T, closes: B },
];

/** Seiten und ihre Stellen (jede Stelle muss genau einmal vorkommen) */
const SEITEN = {
  'index.html': ['kopfkasten', 'tabelle', 'fusszeile', 'schema'],
  'kontakt.html': ['kontakt', 'fusszeile', 'schema'],
  'speisekarte.html': ['fusszeile'],
  'ueber-uns.html': ['satz', 'fusszeile'],
  'catering.html': ['fusszeile'],
  'impressum.html': ['fusszeile'],
  'datenschutz.html': ['fusszeile'],
  'instagram.html': ['instagram'],
};

function ersetzeBlock(text, name, datei) {
  const re = new RegExp(`([ \\t]*)<!-- oeffnungszeiten:${name} -->([\\s\\S]*?)<!-- /oeffnungszeiten:${name} -->`, 'g');
  const treffer = [...text.matchAll(re)];
  if (treffer.length !== 1) throw new Error(`${datei}: Markierung „oeffnungszeiten:${name}“ ${treffer.length}× gefunden (erwartet genau 1).`);
  return text.replace(re, (alles, einzug, inhalt) => {
    const zeilen = VORLAGEN[name];
    if (!inhalt.includes('\n')) return `${einzug}<!-- oeffnungszeiten:${name} -->${zeilen.join(' ')}<!-- /oeffnungszeiten:${name} -->`;
    return `${einzug}<!-- oeffnungszeiten:${name} -->\n${zeilen.map(z => einzug + z).join('\n')}\n${einzug}<!-- /oeffnungszeiten:${name} -->`;
  });
}

function ersetzeSchema(text, datei) {
  const re = /(<script type="application\/ld\+json">\n)([\s\S]*?)(\n\s*<\/script>)/;
  const m = text.match(re);
  if (!m) throw new Error(`${datei}: keine strukturierten Daten (application/ld+json) gefunden.`);
  const daten = JSON.parse(m[2]);
  if (!Array.isArray(daten.openingHoursSpecification)) throw new Error(`${datei}: openingHoursSpecification fehlt.`);
  daten.openingHoursSpecification = SCHEMA;
  const einzug = m[2].match(/^( *)\{/)[1];
  return text.replace(re, `${m[1]}${JSON.stringify(daten, null, 2).split('\n').map(z => einzug + z).join('\n')}${m[3]}`);
}

let veraltet = 0;
for (const [datei, stellen] of Object.entries(SEITEN)) {
  const pfad = WURZEL + datei;
  const vorher = readFileSync(pfad, 'utf8');
  let text = vorher;
  for (const s of stellen) text = s === 'schema' ? ersetzeSchema(text, datei) : ersetzeBlock(text, s, datei);
  if (text === vorher) { console.log(`aktuell     ${datei}`); continue; }
  veraltet++;
  if (PRUEFEN) console.log(`VERALTET    ${datei}`);
  else { writeFileSync(pfad, text); console.log(`geschrieben ${datei}`); }
}
if (PRUEFEN && veraltet) { console.log(`${veraltet} Seite(n) passen nicht zu daten/oeffnungszeiten.js – bitte „node tools/oeffnungszeiten-website.mjs“ ausführen.`); process.exit(1); }
