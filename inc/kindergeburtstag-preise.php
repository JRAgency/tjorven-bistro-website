<?php
/**
 * Tjorven Bistro — serverseitige Berechnung des Kindergeburtstag-Planers
 *
 * Grundlage ist ausschließlich data/kindergeburtstag-preise.json: die beiden
 * Kindergeburtstags-Menüs aus der PDF „Kindergeburtstag im Bistro Tjorven“ und
 * Speisen & Getränke à la carte aus der aktuellen Speisekarte. Dieselbe Datei
 * liest auch der Planer im Browser (js/kindergeburtstag-rechner.js); die hier
 * berechnete Summe ist maßgeblich.
 *
 * Berechnet wird nur, was einen eindeutigen Preis hat. Ein Artikel mit
 * "preis": null würde mit Anzahl übermittelt, aber als „Preis auf Anfrage“ nicht
 * in die Summe eingerechnet (derzeit hat jeder Artikel einen eindeutigen Preis).
 *
 * Alle Beträge in Cent (Integer).
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

function tj_kg_euro(int $cent): string
{
    return number_format($cent / 100, 2, ',', '.') . ' €';
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
 * @param string $json          Auswahl aus dem Browser (Feld "auswahl")
 * @param int    $kinder        bereits als Zahl validierte Kinderzahl
 * @param int    $begleitung    Begleitpersonen (nur Planung, ohne Preiswirkung)
 * @param string $datum         Wunschtermin JJJJ-MM-TT (für die Verfügbarkeit der Lasagne)
 * @return array{ok:bool,message:string,errors:array,modus:string,positionen:array,hinweise:array,kuchen:bool,summe:int}
 */
