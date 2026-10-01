<?php
/**
 * Tjorven Bistro — serverseitige Preisberechnung des Catering-Rechners
 *
 * Grundlage ist ausschließlich data/catering-preise.json. Dieselbe Datei liest
 * auch der Rechner im Browser (js/catering-rechner.js). Beide Seiten rechnen
 * nach denselben Regeln; die hier berechnete Summe ist maßgeblich. Ein vom
 * Browser mitgeschickter Betrag wird nie übernommen, sondern nur verglichen.
 *
 * Alle Beträge in Cent (Integer), damit keine Rundungsfehler entstehen.
 * Die Preise sind laut PDF Nettopreise zzgl. gesetzlicher Mehrwertsteuer;
 * eine Mehrwertsteuer wird bewusst NICHT berechnet.
 */

declare(strict_types=1);

/**
 * Lädt die Preiskonfiguration (einmal pro Anfrage).
 */
function tj_catering_config(): array
{
    static $config = null;
    if ($config === null) {
        $file = __DIR__ . '/../data/catering-preise.json';
        $data = is_file($file) ? json_decode((string) file_get_contents($file), true) : null;
        $config = is_array($data) ? $data : [];
    }
    return $config;
}

/**
 * Deutsche Preisformatierung: 124550 -> "1.245,50 €"
 */
function tj_catering_euro(int $cent): string
{
    return number_format($cent / 100, 2, ',', '.') . ' €';
}

/**
 * Berechnet die Kostenschätzung aus der im Browser getroffenen Auswahl.
 *
 * @param string $json    JSON der Auswahl (Feld "auswahl")
 * @param int    $persons bereits validierte Personenzahl
 * @return array{ok:bool,message:string,errors:array,positionen:array,hinweise:array,summe:int,ab:bool}
 */
