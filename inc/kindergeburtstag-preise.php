<?php
/**
 * Tjorven Bistro — serverseitige Prüfung des Kindergeburtstag-Planers
 *
 * Seit 01.10.2026 ist der Planer eine reine unverbindliche Anfrage: Die
 * Kindergeburtstags-Menüs und das Angebot à la carte werden nur als Information
 * gezeigt, nichts wird vorab ausgewählt oder berechnet. Hier werden deshalb nur
 * noch die Gruppengrößen geprüft und der Abschnitt für die Anfrage-Mail gebaut.
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
 * ISO-Wochentag (1 = Montag … 7 = Sonntag) eines Datums im Format JJJJ-MM-TT, sonst 0
 */
function tj_kg_wochentag(string $datum): int
{
    $d = DateTime::createFromFormat('!Y-m-d', $datum);
    return ($d && $d->format('Y-m-d') === $datum) ? (int) $d->format('N') : 0;
}

/**
 * Prüft Kinderzahl und Begleitpersonen gegen die Grenzen aus der Konfiguration.
 *
 * @return array{ok:bool,message:string,errors:array}
 */
function tj_kg_pruefen(int $kinder, int $begleitung): array
{
    $cfg  = tj_kg_config();
    $fail = static fn (string $msg, string $feld): array => ['ok' => false, 'message' => $msg, 'errors' => [$feld => $msg]];
    if (!$cfg) {
        return $fail('Die Anfrage ist gerade nicht möglich. Bitte versuche es später noch einmal.', 'guests');
    }
    if ($kinder < (int) $cfg['kinder']['min'] || $kinder > (int) $cfg['kinder']['max']) {
        return $fail('Bitte gib eine Kinderzahl zwischen ' . (int) $cfg['kinder']['min'] . ' und '
            . (int) $cfg['kinder']['max'] . ' an.', 'guests');
    }
    if ($begleitung < 0 || $begleitung > (int) $cfg['begleitpersonen']['max']) {
        return $fail('Bitte gib eine gültige Zahl an Begleitpersonen an.', 'begleitung');
    }
    return ['ok' => true, 'message' => '', 'errors' => []];
}

/**
 * Abschnitt der Anfrage-Mail mit Gruppe, Wunschtermin und Hinweis zu Speisen & Getränken.
 *
 * @return string[]
 */
function tj_kg_mail_lines(int $kinder, int $begleitung, string $datum = ''): array
{
    $tage  = [1 => 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
    $lines = [];
    $lines[] = '';
    $lines[] = 'GRUPPE & TERMIN';
    $lines[] = str_repeat('-', 46);
    $lines[] = 'Kinder: ' . $kinder . ' · Begleitpersonen: ' . $begleitung;
    $tag = tj_kg_wochentag($datum);
    if ($tag) {
        $lines[] = 'Wunschtermin: ' . $tage[$tag] . ', ' . date('d.m.Y', (int) strtotime($datum));
    }
    $lines[] = '';
    $lines[] = 'Speisen & Getränke: Im Planer wird nichts vorab ausgewählt. Kindergeburtstags-Menüs';
    $lines[] = 'und à la carte werden bei der Ankunft besprochen (Wünsche ggf. in der Nachricht oben).';
    return $lines;
}