function tj_kg_calculate(string $json, int $kinder, int $begleitung = 0, string $datum = ''): array
{
    $cfg  = tj_kg_config();
    $fail = static fn (string $msg, string $feld = 'auswahl'): array => [
        'ok' => false, 'message' => $msg, 'errors' => [$feld => $msg], 'modus' => '',
        'positionen' => [], 'hinweise' => [], 'kuchen' => false, 'summe' => 0,
    ];
    if (!$cfg) {
        return $fail('Die Preisübersicht ist gerade nicht verfügbar. Bitte versuche es später noch einmal.');
    }
    if (strlen($json) > 8000) {
        return $fail('Die Auswahl ist zu umfangreich.');
    }
    $sel = json_decode($json, true);
    if (!is_array($sel)) {
        return $fail('Die Auswahl konnte nicht gelesen werden. Bitte lade die Seite neu.');
    }
    if ($kinder < (int) $cfg['kinder']['min'] || $kinder > (int) $cfg['kinder']['max']) {
        return $fail('Bitte gib eine Kinderzahl zwischen ' . (int) $cfg['kinder']['min'] . ' und '
            . (int) $cfg['kinder']['max'] . ' an.', 'guests');
    }
    if ($begleitung < 0 || $begleitung > (int) $cfg['begleitpersonen']['max']) {
        return $fail('Bitte gib eine gültige Zahl an Begleitpersonen an.', 'begleitung');
    }

    /* ---------- Vorab auswählen oder spontan vor Ort ---------- */
    $modus = $sel['modus'] ?? '';
    if (!is_string($modus) || !in_array($modus, array_column($cfg['planung']['optionen'], 'id'), true)) {
        return $fail('Bitte wähle, wie ihr Speisen & Getränke planen möchtet.');
    }

    $positionen = [];

    /* ---------- Kindergeburtstags-Menüs (S. 3) ---------- */
    $menues = $sel['menues'] ?? [];
    if (!is_array($menues)) {
        return $fail('Ungültige Menüauswahl.');
    }
    $ids = array_column($cfg['menues']['auswahl'], 'id');
    foreach ($menues as $id => $anzahl) {
        if (!in_array((string) $id, $ids, true)) {
            return $fail('Unbekanntes Menü.');
        }
        if (!is_int($anzahl) || $anzahl < 0 || $anzahl > (int) $cfg['menues']['max_je_menue']) {
            return $fail('Bitte bei den Menüs nur ganze Anzahlen zwischen 0 und '
                . (int) $cfg['menues']['max_je_menue'] . ' angeben.');
        }
    }
    foreach ($cfg['menues']['auswahl'] as $m) {
        $anzahl = $menues[$m['id']] ?? 0;
        if ($anzahl === 0) {
            continue;
        }
        $positionen[] = [
            'gruppe' => 'Kindergeburtstags-Menüs',
            'titel'  => $m['titel'] . ' (' . implode(', ', $m['inhalt']) . ')',
            'menge'  => $anzahl, 'einheit' => '×',
            'einzel' => (int) $m['preis'],
            'summe'  => (int) $m['preis'] * $anzahl,
        ];
    }

    /* ---------- Speisen & Getränke à la carte (aktuelle Speisekarte) ---------- */
    $alc     = $cfg['a_la_carte'];
    $artikel = $sel['artikel'] ?? [];
    if (!is_array($artikel)) {
        return $fail('Ungültige Auswahl à la carte.');
    }
    $bekannt = [];
    foreach ($alc['schritte'] as $s) {
        foreach ($s['artikel'] as $a) {
            $bekannt[$a['id']] = $a;
        }
    }
    if (count($artikel) > count($bekannt)) {
        return $fail('Ungültige Auswahl à la carte.');
    }
    $anzahl = [];
    foreach ($artikel as $id => $n) {
        if (!is_string($id) || !isset($bekannt[$id])) {
            return $fail('Unbekannter Artikel.');
        }
        if (!is_int($n) || $n < 0 || $n > (int) $alc['max_je_artikel']) {
            return $fail('Bitte nur ganze Anzahlen zwischen 0 und ' . (int) $alc['max_je_artikel'] . ' angeben.');
        }
        if ($n > 0) {
            $anzahl[$id] = $n;
        }
    }
    // Spontan vor Ort: die Speisekarten-Schritte sind ausgeblendet, eine Vorauswahl darf es nicht geben
    if ($modus === 'spontan' && $anzahl) {
        return $fail('Ungültige Auswahl à la carte.');
    }
    // Aufpreis-Toppings gibt es nur zu dem Artikel, zu dem sie gehören (z. B. zur Waffel)
    foreach ($anzahl as $id => $n) {
        $zu = $bekannt[$id]['zusatz_zu'] ?? '';
        if ($zu !== '' && empty($anzahl[$zu])) {
            return $fail($bekannt[$id]['name'] . ' gibt es nur zu: ' . $bekannt[$zu]['name'] . '.');
        }
    }

    $hinweise = [];
    foreach ($alc['schritte'] as $s) {
        foreach ($s['artikel'] as $a) {
            $n = $anzahl[$a['id']] ?? 0;
            if ($n === 0) {
                continue;
            }
            $titel = $a['name'] . (!empty($a['menge_text']) ? ' (' . $a['menge_text'] . ')' : '');
            if ($a['preis'] === null) {
                $positionen[] = [
                    'gruppe' => $s['kategorie'], 'titel' => $titel, 'menge' => $n, 'einheit' => '×',
                    'einzel' => null, 'summe' => 0, 'preis_text' => (string) $a['preis_text'],
                ];
            } else {
                $positionen[] = [
                    'gruppe' => $s['kategorie'], 'titel' => $titel, 'menge' => $n, 'einheit' => '×',
                    'einzel' => (int) $a['preis'], 'summe' => (int) $a['preis'] * $n,
                ];
            }
            // Lasagne: Samstag & Sonntag laut Karte; an anderen Tagen nicht sperren, sondern prüfen
            if (($a['verfuegbarkeit'] ?? '') === 'wochenende') {
                $regel = $alc['verfuegbarkeit']['wochenende'];
                $tag   = tj_kg_wochentag($datum);
                if (in_array($tag, $regel['iso_tage'], true)) {
                    $hinweise[] = $a['name'] . ': Wunschtermin ist ein ' . ($tag === 6 ? 'Samstag' : 'Sonntag')
                        . ' – laut Speisekarte im Angebot.';
                } else {
                    $hinweise[] = $a['name'] . ': ' . $regel['text_pruefen'];
                }
            }
        }
    }

    /* ---------- Geburtstagskuchen (S. 2: „Kuchen darf mitgebracht werden“) ---------- */
    $kuchen = $sel['kuchen'] ?? false;
    if (!is_bool($kuchen)) {
        return $fail('Ungültige Angabe zum Kuchen.');
    }

    // S. 2: Einen Tischbereich gibt es, wenn Speisen oder Getränke bestellt werden.
    // Wer spontan vor Ort bestellt, erfüllt das vor Ort; wer vorab plant, wählt hier etwas aus.
    if ($modus === 'vorab' && !$positionen) {
        return $fail('Einen Tischbereich reservieren wir, wenn Speisen oder Getränke im Tjorven Bistro bestellt werden. '
            . 'Bitte wähle mindestens ein Menü oder etwas von der Speisekarte – oder entscheidet spontan vor Ort.');
    }

    if ($modus === 'spontan') {
        array_unshift($hinweise, 'Speisen & Getränke: spontan vor Ort nach unserer Speisekarte – nicht in der Kostenschätzung enthalten.');
    } elseif ($anzahl) {
        array_unshift($hinweise, 'Vorauswahl à la carte: ' . $alc['vorab_hinweis']);
    }
    if ($kuchen) {
        $hinweise[] = 'Geburtstagskuchen wird mitgebracht (Kuchen darf mitgebracht werden).';
    }

    $summe = 0;
    foreach ($positionen as $p) {
        $summe += $p['summe'];
    }

    return [
        'ok' => true, 'message' => '', 'errors' => [], 'modus' => $modus,
        'positionen' => $positionen, 'hinweise' => $hinweise, 'kuchen' => $kuchen, 'summe' => $summe,
    ];
}

