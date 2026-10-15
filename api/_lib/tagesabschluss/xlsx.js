// Tagesabschluss – Excel-Export als echte .xlsx-Datei (Office Open XML in einem ZIP),
// ohne Zusatzbibliothek. Datum als Excel-Datum, Beträge als Zahlen mit €-Format.

import zlib from 'node:zlib';

export const SPALTEN = [
  { titel: 'Datum', feld: 'datum', art: 'datum', breite: 12 },
  { titel: '7 % Umsatz', feld: 'umsatz7', art: 'geld', breite: 13 },
  { titel: '19 % Umsatz', feld: 'umsatz19', art: 'geld', breite: 13 },
  { titel: 'Umsatz bar', feld: 'umsatzBar', art: 'geld', breite: 13 },
  { titel: 'Barausgabe', feld: 'barausgabe', art: 'geld', breite: 13 },
  { titel: 'Bankeinzahlung', feld: 'bankeinzahlung', art: 'geld', breite: 15 },
  { titel: 'Bargeld entfernt', feld: 'bargeldEntfernt', art: 'geld', breite: 15 },
  { titel: 'Kassendifferenz', feld: 'kassendifferenz', art: 'geld', breite: 15 },
  { titel: 'Barkassenbestand', feld: 'barkassenbestand', art: 'geld', breite: 17 },
  { titel: 'Bemerkung', feld: 'bemerkung', art: 'text', breite: 40 },
  { titel: 'Tagesabschluss Foto', feld: 'foto', art: 'foto', breite: 32 },
];

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const spalte = i => String.fromCharCode(65 + i);               // höchstens 26 Spalten nötig
const excelDatum = iso => { const [j, m, t] = iso.split('-').map(Number); return (Date.UTC(j, m - 1, t) - Date.UTC(1899, 11, 30)) / 86400000; };
const deutschesDatum = iso => iso.split('-').reverse().join('.');

/**
 * eintraege: gespeicherte Datensätze (neuestes zuerst)
 * fotoLink(datum): Adresse der geschützten Seite, die das Foto nach Anmeldung zeigt
 */
export function erzeugeXlsx(eintraege, fotoLink) {
  const zeilen = [];
  zeilen.push(`<row r="1">${SPALTEN.map((s, i) => `<c r="${spalte(i)}1" t="inlineStr" s="1"><is><t>${esc(s.titel)}</t></is></c>`).join('')}</row>`);
  eintraege.forEach((e, n) => {
    const r = n + 2;
    const zellen = SPALTEN.map((s, i) => {
      const ref = `${spalte(i)}${r}`;
      if (s.art === 'datum') return `<c r="${ref}" s="2"><v>${excelDatum(e.datum)}</v></c>`;
      if (s.art === 'geld') {
        const w = e[s.feld];
        return typeof w === 'number' && Number.isFinite(w) ? `<c r="${ref}" s="3"><v>${w}</v></c>` : '';
      }
      if (s.art === 'text') return e.bemerkung ? `<c r="${ref}" t="inlineStr" s="4"><is><t xml:space="preserve">${esc(e.bemerkung)}</t></is></c>` : '';
      if (s.art === 'foto') {
        if (!(e.foto && e.foto.pfad)) return '';
        const anzeige = `Foto vom ${deutschesDatum(e.datum)} (nur nach Anmeldung)`;
        const formel = `HYPERLINK("${fotoLink(e.datum).replace(/"/g, '""')}","${anzeige.replace(/"/g, '""')}")`;
        return `<c r="${ref}" t="str" s="5"><f>${esc(formel)}</f><v>${esc(anzeige)}</v></c>`;
      }
      return '';
    }).join('');
    zeilen.push(`<row r="${r}">${zellen}</row>`);
  });
  const letzte = Math.max(1, eintraege.length + 1);

  const blatt = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<dimension ref="A1:${spalte(SPALTEN.length - 1)}${letzte}"/>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${SPALTEN.map((s, i) => `<col min="${i + 1}" max="${i + 1}" width="${s.breite}" customWidth="1"/>`).join('')}</cols>
<sheetData>${zeilen.join('')}</sheetData>
<autoFilter ref="A1:${spalte(SPALTEN.length - 1)}${letzte}"/>
</worksheet>`;

  const stile = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="DD.MM.YYYY"/><numFmt numFmtId="165" formatCode="#,##0.00\\ &quot;€&quot;"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><u/><sz val="11"/><color rgb="FF0563C1"/><name val="Calibri"/><family val="2"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD4E8D6"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF2D6B3A"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Standard" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  const dateien = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`],
    ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>Tagesabschlüsse Tjorven Bistro</dc:title><dc:creator>Tjorven Bistro</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created>
