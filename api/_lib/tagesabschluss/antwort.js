// Tagesabschluss – gemeinsame HTTP-Hilfen (Web-Standard Request/Response, wie in den Vercel-Funktionen).

const SICHERHEIT = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow',
};

export function json(daten, status = 200, kopf = {}) {
  return new Response(JSON.stringify(daten), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...SICHERHEIT, ...kopf },
  });
}

/** Fehlerantwort mit verständlicher deutscher Meldung (nie technische Details) */
export const fehler = (status, meldung, extra = {}) => json({ fehler: meldung, ...extra }, status);

export function datei(inhalt, typ, kopf = {}) {
  return new Response(inhalt, { status: 200, headers: { 'Content-Type': typ, ...SICHERHEIT, ...kopf } });
}

export const nurMethoden = (...erlaubt) => json({ fehler: 'Diese Anfrage ist nicht erlaubt.' }, 405, { Allow: erlaubt.join(', ') });

export function kekse(request) {
  const ergebnis = {};
  for (const teil of (request.headers.get('cookie') || '').split(';')) {
    const i = teil.indexOf('=');
    if (i > 0) ergebnis[teil.slice(0, i).trim()] = teil.slice(i + 1).trim();
  }
  return ergebnis;
}

/**
 * Schutz gegen Anfragen von fremden Seiten (CSRF) für alles, was Daten ändert oder
 * Kosten verursacht: eigener Kopf „X-Tagesabschluss: 1“ (setzt nur unsere Seite) und –
 * falls vorhanden – Origin gleich dem eigenen Host. Zusätzlich SameSite=Strict am Cookie.
 */
export function vonEigenerSeite(request) {
  if (request.headers.get('x-tagesabschluss') !== '1') return false;
  const herkunft = request.headers.get('origin');
  if (!herkunft) return true;
  try {
    const eigene = [request.headers.get('x-forwarded-host'), request.headers.get('host'), new URL(request.url).host].filter(Boolean);
    return eigene.includes(new URL(herkunft).host);
  } catch { return false; }
}

export const fremdeSeite = () => fehler(403, 'Diese Anfrage ist nicht erlaubt.', { code: 'herkunft' });

/** JSON-Körper lesen, höchstens maxBytes; wirft { status, meldung } */
export async function leseJson(request, maxBytes) {
  const laenge = Number(request.headers.get('content-length') || 0);
  if (laenge > maxBytes) throw { status: 413, meldung: 'Die Datei ist zu groß.' };
  const puffer = Buffer.from(await request.arrayBuffer());
  if (puffer.length > maxBytes) throw { status: 413, meldung: 'Die Datei ist zu groß.' };
  try {
    const daten = JSON.parse(puffer.toString('utf8'));
    if (!daten || typeof daten !== 'object' || Array.isArray(daten)) throw new Error();
    return daten;
  } catch {
    throw { status: 400, meldung: 'Die Anfrage ist ungültig.' };
  }
}
