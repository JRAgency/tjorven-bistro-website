<?php
/**
 * Tjorven Bistro — Verarbeitung der Kontakt- und Cateringformulare
 *
 * Aufbau
 *   1. Konfiguration laden
 *   2. Nur POST zulassen
 *   3. Spam-Schutz (Honeypot, Mindestausfüllzeit, Rate-Limit)
 *   4. Serverseitige Validierung
 *   5. Mails zusammenstellen (Text + HTML, inc/mail-inhalt.php)
 *   6. Anfrage an das Bistro versenden, danach Eingangsbestätigung an den Gast
 *   7. Antwort als JSON (bei aktivem JavaScript) oder als HTML-Seite
 *
 * Datenschutz: Die Formularinhalte werden ausschließlich für den Mailversand
 * verwendet und danach verworfen. Es werden keine Anfragen gespeichert und
 * keine Formularinhalte protokolliert. Der Rate-Limit-Speicher enthält nur
 * einen anonymisierten Hash der IP-Adresse und einen Zähler; der Zähler für
 * Eingangsbestätigungen nur einen Hash der E-Mail-Adresse (max. 24 Stunden).
 */

declare(strict_types=1);

// Fehler nie an Besucher ausgeben — sie könnten Pfade oder Konfiguration verraten
ini_set('display_errors', '0');
error_reporting(E_ALL);
// Uhrzeiten in den Mails („Gesendet am …“) in deutscher Zeit, unabhängig von der Servereinstellung
date_default_timezone_set('Europe/Berlin');

require __DIR__ . '/inc/mailer.php';
require __DIR__ . '/inc/mail-inhalt.php';

const TJ_MAX_MESSAGE   = 5000;
const TJ_MAX_SHORTTEXT = 150;

// Prüfregeln der Kontaktdaten im Catering-Planer – dieselben wie in js/catering-rechner.js.
// „Buchstabe“ = alles außer Ziffern, Leerraum und ASCII-Satzzeichen (auch Umlaute, andere Schriften).
const TJ_RE_BUCHSTABE = '/[^\s0-9\x21-\x2F\x3A-\x40\x5B-\x60\x7B-\x7E]/u';
const TJ_RE_ZIFFER    = '/\d/';

/* ==================================================================
   1. Konfiguration
   ================================================================== */

$configFile = __DIR__ . '/inc/config.php';
if (!is_file($configFile)) {
    tj_respond(false, 'Der Formularversand ist noch nicht eingerichtet. '
        . 'Bitte wende dich direkt per E-Mail an uns.', [], 503);
}
$config = require $configFile;
if (!is_array($config) || empty($config['recipient']) || empty($config['from'])) {
    tj_respond(false, 'Der Formularversand ist noch nicht vollständig eingerichtet. '
        . 'Bitte wende dich direkt per E-Mail an uns.', [], 503);
}

/* ==================================================================
   2. Nur POST
   ================================================================== */

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    tj_respond(false, 'Diese Adresse nimmt nur abgeschickte Formulare entgegen.', [], 405);
}

/* ==================================================================
   Formulardefinitionen
   Ein Feld je Eintrag: Beschriftung für die Mail, Pflichtfeld, Typ, Länge.
   ================================================================== */

