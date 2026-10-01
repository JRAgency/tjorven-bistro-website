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
 *
 * Seit 01.10.2026 optional als multipart/alternative (Text + HTML) und mit
 * frei wählbarem Empfänger – für die Eingangsbestätigung an den Absender.
 * Der Textteil bleibt immer enthalten (Rückfall für reine Text-Programme).
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
 *
 * Ein Anzeigename aus einem Formular („Max <a@b.de>, c@d.de“) darf keine
 * weiteren Adressen in den Header schmuggeln: Enthält er Sonderzeichen wie
 * , ; < > " oder @, wird er komplett als RFC-2047-Wort kodiert und ist damit
 * nur noch Text.
 */
function tj_address(string $email, string $name = ''): string
{
    $email = tj_header_safe($email);
    $name  = tj_header_safe($name);
    if ($name === '') {
        return $email;
    }
    if (preg_match('/^[A-Za-z0-9 .\'_-]*$/', $name) === 1 && strpos($name, '..') === false) {
        return '"' . $name . '" <' . $email . '>';
    }
    return '=?UTF-8?B?' . base64_encode($name) . '?= <' . $email . '>';
}

/**
 * Zerlegt Text (und optional HTML) in Content-Header und kodierten Inhalt.
 *
 * @return array{0:string[],1:string} [Content-Header, Nachrichtenkörper]
 */
function tj_mail_payload(string $text, string $html = ''): array
{
    // Zeilenenden für den Mailtransport normalisieren …
    $crlf = static function (string $s): string {
        return str_replace("\n", "\r\n", str_replace(["\r\n", "\r"], "\n", $s));
    };
    // … und Quoted-Printable kodieren. Damit bleiben Umlaute auch dann
    // unversehrt, wenn ein Server auf dem Weg kein 8BITMIME beherrscht, und
    // die von RFC 5321 vorgeschriebene maximale Zeilenlänge wird eingehalten
    // (eine sehr lange Nachricht ohne Umbruch würde sie sonst überschreiten).
    $textQp = quoted_printable_encode($crlf($text));

    if ($html === '') {
        return [[
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: quoted-printable',
        ], $textQp];
    }

    $boundary = '=_tjorven_' . bin2hex(random_bytes(12));
    $body = 'This is a multi-part message in MIME format.' . "\r\n\r\n"
        . '--' . $boundary . "\r\n"
        . 'Content-Type: text/plain; charset=UTF-8' . "\r\n"
        . 'Content-Transfer-Encoding: quoted-printable' . "\r\n\r\n"
        . $textQp . "\r\n\r\n"
        . '--' . $boundary . "\r\n"
        . 'Content-Type: text/html; charset=UTF-8' . "\r\n"
        . 'Content-Transfer-Encoding: quoted-printable' . "\r\n\r\n"
        . quoted_printable_encode($crlf($html)) . "\r\n\r\n"
        . '--' . $boundary . '--' . "\r\n";

    return [[
        'MIME-Version: 1.0',
        'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
    ], $body];
}

/**
 * Versendet die Nachricht. Gibt true bei Erfolg zurück.
 *
 * @param array  $config  Konfiguration aus inc/config.php
 * @param string $subject Betreff (unkodiert)
 * @param string $body    Nachrichtentext (UTF-8, plain text) – immer enthalten
 * @param string $replyTo Antwortadresse (Anfrage-Mail: der Gast; Bestätigung: das Bistro)
 * @param string $replyToName Anzeigename dazu
 * @param array  $opts    optional: 'html' (HTML-Fassung), 'to' / 'to_name' (anderer
 *                        Empfänger als $config['recipient']), 'from_name',
 *                        'auto' (true = automatisch erzeugte Mail, RFC 3834)
 */
function tj_send_mail(array $config, string $subject, string $body, string $replyTo, string $replyToName = '', array $opts = []): bool
{
    $transport = $config['transport'] ?? 'mail';

    [$contentHeaders, $payload] = tj_mail_payload($body, (string) ($opts['html'] ?? ''));

    $mail = [
        'to'       => tj_header_safe((string) ($opts['to'] ?? $config['recipient'])),
        'to_name'  => (string) ($opts['to'] ?? '') !== '' ? (string) ($opts['to_name'] ?? '') : (string) ($config['recipient_name'] ?? ''),
        'from'     => tj_header_safe((string) $config['from']),
        'from_name' => (string) ($opts['from_name'] ?? ($config['from_name'] ?? '')),
        'reply_to' => tj_address($replyTo, $replyToName),
        'subject'  => tj_encode_header($subject),
        'headers'  => $contentHeaders,
        'extra'    => !empty($opts['auto']) ? ['Auto-Submitted: auto-generated', 'X-Auto-Response-Suppress: All'] : [],
        'body'     => $payload,
    ];

    if ($transport === 'smtp') {
        return tj_send_via_smtp($config, $mail);
    }

    return tj_send_via_mail($mail);
}

/**
 * Standardweg: PHP mail().
 */
function tj_send_via_mail(array $mail): bool
{
    $to      = tj_address($mail['to'], $mail['to_name']);
    $headers = array_merge($mail['headers'], [
        'From: ' . tj_address($mail['from'], $mail['from_name']),
        'Reply-To: ' . $mail['reply_to'],
        'X-Mailer: Tjorven-Website',
    ], $mail['extra']);

    $headerString = implode("\r\n", $headers);

    // -f setzt den Envelope-Absender auf die eigene Domain (hilft SPF).
    // Falls der Host den Parameter ablehnt, wird ohne ihn erneut versucht.
    $sent = @mail($to, $mail['subject'], $mail['body'], $headerString, '-f' . $mail['from']);
    if (!$sent) {
        $sent = @mail($to, $mail['subject'], $mail['body'], $headerString);
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
function tj_send_via_smtp(array $config, array $mail): bool
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

    $from = $mail['from'];
    $to   = $mail['to'];

    $write('MAIL FROM:<' . $from . '>');
    if (!$expect($read(), '250')) return $fail();
    $write('RCPT TO:<' . $to . '>');
    if (!$expect($read(), '250')) return $fail();
    $write('DATA');
    if (!$expect($read(), '354')) return $fail();

    $headers = array_merge([
        'Date: ' . date('r'),
        'From: ' . tj_address($from, $mail['from_name']),
        'To: ' . tj_address($to, $mail['to_name']),
        'Reply-To: ' . $mail['reply_to'],
        'Subject: ' . $mail['subject'],
    ], $mail['headers'], ['X-Mailer: Tjorven-Website'], $mail['extra']);

    // Punkt am Zeilenanfang maskieren (SMTP-Transparenz, RFC 5321)
    $data = implode("\r\n", $headers) . "\r\n\r\n" . preg_replace('/^\./m', '..', $mail['body']);

    fwrite($socket, $data . "\r\n.\r\n");
    if (!$expect($read(), '250')) return $fail();

    $write('QUIT');
    @fclose($socket);

    return true;
}
