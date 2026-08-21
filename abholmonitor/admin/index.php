<?php
/**
 * Abholmonitor — Administration
 *
 * Sicherheitsprinzip: Ohne inc/abholmonitor-config.php und ohne gesetzten
 * Passwort-Hash ist hier nichts bedienbar (fail closed). Alle Schreibwege
 * laufen über api.php und verlangen Sitzung + CSRF-Token — clientseitig
 * wird nichts abgesichert.
 */

declare(strict_types=1);

require __DIR__ . '/../lib.php';

am_send_noindex_headers();
header('Cache-Control: no-store');
am_session_start();

$fehler = '';

/* ---------- Abmelden ---------- */
if (($_GET['logout'] ?? '') === '1') {
    $_SESSION = [];
    session_destroy();
    header('Location: index.php');
    exit;
}

/* ---------- Anmelden ---------- */
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && isset($_POST['passwort'])) {
    if (!am_admin_ready()) {
        $fehler = 'Die Administration ist auf diesem Server noch nicht eingerichtet.';
    } elseif (am_login_blocked()) {
        $fehler = 'Zu viele Fehlversuche. Bitte später erneut probieren.';
    } elseif (!am_csrf_ok((string) ($_POST['csrf'] ?? ''))) {
        $fehler = 'Sitzung abgelaufen. Bitte erneut versuchen.';
    } else {
        $cfg = am_config() ?? [];
        if (password_verify((string) $_POST['passwort'], (string) $cfg['admin_password_hash'])) {
            session_regenerate_id(true);
            $_SESSION['am_admin'] = true;
            am_login_record(true);
            header('Location: index.php');
            exit;
        }
        am_login_record(false);
        $fehler = 'Passwort stimmt nicht.';
    }
}

$eingerichtet = am_admin_ready();
$angemeldet   = am_is_admin();
$csrf         = am_csrf_token();
?>
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
  <title>Abholmonitor verwalten – Tjorven Bistro</title>
  <link rel="stylesheet" href="../assets/monitor.css">
  <link rel="stylesheet" href="../assets/admin.css">
</head>
<body class="adm">

<header class="adm__head">
  <img class="adm__logo" src="../../images/tjorven-logo-gruen.png"
       alt="Tjorven Bistro" width="500" height="364" decoding="async">
  <h1 class="adm__title">Abholmonitor verwalten</h1>
  <?php if ($angemeldet): ?>
    <a class="adm__logout" href="index.php?logout=1">Abmelden</a>
  <?php endif; ?>
</header>

<main class="adm__main">

<?php if (!$eingerichtet): ?>
  <div class="adm__box adm__box--warn">
    <h2>Noch nicht eingerichtet</h2>
    <p>Auf dem Server fehlt <code>inc/abholmonitor-config.php</code> oder es ist kein
       Passwort-Hash hinterlegt. Solange das so ist, lässt sich hier bewusst nichts
       bedienen.</p>
    <p>Vorlage <code>inc/abholmonitor-config.example.php</code> kopieren und den mit
       <code>password_hash()</code> erzeugten Wert bei <code>admin_password_hash</code>
       eintragen.</p>
  </div>

<?php elseif (!$angemeldet): ?>
  <form class="adm__box adm__login" method="post" action="index.php">
    <h2>Anmelden</h2>
    <?php if ($fehler): ?><p class="adm__error" role="alert"><?= am_e($fehler) ?></p><?php endif; ?>
    <input type="hidden" name="csrf" value="<?= am_e($csrf) ?>">
    <label for="pw">Passwort</label>
    <input type="password" id="pw" name="passwort" autocomplete="current-password" required autofocus>
    <button type="submit" class="adm__btn adm__btn--primary">Anmelden</button>
  </form>

<?php else: ?>
  <form class="adm__box adm__add" id="form-add" autocomplete="off">
    <h2>Neue Bestellnummer</h2>
    <div class="adm__addrow">
      <label class="adm__sronly" for="nr">Bestellnummer</label>
      <input type="text" id="nr" name="nr" inputmode="numeric" maxlength="6"
             placeholder="z. B. 42" required
             pattern="[A-Za-z0-9]{1,6}"
             aria-describedby="nr-hint">
      <button type="submit" class="adm__btn adm__btn--primary">Hinzufügen</button>
    </div>
    <p class="adm__hint" id="nr-hint">1–6 Zeichen, Ziffern oder Buchstaben.</p>
  </form>

  <p class="adm__msg" id="msg" role="status" aria-live="polite"></p>

  <section class="adm__box" aria-labelledby="h-prep">
    <h2 id="h-prep">In Vorbereitung</h2>
    <ul class="adm__list" id="adm-prep"></ul>
    <p class="adm__empty" id="adm-prep-empty">Nichts in Arbeit.</p>
  </section>

  <section class="adm__box" aria-labelledby="h-ready">
    <h2 id="h-ready">Abholbereit</h2>
    <ul class="adm__list" id="adm-ready"></ul>
    <p class="adm__empty" id="adm-ready-empty">Nichts abholbereit.</p>
  </section>

  <section class="adm__box">
    <button type="button" class="adm__btn adm__btn--danger" id="btn-clear">
      Monitor komplett leeren
    </button>
    <p class="adm__hint">Entfernt alle Nummern. Lässt sich nicht rückgängig machen.</p>
  </section>

  <p class="adm__hint">
    <a href="../index.php" target="_blank" rel="noopener">Monitoransicht öffnen</a>
  </p>

  <script>window.AM_CSRF = <?= json_encode($csrf) ?>;</script>
  <script src="../assets/admin.js" defer></script>
<?php endif; ?>

</main>
</body>
</html>