/**
 * Abschnitt der Mail mit Planung, Auswahl, Kostenschätzung und Hinweisen.
 *
 * @param string $clientSumme im Browser angezeigter Betrag in Cent (nur Vergleich)
 * @return string[]
 */
function tj_kg_mail_lines(array $calc, string $clientSumme, int $kinder, int $begleitung, string $datum = ''): array
{
    $cfg   = tj_kg_config();
    $tage  = [1 => 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
    $modus = '';
    foreach ($cfg['planung']['optionen'] as $o) {
        if ($o['id'] === $calc['modus']) {
            $modus = $o['kurz'];
        }
    }
    $lines = [];
    $lines[] = '';
    $lines[] = 'GRUPPE & PLANUNG';
    $lines[] = str_repeat('-', 46);
    $lines[] = 'Kinder: ' . $kinder . ' · Begleitpersonen: ' . $begleitung;
    $tag = tj_kg_wochentag($datum);
    if ($tag) {
        $lines[] = 'Wunschtermin: ' . $tage[$tag] . ', ' . date('d.m.Y', (int) strtotime($datum));
    }
    $lines[] = 'Speisen & Getränke: ' . $modus;
    $lines[] = '';
    $lines[] = 'UNVERBINDLICHE KOSTENSCHÄTZUNG (vom Server berechnet)';
    $lines[] = str_repeat('-', 46);
    if ($calc['positionen']) {
        $gruppe = null;
        foreach ($calc['positionen'] as $p) {
            if ($p['gruppe'] !== $gruppe) {
                $gruppe  = $p['gruppe'];
                $lines[] = '[' . $gruppe . ']';
            }
            $lines[] = $p['titel'];
            $lines[] = $p['einzel'] === null
                ? '  ' . $p['menge'] . ' × ' . $p['preis_text'] . ' – nicht in der Summe'
                : '  ' . $p['menge'] . ' × ' . tj_kg_euro($p['einzel']) . ' = ' . tj_kg_euro($p['summe']);
        }
    } else {
        $lines[] = 'Keine Menüs und keine Speisen oder Getränke vorab ausgewählt.';
    }
    $lines[] = str_repeat('-', 46);
    $lines[] = 'Voraussichtliche Kostenschätzung: ' . tj_kg_euro($calc['summe']);
    $lines[] = $cfg['preis_hinweis'] ?? '';

    if ($calc['hinweise']) {
        $lines[] = '';
        $lines[] = 'HINWEISE';
        foreach ($calc['hinweise'] as $h) {
            $lines[] = '  - ' . $h;
        }
    }

    if ($clientSumme !== '' && ctype_digit($clientSumme) && (int) $clientSumme !== $calc['summe']) {
        $lines[] = '';
        $lines[] = 'HINWEIS: Im Browser wurde ' . tj_kg_euro((int) $clientSumme)
            . ' angezeigt. Maßgeblich ist die obige, serverseitig berechnete Summe.';
    }

    return $lines;
}