$forms = [
    'kontakt' => [
        'subject_prefix' => 'Kontaktanfrage',
        'abschnitt'      => 'Anfrage',
        'fields' => [
            'name'    => ['label' => 'Name',         'required' => true,  'type' => 'text',  'max' => TJ_MAX_SHORTTEXT],
            'email'   => ['label' => 'E-Mail',       'required' => true,  'type' => 'email'],
            'phone'   => ['label' => 'Telefon',      'required' => false, 'type' => 'text',  'max' => 60],
            'subject' => ['label' => 'Betreff',      'required' => false, 'type' => 'choice',
                          'options' => ['allgemein' => 'Allgemeine Frage', 'catering' => 'Cateringanfrage',
                                        'gruppe' => 'Reservierung / Gruppe', 'feedback' => 'Feedback',
                                        'sonstiges' => 'Sonstiges']],
            'message' => ['label' => 'Nachricht',    'required' => true,  'type' => 'textarea', 'max' => TJ_MAX_MESSAGE],
        ],
    ],
    'catering' => [
        'subject_prefix' => 'Cateringanfrage',
        'abschnitt'      => 'Anfrage',
        'fields' => [
            'name'     => ['label' => 'Name',              'required' => true,  'type' => 'text', 'max' => TJ_MAX_SHORTTEXT],
            'email'    => ['label' => 'E-Mail',            'required' => true,  'type' => 'email'],
            'phone'    => ['label' => 'Telefon',           'required' => false, 'type' => 'text', 'max' => 60],
            'date'     => ['label' => 'Gewünschtes Datum', 'required' => false, 'type' => 'date'],
            'time'     => ['label' => 'Uhrzeit',           'required' => false, 'type' => 'time'],
            'guests'   => ['label' => 'Anzahl Gäste',      'required' => false, 'type' => 'int', 'min' => 1, 'max' => 2000],
            'occasion' => ['label' => 'Anlass',            'required' => false, 'type' => 'choice',
                           'options' => ['firma' => 'Firmenevent / Business Lunch', 'privat' => 'Private Feier',
                                         'kindergeburtstag' => 'Kindergeburtstag', 'verein' => 'Vereinsevent',
                                         'schule' => 'Schulausflug / Gruppe', 'sonstiges' => 'Sonstiges']],
            'message'  => ['label' => 'Wünsche & Details', 'required' => false, 'type' => 'textarea', 'max' => TJ_MAX_MESSAGE],
        ],
    ],
    // Catering-Rechner (catering-broschuere.html, öffentlich /catering/planen/). Die Auswahl kommt zusätzlich
    // als JSON im Feld "auswahl" und wird in Abschnitt 4b serverseitig berechnet.
    // Die Personengrenzen 10–200 prüft dort data/catering-preise.json; die Werte
    // hier sind nur technische Grenzen.
    'catering-rechner' => [
        'subject_prefix' => 'Cateringanfrage (Preisrechner)',
        'abschnitt'      => 'Termin & Personen',
        // Seit 02.10.2026: Ansprechpartner, Firma/Verein, Anschrift und Telefon sind Pflicht
        // (Angebot und Rechnung). Reihenfolge = Reihenfolge in den Mails.
        'fields' => [
            'name'     => ['label' => 'Ansprechpartner',   'required' => true,  'type' => 'text', 'max' => TJ_MAX_SHORTTEXT, 'gruppe' => 'kontakt',
                           'required_message' => 'Bitte gib eine Ansprechperson an.',
                           'regeln' => [['/^.{2,}$/us', true, 'Bitte einen gültigen Namen angeben.'],
                                        [TJ_RE_BUCHSTABE, true, 'Bitte einen gültigen Namen angeben.']]],
            'company'  => ['label' => 'Firma / Verein',    'required' => true,  'type' => 'text', 'max' => TJ_MAX_SHORTTEXT, 'gruppe' => 'kontakt',
                           'required_message' => 'Bitte gib eine Firma oder einen Verein an.',
                           'regeln' => [['/^.{2,}$/us', true, 'Bitte einen gültigen Namen für Firma oder Verein angeben.'],
                                        ['/[^\s\x21-\x2F\x3A-\x40\x5B-\x60\x7B-\x7E]/u', true, 'Bitte einen gültigen Namen für Firma oder Verein angeben.']]],
            'email'    => ['label' => 'E-Mail',            'required' => true,  'type' => 'email', 'gruppe' => 'kontakt',
                           'required_message' => 'Bitte gib deine E-Mail-Adresse an.'],
            'phone'    => ['label' => 'Mobil / WhatsApp / Telefon', 'required' => true, 'type' => 'text', 'max' => 60, 'gruppe' => 'kontakt',
                           'required_message' => 'Bitte gib eine Mobil- oder Telefonnummer an.',
                           'regeln' => [['/^\+?[0-9 ()\/.\-]+$/', true, 'Bitte eine gültige Mobil- oder Telefonnummer angeben.'],
                                        ['/^(?:\D*\d){6,20}\D*$/', true, 'Bitte eine gültige Mobil- oder Telefonnummer angeben.']]],
            'street'   => ['label' => 'Straße & Hausnummer', 'required' => true, 'type' => 'text', 'max' => TJ_MAX_SHORTTEXT, 'gruppe' => 'adresse',
                           'required_message' => 'Bitte gib Straße und Hausnummer an.',
                           'regeln' => [['/^.{3,}$/us', true, 'Bitte Straße und Hausnummer angeben (z. B. Musterstraße 12).'],
                                        [TJ_RE_BUCHSTABE, true, 'Bitte Straße und Hausnummer angeben (z. B. Musterstraße 12).'],
                                        [TJ_RE_ZIFFER, true, 'Bitte Straße und Hausnummer angeben (z. B. Musterstraße 12).']]],
            'zip'      => ['label' => 'PLZ',               'required' => true,  'type' => 'text', 'max' => 5, 'gruppe' => 'adresse',
                           'required_message' => 'Bitte gib die PLZ an.',
                           'regeln' => [['/^(?!00)\d{5}$/', true, 'Bitte eine gültige fünfstellige PLZ angeben.']]],
            'city'     => ['label' => 'Ort',               'required' => true,  'type' => 'text', 'max' => 100, 'gruppe' => 'adresse',
                           'required_message' => 'Bitte gib den Ort an.',
                           'regeln' => [[TJ_RE_ZIFFER, false, 'Bitte nur den Ort angeben – die PLZ hat ein eigenes Feld.'],
                                        ['/^.{2,}$/us', true, 'Bitte einen gültigen Ort angeben.'],
                                        [TJ_RE_BUCHSTABE, true, 'Bitte einen gültigen Ort angeben.']]],
            'date'     => ['label' => 'Gewünschtes Datum', 'required' => true,  'type' => 'date', 'not_past' => true],
            // Keine Uhrzeit beim Catering (Vorgabe 01.10.2026) – ein mitgeschicktes „time“ wird ignoriert
            'guests'   => ['label' => 'Anzahl Personen',   'required' => true,  'type' => 'int', 'min' => 1, 'max' => 2000],
            'message'  => ['label' => 'Nachricht & Hinweise', 'required' => false, 'type' => 'textarea', 'max' => TJ_MAX_MESSAGE],
            // Freiwillige Einwilligung zu Gesundheitsangaben in der Nachricht (Art. 9 DSGVO) – nur „1“ oder leer
            'gesundheit' => ['label' => 'Einwilligung Gesundheitsangaben (Allergien, Unverträglichkeiten u. Ä.)', 'required' => false,
                             'type' => 'zustimmung', 'gruppe' => 'einwilligung'],
        ],
    ],
    // Kindergeburtstag-Planer (kindergeburtstag-broschuere.html, öffentlich /kindergeburtstag/planen/): reine unverbindliche
    // Anfrage, nichts wird ausgewählt oder berechnet (seit 01.10.2026). Abschnitt 4b
    // prüft Gruppengrößen und Ankunftszeit gegen data/kindergeburtstag-preise.json.
    'kindergeburtstag-rechner' => [
        'subject_prefix' => 'Kindergeburtstag-Anfrage (Planer)',
        'abschnitt'      => 'Gruppe & Termin',
        'fields' => [
            'name'       => ['label' => 'Name',              'required' => true,  'type' => 'text', 'max' => TJ_MAX_SHORTTEXT],
            'email'      => ['label' => 'E-Mail',            'required' => true,  'type' => 'email'],
            'phone'      => ['label' => 'Telefon / WhatsApp', 'required' => false, 'type' => 'text', 'max' => 60],
            'guests'     => ['label' => 'Anzahl Kinder',     'required' => true,  'type' => 'int', 'min' => 1, 'max' => 2000],
            // Mindestens 1 Begleitperson; 0, negative Werte und Text werden abgelehnt
            'begleitung' => ['label' => 'Begleitpersonen',   'required' => true,  'type' => 'int', 'min' => 1, 'max' => 2000,
                             'required_message' => 'Bitte gib die Anzahl der Begleitpersonen an (mindestens 1).',
                             'invalid_message'  => 'Bitte gib mindestens 1 Begleitperson an (ganze Zahl).'],
            'date'       => ['label' => 'Gewünschtes Datum', 'required' => true,  'type' => 'date', 'not_past' => true],
            // Nur 09:00–16:00 im 15-Minuten-Takt – das genaue Zeitfenster prüft Abschnitt 4b
            'time'       => ['label' => 'Voraussichtliche Ankunftszeit', 'required' => true, 'type' => 'time',
                             'required_message' => 'Bitte gib eine voraussichtliche Ankunftszeit an.'],
            'message'    => ['label' => 'Nachricht', 'required' => false, 'type' => 'textarea', 'max' => TJ_MAX_MESSAGE],
            // Freiwillige Einwilligung zu Gesundheitsangaben in der Nachricht (Art. 9 DSGVO) – nur „1“ oder leer
            'gesundheit' => ['label' => 'Einwilligung Gesundheitsangaben (Allergien, Unverträglichkeiten u. Ä.)', 'required' => false,
                             'type' => 'zustimmung', 'gruppe' => 'einwilligung'],
        ],
    ],
];

