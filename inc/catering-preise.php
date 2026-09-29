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
 * @return array{ok:bool,message:string,errors:array,positionen:array,hinweise:array,speisen:array,summe:int,ab:bool}
 */
function tj_catering_calculate(string $json, int $persons): array
{
    $cfg  = tj_catering_config();
    $fail = static fn (string $msg, string $feld = 'auswahl'): array => [
        'ok' => false, 'message' => $msg, 'errors' => [$feld => $msg],
        'positionen' => [], 'hinweise' => [], 'speisen' => [], 'summe' => 0, 'ab' => false,
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
    $speisenOut = [];
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

        $positionen[] = [
            'gruppe' => 'Menü',
            'titel'  => $variante['titel'] . ' (' . $folge['titel'] . ')',
            'menge'  => $persons, 'einheit' => 'Pers.',
            'einzel' => (int) $variante['preis_ab_pp'],
            'summe'  => (int) $variante['preis_ab_pp'] * $persons,
            'ab'     => !empty($variante['preis_ist_ab']),
        ];
        $ab = $ab || !empty($variante['preis_ist_ab']);

        // Mehr Auswahl
        $mehr     = $variante['mehr_auswahl'];
        $gewaehlt = $menue['mehr'] ?? [];
        if (!is_array($gewaehlt)) {
            return $fail('Ungültige Menüauswahl.');
        }
        $gewaehlt = array_values(array_unique(array_map('strval', $gewaehlt)));
        $optIds   = array_column($mehr['optionen'], 'id');
        foreach ($gewaehlt as $optId) {
            if (!in_array($optId, $optIds, true)) {
                return $fail('Unbekannte Menüoption.');
            }
        }
        if ($gewaehlt && $persons < (int) $mehr['min_personen']) {
            return $fail($mehr['titel'] . ': erst ab ' . (int) $mehr['min_personen'] . ' Personen möglich.');
        }
        $zweiteErlaubt = []; // Gang => true, wenn eine zweite Speise gewählt werden darf
        foreach ($mehr['optionen'] as $opt) {
            if (!in_array($opt['id'], $gewaehlt, true)) {
                continue;
            }
            $positionen[] = [
                'gruppe' => 'Menü',
                'titel'  => 'Mehr Auswahl: ' . $opt['titel'],
                'menge'  => $persons, 'einheit' => 'Pers.',
                'einzel' => (int) $opt['aufpreis_pp'],
                'summe'  => (int) $opt['aufpreis_pp'] * $persons,
                'ab'     => false,
            ];
            foreach ($opt['gaenge'] as $gang) {
                if (in_array($gang, $folge['gaenge'], true)) {
                    $zweiteErlaubt[$gang] = true;
                }
            }
        }

        // Speisenwahl (ohne Preiswirkung, aber gegen die Regeln geprüft)
        $speisen = $menue['speisen'] ?? [];
        if (!is_array($speisen)) {
            return $fail('Ungültige Speisenauswahl.');
        }
        foreach (['vorspeise', 'hauptspeise', 'dessert'] as $gang) {
            $ids = $speisen[$gang] ?? [];
            if (!is_array($ids)) {
                return $fail('Ungültige Speisenauswahl.');
            }
            $ids = array_values(array_filter(array_map('strval', $ids), static fn ($x) => $x !== ''));
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
            $namen = [];
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
                $namen[] = $gefunden['name'];
            }
            $speisenOut[] = [
                'gang'   => $cfg['speisen'][$gang]['titel'],
                'namen'  => $namen,
                'max'    => $max,
            ];
        }
    }

    /* ---------- Frühstück, Snacks & Fingerfood (S. 4) ---------- */
    $stueck = $sel['stueck'] ?? [];
    if (!is_array($stueck)) {
        return $fail('Ungültige Mengenangabe.');
    }
    $stueckMax = (int) ($cfg['stueck_max'] ?? 9999);
    $bekannt   = [];
    foreach ($cfg['stueckartikel']['gruppen'] as $gr) {
        foreach ($gr['artikel'] as $a) {
            $bekannt[$a['id']] = ['gruppe' => $gr, 'artikel' => $a];
        }
    }
    $mengen = [];
    foreach ($stueck as $id => $menge) {
        $id = (string) $id;
        if (!isset($bekannt[$id])) {
            return $fail('Unbekannter Artikel.');
        }
        if (!is_int($menge) && !(is_string($menge) && ctype_digit($menge))) {
            return $fail('Bitte nur ganze Mengen angeben.');
        }
        $menge = (int) $menge;
        if ($menge < 0 || $menge > $stueckMax) {
            return $fail('Bitte eine Menge zwischen 0 und ' . $stueckMax . ' angeben.');
        }
        $mengen[$id] = $menge;
    }
    foreach ($bekannt as $id => $eintrag) {
        $menge = $mengen[$id] ?? 0;
        if ($menge === 0) {
            continue;
        }
        $gr = $eintrag['gruppe'];
        $a  = $eintrag['artikel'];
        $positionen[] = [
            'gruppe' => $gr['titel'],
            'titel'  => $gr['titel'] . ': ' . $a['name'],
            'menge'  => $menge, 'einheit' => $a['einheit'] ?? 'Stück',
            'einzel' => (int) $gr['preis'],
            'summe'  => (int) $gr['preis'] * $menge,
            'ab'     => false,
        ];
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

    /* ---------- Servicepersonal & Spülpauschale (S. 8) ---------- */
    $personal = $cfg['service']['personal'];
    $service  = $sel['service'] ?? [];
    $kraefte  = is_array($service) ? ($service['kraefte'] ?? 0) : 0;
    $stunden  = is_array($service) ? ($service['stunden'] ?? 0) : 0;
    if (!is_numeric($kraefte) || !is_numeric($stunden)) {
        return $fail('Bitte beim Servicepersonal nur Zahlen angeben.');
    }
    $kraefte     = (float) $kraefte;
    $halbStunden = (float) $stunden * 2;
    if ($kraefte != floor($kraefte) || $kraefte < 0 || $kraefte > (int) $personal['kraefte_max']
        || $halbStunden != floor($halbStunden) || $halbStunden < 0 || $halbStunden > (int) $personal['stunden_max'] * 2) {
        return $fail('Bitte beim Servicepersonal eine gültige Schätzung angeben.');
    }
    $kraefte     = (int) $kraefte;
    $halbStunden = (int) $halbStunden;
    if ($kraefte > 0 && $halbStunden > 0) {
        $stundenGesamt = $kraefte * $halbStunden; // in halben Stunden
        $positionen[] = [
            'gruppe' => 'Service',
            'titel'  => $personal['titel'] . ' (Schätzung: ' . $kraefte . ' × '
                . tj_catering_stunden($halbStunden) . ' Std.)',
            'menge'  => $stundenGesamt / 2, 'einheit' => 'Std.',
            'einzel' => (int) $personal['preis_pro_stunde'],
            'summe'  => intdiv((int) $personal['preis_pro_stunde'] * $stundenGesamt, 2),
            'ab'     => false,
        ];
        $hinweise[] = $personal['titel'] . ': deine eigene Schätzung ist in der Summe enthalten – '
            . 'abgerechnet wird nach tatsächlichem Aufwand, die Einsatzzeit wird individuell abgestimmt.';
    } else {
        $hinweise[] = $personal['titel'] . ': nach tatsächlichem Aufwand ('
            . $personal['preis_text'] . ') – nicht in der Summe enthalten, die Einsatzzeit wird individuell abgestimmt.';
    }
    $hinweise[] = $cfg['service']['spuelpauschale']['titel'] . ': Preis auf Anfrage, nicht in der Summe enthalten – '
        . $cfg['service']['spuelpauschale']['text'];

    if (!$positionen) {
        return $fail('Bitte wähle mindestens eine Leistung aus.');
    }

    $summe = 0;
    foreach ($positionen as $pos) {
        $summe += $pos['summe'];
    }

    return [
        'ok' => true, 'message' => '', 'errors' => [],
        'positionen' => $positionen, 'hinweise' => $hinweise, 'speisen' => $speisenOut,
        'summe' => $summe, 'ab' => $ab,
    ];
}

