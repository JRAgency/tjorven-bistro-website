<?php
/**
 * Tjorven Bistro — Mailversand
 *
 * Zwei Versandwege hinter einer gemeinsamen Funktion:
 *   'mail' — PHP mail(); auf ALL-INKL ohne Zugangsdaten sofort lauffähig.
 *   'smtp' — authentifizierter SMTP-Versand; nur aktiv, wenn in der
 *            Konfiguration vollständige Zugangsdaten hinterlegt sind.
 *
 * Bewusst ohne externe Bibliothek, damit das Projekt abhängigkeitsfrei bleibt.
 */

declare(strict_types=1);

/**
 * Entfernt Zeilenumbrüche aus einem Wert, der in einen Mail-Header fließt.
 * Ohne diese Bereinigung könnte ein Angreifer über ein Eingabefeld eigene
 * Header (z. B. Bcc) einschleusen — klassische Header-Injection.
 */
function tj_header_safe(string $value): string
{
    return trim(preg_replace('/[\r\n\t]+/', ' ', $value) ?? '');
}

/**
 * Kodiert einen Header-Wert RFC-2047-konform, damit Umlaute korrekt ankommen.
 */
function tj_encode_header(string $value): string
{
    $value = tj_header_safe($value);
    if (preg_match('/^[\x20-\x7E]*$/', $value) === 1) {
        return $value; // reines ASCII braucht keine Kodierung
    }
    if (function_exists('mb_encode_mimeheader')) {
        return mb_encode_mimeheader($value, 'UTF-8', 'B', "\r\n");
    }
    return '=?UTF-8?B?' . base64_encode($value) . '?=';
}

/**
 * Baut "Name <adresse@example.com>" mit kodiertem Anzeigenamen.
 */
function tj_address(string $email, string $name = ''): string
{
    $email = tj_header_safe($email);
    if ($name === '') {
        return $email;
    }
    return tj_encode_header($name) . ' <' . $email . '>';
}

/**
 * Versendet die Nachricht. Gibt true bei Erfolg zurück.
 *
 * @param array  $config  Konfiguration aus inc/config.php
 * @param string $subject Betreff (unkodiert)
 * @param string $body    Nachrichtentext (UTF-8, plain text)
 * @param string $replyTo E-Mail-Adresse des Absenders der Anfrage
 * @param string $replyToName Anzeigename dazu
 */
function tj_send_mail(array $config, string $subject, string $body, string $replyTo, string $replyToName = ''): bool
{
    $transport = $config['transport'] ?? 'mail';

    // Zeilenenden für den Mailtransport normalisieren
    $body = str_replace(["\r\n", "\r"], "\n", $body);
    $body = str_replace("\n", "\r\n", $body);

    if ($transport === 'smtp') {
        return tj_send_via_smtp($config, $subject, $body, $replyTo, $replyToName);
    }

    return tj_send_via_mail($config, $subject, $body, $replyTo, $replyToName);
}

/**
 * Standardweg: PHP mail().
 */
function tj_send_via_mail(array $config, string $subject, string $body, string $replyTo, string $replyToName): bool
{
    $to      = tj_address($config['recipient'], $config['recipient_name'] ?? '');
    $from    = tj_header_safe($config['from']);
    $headers = [
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        'From: ' . tj_address($from, $config['from_name'] ?? ''),
        'Reply-To: ' . tj_address($replyTo, $replyToName),
        'X-Mailer: Tjorven-Website',
    ];

    $encodedSubject = tj_encode_header($subject);
    $headerString   = implode("\r\n", $headers);

    // -f setzt den Envelope-Absender auf die eigene Domain (hilft SPF).
    // Falls der Host den Parameter ablehnt, wird ohne ihn erneut versucht.
    $sent = @mail($to, $encodedSubject, $body, $headerString, '-f' . $from);
    if (!$sent) {
        $sent = @mail($to, $encodedSubject, $body, $headerString);
    }

    return (bool) $sent;
}

