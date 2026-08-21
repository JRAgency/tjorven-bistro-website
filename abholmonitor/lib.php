<?php
/**
 * Abholmonitor — gemeinsame Grundlagen
 *
 * Enthält: Konfiguration, Datenspeicher mit Dateisperre, Authentifizierung
 * und CSRF-Schutz. Wird von index.php, api.php und admin/index.php genutzt.
 *
 * Datenschutz: Gespeichert werden ausschließlich Bestellnummer, Status und
 * ein technischer Zeitstempel. Keine Namen, keine Kontaktdaten, keine
 * Produkte. Ältere Einträge werden automatisch entfernt.
 */

declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

const TJ_AM_STATUS = ['prep', 'ready'];

/* Schutzpraefix der Datendateien. Die Dateien tragen die Endung .php und
   beginnen mit diesem Praefix: Ein direkter Aufruf im Browser fuehrt sie aus
   und gibt nichts zurueck. Der Schutz haengt damit nicht allein an
   inc/.htaccess. Beim Lesen wird das Praefix wieder abgeschnitten. */
const TJ_AM_GUARD = "<?php exit; /* Datenspeicher Abholmonitor */ ?>\n";

function am_read_guarded(string $raw): string
{
    $pos = strpos($raw, "?>\n");
    return $pos === false ? $raw : substr($raw, $pos + 3);
}

/* ==================================================================
   Konfiguration
   ================================================================== */

function am_config(): ?array
{
    static $cfg = null;
    static $loaded = false;
    if ($loaded) {
        return $cfg;
    }
    $loaded = true;
    $file = __DIR__ . '/../inc/abholmonitor-config.php';
    if (!is_file($file)) {
        return $cfg = null;          // fail closed
    }
    $c = require $file;
    return $cfg = is_array($c) ? $c : null;
}

/** Ist die Administration einsatzbereit? Ohne Hash bleibt sie gesperrt. */
function am_admin_ready(): bool
{
    $c = am_config();
    return $c !== null && !empty($c['admin_password_hash']);
}

function am_data_file(): string
{
    $c = am_config() ?? [];
    $f = trim((string) ($c['data_file'] ?? ''));
    return $f !== '' ? $f : __DIR__ . '/../inc/abholmonitor-data.php';
}

/* ==================================================================
   Datenspeicher
   Eine JSON-Datei mit exklusiver Sperre. Gelesen und geschrieben wird über
   denselben Dateizeiger, damit zwischen Lesen und Schreiben niemand
   dazwischenfunkt (kein Rename, dadurch bleibt die Sperre gültig).
   ================================================================== */

/**
 * Führt $mutator auf der Bestellliste aus und speichert das Ergebnis.
 * Ohne $mutator wird nur gelesen.
 *
 * @param callable|null $mutator fn(array $orders): array
 * @return array Bestellungen nach der Operation
 */
function am_with_orders(?callable $mutator = null): array
{
    $file = am_data_file();
    $dir  = dirname($file);
    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }

    $fh = @fopen($file, 'c+');
    if (!$fh) {
        return [];
    }
    @flock($fh, LOCK_EX);

    $raw  = am_read_guarded((string) stream_get_contents($fh));
    $data = json_decode($raw, true);
    $orders = (is_array($data) && isset($data['orders']) && is_array($data['orders']))
        ? $data['orders'] : [];

    $orders = am_prune($orders);

    if ($mutator !== null) {
        $orders = $mutator($orders);
        $orders = array_values($orders);

        rewind($fh);
        ftruncate($fh, 0);
        fwrite($fh, TJ_AM_GUARD . json_encode(
            ['orders' => $orders, 'updated' => time()],
            JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT
        ));
        fflush($fh);
    }

    @flock($fh, LOCK_UN);
    fclose($fh);

    return $orders;
}

/** Entfernt abgelaufene Einträge — Altdaten bleiben so nicht liegen. */
function am_prune(array $orders): array
{
    $c   = am_config() ?? [];
    $max = (int) ($c['max_age_hours'] ?? 12);
    if ($max <= 0) {
        return array_values($orders);
    }
    $cutoff = time() - $max * 3600;
    $out = [];
    foreach ($orders as $o) {
        if (!is_array($o) || !isset($o['nr'], $o['status'], $o['ts'])) {
            continue;
        }
        if ((int) $o['ts'] >= $cutoff) {
            $out[] = $o;
        }
    }
    return $out;
}

