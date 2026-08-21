<?php
/**
 * Abholmonitor — Schnittstelle
 *
 * GET  ?action=state   Öffentlich lesbar. Liefert nur Bestellnummern und
 *                      Status — keine personenbezogenen Daten.
 * POST action=…        Schreiboperationen. Erfordern eine angemeldete
 *                      Sitzung UND ein gültiges CSRF-Token. Ohne beides
 *                      wird abgewiesen (fail closed).
 */

declare(strict_types=1);

require __DIR__ . '/lib.php';

am_send_noindex_headers();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function am_json(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = (string) ($_REQUEST['action'] ?? '');

/* ---------- Lesen: öffentlich ---------- */

if ($method === 'GET') {
    if ($action !== 'state') {
        am_json(['ok' => false, 'error' => 'Unbekannte Aktion.'], 400);
    }
    $orders = am_with_orders();
    $prep = $ready = [];
    foreach ($orders as $o) {
        $entry = ['nr' => (string) $o['nr'], 'ts' => (int) $o['ts']];
        if ($o['status'] === 'ready') { $ready[] = $entry; } else { $prep[] = $entry; }
    }
    // Beide Spalten nach Bestellnummer sortiert — ein Gast sucht seine
    // Nummer, nicht den Zeitpunkt der Eingabe.
    $prep  = am_sort_by_nr($prep);
    $ready = am_sort_by_nr($ready);

    am_json(['ok' => true, 'prep' => $prep, 'ready' => $ready, 'now' => time()]);
}

/* ---------- Schreiben: nur angemeldet ---------- */

if ($method !== 'POST') {
    header('Allow: GET, POST');
    am_json(['ok' => false, 'error' => 'Methode nicht erlaubt.'], 405);
}

if (!am_admin_ready()) {
    am_json(['ok' => false, 'error' => 'Administration ist nicht eingerichtet.'], 503);
}
if (!am_is_admin()) {
    am_json(['ok' => false, 'error' => 'Nicht angemeldet.'], 401);
}
if (!am_csrf_ok((string) ($_POST['csrf'] ?? ''))) {
    am_json(['ok' => false, 'error' => 'Sitzung abgelaufen. Bitte Seite neu laden.'], 403);
}

$cfg      = am_config() ?? [];
$maxTotal = (int) ($cfg['max_orders'] ?? 60);

switch ($action) {

    case 'add':
        $nr = am_clean_number((string) ($_POST['nr'] ?? ''));
        if ($nr === null) {
            am_json(['ok' => false, 'error' => 'Bitte eine Nummer aus 1–6 Zeichen (A–Z, 0–9) angeben.'], 422);
        }
        $dup = false;
        am_with_orders(function (array $orders) use ($nr, $maxTotal, &$dup): array {
            foreach ($orders as $o) {
                if ($o['nr'] === $nr) { $dup = true; return $orders; }
            }
            if (count($orders) >= $maxTotal) { return $orders; }
            $orders[] = ['nr' => $nr, 'status' => 'prep', 'ts' => time()];
            return $orders;
        });
        if ($dup) {
            am_json(['ok' => false, 'error' => 'Nummer ' . $nr . ' steht bereits auf dem Monitor.'], 409);
        }
        am_json(['ok' => true, 'message' => 'Nummer ' . $nr . ' hinzugefügt.']);

    case 'ready':
    case 'prep':
        $nr = am_clean_number((string) ($_POST['nr'] ?? ''));
        if ($nr === null) {
            am_json(['ok' => false, 'error' => 'Ungültige Nummer.'], 422);
        }
        $target = $action === 'ready' ? 'ready' : 'prep';
        am_with_orders(function (array $orders) use ($nr, $target): array {
            foreach ($orders as $i => $o) {
                if ($o['nr'] === $nr) {
                    $orders[$i]['status'] = $target;
                    $orders[$i]['ts']     = time();
                }
            }
            return $orders;
        });
        am_json(['ok' => true, 'message' => 'Nummer ' . $nr . ' aktualisiert.']);

    case 'delete':
        $nr = am_clean_number((string) ($_POST['nr'] ?? ''));
        if ($nr === null) {
            am_json(['ok' => false, 'error' => 'Ungültige Nummer.'], 422);
        }
        am_with_orders(static fn (array $orders): array
            => array_values(array_filter($orders, static fn ($o) => $o['nr'] !== $nr)));
        am_json(['ok' => true, 'message' => 'Nummer ' . $nr . ' entfernt.']);

    case 'clear':
        am_with_orders(static fn (array $orders): array => []);
        am_json(['ok' => true, 'message' => 'Monitor geleert.']);

    default:
        am_json(['ok' => false, 'error' => 'Unbekannte Aktion.'], 400);
}
