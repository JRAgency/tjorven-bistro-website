// POST /api/tagesabschluss/abmelden – Sitzungs-Cookie löschen.

import { json, nurMethoden, vonEigenerSeite, fremdeSeite } from '../_lib/tagesabschluss/antwort.js';
import { abmeldeKeks } from '../_lib/tagesabschluss/sitzung.js';

export default {
  async fetch(request) {
    if (request.method !== 'POST') return nurMethoden('POST');
    if (!vonEigenerSeite(request)) return fremdeSeite();
    return json({ ok: true }, 200, { 'Set-Cookie': abmeldeKeks() });
  },
};
