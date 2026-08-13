<?php
/**
 * Tjorven Bistro — Konfiguration der Formularverarbeitung (VORLAGE)
 *
 * ANLEITUNG
 * ---------
 * Diese Datei ist nur die Vorlage und enthält bewusst KEINE echten Zugangsdaten.
 * Auf dem Webspace einmalig kopieren und die Werte prüfen:
 *
 *     inc/config.example.php   ->   inc/config.php
 *
 * inc/config.php ist per .gitignore vom Repository ausgeschlossen und darf
 * niemals committet werden.
 *
 *
 * WICHTIG ZUR MAIL-INFRASTRUKTUR DIESER DOMAIN
 * --------------------------------------------
 * Der E-Mail-Empfang von tjorven-bistro.de läuft über Google, NICHT über
 * ALL-INKL. Es darf deshalb bei ALL-INKL weder ein Postfach noch eine
 * Weiterleitung für diese Domain angelegt werden, und die MX-Records dürfen
 * nicht verändert werden.
 *
 * Das ist für den Formularversand auch nicht nötig. Versenden und Empfangen
 * sind zwei getrennte Vorgänge:
 *   - MX-Records steuern nur den EMPFANG (-> Google, bleibt unangetastet).
 *   - PHP mail() versendet über den lokalen Mailserver von ALL-INKL. Dafür
 *     muss auf dem Webspace KEIN Postfach existieren.
 *
 * Geprüfter DNS-Stand der Domain:
 *   MX     -> Google (aspmx.l.google.com u. a.)
 *   SPF    -> "v=spf1 a mx include:spf.kasserver.com ~all"
 *             Damit ist ALL-INKL bereits ausdrücklich zum Versand berechtigt:
 *             include:spf.kasserver.com deckt das ALL-INKL-Mailrelay ab,
 *             der Mechanismus "a" zusätzlich den Webserver der Domain selbst.
 *   DMARC  -> "v=DMARC1; p=none;"
 *
 * Ergebnis: Eine über mail() versendete Nachricht mit einem Absender
 * @tjorven-bistro.de besteht die SPF-Prüfung und wird von DMARC nicht
 * beanstandet. Eine DNS-Änderung ist dafür nicht erforderlich.
 */

return [

    /* ------------------------------------------------------------------
     * Empfänger — hier laufen die Formularanfragen auf.
     * Dieses Postfach liegt bei Google und bleibt unverändert.
     * ------------------------------------------------------------------ */
    'recipient'      => 'kontakt@tjorven-bistro.de',
    'recipient_name' => 'Tjorven Bistro',

    /* ------------------------------------------------------------------
     * Technischer Absender
     *
     * Bewusst dieselbe Adresse wie der Empfänger:
     *   - Sie existiert nachweislich (bei Google) — eine erfundene Adresse
     *     wie website@… hätte kein Postfach, sodass Unzustellbarkeits-
     *     meldungen ins Leere liefen.
     *   - Es muss dafür KEIN Postfach bei ALL-INKL angelegt werden.
     *   - Der Absender liegt auf der eigenen Domain, deshalb greift SPF.
     *
     * Die vom Besucher eingegebene Adresse wird NIE als Absender verwendet.
     * Sie landet ausschließlich im Reply-To, sodass ein Klick auf
     * „Antworten" direkt beim Gast landet.
     * ------------------------------------------------------------------ */
    'from'      => 'kontakt@tjorven-bistro.de',
    'from_name' => 'Tjorven Website-Formular',

    /* ------------------------------------------------------------------
     * Versandweg
     *
     * 'mail'  = PHP mail() über ALL-INKL. Das ist hier der richtige Weg und
     *           funktioniert ohne Zugangsdaten und ohne lokales Postfach.
     *
     * 'smtp'  = Versand über einen authentifizierten SMTP-Zugang. Für diese
     *           Domain NICHT erforderlich (siehe SPF-Hinweis oben) und nur
     *           sinnvoll, falls sich im Produktivtest zeigt, dass ALL-INKL
     *           die Mail nicht zustellt. Dann käme Google Workspace als
     *           Relay in Frage — dafür wären ein Google-Konto und ein
     *           App-Passwort nötig (Zwei-Faktor-Anmeldung vorausgesetzt).
     *           Bitte vorher Rücksprache halten.
     * ------------------------------------------------------------------ */
    'transport' => 'mail',

    'smtp' => [
        'host'     => 'smtp.gmail.com',  // nur relevant bei transport = 'smtp'
        'port'     => 587,               // 587 = STARTTLS
        'secure'   => 'tls',
        'username' => '',                // vollständige Google-Adresse
        'password' => '',                // App-Passwort — NIEMALS in Git committen
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
     * Leer lassen = temporäres Systemverzeichnis verwenden (auf ALL-INKL ok).
     * ------------------------------------------------------------------ */
    'storage_dir' => '',

];