/**
 * Authentifizierter SMTP-Versand.
 *
 * HINWEIS: Dieser Weg ist erst aktiv, wenn in inc/config.php
 * 'transport' => 'smtp' gesetzt UND Host/Benutzer/Passwort hinterlegt sind.
 * Vor der Umstellung bitte einmal produktiv testen.
 */
function tj_send_via_smtp(array $config, string $subject, string $body, string $replyTo, string $replyToName): bool
{
    $smtp = $config['smtp'] ?? [];
    foreach (['host', 'port', 'username', 'password'] as $key) {
        if (empty($smtp[$key])) {
            return false; // unvollständig konfiguriert — kein stiller Fehlversand
        }
    }

    $host    = (string) $smtp['host'];
    $port    = (int) $smtp['port'];
    $secure  = strtolower((string) ($smtp['secure'] ?? 'tls'));
    $timeout = 15;

    $target = ($secure === 'ssl' ? 'ssl://' : '') . $host . ':' . $port;
    $socket = @stream_socket_client($target, $errno, $errstr, $timeout);
    if (!$socket) {
        return false;
    }
    stream_set_timeout($socket, $timeout);

    // Liest eine (auch mehrzeilige) Serverantwort und prüft den Statuscode
    $read = static function () use ($socket): string {
        $data = '';
        while (($line = fgets($socket, 515)) !== false) {
            $data .= $line;
            // Letzte Zeile einer Antwort hat an Position 4 ein Leerzeichen
            if (strlen($line) < 4 || $line[3] !== '-') {
                break;
            }
        }
        return $data;
    };
    $expect = static function (string $response, string $code): bool {
        return strncmp($response, $code, strlen($code)) === 0;
    };
    $write = static function (string $line) use ($socket): void {
        fwrite($socket, $line . "\r\n");
    };

    $fail = static function () use ($socket): bool {
        @fclose($socket);
        return false;
    };

    if (!$expect($read(), '220')) return $fail();

    $ehloHost = $_SERVER['SERVER_NAME'] ?? 'localhost';
    $write('EHLO ' . $ehloHost);
    if (!$expect($read(), '250')) return $fail();

    if ($secure === 'tls') {
        $write('STARTTLS');
        if (!$expect($read(), '220')) return $fail();
        $crypto = STREAM_CRYPTO_METHOD_TLS_CLIENT;
        if (!@stream_socket_enable_crypto($socket, true, $crypto)) return $fail();
        $write('EHLO ' . $ehloHost);
        if (!$expect($read(), '250')) return $fail();
    }

    $write('AUTH LOGIN');
    if (!$expect($read(), '334')) return $fail();
    $write(base64_encode((string) $smtp['username']));
    if (!$expect($read(), '334')) return $fail();
    $write(base64_encode((string) $smtp['password']));
    if (!$expect($read(), '235')) return $fail();

    $from = tj_header_safe($config['from']);
    $to   = tj_header_safe($config['recipient']);

    $write('MAIL FROM:<' . $from . '>');
    if (!$expect($read(), '250')) return $fail();
    $write('RCPT TO:<' . $to . '>');
    if (!$expect($read(), '250')) return $fail();
    $write('DATA');
    if (!$expect($read(), '354')) return $fail();

    $headers = [
        'Date: ' . date('r'),
        'From: ' . tj_address($from, $config['from_name'] ?? ''),
        'To: ' . tj_address($to, $config['recipient_name'] ?? ''),
        'Reply-To: ' . tj_address($replyTo, $replyToName),
        'Subject: ' . tj_encode_header($subject),
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        'X-Mailer: Tjorven-Website',
    ];

    // Punkt am Zeilenanfang maskieren (SMTP-Transparenz, RFC 5321)
    $data = implode("\r\n", $headers) . "\r\n\r\n" . preg_replace('/^\./m', '..', $body);

    fwrite($socket, $data . "\r\n.\r\n");
    if (!$expect($read(), '250')) return $fail();

    $write('QUIT');
    @fclose($socket);

    return true;
}