function tj_catering_calculate(string $json, int $persons): array
{
    $cfg  = tj_catering_config();
    $fail = static fn (string $msg, string $feld = 'auswahl'): array => [
        'ok' => false, 'message' => $msg, 'errors' => [$feld => $msg],
        'positionen' => [], 'hinweise' => [], 'summe' => 0, 'ab' => false,
    ];
    if (!$cfg) {
        return $fail('Die Preisübersicht ist gerade nicht verfügbar. Bitte versuche es später noch einmal.');
    }
    if (strlen($json) > 20000) {
        return $fail('Die Auswahl ist zu umfangreich.');
    }
    $sel = json_decode($json, true);
    if (!is_array($sel)) {
        return $fail('Die Auswahl konnte nicht gelesen werden. Bitte lade die Seite neu.');
    }

    $pMin = (int) $cfg['personen']['min'];
    $pMax = (int) $cfg['personen']['max'];
    if ($persons < $pMin || $persons > $pMax) {
        return $fail($cfg['personen']['text'], 'guests');
    }

    $positionen = [];
    $hinweise   = [];
    $ab         = false;

    /* ---------- Menü (S. 5 / S. 6) ---------- */
    $menue = $sel['menue'] ?? null;
    if (is_array($menue) && ($menue['id'] ?? null) !== null && $menue['id'] !== '') {
        $variante = null;
        foreach ($cfg['menues']['varianten'] as $v) {
            if ($v['id'] === $menue['id']) {
                $variante = $v;
            }
        }
        if ($variante === null) {
            return $fail('Unbekannte Menüvariante.');
        }
        $folge = null;
        foreach ($variante['gangfolgen'] as $g) {
            if ($g['id'] === ($menue['gangfolge'] ?? '')) {
                $folge = $g;
            }
        }
        if ($folge === null) {
            return $fail('Bitte wähle die Gangfolge des Menüs.');
        }

        // Mehr Auswahl: jede Option gilt genau für ihren Gang und nur, wenn dieser Gang zur Gangfolge gehört
        $mehr     = $variante['mehr_auswahl'];
        $gewaehlt = $menue['mehr'] ?? [];
        if (!is_array($gewaehlt)) {
            return $fail('Ungültige Menüauswahl.');
        }
        foreach ($gewaehlt as $optId) {
            if (!is_string($optId)) {
                return $fail('Unbekannte Menüoption.');
            }
        }
        if (count($gewaehlt) !== count(array_unique($gewaehlt))) {
            return $fail('Eine Menüoption wurde doppelt gewählt.');
        }
        $optIds = array_column($mehr['optionen'], 'id');
        foreach ($gewaehlt as $optId) {
            if (!in_array($optId, $optIds, true)) {
                return $fail('Unbekannte Menüoption.');
            }
        }
        if ($gewaehlt && $persons < (int) $mehr['min_personen']) {
            return $fail($mehr['titel'] . ': erst ab ' . (int) $mehr['min_personen'] . ' Personen möglich.');
        }
        $optionen      = [];   // gewählte Optionen in der Reihenfolge der Preisliste
        $zweiteErlaubt = [];   // Gang => true, wenn eine zweite Speise gewählt werden darf
        foreach ($mehr['optionen'] as $opt) {
            if (!in_array($opt['id'], $gewaehlt, true)) {
                continue;
            }
            if (!array_intersect($opt['gaenge'], $folge['gaenge'])) {
                return $fail($opt['titel'] . ' passt nicht zur gewählten Gangfolge.');
            }
            foreach ($opt['gaenge'] as $gang) {
                $zweiteErlaubt[$gang] = true;
            }
            $optionen[] = $opt;
        }

        // Speisenwahl (ohne Preiswirkung, aber gegen die Regeln geprüft)
        $speisen = $menue['speisen'] ?? [];
        if (!is_array($speisen)) {
            return $fail('Ungültige Speisenauswahl.');
        }
        $namen = [];   // Gang => [erste Speise, zweite Speise]
        foreach (['vorspeise', 'hauptspeise', 'dessert'] as $gang) {
            $ids = $speisen[$gang] ?? [];
            if (!is_array($ids)) {
                return $fail('Ungültige Speisenauswahl.');
            }
            foreach ($ids as $id) {
                if (!is_string($id)) {
                    return $fail('Unbekannte Speise.');
                }
            }
            $ids = array_values(array_filter($ids, static fn ($x) => $x !== ''));
            if (!in_array($gang, $folge['gaenge'], true)) {
                if ($ids) {
                    return $fail('Die gewählte Speise passt nicht zur Gangfolge.');
                }
                continue;
            }
            $max = empty($zweiteErlaubt[$gang]) ? 1 : 2;
            if (count($ids) > $max || count($ids) !== count(array_unique($ids))) {
                return $fail('Zu viele Speisen für diesen Gang gewählt.');
            }
            $namen[$gang] = [];
            foreach ($ids as $id) {
                $gefunden = null;
                foreach ($cfg['speisen'][$gang]['auswahl'] as $s) {
                    if ($s['id'] === $id) {
                        $gefunden = $s;
                    }
                }
                if ($gefunden === null) {
                    return $fail('Unbekannte Speise.');
                }
                $namen[$gang][] = tj_catering_speise($gefunden);
            }
        }

        // Menü: gewählte erste Speise je Gang als Detail
        $details = [];
        foreach ($folge['gaenge'] as $gang) {
            if (isset($namen[$gang][0])) {
                $details[] = $cfg['speisen'][$gang]['label'] . ': ' . $namen[$gang][0];
            }
        }
        $positionen[] = [
            'gruppe'  => 'Menü',
            'titel'   => $variante['titel'] . ' (' . $folge['titel'] . ')',
            'menge'   => $persons, 'einheit' => 'Pers.',
            'einzel'  => (int) $variante['preis_ab_pp'],
            'summe'   => (int) $variante['preis_ab_pp'] * $persons,
            'ab'      => !empty($variante['preis_ist_ab']),
            'details' => $details,
        ];
        $ab = $ab || !empty($variante['preis_ist_ab']);

        // Mehr Auswahl: je Option ein eigener Posten mit der gewählten zweiten Speise
        foreach ($optionen as $opt) {
            $details = [];
            foreach ($opt['gaenge'] as $gang) {
                if (isset($namen[$gang][1])) {
                    $details[] = $cfg['speisen'][$gang]['label_zweite'] . ': ' . $namen[$gang][1];
                }
            }
            $positionen[] = [
                'gruppe'  => 'Menü',
                'titel'   => 'Mehr Auswahl: ' . $opt['titel'],
                'menge'   => $persons, 'einheit' => 'Pers.',
                'einzel'  => (int) $opt['aufpreis_pp'],
                'summe'   => (int) $opt['aufpreis_pp'] * $persons,
                'ab'      => false,
                'details' => $details,
            ];
        }
    }

    /* ---------- Frühstück, Snacks, Süßes, Wraps & Fingerfood (S. 4) ----------
       Gewählt wird nur, OB eine Position gewünscht ist. Berechnet wird sie
       automatisch für alle angegebenen Personen: Personen × Stückpreis der Gruppe. */
    $snacks = $sel['snacks'] ?? [];
    if (!is_array($snacks) || count($snacks) > 100) {
        return $fail('Ungültige Speisenauswahl.');
    }
    $bekannt = [];
    foreach ($cfg['stueckartikel']['gruppen'] as $gr) {
        foreach ($gr['artikel'] as $a) {
            $bekannt[$a['id']] = true;
        }
    }
    $gewaehlt = [];
    foreach ($snacks as $id) {
        if (!is_string($id) || !isset($bekannt[$id])) {
            return $fail('Unbekannter Artikel.');
        }
        if (isset($gewaehlt[$id])) {
            return $fail('Ein Artikel wurde doppelt gewählt.');
        }
        $gewaehlt[$id] = true;
    }
    foreach ($cfg['stueckartikel']['gruppen'] as $gr) {
        foreach ($gr['artikel'] as $a) {
            if (!isset($gewaehlt[$a['id']])) {
                continue;
            }
            $positionen[] = [
                'gruppe' => $gr['titel'],
                'titel'  => $gr['titel'] . ': ' . $a['name'],
                'menge'  => $persons, 'einheit' => 'Pers.',
                'einzel' => (int) $gr['preis'],
                'summe'  => (int) $gr['preis'] * $persons,
                'ab'     => false,
            ];
        }
    }

    /* ---------- Getränkepauschalen (S. 7) ---------- */
    $getraenke = $sel['getraenke'] ?? [];
    if (!is_array($getraenke)) {
        return $fail('Ungültige Getränkeauswahl.');
    }
    $dauerTitel = [];
    foreach ($cfg['getraenke']['dauer'] as $d) {
        $dauerTitel[$d['id']] = $d['titel'];
    }
    $pauschalIds = array_column($cfg['getraenke']['pauschalen'], 'id');
    foreach (array_keys($getraenke) as $id) {
        if (!in_array((string) $id, $pauschalIds, true)) {
            return $fail('Unbekannte Getränkepauschale.');
        }
    }
    foreach ($cfg['getraenke']['pauschalen'] as $pauschale) {
        $dauer = $getraenke[$pauschale['id']] ?? null;
        if ($dauer === null || $dauer === '') {
            continue;
        }
        if (!is_string($dauer) || !isset($dauerTitel[$dauer], $pauschale['preise_pp'][$dauer])) {
            return $fail('Bitte die Dauer der Getränkepauschale wählen.');
        }
        if ($persons < (int) $pauschale['min_personen']) {
            return $fail($pauschale['titel'] . ': ab ' . (int) $pauschale['min_personen'] . ' Personen.');
        }
        $einzel = (int) $pauschale['preise_pp'][$dauer];
        $positionen[] = [
            'gruppe' => 'Getränke',
            'titel'  => $pauschale['titel'] . ' (' . $dauerTitel[$dauer] . ')',
            'menge'  => $persons, 'einheit' => 'Pers.',
            'einzel' => $einzel,
            'summe'  => $einzel * $persons,
            'ab'     => false,
        ];
    }

    /* ---------- Servicepersonal & Spülpauschale (S. 8) ----------
       Seit 01.10.2026 nur noch Information: keine Eingabe, keine Berechnung.
       Ein mitgeschicktes „service“-Feld (z. B. aus einer alten Seite im Cache)
       wird ignoriert und kann den Preis nicht beeinflussen. */
    $personal = $cfg['service']['personal'];
    $hinweise[] = $personal['titel'] . ': nach tatsächlichem Aufwand (' . $personal['preis_text']
        . ') – nicht in der Kostenschätzung enthalten; die Einsatzzeit stimmen wir individuell ab.';
    $hinweise[] = $cfg['service']['spuelpauschale']['titel'] . ': ' . $cfg['service']['spuelpauschale']['text'];

    if (!$positionen) {
        return $fail('Bitte wähle mindestens eine Leistung aus.');
    }

    $summe = 0;
    foreach ($positionen as $pos) {
        $summe += $pos['summe'];
    }

    return [
        'ok' => true, 'message' => '', 'errors' => [],
        'positionen' => $positionen, 'hinweise' => $hinweise,
        'summe' => $summe, 'ab' => $ab,
    ];
}

