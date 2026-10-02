<?php
/**
 * Tjorven Bistro — Inhalt der Formular-Mails
 *
 * Aus den geprüften Formularwerten entstehen zwei Mails, beide als Text und
 * als HTML aus derselben Struktur (ein „Dokument“), damit beide Fassungen
 * immer dasselbe enthalten:
 *   - die Anfrage an das Bistro (Reply-To = Gast),
 *   - die Eingangsbestätigung an den Gast (Reply-To = Bistro).
 *
 * Sicherheit: Jeder Wert aus dem Formular wird im HTML mit htmlspecialchars()
 * maskiert – Eingaben können kein HTML, kein Script und keine Links einbauen.
 * Betreffzeilen der Bestätigung enthalten keine Eingaben.
 */

declare(strict_types=1);

/** Kontaktdaten wie im Footer der Website */
const TJ_MAIL_BISTRO = [
    'name'    => 'Tjorven Bistro',
    'adresse' => 'Dietmar-Hopp-Str. 6 · 74889 Sinsheim',
    'telefon' => '07261 1441199',
    'email'   => 'kontakt@tjorven-bistro.de',
];

/** Farben: Grün für Catering und Kontakt, Rot für den Kindergeburtstag (wie die Broschüren) */
const TJ_MAIL_FARBEN = [
    'gruen' => ['akzent' => '#186118', 'hell' => '#f1f7f2', 'linie' => '#cfe3d1'],
    'rot'   => ['akzent' => '#b02f3d', 'hell' => '#fbf0f1', 'linie' => '#efcdd2'],
];