$formKey = (string) ($_POST['form'] ?? '');
if (!isset($forms[$formKey])) {
    tj_respond(false, 'Unbekanntes Formular.', [], 400);
}
$definition = $forms[$formKey];

/* ==================================================================
   3. Spam-Schutz
   ================================================================== */

// 3a) Honeypot — für Menschen unsichtbar, Bots füllen ihn aus.
//     Stillschweigend "erfolgreich" antworten, damit der Bot nichts lernt.
if (trim((string) ($_POST['website'] ?? '')) !== '') {
    tj_respond(true, 'Vielen Dank! Deine Nachricht ist bei uns eingegangen.');
}

// 3b) Mindestausfüllzeit. Das Feld wird per JavaScript gesetzt; fehlt es
//     (JavaScript deaktiviert), wird diese Prüfung übersprungen.
$startedAt = $_POST['form_started'] ?? '';
if (is_string($startedAt) && ctype_digit($startedAt) && $startedAt !== '') {
    $elapsed = (microtime(true) * 1000 - (float) $startedAt) / 1000;
    if ($elapsed >= 0 && $elapsed < (float) ($config['min_fill_seconds'] ?? 2.5)) {
        tj_respond(false, 'Das ging uns etwas zu schnell. Bitte sende das Formular noch einmal ab.', [], 429);
    }
}

