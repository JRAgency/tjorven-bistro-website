<?php
/**
 * Abholmonitor — Anzeige für den Fernseher im Bistro
 *
 * Zeigt ausschließlich an. Es gibt hier keinerlei Bedienelemente, mit denen
 * sich Bestellungen ändern liessen — das passiert nur in /abholmonitor/admin/.
 *
 * Der aktuelle Stand wird serverseitig gerendert, damit der Monitor auch dann
 * sofort etwas anzeigt, wenn JavaScript noch nicht geladen ist. Danach hält
 * ein schlanker Poller die Anzeige aktuell.
 */

declare(strict_types=1);

require __DIR__ . '/lib.php';

am_send_noindex_headers();
header('Cache-Control: no-store');

$orders = am_with_orders();
$prep = $ready = [];
foreach ($orders as $o) {
    if ($o['status'] === 'ready') { $ready[] = $o; } else { $prep[] = $o; }
}
// Beide Spalten nach Bestellnummer sortiert — ein Gast sucht seine
// Nummer, nicht den Zeitpunkt der Eingabe.
$prep  = am_sort_by_nr($prep);
$ready = am_sort_by_nr($ready);
?>
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
  <title>Abholmonitor – Tjorven Bistro</title>
  <link rel="stylesheet" href="assets/monitor.css">
</head>
<body class="mon">

  <main class="mon__grid">

    <!-- Linke Spalte: Marke. Bewusst schmal gehalten, damit die beiden
         Nummernbereiche den Bildschirm dominieren. -->
    <aside class="mon__brand">
      <p class="mon__clock" id="clock" aria-hidden="true"></p>
      <div class="mon__brandgroup">
        <img class="mon__logo" src="../images/tjorven-logo-gruen.png"
             alt="Tjorven Bistro" width="500" height="364" decoding="async">
        <p class="mon__welcome">Herzlich Willkommen im Tjorven Bistro</p>
        <p class="mon__subtitle">Abholmonitor</p>
      </div>
      <p class="mon__status" id="status" role="status"></p>
    </aside>

    <section class="mon__col mon__col--prep" aria-labelledby="t-prep">
      <div class="mon__colhead">
        <h1 class="mon__coltitle" id="t-prep">In Vorbereitung</h1>
        <!-- Seitenanzeige. Bleibt leer und unsichtbar, solange alles auf
             eine Seite passt; das Skript blendet sie nur bei Bedarf ein. -->
        <p class="mon__pages" id="pages-prep" aria-hidden="true" hidden></p>
      </div>
      <ol class="mon__list" id="list-prep" aria-live="polite" aria-relevant="additions removals">
        <?php foreach ($prep as $o): ?>
        <li class="mon__nr"><?= am_e((string) $o['nr']) ?></li>
        <?php endforeach; ?>
      </ol>
      <p class="mon__empty" id="empty-prep"<?= $prep ? ' hidden' : '' ?>>Gerade nichts in Arbeit</p>
    </section>

    <section class="mon__col mon__col--ready" aria-labelledby="t-ready">
      <div class="mon__colhead">
        <h1 class="mon__coltitle" id="t-ready">Abholbereit</h1>
        <p class="mon__pages" id="pages-ready" aria-hidden="true" hidden></p>
      </div>
      <ol class="mon__list" id="list-ready" aria-live="polite" aria-relevant="additions removals">
        <?php foreach ($ready as $o): ?>
        <li class="mon__nr mon__nr--ready"><?= am_e((string) $o['nr']) ?></li>
        <?php endforeach; ?>
      </ol>
      <p class="mon__empty" id="empty-ready"<?= $ready ? ' hidden' : '' ?>>Noch nichts abholbereit</p>
    </section>

  </main>

  <script src="assets/monitor.js" defer></script>
</body>
</html>
