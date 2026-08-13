<?php
/**
 * Tjorven Bistro — Verarbeitung der Kontakt- und Cateringformulare
 *
 * Aufbau
 *   1. Konfiguration laden
 *   2. Nur POST zulassen
 *   3. Spam-Schutz (Honeypot, Mindestausfüllzeit, Rate-Limit)
 *   4. Serverseitige Validierung
 *   5. Mail zusammenstellen und versenden
 *   6. Antwort als JSON (bei aktivem JavaScript) oder als HTML-Seite
 *
 * Datenschutz: Die Formularinhalte werden ausschließlich für den Mailversand
 * verwendet und danach verworfen. Es werden keine Anfragen gespeichert und
 * keine Formularinhalte protokolliert. Der Rate-Limit-Speicher enthält nur
 * einen anonymisierten Hash der IP-Adresse und einen Zähler.
 */

declare(strict_types=1);

// Fehler nie an Besucher ausgeben — sie könnten Pfade oder Konfiguration verraten
ini_set('display_errors', '0');
error_reporting(E_ALL);

require __DIR__ . '/inc/mailer.php';

const TJ_MAX_MESSAGE   = 5000;
const TJ_MAX_SHORTTEXT = 150;

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
    if (($rules['type'] ?? '') !== 'textarea') {
        $raw = preg_replace('/\s*\n\s*/', ' ', $raw) ?? '';
    }
    $value = trim($raw);

    if ($value === '') {
        if (!empty($rules['required'])) {
            $errors[$name] = 'Bitte ausfüllen.';
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
            }
            break;

        case 'time':
            if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $value)) {
                $errors[$name] = 'Bitte eine gültige Uhrzeit angeben.';
            }
            break;

        case 'int':
            if (!ctype_digit($value)) {
                $errors[$name] = 'Bitte eine Zahl angeben.';
            } else {
                $n = (int) $value;
                if ($n < ($rules['min'] ?? 0) || $n > ($rules['max'] ?? PHP_INT_MAX)) {
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

    $values[$name] = $value;
}

if ($errors) {
    tj_respond(false, 'Bitte prüfe die markierten Felder.', $errors, 422);
}

/* ==================================================================
   5. Mail zusammenstellen
   ================================================================== */

$subject = $definition['subject_prefix'] . ' von ' . $values['name'];

$lines   = [];
$lines[] = strtoupper($definition['subject_prefix']) . ' ÜBER DIE WEBSITE';
$lines[] = str_repeat('=', 46);
$lines[] = '';

foreach ($definition['fields'] as $name => $rules) {
    $value = $values[$name] ?? '';
    if ($value === '') {
        continue;
    }
    if ($rules['type'] === 'choice') {
        $value = $rules['options'][$value];
    }
    if ($rules['type'] === 'date') {
        $value = date('d.m.Y', strtotime($value)) . ' (' . $value . ')';
    }
    if ($rules['type'] === 'time') {
        $value .= ' Uhr';
    }

    if ($rules['type'] === 'textarea') {
        $lines[] = $rules['label'] . ':';
        $lines[] = '';
        $lines[] = $value;
        $lines[] = '';
    } else {
        // str_pad zählt Bytes — bei Umlauten verrutscht die Spalte sonst
        $label = $rules['label'] . ':';
        $pad   = max(1, 20 - mb_strlen($label, 'UTF-8'));
        $lines[] = $label . str_repeat(' ', $pad) . $value;
    }
}

$lines[] = str_repeat('-', 46);
$lines[] = 'Gesendet am ' . date('d.m.Y \u\m H:i') . ' Uhr';
$lines[] = 'Antwort geht direkt an: ' . $values['email'];

$body = implode("\n", $lines);

/* ==================================================================
   6. Versenden und antworten
   ================================================================== */

$ok = tj_send_mail($config, $subject, $body, $values['email'], $values['name']);

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

tj_respond(true, $formKey === 'catering'
    ? 'Vielen Dank! Deine Cateringanfrage ist bei uns eingegangen. Wir melden uns innerhalb von 1–2 Werktagen.'
    : 'Vielen Dank! Deine Nachricht ist bei uns eingegangen. Wir antworten innerhalb von 1–2 Werktagen.');


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
        . '<link rel="stylesheet" href="css/style.css">'
        . '<style>.fb{min-height:100svh;min-height:100vh;display:flex;align-items:center;'
        . 'justify-content:center;padding:24px;text-align:center}.fb__inner{max-width:520px}'
        . '.fb__list{margin:16px 0;padding:0;list-style:none;color:var(--ink-60);font-size:14px}'
        . '.fb__list li{margin:4px 0}</style></head><body>'
        . '<main class="fb"><div class="fb__inner">'
        . '<h1 class="display-md">' . $esc($title) . '</h1>'
        . '<p class="body-md body-sub" style="margin-top:12px">' . $esc($message) . '</p>'
        . $list
        . '<p style="margin-top:28px"><a class="btn btn--primary btn--lg" href="javascript:history.back()">Zurück zum Formular</a></p>'
        . '<p style="margin-top:12px"><a class="btn-icon" href="index.html">Zur Startseite</a></p>'
        . '</div></main></body></html>';
    exit;
}
