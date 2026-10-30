// GET /api/monitore/specials – öffentlich, nur lesend: die aktiven Angebote für Monitor 4.
// GET /api/monitore/specials/?bild=<Kennung> – ein in der Verwaltung hochgeladenes Bild einer freien Kachel.
//
// Die Angebotsliste liegt bis zu einer Stunde im Vercel-CDN (Cache-Tag „monitor-specials“), damit der
// Monitor alle 60 Sekunden fragen kann, ohne jedes Mal den Blob-Speicher zu lesen. Beim
// Speichern in der Verwaltung wird genau dieser Tag gelöscht – die nächste Abfrage holt den
// neuen Stand. Bilder haben eine Kennung aus ihrem Inhalt (SHA-256) und ändern sich nie – sie dürfen
// deshalb lange im CDN liegen. Gelesen wird nur monitore/specials.json bzw. monitore/bilder/<Kennung>;
// geschrieben wird hier nie.

import crypto from 'node:crypto';
import { json, fehler, nurMethoden } from '../_lib/tagesabschluss/antwort.js';
import { anzeige, BILD_MUSTER } from '../_lib/monitore/katalog.js';
import { liesSpecials, liesBild, CACHE_TAG } from '../_lib/monitore/speicher.js';

async function bild(id) {
  if (!BILD_MUSTER.test(id)) return fehler(404, 'Nicht gefunden.');
  let b;
  try { b = await liesBild(id); } catch (f) { return fehler(f.status || 503, 'Das Bild ist gerade nicht erreichbar.'); }
  if (!b) {
    const r = fehler(404, 'Nicht gefunden.');
    r.headers.set('Vercel-CDN-Cache-Control', 'max-age=60');
    return r;
  }
  const typ = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[id.split('.').pop()];
  return new Response(b.stream, {
    status: 200,
    headers: {
      'Content-Type': typ,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Vercel-CDN-Cache-Control': 'max-age=31536000',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}

export default {
  async fetch(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return nurMethoden('GET', 'HEAD');
    const bildId = new URL(request.url).searchParams.get('bild');
    if (bildId !== null) return bild(bildId);
    let daten;
    try {
      ({ daten } = await liesSpecials());
    } catch (f) {
      // Monitor behält dann seinen letzten Stand; Fehler nur kurz zwischenspeichern
      const r = fehler(f.status || 503, f.message || 'Der Speicher ist gerade nicht erreichbar.');
      r.headers.set('Vercel-CDN-Cache-Control', 'max-age=60');
      r.headers.set('Vercel-Cache-Tag', CACHE_TAG);
      return r;
    }
    const angebote = anzeige(daten);
    const stand = crypto.createHash('sha256').update(JSON.stringify(angebote)).digest('hex').slice(0, 16);
    return json({ stand, angebote }, 200, {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Vercel-CDN-Cache-Control': 'max-age=3600',
      'Vercel-Cache-Tag': CACHE_TAG,
    });
  },
};
