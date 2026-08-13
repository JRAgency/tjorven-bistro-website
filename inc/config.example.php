<?php
/**
 * Tjorven Bistro — Konfiguration der Formularverarbeitung (VORLAGE)
 *
 * ANLEITUNG
 * ---------
 * Diese Datei ist nur die Vorlage und enthält bewusst KEINE echten Zugangsdaten.
 * Auf dem Webspace einmalig kopieren und die Werte eintragen:
 *
 *     inc/config.example.php   ->   inc/config.php
 *
 * inc/config.php ist per .gitignore vom Repository ausgeschlossen und darf
 * niemals committet werden.
 */

return [

    /* ------------------------------------------------------------------
     * Empfänger — hier laufen die Formularanfragen auf
     * ------------------------------------------------------------------ */
    'recipient'      => 'kontakt@tjorven-bistro.de',
    'recipient_name' => 'Tjorven Bistro',

    /* ------------------------------------------------------------------
     * Technischer Absender
     *
     * WICHTIG: Muss eine Adresse der eigenen Domain sein, damit SPF/DKIM
     * greifen und die Mail nicht im Spam landet. Die vom Besucher
     * eingegebene Adresse wird NIE als Absender verwendet — sie landet
     * ausschließlich im Reply-To.
     *
     * Die Adresse muss im ALL-INKL KAS als Postfach oder Weiterleitung
     * tatsächlich existieren.
     * ------------------------------------------------------------------ */
    'from'      => 'website@tjorven-bistro.de',
    'from_name' => 'Tjorven Bistro Website',

    /* ------------------------------------------------------------------
     * Versandweg
     *
     * 'mail'  = PHP mail() — auf ALL-INKL ohne weitere Angaben lauffähig.
     *           Das ist die empfohlene Standardeinstellung.
     * 'smtp'  = Versand über einen SMTP-Zugang. Nur wählen, wenn die
     *           unten stehenden Zugangsdaten vollständig hinterlegt sind.
     * ------------------------------------------------------------------ */
    'transport' => 'mail',

    'smtp' => [
        'host'     => 'w01xxxxx.kasserver.com', // ALL-INKL Mailserver aus dem KAS
        'port'     => 587,                      // 587 = STARTTLS, 465 = SSL
        'secure'   => 'tls',                    // 'tls' oder 'ssl'
        'username' => '',                       // vollständige E-Mail-Adresse
        'password' => '',                       // NIEMALS in Git committen
    ],

    /* ------------------------------------------------------------------
     * Spam-Schutz
     *
     * Es werden bewusst keine externen Dienste (reCAPTCHA o. Ä.) eingebunden,
     * um keine Daten an Dritte zu übertragen.
     * ------------------------------------------------------------------ */

    // Maximale Anzahl Absendungen je IP innerhalb des Zeitfensters
    'rate_limit_max'     => 5,
    'rate_limit_window'  => 3600,   // Sekunden (3600 = 1 Stunde)

    // Schneller als so viele Sekunden nach Seitenaufruf abgeschickt = Bot.
    // Greift nur, wenn das Zeitfeld vorhanden ist (also bei aktivem JavaScript).
    'min_fill_seconds'   => 2.5,

    // Zufälliger Wert, ausschließlich zum Anonymisieren der IP im
    // Rate-Limit-Speicher. Bitte einmalig durch eine lange Zufallszeichenfolge
    // ersetzen, z. B. mit: openssl rand -hex 32
    'hash_salt'          => 'BITTE-DURCH-ZUFALLSWERT-ERSETZEN',

    /* ------------------------------------------------------------------
     * Verzeichnis für den Rate-Limit-Speicher
     *
     * Dort werden ausschließlich anonymisierte Zähler abgelegt —
     * keine Formularinhalte, keine Klartext-IP-Adressen.
     * Leer lassen = temporäres Systemverzeichnis verwenden.
     * ------------------------------------------------------------------ */
    'storage_dir' => '',

];