// 3c) Rate-Limit je IP
if (!tj_rate_limit_ok($config)) {
    tj_respond(false, 'Es wurden bereits mehrere Anfragen von diesem Anschluss gesendet. '
        . 'Bitte versuche es später noch einmal oder ruf uns an.', [], 429);
}

/* ==================================================================
   4. Validierung
   ================================================================== */

$values = [];   // bereinigte Werte
$errors = [];   // feldbezogene Fehlermeldungen

foreach ($definition['fields'] as $name => $rules) {
    $raw = $_POST[$name] ?? '';
    if (!is_string($raw)) {
        $raw = '';
    }

    // Steuerzeichen entfernen; Zeilenumbrüche nur in mehrzeiligen Feldern erhalten.
    // In einzeiligen Feldern würden sie sonst im Mailtext eigene Zeilen erzeugen
    // und liessen sich nutzen, um zusätzliche Abschnitte vorzutäuschen.
    $raw = str_replace(["\r\n", "\r"], "\n", $raw);
    $raw = preg_replace('/[^\P{C}\n]+/u', '', $raw) ?? '';
    // Geschützte und andere Unicode-Leerzeichen wie normale behandeln – „nur Leerzeichen“ zählt als leer
    $raw = preg_replace('/\p{Zs}/u', ' ', $raw) ?? '';
    if (($rules['type'] ?? '') !== 'textarea') {
        $raw = preg_replace('/\s*\n\s*/', ' ', $raw) ?? '';
    }
    $value = trim($raw);

    // Einwilligungs-Häkchen: angehakt = „1“, nicht angehakt = Feld fehlt. Alles andere ist manipuliert.
    if (($rules['type'] ?? '') === 'zustimmung') {
        if ($value === '1') {
            $values[$name] = 'erteilt';
        } elseif ($value === '') {
            $values[$name] = 'nicht erteilt';
        } else {
            $errors[$name] = 'Ungültige Angabe.';
            $values[$name] = '';
        }
        continue;
    }

    if ($value === '') {
        if (!empty($rules['required'])) {
            $errors[$name] = $rules['required_message'] ?? ($rules['type'] === 'date' ? 'Bitte ein Datum angeben.' : 'Bitte ausfüllen.');
        }
        $values[$name] = '';
        continue;
    }

    switch ($rules['type']) {
        case 'email':
            if (!filter_var($value, FILTER_VALIDATE_EMAIL) || mb_strlen($value) > 190) {
                $errors[$name] = 'Bitte eine gültige E-Mail-Adresse angeben.';
            }
            break;

        case 'choice':
            if (!isset($rules['options'][$value])) {
                $errors[$name] = 'Bitte eine der angebotenen Optionen wählen.';
            }
            break;

        case 'date':
            $d = DateTime::createFromFormat('Y-m-d', $value);
            if (!$d || $d->format('Y-m-d') !== $value) {
                $errors[$name] = 'Bitte ein gültiges Datum angeben.';
            } elseif (!empty($rules['not_past'])
                && $value < (new DateTime('now', new DateTimeZone('Europe/Berlin')))->format('Y-m-d')) {
                $errors[$name] = 'Bitte ein Datum ab heute angeben.';
            }
            break;

        case 'time':
            if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $value)) {
                $errors[$name] = 'Bitte eine gültige Uhrzeit angeben.';
            }
            break;

        case 'int':
            if (!ctype_digit($value)) {
                $errors[$name] = $rules['invalid_message'] ?? 'Bitte eine Zahl angeben.';
            } else {
                $n = (int) $value;
                if ($n < ($rules['min'] ?? 0) && isset($rules['invalid_message'])) {
                    $errors[$name] = $rules['invalid_message'];
                } elseif ($n < ($rules['min'] ?? 0) || $n > ($rules['max'] ?? PHP_INT_MAX)) {
                    $errors[$name] = 'Bitte eine Zahl zwischen '
                        . ($rules['min'] ?? 0) . ' und ' . ($rules['max'] ?? 0) . ' angeben.';
                }
            }
            break;

        default: // text, textarea
            if (mb_strlen($value) > ($rules['max'] ?? TJ_MAX_SHORTTEXT)) {
                $errors[$name] = 'Die Eingabe ist zu lang (max. '
                    . ($rules['max'] ?? TJ_MAX_SHORTTEXT) . ' Zeichen).';
            }
    }

    // Zusätzliche Regeln je Feld: [Muster, muss passen (true) / darf nicht passen (false), Meldung]
    if (!isset($errors[$name])) {
        foreach ($rules['regeln'] ?? [] as $regel) {
            if ((preg_match($regel[0], $value) === 1) !== $regel[1]) {
                $errors[$name] = $regel[2];
                break;
            }
        }
    }

    $values[$name] = $value;
}