const TJ_MAIL_TAGE = [1 => 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

function tj_mail_e(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** "2026-10-10" -> "Samstag, 10.10.2026" */
function tj_mail_datum(string $ymd): string
{
    $d = DateTime::createFromFormat('!Y-m-d', $ymd);
    if (!$d || $d->format('Y-m-d') !== $ymd) {
        return $ymd;
    }
    return TJ_MAIL_TAGE[(int) $d->format('N')] . ', ' . $d->format('d.m.Y');
}

/** Anzeigewert eines geprüften Feldes */
function tj_mail_feldwert(array $rules, string $value): string
{
    switch ($rules['type']) {
        case 'choice':
            return (string) $rules['options'][$value];
        case 'date':
            return tj_mail_datum($value);
        case 'time':
            return $value . ' Uhr';
        default:
            return $value;
    }
}

/**
 * Baut beide Mails (Anfrage an das Bistro, Bestätigung an den Gast).
 *
 * @param array $extra optional: 'calc' (Catering-Berechnung), 'client_summe' (Cent, nur Vergleich)
 * @return array{intern:array,kunde:array,betreff_kunde:string}
 */
function tj_mail_dokumente(string $formKey, array $definition, array $values, array $extra = []): array
{
    $kg       = $formKey === 'kindergeburtstag-rechner';
    $catering = $formKey === 'catering-rechner' || $formKey === 'catering';
    $kontakt  = !$kg && !$catering;
    $farbe    = $kg ? TJ_MAIL_FARBEN['rot'] : TJ_MAIL_FARBEN['gruen'];

    /* ---------- Abschnitte aus den Formularfeldern ----------
       Gruppe je Feld: 'kontakt' (Standard für Name, E-Mail, Telefon), 'adresse'
       (Rechnungsadresse beim Catering-Planer) oder die Anfrage selbst. */
    $kontaktZeilen = [];
    $adressZeilen  = [];
    $anfrageZeilen = [];
    $texte         = [];
    foreach ($definition['fields'] as $name => $rules) {
        $value = (string) ($values[$name] ?? '');
        if ($value === '') {
            continue;
        }
        $gruppe = $rules['gruppe'] ?? (in_array($name, ['name', 'email', 'phone'], true) ? 'kontakt' : 'anfrage');
        if ($rules['type'] === 'textarea') {
            $texte[] = ['titel' => $rules['label'], 'text' => $value];
        } elseif ($gruppe === 'kontakt') {
            $kontaktZeilen[] = [$rules['label'], tj_mail_feldwert($rules, $value)];
        } elseif ($gruppe === 'adresse') {
            $adressZeilen[] = [$rules['label'], tj_mail_feldwert($rules, $value)];
        } else {
            $anfrageZeilen[] = [$rules['label'], tj_mail_feldwert($rules, $value)];
        }
    }
    // Anfrage an das Bistro: jede Angabe in eigener Zeile (gut zum Übernehmen ins Angebot)
    $kontaktIntern = [['titel' => 'Kontaktdaten', 'zeilen' => $kontaktZeilen]];
    if ($adressZeilen) {
        $kontaktIntern[] = ['titel' => 'Rechnungsadresse', 'zeilen' => $adressZeilen];
    }
    // Bestätigung an den Gast: mit Anschrift kompakt in drei Zeilen statt zwei Tabellen
    $kontaktKunde = $kontaktIntern;
    if ($adressZeilen) {
        $v = static function (string $n) use ($values): string { return trim((string) ($values[$n] ?? '')); };
        $zeile = static function (array $teile): string { return implode(' · ', array_filter($teile, 'strlen')); };
        $kontaktKunde = [['titel' => 'Deine Angaben', 'text' => implode("\n", array_filter([
            $zeile([$v('name'), $v('company')]),
            $zeile([$v('street'), trim($v('zip') . ' ' . $v('city'))]),
            $zeile([$v('email'), $v('phone')]),
        ], 'strlen'))]];
    }
    $abschnitte = [];
    if ($anfrageZeilen) {
        $abschnitte[] = ['titel' => $definition['abschnitt'] ?? 'Anfrage', 'zeilen' => $anfrageZeilen];
    }
    foreach ($texte as $t) {
        $abschnitte[] = $t;
    }

    /* ---------- Catering: Auswahl, Kostenschätzung, Hinweise ---------- */
    $vergleich = '';
    if (!empty($extra['calc'])) {
        $calc = $extra['calc'];
        $cfg  = tj_catering_config();
        $positionen = [];
        foreach ($calc['positionen'] as $p) {
            $details = $p['details'] ?? [];
            if (($p['gruppe'] ?? '') === 'Menü' && !$details) {
                $details = ['Speise noch nicht ausgewählt'];
            }
            $ab     = !empty($p['ab']) ? 'ab ' : '';
            $gruppe = (string) ($p['gruppe'] ?? '');
            $titel  = (string) $p['titel'];
            // „Fingerfood: Saisonale Quiche“ steht schon unter der Zwischenüberschrift „Fingerfood“
            if ($gruppe !== '' && strpos($titel, $gruppe . ': ') === 0) {
                $titel = substr($titel, strlen($gruppe) + 2);
            }
            $positionen[] = [
                'gruppe'   => $gruppe,
                'titel'    => $titel,
                'details'  => $details,
                'rechnung' => tj_catering_menge($p['menge']) . ' ' . $p['einheit'] . ' × ' . $ab . tj_catering_euro((int) $p['einzel']),
                'betrag'   => $ab . tj_catering_euro((int) $p['summe']),
            ];
        }
        $fussnoten = [(string) ($cfg['mwst_hinweis'] ?? '')];
        if (!empty($calc['ab'])) {
            $fussnoten[] = 'Menüpreise sind laut Cateringangebot Ab-Preise pro Person.';
        }
        $abschnitte[] = [
            'titel'      => 'Auswahl & unverbindliche Kostenschätzung',
            'positionen' => $positionen,
            'summe'      => ['Voraussichtliche Kostenschätzung', (!empty($calc['ab']) ? 'ab ' : '') . tj_catering_euro((int) $calc['summe'])],
            'fussnoten'  => array_values(array_filter($fussnoten, 'strlen')),
        ];
        $abschnitte[] = ['titel' => 'Service & Hinweise', 'liste' => $calc['hinweise']];

        // Vergleich mit dem im Browser angezeigten Betrag – nur in der internen Mail
        $client = (string) ($extra['client_summe'] ?? '');
        if ($client !== '' && ctype_digit($client) && (int) $client !== (int) $calc['summe']) {
            $vergleich = 'Im Browser wurde ' . tj_catering_euro((int) $client)
                . ' angezeigt. Maßgeblich ist die oben serverseitig berechnete Summe.';
        }
    }
    if ($kg) {
        $abschnitte[] = ['titel' => 'Speisen & Getränke', 'text' =>
            'Im Planer wird nichts vorab ausgewählt. Kindergeburtstags-Menüs und à la carte werden '
            . 'bei der Ankunft besprochen (Wünsche ggf. in der Nachricht).'];
    }

    $name  = (string) $values['name'];
    $email = (string) $values['email'];

    /* ---------- Anfrage an das Bistro ---------- */
    $intern = [
        'farbe'      => $farbe,
        'titel'      => $definition['subject_prefix'] . ' über die Website',
        'vorschau'   => $definition['subject_prefix'] . ' von ' . $name,
        'einleitung' => ['Neue Anfrage über das Formular auf der Website. Mit „Antworten“ schreibst du direkt an ' . $email . '.'],
        'abschnitte' => array_merge($kontaktIntern, $abschnitte),
        'fuss'       => ['Gesendet am ' . date('d.m.Y \u\m H:i') . ' Uhr', 'Antwort geht direkt an: ' . $email],
    ];
    if ($catering && $formKey === 'catering-rechner') {
        $intern['hinweis'] = ['titel' => 'Unverbindliche Anfrage – noch nicht bestätigt', 'text' => [
            'Die im Planer angezeigte Kostenschätzung ist unverbindlich. Diese Nachricht ist eine Anfrage – eine Reservierung '
            . 'bzw. Buchung kommt erst nach ausdrücklicher Bestätigung durch das Tjorven Bistro zustande.',
            'Anfrage / Wunschtermin – noch nicht verbindlich bestätigt.',
        ]];
    } elseif ($kg) {
        $intern['hinweis'] = ['titel' => 'Unverbindliche Anfrage – Termin noch NICHT reserviert', 'text' => [
            'Diese Nachricht ist eine unverbindliche Anfrage. Das Tjorven Bistro prüft die Anfrage – verbindlich wird die '
            . 'Reservierung erst mit der Bestätigung durch das Tjorven Bistro.',
            'Anfrage / Wunschtermin – noch nicht verbindlich bestätigt.',
        ]];
    }
    if ($vergleich !== '') {
        $intern['abschnitte'][] = ['titel' => 'Kontrolle', 'text' => $vergleich];
    }

    /* ---------- Bestätigung an den Gast ---------- */
    $kunde = [
        'farbe'      => $farbe,
        'titel'      => $kontakt ? 'Danke für deine Nachricht!' : 'Danke für deine Anfrage!',
        'vorschau'   => $kontakt ? 'Wir haben deine Nachricht erhalten.' : 'Unverbindliche Anfrage – wir melden uns persönlich bei dir.',
        'einleitung' => [
            'Hallo ' . $name . ',',
            $kontakt
                ? 'vielen Dank für deine Nachricht. Wir haben sie erhalten und melden uns in der Regel innerhalb von 1–2 Werktagen bei dir. Hier ist eine Zusammenfassung deiner Angaben.'
                : 'vielen Dank für deine Anfrage. Wir haben sie erhalten – hier ist eine Zusammenfassung deiner Angaben.',
        ],
        'abschnitte' => array_merge($kontaktKunde, $abschnitte),
        'schluss'    => [
            'Fragen oder Änderungen? Antworte einfach auf diese E-Mail oder ruf uns an: ' . TJ_MAIL_BISTRO['telefon'] . '.',
            'Herzliche Grüße',
            'dein Team vom Tjorven Bistro',
        ],
        'fuss'       => [
            TJ_MAIL_BISTRO['name'] . ' · ' . TJ_MAIL_BISTRO['adresse'],
            'Tel. ' . TJ_MAIL_BISTRO['telefon'] . ' · ' . TJ_MAIL_BISTRO['email'],
            'Diese E-Mail wurde automatisch versendet, weil über ein Formular auf unserer Website eine Anfrage mit dieser '
            . 'E-Mail-Adresse gestellt wurde. Falls du das nicht warst, kannst du diese E-Mail einfach ignorieren.',
        ],
    ];
    $verbindlich = 'Wir prüfen deine Anfrage und melden uns anschließend persönlich bei dir. '
        . 'Erst mit unserer Bestätigung kommt eine verbindliche Reservierung zustande.';
    if ($catering) {
        $kunde['hinweis'] = ['titel' => 'Unverbindliche Anfrage – noch keine Reservierung', 'text' => [
            'Deine Anfrage' . ($formKey === 'catering-rechner' ? ' und die angezeigte Kostenschätzung sind' : ' ist')
            . ' unverbindlich. Durch das Absenden ist noch nichts reserviert oder gebucht.',
            'Wir prüfen deine Anfrage und melden uns anschließend zur weiteren Abstimmung persönlich bei dir. '
            . 'Erst mit unserer Bestätigung kommt eine verbindliche Reservierung zustande.',
        ]];
    } elseif ($kg) {
        $kunde['hinweis'] = ['titel' => 'Unverbindliche Anfrage – noch keine Reservierung', 'text' => [
            'Deine Anfrage ist unverbindlich – dein Wunschtermin ist damit noch nicht reserviert.',
            $verbindlich,
        ]];
    } else {
        $kunde['hinweis'] = ['titel' => 'Gut zu wissen', 'text' => [
            'Eine Reservierung oder Buchung kommt erst mit unserer persönlichen Bestätigung zustande.',
        ]];
    }

    $betreff = [
        'catering-rechner'         => 'Deine Catering-Anfrage beim Tjorven Bistro (unverbindlich)',
        'catering'                 => 'Deine Catering-Anfrage beim Tjorven Bistro (unverbindlich)',
        'kindergeburtstag-rechner' => 'Deine Kindergeburtstag-Anfrage beim Tjorven Bistro (unverbindlich)',
    ][$formKey] ?? 'Deine Nachricht an das Tjorven Bistro';

    return ['intern' => $intern, 'kunde' => $kunde, 'betreff_kunde' => $betreff];
}

/* ==================================================================
   Text-Fassung
   ================================================================== */

function tj_mail_text(array $doc): string
{
    $strich = str_repeat('-', 46);
    $l = [];
    $l[] = mb_strtoupper((string) $doc['titel'], 'UTF-8');
    $l[] = str_repeat('=', 46);
    $l[] = '';
    foreach ($doc['einleitung'] ?? [] as $i => $p) {
        if ($i > 0) {
            $l[] = '';
        }
        $l[] = $p;
    }
    if (!empty($doc['hinweis'])) {
        $l[] = '';
        $l[] = '>> ' . $doc['hinweis']['titel'];
        foreach ($doc['hinweis']['text'] as $p) {
            $l[] = '   ' . $p;
        }
    }
    foreach ($doc['abschnitte'] as $a) {
        $l[] = '';
        $l[] = mb_strtoupper((string) $a['titel'], 'UTF-8');
        $l[] = $strich;
        if (isset($a['zeilen'])) {
            $breite = 0;
            foreach ($a['zeilen'] as $z) {
                $breite = max($breite, mb_strlen($z[0], 'UTF-8') + 2);
            }
            foreach ($a['zeilen'] as $z) {
                $l[] = $z[0] . ':' . str_repeat(' ', max(1, $breite - mb_strlen($z[0], 'UTF-8') - 1)) . $z[1];
            }
        }
        if (isset($a['text'])) {
            $l[] = $a['text'];
        }
        if (isset($a['liste'])) {
            foreach ($a['liste'] as $p) {
                $l[] = '  - ' . $p;
            }
        }
        if (isset($a['positionen'])) {
            $gruppe = null;
            foreach ($a['positionen'] as $p) {
                if ($p['gruppe'] !== $gruppe) {
                    $gruppe = $p['gruppe'];
                    $l[] = '[' . $gruppe . ']';
                }
                $l[] = $p['titel'];
                foreach ($p['details'] as $d) {
                    $l[] = '    · ' . $d;
                }
                $l[] = '  ' . $p['rechnung'] . ' = ' . $p['betrag'];
            }
            $l[] = $strich;
            $l[] = $a['summe'][0] . ': ' . $a['summe'][1];
            foreach ($a['fussnoten'] as $f) {
                $l[] = $f;
            }
        }
    }
    if (!empty($doc['schluss'])) {
        foreach ($doc['schluss'] as $i => $p) {
            if ($i < 2) {
                $l[] = '';
            }
            $l[] = $p;
        }
    }
    $l[] = '';
    $l[] = $strich;
    foreach ($doc['fuss'] as $p) {
        $l[] = $p;
    }
    return implode("\n", $l) . "\n";
}

/* ==================================================================
   HTML-Fassung (Tabellen-Layout mit Inline-Styles für Mailprogramme)
   ================================================================== */

function tj_mail_html(array $doc): string
{
    $e    = 'tj_mail_e';
    $f    = $doc['farbe'];
    $font = "font-family:Arial,Helvetica,sans-serif;";
    $txt  = 'color:#2a2724;font-size:15px;line-height:1.55;';
    $grau = 'color:#726859;';
    $p    = static function (string $s) use ($e): string {
        return nl2br($e($s), false);
    };

    $h = '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">'
        . '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
        . '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">'
        . '<title>' . $e((string) $doc['titel']) . '</title></head>'
        . '<body style="margin:0;padding:0;background:#f7f4ef;">'
        . '<div style="display:none;max-height:0;overflow:hidden;opacity:0;">' . $e((string) ($doc['vorschau'] ?? '')) . '</div>'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7f4ef;">'
        . '<tr><td align="center" style="padding:24px 12px;">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;'
        . 'border:1px solid #e0d8cd;border-radius:14px;border-collapse:separate;overflow:hidden;">'
        // Kopf
        . '<tr><td style="background:' . $f['akzent'] . ';padding:20px 24px;' . $font . 'color:#ffffff;">'
        . '<div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;">' . $e(TJ_MAIL_BISTRO['name']) . '</div>'
        . '<div style="font-size:21px;font-weight:bold;line-height:1.3;margin-top:4px;">' . $e((string) $doc['titel']) . '</div>'
        . '</td></tr>'
        . '<tr><td style="padding:22px 24px 8px;' . $font . $txt . '">';

    foreach ($doc['einleitung'] ?? [] as $absatz) {
        $h .= '<p style="margin:0 0 10px;">' . $p($absatz) . '</p>';
    }

    if (!empty($doc['hinweis'])) {
        $h .= '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 6px;">'
            . '<tr><td style="background:' . $f['hell'] . ';border-left:4px solid ' . $f['akzent'] . ';padding:12px 14px;' . $font . $txt . '">'
            . '<strong style="color:' . $f['akzent'] . ';">' . $e($doc['hinweis']['titel']) . '</strong>';
        foreach ($doc['hinweis']['text'] as $absatz) {
            $h .= '<p style="margin:6px 0 0;">' . $p($absatz) . '</p>';
        }
        $h .= '</td></tr></table>';
    }

    foreach ($doc['abschnitte'] as $a) {
        $h .= '<h2 style="margin:22px 0 8px;padding-bottom:6px;border-bottom:1px solid ' . $f['linie'] . ';'
            . 'font-size:13px;letter-spacing:1px;text-transform:uppercase;color:' . $f['akzent'] . ';' . $font . '">'
            . $e((string) $a['titel']) . '</h2>';

        if (isset($a['zeilen'])) {
            $h .= '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">';
            foreach ($a['zeilen'] as $z) {
                $h .= '<tr><td valign="top" style="padding:4px 12px 4px 0;width:42%;' . $font . 'font-size:14px;' . $grau . '">'
                    . $e($z[0]) . '</td><td valign="top" style="padding:4px 0;' . $font . 'font-size:15px;color:#1a1816;'
                    . 'word-break:break-word;">' . $e($z[1]) . '</td></tr>';
            }
            $h .= '</table>';
        }
        if (isset($a['text'])) {
            $h .= '<p style="margin:0;word-break:break-word;">' . $p($a['text']) . '</p>';
        }
        if (isset($a['liste'])) {
            $h .= '<ul style="margin:0;padding-left:20px;">';
            foreach ($a['liste'] as $punkt) {
                $h .= '<li style="margin:0 0 6px;">' . $e($punkt) . '</li>';
            }
            $h .= '</ul>';
        }
        if (isset($a['positionen'])) {
            $h .= '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">';
            $gruppe = null;
            foreach ($a['positionen'] as $pos) {
                if ($pos['gruppe'] !== $gruppe) {
                    $gruppe = $pos['gruppe'];
                    $h .= '<tr><td colspan="2" style="padding:12px 0 4px;' . $font . 'font-size:13px;font-weight:bold;color:#4a4643;">'
                        . $e($gruppe) . '</td></tr>';
                }
                $h .= '<tr><td valign="top" style="padding:6px 12px 6px 0;border-bottom:1px solid #ece5da;' . $font . 'font-size:14px;color:#1a1816;">'
                    . $e($pos['titel']);
                foreach ($pos['details'] as $d) {
                    $h .= '<br><span style="font-size:13px;' . $grau . '">· ' . $e($d) . '</span>';
                }
                $h .= '<br><span style="font-size:13px;' . $grau . '">' . $e($pos['rechnung']) . '</span></td>'
                    . '<td valign="top" align="right" style="padding:6px 0;border-bottom:1px solid #ece5da;white-space:nowrap;'
                    . $font . 'font-size:14px;color:#1a1816;">' . $e($pos['betrag']) . '</td></tr>';
            }
            $h .= '<tr><td style="padding:12px 12px 4px 0;' . $font . 'font-size:15px;font-weight:bold;color:' . $f['akzent'] . ';">'
                . $e($a['summe'][0]) . '</td><td align="right" style="padding:12px 0 4px;white-space:nowrap;' . $font
                . 'font-size:16px;font-weight:bold;color:' . $f['akzent'] . ';">' . $e($a['summe'][1]) . '</td></tr>';
            foreach ($a['fussnoten'] as $fn) {
                $h .= '<tr><td colspan="2" style="padding:2px 0;' . $font . 'font-size:12.5px;' . $grau . '">' . $e($fn) . '</td></tr>';
            }
            $h .= '</table>';
        }
    }

    if (!empty($doc['schluss'])) {
        $h .= '<div style="margin-top:22px;">';
        foreach ($doc['schluss'] as $absatz) {
            $h .= '<p style="margin:0 0 6px;">' . $p($absatz) . '</p>';
        }
        $h .= '</div>';
    }

    $h .= '</td></tr><tr><td style="padding:14px 24px 20px;' . $font . 'font-size:12px;line-height:1.5;color:#8a7f74;'
        . 'border-top:1px solid #ece5da;">';
    foreach ($doc['fuss'] as $zeile) {
        $h .= '<p style="margin:4px 0;">' . $p($zeile) . '</p>';
    }
    $h .= '</td></tr></table></td></tr></table></body></html>';

    return $h;
}