/**
 * Speisenname wie in der Preisliste: Name und Beilage, ohne Hinweis
 */
function tj_catering_speise(array $s): string
{
    return $s['name'] . (!empty($s['detail']) ? ' ' . $s['detail'] : '');
}

/**
 * Menge für die Mail: 12 -> "12", 7.5 -> "7,5"
 */
function tj_catering_menge($menge): string
{
    return floor((float) $menge) == (float) $menge ? (string) (int) $menge : number_format((float) $menge, 1, ',', '');
}

/**
 * Baut den Abschnitt der Mail mit Speisenwahl und Kostenschätzung.
 *
 * @param string $clientSumme vom Browser angezeigter Betrag in Cent (nur zum Vergleich)
 * @return string[]
 */
function tj_catering_mail_lines(array $calc, string $clientSumme): array
{
    $cfg   = tj_catering_config();
    $lines = [];

    $lines[] = '';
    $lines[] = 'UNVERBINDLICHE KOSTENSCHÄTZUNG (vom Server berechnet)';
    $lines[] = str_repeat('-', 46);
    foreach ($calc['positionen'] as $p) {
        $lines[] = $p['titel'];
        $lines[] = '  ' . tj_catering_menge($p['menge']) . ' ' . $p['einheit'] . ' × '
            . ($p['ab'] ? 'ab ' : '') . tj_catering_euro($p['einzel'])
            . ' = ' . ($p['ab'] ? 'ab ' : '') . tj_catering_euro($p['summe']);
        foreach ($p['details'] ?? [] as $d) {
            $lines[] = '    · ' . $d;
        }
        if (($p['gruppe'] ?? '') === 'Menü' && empty($p['details'])) {
            $lines[] = '    · Speise noch nicht ausgewählt';
        }
    }
    $lines[] = str_repeat('-', 46);
    $lines[] = 'Voraussichtliche Kostenschätzung: ' . ($calc['ab'] ? 'ab ' : '') . tj_catering_euro($calc['summe']);
    $lines[] = $cfg['mwst_hinweis'] ?? '';
    if ($calc['ab']) {
        $lines[] = 'Menüpreise sind laut Cateringangebot Ab-Preise pro Person.';
    }

    $lines[] = '';
    $lines[] = 'HINWEISE';
    foreach ($calc['hinweise'] as $h) {
        $lines[] = '  - ' . $h;
    }

    // Vergleich mit dem im Browser angezeigten Betrag – nur zur Kontrolle
    if ($clientSumme !== '' && ctype_digit($clientSumme) && (int) $clientSumme !== $calc['summe']) {
        $lines[] = '';
        $lines[] = 'HINWEIS: Im Browser wurde ' . tj_catering_euro((int) $clientSumme)
            . ' angezeigt. Maßgeblich ist die obige, serverseitig berechnete Summe.';
    }

    return $lines;
}