if ($errors) {
    tj_respond(false, 'Bitte prüfe die markierten Felder.', $errors, 422);
}

/* ==================================================================
   4b. Catering-Rechner: Kostenschätzung serverseitig neu berechnen.
   Der im Browser angezeigte Betrag wird nie übernommen, nur verglichen.
   ================================================================== */

$mailExtra = [];
if ($formKey === 'catering-rechner') {
    require __DIR__ . '/inc/catering-preise.php';
    $calc = tj_catering_calculate((string) ($_POST['auswahl'] ?? ''), (int) $values['guests']);
    if (!$calc['ok']) {
        tj_respond(false, $calc['message'], $calc['errors'], 422);
    }
    $mailExtra = ['calc' => $calc, 'client_summe' => (string) ($_POST['summe_anzeige'] ?? '')];
}
if ($formKey === 'kindergeburtstag-rechner') {
    require __DIR__ . '/inc/kindergeburtstag-preise.php';
    // Pflichtfelder, oben bereits als Ganzzahl ≥ 1 bzw. als Uhrzeit HH:MM geprüft
    $pruefung = tj_kg_pruefen((int) $values['guests'], (int) $values['begleitung'], (string) $values['time']);
    if (!$pruefung['ok']) {
        tj_respond(false, $pruefung['message'], $pruefung['errors'], 422);
    }
}

