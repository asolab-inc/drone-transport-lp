<?php
declare(strict_types=1);

mb_language('Japanese');
mb_internal_encoding('UTF-8');
header('Content-Type: application/json; charset=UTF-8');

const MAIL_TO      = 'mail@asolab.co.jp';
const MAIL_FROM    = 'noreply@asolab.co.jp';
const SITE_NAME    = 'ドローン物資輸送LP';
const THROTTLE_SEC = 60;

function fail(string $message, int $code = 400): void
{
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

function ok(): void
{
    echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

/** ヘッダーインジェクション対策：改行・NULを除去して1行に */
function headerSafe(string $value): string
{
    return trim(str_replace(["\r", "\n", "\0"], ' ', $value));
}

function post(string $key, int $maxLen = 1000): string
{
    $raw = $_POST[$key] ?? '';
    if (!is_string($raw)) {
        return '';
    }
    $value = trim(str_replace("\0", '', $raw));
    return mb_substr($value, 0, $maxLen);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    fail('Method Not Allowed', 405);
}

// ハニーポット：埋まっていれば成功を装って破棄
if (post('website', 200) !== '') {
    ok();
}

// 連投制限
session_start();
$now  = time();
$last = $_SESSION['drone_lp_last_sent'] ?? 0;
if (is_int($last) && $now - $last < THROTTLE_SEC) {
    fail('送信間隔が短すぎます。しばらく経ってからお試しください。', 429);
}

$company = post('company', 100);
$name    = post('name', 100);
$email   = post('email', 200);
$tel     = post('tel', 40);
$site    = post('site', 200);
$cargo   = post('cargo', 300);
$timing  = post('timing', 40);
$message = post('message', 5000);
$privacy = post('privacy', 10);

$requests = [];
if (isset($_POST['request']) && is_array($_POST['request'])) {
    foreach ($_POST['request'] as $item) {
        if (is_string($item) && $item !== '') {
            $requests[] = mb_substr(trim($item), 0, 60);
        }
        if (count($requests) >= 10) {
            break;
        }
    }
}

if ($name === '' || $email === '' || $message === '') {
    fail('必須項目が入力されていません。');
}
if ($privacy === '') {
    fail('個人情報の取り扱いへの同意が必要です。');
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fail('メールアドレスの形式が正しくありません。');
}

$safeEmail = headerSafe($email);
$safeName  = headerSafe($name);

$lines = [
    'ドローン物資輸送LPからお問い合わせがありました。',
    '',
    '■ 会社名・団体名: ' . ($company !== '' ? $company : '（未記入）'),
    '■ お名前: ' . $name,
    '■ メールアドレス: ' . $email,
    '■ 電話番号: ' . ($tel !== '' ? $tel : '（未記入）'),
    '■ 現場の所在地: ' . ($site !== '' ? $site : '（未記入）'),
    '■ 運びたい物・重量: ' . ($cargo !== '' ? $cargo : '（未記入）'),
    '■ 希望時期: ' . ($timing !== '' ? $timing : '（未記入）'),
    '■ ご相談の種類: ' . ($requests ? implode('、', $requests) : '（未選択）'),
    '',
    '■ ご相談内容:',
    $message,
    '',
    '---',
    '送信日時: ' . date('Y-m-d H:i:s'),
    'IPアドレス: ' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'),
];

$subject = '【' . SITE_NAME . '】お問い合わせ（' . $safeName . '様）';
$headers = 'From: ' . SITE_NAME . ' <' . MAIL_FROM . '>' . "\r\n"
         . 'Reply-To: ' . $safeName . ' <' . $safeEmail . '>';

if (!mb_send_mail(MAIL_TO, $subject, implode("\n", $lines), $headers)) {
    fail('メールの送信に失敗しました。', 500);
}

// 自動返信（失敗しても問い合わせ自体は成功として扱う）
$replyBody = implode("\n", [
    $name . ' 様',
    '',
    'お問い合わせいただきありがとうございます。',
    '以下の内容で受け付けいたしました。担当者より折り返しご連絡いたします。',
    '',
    '------------------------------',
    'ご相談内容:',
    $message,
    '------------------------------',
    '',
    'お急ぎの場合はお電話ください。',
    'TEL 0263-88-6968',
    '',
    '株式会社ASOLAB.',
    '〒399-0014 長野県松本市平田東2-14-5',
    'https://asolab.co.jp/',
]);
@mb_send_mail(
    $safeEmail,
    '【株式会社ASOLAB.】お問い合わせを受け付けました',
    $replyBody,
    'From: 株式会社ASOLAB. <' . MAIL_FROM . '>'
);

$_SESSION['drone_lp_last_sent'] = $now;
ok();