/**
 * Vergleicht zwei Bestellnummern für die Anzeigereihenfolge.
 *
 * Rein numerische Nummern werden numerisch verglichen, damit 9 vor 10 steht
 * und führende Nullen ("07") nicht stören. Sobald Buchstaben im Spiel sind
 * (z. B. "A15"), greift eine natürliche Sortierung, die Ziffernfolgen
 * ebenfalls als Zahl behandelt — "A9" steht damit vor "A15".
 */
function am_compare_nr(string $a, string $b): int
{
    if (ctype_digit($a) && ctype_digit($b)) {
        return (int) $a <=> (int) $b;
    }
    return strnatcasecmp($a, $b);
}

/** Sortiert eine Bestellliste nach Bestellnummer. */
function am_sort_by_nr(array $orders): array
{
    usort($orders, static fn ($x, $y) => am_compare_nr((string) $x['nr'], (string) $y['nr']));
    return $orders;
}

/** Bestellnummer normalisieren und prüfen. Erlaubt: 1–6 Zeichen A–Z und 0–9. */
function am_clean_number(string $nr): ?string
{
    $nr = strtoupper(trim($nr));
    $nr = preg_replace('/[^A-Z0-9]/', '', $nr) ?? '';
    if ($nr === '' || strlen($nr) > 6) {
        return null;
    }
    return $nr;
}

/* ==================================================================
   Sitzung, Anmeldung, CSRF
   ================================================================== */

function am_session_start(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_name('tjam');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => $https,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

function am_is_admin(): bool
{
    am_session_start();
    return am_admin_ready() && !empty($_SESSION['am_admin']);
}

function am_csrf_token(): string
{
    am_session_start();
    if (empty($_SESSION['am_csrf'])) {
        $_SESSION['am_csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['am_csrf'];
}

function am_csrf_ok(string $token): bool
{
    am_session_start();
    return !empty($_SESSION['am_csrf'])
        && is_string($token)
        && hash_equals($_SESSION['am_csrf'], $token);
}

/* ---- Schutz gegen Passwort-Raten ---------------------------------- */

function am_attempts_file(): string
{
    return dirname(am_data_file()) . '/abholmonitor-login.php';
}

function am_attempt_key(): string
{
    $c = am_config() ?? [];
    return hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0')
        . '|' . (string) ($c['hash_salt'] ?? 'tjam'));
}

function am_login_blocked(): bool
{
    $c   = am_config() ?? [];
    $max = (int) ($c['login_max_attempts'] ?? 10);
    $win = (int) ($c['login_lockout_min'] ?? 15) * 60;
    if ($max <= 0) {
        return false;
    }
    $all = json_decode(am_read_guarded((string) @file_get_contents(am_attempts_file())), true);
    $rec = is_array($all) ? ($all[am_attempt_key()] ?? null) : null;
    if (!is_array($rec) || !isset($rec['n'], $rec['t'])) {
        return false;
    }
    if (time() - (int) $rec['t'] > $win) {
        return false;
    }
    return (int) $rec['n'] >= $max;
}

function am_login_record(bool $success): void
{
    $file = am_attempts_file();
    $win  = ((int) ((am_config() ?? [])['login_lockout_min'] ?? 15)) * 60;
    $key  = am_attempt_key();

    $fh = @fopen($file, 'c+');
    if (!$fh) {
        return;
    }
    @flock($fh, LOCK_EX);
    $all = json_decode(am_read_guarded((string) stream_get_contents($fh)), true);
    if (!is_array($all)) {
        $all = [];
    }
    // abgelaufene Eintraege aufraeumen
    foreach ($all as $k => $v) {
        if (!is_array($v) || time() - (int) ($v['t'] ?? 0) > $win * 4) {
            unset($all[$k]);
        }
    }
    if ($success) {
        unset($all[$key]);
    } else {
        $rec = $all[$key] ?? ['n' => 0, 't' => time()];
        if (time() - (int) $rec['t'] > $win) {
            $rec = ['n' => 0, 't' => time()];
        }
        $rec['n'] = (int) $rec['n'] + 1;
        $all[$key] = $rec;
    }
    rewind($fh);
    ftruncate($fh, 0);
    fwrite($fh, TJ_AM_GUARD . json_encode($all));
    fflush($fh);
    @flock($fh, LOCK_UN);
    fclose($fh);
}

/* ==================================================================
   Ausgabe-Helfer
   ================================================================== */

/** Suchmaschinen fernhalten — zusätzlich zum meta robots im HTML. */
function am_send_noindex_headers(): void
{
    header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet');
    header('Referrer-Policy: same-origin');
    header('X-Content-Type-Options: nosniff');
}

function am_e(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
}