/* ==================================================================
   5. Mails zusammenstellen – Text und HTML aus derselben Struktur
   ================================================================== */

$subject = $definition['subject_prefix'] . ' von ' . $values['name']
    . (($values['company'] ?? '') !== '' ? ' (' . $values['company'] . ')' : '');
$mails   = tj_mail_dokumente($formKey, $definition, $values, $mailExtra);

/* ==================================================================
   6. Versenden: erst die Anfrage an das Bistro (Reply-To = Gast) …
   ================================================================== */

$ok = tj_send_mail($config, $subject, tj_mail_text($mails['intern']), $values['email'], $values['name'],
    ['html' => tj_mail_html($mails['intern'])]);

if (!$ok) {
    // Nur der technische Fehler wird vermerkt — niemals Formularinhalte.
    $last = error_get_last();
    error_log('[tjorven] Mailversand fehlgeschlagen'
        . ' | Formular: ' . $formKey
        . ' | Versandweg: ' . ($config['transport'] ?? 'mail')
        . ' | Absender: ' . $config['from']
        . ' | Empfaenger: ' . $config['recipient']
        . ' | PHP: ' . (($last && isset($last['message'])) ? $last['message'] : 'keine Meldung'));
    tj_respond(false, 'Deine Nachricht konnte gerade nicht versendet werden. '
        . 'Bitte versuche es später noch einmal oder schreib uns direkt an '
        . $config['recipient'] . '.', [], 500);
}

tj_rate_limit_record($config);

/* … dann die Eingangsbestätigung an den Gast (Reply-To = Bistro). Nur wenn die
   Anfrage selbst angekommen ist, höchstens 3 je Adresse und 24 Stunden, und nie
   ein Grund für eine Fehlermeldung: Die Anfrage ist zu diesem Zeitpunkt schon da. */
$bestaetigt = false;
if (($config['confirmation_mail'] ?? true) && tj_bestaetigung_erlaubt($config, $values['email'])) {
    $bestaetigt = tj_send_mail($config, $mails['betreff_kunde'], tj_mail_text($mails['kunde']),
        (string) $config['recipient'], (string) ($config['recipient_name'] ?? 'Tjorven Bistro'), [
            'html'      => tj_mail_html($mails['kunde']),
            'to'        => $values['email'],
            'from_name' => (string) ($config['confirmation_from_name'] ?? 'Tjorven Bistro'),
            'auto'      => true,
        ]);
    if (!$bestaetigt) {
        error_log('[tjorven] Eingangsbestaetigung fehlgeschlagen | Formular: ' . $formKey
            . ' | Versandweg: ' . ($config['transport'] ?? 'mail'));
    }
}

