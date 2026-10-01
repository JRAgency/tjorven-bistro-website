<?php
/**
 * Tjorven Bistro — serverseitige Prüfung des Kindergeburtstag-Planers
 *
 * Seit 01.10.2026 ist der Planer eine reine unverbindliche Anfrage: Die
 * Kindergeburtstags-Menüs und das Angebot à la carte werden nur als Information
 * gezeigt, nichts wird vorab ausgewählt oder berechnet. Hier werden deshalb nur
 * noch Gruppengrößen und Ankunftszeit geprüft; die Mails baut inc/mail-inhalt.php.
 * Ein mitgeschicktes Feld „auswahl“ (z. B. aus einer alten Seite im Cache) wird
 * ignoriert.
 *
 * Grundlage: data/kindergeburtstag-preise.json (dieselbe Datei liest der Browser).
 */

declare(strict_types=1);

function tj_kg_config(): array
{
    static $config = null;
    if ($config === null) {
        $file = __DIR__ . '/../data/kindergeburtstag-preise.json';
        $data = is_file($file) ? json_decode((string) file_get_contents($file), true) : null;
        $config = is_array($data) ? $data : [];
    }
    return $config;
}

/**
 * Erlaubte Ankunftszeiten laut Konfiguration, z. B. 09:00, 09:15 … 16:00.
 * Gleiche Regel wie ankunftszeiten() in js/kindergeburtstag-rechner.js.
 *
 * @return string[]
 */
function tj_kg_ankunftszeiten(): array
{
    $a   = tj_kg_config()['ankunftszeit'] ?? [];
    $min = static function ($hhmm): int {
        return (is_string($hhmm) && preg_match('/^([01]\d|2[0-3]):([0-5]\d)$/', $hhmm, $m))
            ? (int) $m[1] * 60 + (int) $m[2] : -1;
    };
    $von     = $min($a['von'] ?? null);
    $bis     = $min($a['bis'] ?? null);
    $schritt = (int) ($a['schritt_minuten'] ?? 0);
    $zeiten  = [];
    if ($von < 0 || $bis < $von || $schritt <= 0) {
        return $zeiten;
    }
    for ($m = $von; $m <= $bis; $m += $schritt) {
        $zeiten[] = sprintf('%02d:%02d', intdiv($m, 60), $m % 60);
    }
    return $zeiten;
}

/**
 * Prüft Kinderzahl, Begleitpersonen (mindestens 1) und die voraussichtliche
 * Ankunftszeit (nur Zeiten aus tj_kg_ankunftszeiten()) gegen die Konfiguration.
 *
 * @return array{ok:bool,message:string,errors:array}
 */
function tj_kg_pruefen(int $kinder, int $begleitung, string $zeit): array
{
    $cfg  = tj_kg_config();
    $fail = static function (string $msg, string $feld): array {
        return ['ok' => false, 'message' => $msg, 'errors' => [$feld => $msg]];
    };
    if (!$cfg) {
        return $fail('Die Anfrage ist gerade nicht möglich. Bitte versuche es später noch einmal.', 'guests');
    }
    if ($kinder < (int) $cfg['kinder']['min'] || $kinder > (int) $cfg['kinder']['max']) {
        return $fail('Bitte gib eine Kinderzahl zwischen ' . (int) $cfg['kinder']['min'] . ' und '
            . (int) $cfg['kinder']['max'] . ' an.', 'guests');
    }
    $bMin = max(1, (int) ($cfg['begleitpersonen']['min'] ?? 1));
    $bMax = (int) $cfg['begleitpersonen']['max'];
    if ($begleitung < $bMin || $begleitung > $bMax) {
        return $fail('Bitte gib zwischen ' . $bMin . ' und ' . $bMax . ' Begleitpersonen an.', 'begleitung');
    }
    if (!in_array($zeit, tj_kg_ankunftszeiten(), true)) {
        $a = $cfg['ankunftszeit'] ?? [];
        return $fail('Bitte wähle eine Ankunftszeit zwischen ' . ($a['von'] ?? '') . ' und ' . ($a['bis'] ?? '')
            . ' Uhr (im ' . (int) ($a['schritt_minuten'] ?? 0) . '-Minuten-Takt).', 'time');
    }
    return ['ok' => true, 'message' => '', 'errors' => []];
}