/**
 * 7 halbe Stunden -> "3,5"
 */
function tj_catering_stunden(int $halbeStunden): string
{
    return $halbeStunden % 2 === 0 ? (string) intdiv($halbeStunden, 2) : number_format($halbeStunden / 2, 1, ',', '');
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

    if ($calc['speisen']) {
        $lines[] = '';
        $lines[] = 'SPEISENWAHL (MENÜ)';
        $lines[] = str_repeat('-', 46);
        foreach ($calc['speisen'] as $s) {
            $lines[] = $s['gang'] . ':';
            if ($s['namen']) {
                foreach ($s['namen'] as $n) {
                    $lines[] = '  - ' . $n;
                }
            } else {
                $lines[] = '  - noch offen';
            }
        }
    }

    $lines[] = '';
    $lines[] = 'UNVERBINDLICHE KOSTENSCHÄTZUNG (vom Server berechnet)';
    $lines[] = str_repeat('-', 46);
    foreach ($calc['positionen'] as $p) {
        $lines[] = $p['titel'];
        $lines[] = '  ' . tj_catering_menge($p['menge']) . ' ' . $p['einheit'] . ' × '
            . ($p['ab'] ? 'ab ' : '') . tj_catering_euro($p['einzel'])
            . ' = ' . ($p['ab'] ? 'ab ' : '') . tj_catering_euro($p['summe']);
    }
    $lines[] = str_repeat('-', 46);
    $lines[] = 'Voraussichtliche Kostenschätzung: ' . ($calc['ab'] ? 'ab ' : '') . tj_catering_euro($calc['summe']);
    $lines[] = $cfg['mwst_hinweis'] ?? '';
    if ($calc['ab']) {
        $lines[] = 'Menüpreise sind laut Cateringangebot Ab-Preise pro Person.';
    }

    $lines[] = '';
    $lines[] = 'HINWEISE & PREISE AUF ANFRAGE';
    foreach ($calc['hinweise'] as $h) {
        $lines[] = '  - ' . $h;
    }

    // Vergleich mit dem im Browser angezeigten Betrag – nur zur Kontrolle
    if ($clientSumme !== '' && ctype_digit($clientSumme) && (int) $clientSumme !== $calc['summe']) {
        $lines[] = '';
        $lines[] = 'HINWEIS: Im Browser wurde ' . tj_catering_euro((int) $clientSumme)
            . ' angezeigt. Maßgeblich ist die obige, serverseitig berechnete Summe.';
    }

    $lines[] = '';
    $lines[] = 'Die berechnete Summe dient als erste Kostenschätzung. Der endgültige Preis kann';
    $lines[] = 'abhängig von den konkreten Anforderungen und der finalen Abstimmung abweichen.';

    return $lines;
}