$danke = 'Vielen Dank! Deine Nachricht ist bei uns eingegangen. Wir antworten innerhalb von 1–2 Werktagen.';
if ($formKey === 'catering') {
    $danke = 'Vielen Dank! Deine Cateringanfrage ist bei uns eingegangen. Wir melden uns innerhalb von 1–2 Werktagen.';
} elseif ($formKey === 'catering-rechner') {
    // Planer: ausdrücklich keine Reservierung, erst die Bestätigung des Bistros zählt
    $danke = 'Vielen Dank für deine Anfrage. Wir prüfen deinen Wunschtermin und melden uns bei dir. '
        . 'Deine Anfrage ist noch keine verbindliche Reservierung.';
} elseif ($formKey === 'kindergeburtstag-rechner') {
    $danke = 'Vielen Dank für deine unverbindliche Anfrage. Wir prüfen deinen Wunschtermin und melden uns bei dir. '
        . 'Dein Termin ist damit noch nicht reserviert – verbindlich wird die Reservierung erst mit unserer Bestätigung.';
}
if ($bestaetigt) {
    $danke .= ' Eine Bestätigung mit deinen Angaben haben wir dir per E-Mail geschickt.';
}
tj_respond(true, $danke);


/* ==================================================================
   Hilfsfunktionen
   ================================================================== */

/**
 * Anonymisierter Schlüssel je Anschluss. Die IP wird nie im Klartext abgelegt.
 */
function tj_rate_limit_key(array $config): string
{
    $ip   = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    $salt = (string) ($config['hash_salt'] ?? 'tjorven');
    return hash('sha256', $ip . '|' . $salt);
}

function tj_rate_limit_dir(array $config): string
{
    $dir = (string) ($config['storage_dir'] ?? '');
    if ($dir === '') {
        $dir = sys_get_temp_dir() . '/tjorven-formulare';
    }
    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }
    return $dir;
}

/**
 * Prüft, ob das Limit noch nicht erreicht ist (ohne zu zählen).
 */
function tj_rate_limit_ok(array $config): bool
{
    $max    = (int) ($config['rate_limit_max'] ?? 5);
    $window = (int) ($config['rate_limit_window'] ?? 3600);
    if ($max <= 0) {
        return true;
    }

    $file = tj_rate_limit_dir($config) . '/' . tj_rate_limit_key($config) . '.json';
    if (!is_file($file)) {
        return true;
    }

    $data = json_decode((string) @file_get_contents($file), true);
    if (!is_array($data) || !isset($data['first'], $data['count'])) {
        return true;
    }
    if (time() - (int) $data['first'] > $window) {
        return true; // Zeitfenster abgelaufen
    }

    return (int) $data['count'] < $max;
}

/**
 * Zählt eine erfolgreiche Absendung. Enthält keinerlei Formulardaten.
 */
function tj_rate_limit_record(array $config): void
{
    $window = (int) ($config['rate_limit_window'] ?? 3600);
    $dir    = tj_rate_limit_dir($config);
    $file   = $dir . '/' . tj_rate_limit_key($config) . '.json';

    $data = ['first' => time(), 'count' => 0];
    if (is_file($file)) {
        $existing = json_decode((string) @file_get_contents($file), true);
        if (is_array($existing) && isset($existing['first'], $existing['count'])
            && time() - (int) $existing['first'] <= $window) {
            $data = ['first' => (int) $existing['first'], 'count' => (int) $existing['count']];
        }
    }
    $data['count']++;
    @file_put_contents($file, json_encode($data), LOCK_EX);

    tj_rate_limit_cleanup($dir, $window);
}

/**
 * Eingangsbestätigungen je Empfängeradresse drosseln (Standard: 3 in 24 Stunden),
 * damit das Formular nicht genutzt werden kann, fremde Postfächer zu fluten.
 * Gespeichert wird nur ein gesalzener Hash der Adresse und ein Zähler – keine
 * Adresse im Klartext, keine Formularinhalte. Zählt bei Erlaubnis gleich mit.
 */
