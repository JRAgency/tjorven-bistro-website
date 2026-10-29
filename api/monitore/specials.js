// GET /api/monitore/specials – öffentlich, nur lesend: die aktiven Angebote für Monitor 4.
//
// Die Antwort liegt bis zu einer Stunde im Vercel-CDN (Cache-Tag „monitor-specials“), damit der
// Monitor alle 60 Sekunden fragen kann, ohne jedes Mal den Blob-Speicher zu lesen. Beim
// Speichern in der Verwaltung wird genau dieser Tag gelöscht – die nächste Abfrage holt den
// neuen Stand. Geschrieben wird hier nie.

import crypto from 'node:crypto';
import { json, fehler, nurMethoden } from '../_lib/tagesabschluss/antwort.js';
import { anzeige } from '../_lib/monitore/katalog.js';
import { liesSpecials, CACHE_TAG } from '../_lib/monitore/speicher.js';

export default {
  async fetch(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return nurMethoden('GET', 'HEAD');
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
