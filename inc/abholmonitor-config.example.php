<?php
/**
 * Abholmonitor — Konfiguration (VORLAGE)
 *
 * ANLEITUNG
 * ---------
 * Auf dem Webspace einmalig kopieren und ausfüllen:
 *
 *     inc/abholmonitor-config.example.php  ->  inc/abholmonitor-config.php
 *
 * inc/abholmonitor-config.php ist per .gitignore ausgeschlossen und darf
 * niemals committet werden.
 *
 * WICHTIG: Diese Datei ist von inc/config.php (Kontaktformulare) vollständig
 * getrennt. Beim Deployment darf inc/config.php nicht überschrieben werden.
 *
 * Fehlt diese Datei oder ist kein Passwort-Hash gesetzt, verweigert die
 * Administration jede Schreiboperation (fail closed).
 */

return [

    /* ------------------------------------------------------------------
     * Zugang zur Administration
     *
     * Es wird ausschließlich ein Hash gespeichert, nie das Passwort selbst.
     * Hash auf dem Server erzeugen (PHP-CLI im KAS oder lokal):
     *
     *     php -r "echo password_hash('DEIN-PASSWORT', PASSWORD_DEFAULT), PHP_EOL;"
     *
     * Den ausgegebenen Wert hier eintragen. Leer lassen = Administration
     * bleibt gesperrt.
     * ------------------------------------------------------------------ */
    'admin_password_hash' => '',

    /* ------------------------------------------------------------------
     * Datenspeicher
     *
     * Liegt bewusst in inc/, weil dieses Verzeichnis per inc/.htaccess für
     * direkte Browser-Zugriffe gesperrt ist. Die Datei enthält ausschließlich
     * Bestellnummer, Status und Zeitstempel — keine personenbezogenen Daten.
     * Leer lassen = Standardpfad inc/abholmonitor-data.php
     * ------------------------------------------------------------------ */
    'data_file' => '',

    /* ------------------------------------------------------------------
     * Automatische Bereinigung
     *
     * Bestellungen, die älter sind als dieser Wert, werden bei jedem Zugriff
     * automatisch entfernt. So bleiben keine Altdaten liegen.
     * ------------------------------------------------------------------ */
    'max_age_hours' => 12,

    /* Höchstzahl gleichzeitig angezeigter Bestellungen je Spalte */
    'max_orders' => 60,

    /* ------------------------------------------------------------------
     * Schutz gegen Passwort-Raten
     * ------------------------------------------------------------------ */
    'login_max_attempts' => 10,
    'login_lockout_min'  => 15,

    /* Zufallswert zum Anonymisieren der IP im Fehlversuchs-Zähler.
       Einmalig ersetzen, z. B. mit: openssl rand -hex 32 */
    'hash_salt' => 'BITTE-DURCH-ZUFALLSWERT-ERSETZEN',
];