function tj_bestaetigung_erlaubt(array $config, string $email): bool
{
    $max    = (int) ($config['confirmation_max_per_address'] ?? 3);
    $window = (int) ($config['confirmation_window'] ?? 86400);
    if ($max <= 0) {
        return false;
    }
    $dir = tj_rate_limit_dir($config) . '/bestaetigungen';
    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }
    $salt = (string) ($config['hash_salt'] ?? 'tjorven');
    $file = $dir . '/' . hash('sha256', 'mail|' . mb_strtolower(trim($email), 'UTF-8') . '|' . $salt) . '.json';

    $data = ['first' => time(), 'count' => 0];
    $existing = is_file($file) ? json_decode((string) @file_get_contents($file), true) : null;
    if (is_array($existing) && isset($existing['first'], $existing['count'])
        && time() - (int) $existing['first'] <= $window) {
        $data = ['first' => (int) $existing['first'], 'count' => (int) $existing['count']];
    }
    if ($data['count'] >= $max) {
        return false;
    }
    $data['count']++;
    @file_put_contents($file, json_encode($data), LOCK_EX);
    tj_rate_limit_cleanup($dir, (int) ceil($window / 2));
    return true;
}

/**
 * Räumt abgelaufene Zähler auf, damit nichts unbegrenzt liegen bleibt.
 * Läuft nur gelegentlich, um Last zu sparen.
 */
function tj_rate_limit_cleanup(string $dir, int $window): void
{
    if (random_int(1, 20) !== 1) {
        return;
    }
    foreach ((array) @glob($dir . '/*.json') as $path) {
        if (is_string($path) && @filemtime($path) < time() - ($window * 2)) {
            @unlink($path);
        }
    }
}

/**
 * Antwortet je nach Anfrageart als JSON oder als schlichte HTML-Seite
 * und beendet die Ausführung.
 *
 * @param array<string,string> $fieldErrors
 */
function tj_respond(bool $success, string $message, array $fieldErrors = [], int $status = 200): void
{
    http_response_code($status);
    header('X-Robots-Tag: noindex');
    header('Cache-Control: no-store');

    $wantsJson = (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') === 'XMLHttpRequest')
        || (stripos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') !== false);

    if ($wantsJson) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'success' => $success,
            'message' => $message,
            'errors'  => (object) $fieldErrors,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Rückfallebene ohne JavaScript
    header('Content-Type: text/html; charset=utf-8');
    $esc   = static fn (string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    $title = $success ? 'Nachricht gesendet' : 'Es gab ein Problem';

    $list = '';
    if ($fieldErrors) {
        $list = '<ul class="fb__list">';
        foreach ($fieldErrors as $field => $error) {
            $list .= '<li>' . $esc((string) $field) . ': ' . $esc((string) $error) . '</li>';
        }
        $list .= '</ul>';
    }

    echo '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">'
        . '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
        . '<meta name="robots" content="noindex">'
        . '<title>' . $esc($title) . ' – Tjorven Bistro</title>'
        . '<link rel="stylesheet" href="/css/style.css">'
        . '<style>.fb{min-height:100svh;min-height:100vh;display:flex;align-items:center;'
        . 'justify-content:center;padding:24px;text-align:center}.fb__inner{max-width:520px}'
        . '.fb__list{margin:16px 0;padding:0;list-style:none;color:var(--ink-60);font-size:14px}'
        . '.fb__list li{margin:4px 0}</style></head><body>'
        . '<main class="fb"><div class="fb__inner">'
        . '<h1 class="display-md">' . $esc($title) . '</h1>'
        . '<p class="body-md body-sub" style="margin-top:12px">' . $esc($message) . '</p>'
        . $list
        . '<p style="margin-top:28px"><a class="btn btn--primary btn--lg" href="javascript:history.back()">Zurück zum Formular</a></p>'
        . '<p style="margin-top:12px"><a class="btn-icon" href="/">Zur Startseite</a></p>'
        . '</div></main></body></html>';
    exit;
}