</cp:coreProperties>`],
    ['docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Tjorven Bistro Tagesabschluss</Application></Properties>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Tagesabschlüsse" sheetId="1" r:id="rId1"/></sheets>
<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'Tagesabschlüsse'!$A$1:$${spalte(SPALTEN.length - 1)}$${letzte}</definedName></definedNames>
</workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`],
    ['xl/styles.xml', stile],
    ['xl/worksheets/sheet1.xml', blatt],
  ];
  return zip(dateien.map(([name, inhalt]) => [name, Buffer.from(inhalt, 'utf8')]));
}

/* ------------------------------------------------------------- ZIP */

const CRC_TABELLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0;
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABELLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(dateien) {
  const jetzt = new Date();
  const zeit = (jetzt.getHours() << 11) | (jetzt.getMinutes() << 5) | Math.floor(jetzt.getSeconds() / 2);
  const datum = ((jetzt.getFullYear() - 1980) << 9) | ((jetzt.getMonth() + 1) << 5) | jetzt.getDate();
  const lokal = [], zentral = [];
  let versatz = 0;
  for (const [name, inhalt] of dateien) {
    const nameBuf = Buffer.from(name, 'utf8');
    const gepackt = zlib.deflateRawSync(inhalt, { level: 9 });
    const crc = crc32(inhalt);
    const kopf = Buffer.alloc(30);
    kopf.writeUInt32LE(0x04034b50, 0); kopf.writeUInt16LE(20, 4); kopf.writeUInt16LE(0x0800, 6); kopf.writeUInt16LE(8, 8);
    kopf.writeUInt16LE(zeit, 10); kopf.writeUInt16LE(datum, 12); kopf.writeUInt32LE(crc, 14);
    kopf.writeUInt32LE(gepackt.length, 18); kopf.writeUInt32LE(inhalt.length, 22); kopf.writeUInt16LE(nameBuf.length, 26); kopf.writeUInt16LE(0, 28);
    lokal.push(kopf, nameBuf, gepackt);
    const z = Buffer.alloc(46);
    z.writeUInt32LE(0x02014b50, 0); z.writeUInt16LE(20, 4); z.writeUInt16LE(20, 6); z.writeUInt16LE(0x0800, 8); z.writeUInt16LE(8, 10);
    z.writeUInt16LE(zeit, 12); z.writeUInt16LE(datum, 14); z.writeUInt32LE(crc, 16); z.writeUInt32LE(gepackt.length, 20);
    z.writeUInt32LE(inhalt.length, 24); z.writeUInt16LE(nameBuf.length, 28); z.writeUInt16LE(0, 30); z.writeUInt16LE(0, 32);
    z.writeUInt16LE(0, 34); z.writeUInt16LE(0, 36); z.writeUInt32LE(0, 38); z.writeUInt32LE(versatz, 42);
    zentral.push(z, nameBuf);
    versatz += 30 + nameBuf.length + gepackt.length;
  }
  const zentralBuf = Buffer.concat(zentral);
  const ende = Buffer.alloc(22);
  ende.writeUInt32LE(0x06054b50, 0); ende.writeUInt16LE(0, 4); ende.writeUInt16LE(0, 6);
  ende.writeUInt16LE(dateien.length, 8); ende.writeUInt16LE(dateien.length, 10);
  ende.writeUInt32LE(zentralBuf.length, 12); ende.writeUInt32LE(versatz, 16); ende.writeUInt16LE(0, 20);
  return Buffer.concat([...lokal, zentralBuf, ende]);
}
