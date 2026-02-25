<?php
/**
 * Proxy Sellforge para Betrés ON (pedidosb3).
 * Sube este archivo a la raíz de tu WordPress.
 * Ej: https://b2b.betreson.com/sellforge-proxy.php
 */

// --- CORS ---
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Solo POST']);
    exit;
}

// --- Config ---
$SF_ENDPOINT = 'http://natuaromatic.no-ip.net:85/sellforge/api/index.php';
$SF_API_KEY  = 'EBA091C2D8F9E282CCE109AF1DD173B';
$SF_DEALER   = 'BET';

// ============================================================
// Parser robusto (misma lógica que el plugin WooCommerce)
// ============================================================

function sf_fix_encoding($s) {
    if (!is_string($s)) return $s;
    if (function_exists('mb_detect_encoding') && function_exists('mb_convert_encoding')) {
        if (!mb_detect_encoding($s, 'UTF-8', true)) {
            $enc = mb_detect_encoding($s, 'Windows-1252, ISO-8859-1, ASCII', true);
            if ($enc && $enc !== 'UTF-8') $s = mb_convert_encoding($s, 'UTF-8', $enc);
        }
    } else {
        $try = @iconv('Windows-1252', 'UTF-8//IGNORE', $s);
        if ($try !== false) $s = $try;
    }
    return $s;
}

function sf_normalize_quotes($s) {
    if (!is_string($s)) return $s;
    $s = str_replace(
        ['&laquo;','&raquo;','&ldquo;','&rdquo;','&lsquo;','&rsquo;','&quot;'],
        ['"','"','"','"','"','"','"'],
        $s
    );
    $map = [
        "\xAB" => '"', "\xBB" => '"',
        "\x91" => '"', "\x92" => '"',
        "\x93" => '"', "\x94" => '"',
        "\x84" => '"', "\x82" => '"',
        "\xC2\xAB" => '"', "\xC2\xBB" => '"',
        "\xE2\x80\x98" => '"', "\xE2\x80\x99" => '"',
        "\xE2\x80\x9C" => '"', "\xE2\x80\x9D" => '"',
        "\xE2\x80\x9E" => '"', "\xE2\x80\x9A" => '"',
        "\xE2\x80\xB2" => '"', "\xE2\x80\xB3" => '"',
    ];
    return strtr($s, $map);
}

function sf_decode_json($body) {
    if (!is_string($body)) return null;
    $body = sf_fix_encoding($body);
    $body = sf_normalize_quotes($body);
    if (strpos($body, '&#') !== false) $body = html_entity_decode($body, ENT_QUOTES, 'UTF-8');
    $body = trim(ltrim($body, "\xEF\xBB\xBF \t\n\r\0\x0B"));

    // Intento directo
    $j = json_decode($body, true);
    if (is_array($j)) return $j;

    // Extraer primer objeto JSON equilibrado
    if (preg_match('~\{(?:[^{}]|(?R))*\}~s', $body, $m)) {
        $candidate = trim(ltrim(sf_normalize_quotes($m[0]), "\xEF\xBB\xBF \t\n\r\0\x0B"));
        $j2 = json_decode($candidate, true);
        if (is_array($j2)) return $j2;
    }

    // Buscar por clave conocida "result"
    $pos = strpos($body, '{"result"');
    if ($pos !== false) {
        $tail = substr($body, $pos);
        $end  = strrpos($tail, '}');
        if ($end !== false) {
            $candidate = sf_normalize_quotes(substr($tail, 0, $end + 1));
            $j3 = json_decode($candidate, true);
            if (is_array($j3)) return $j3;
        }
    }

    return null;
}

// Fallback por regex
function sf_soft_extract($body) {
    if (!is_string($body)) return null;
    $s = sf_fix_encoding($body);
    $s = sf_normalize_quotes($s);
    $s = trim(strip_tags($s));
    $s = preg_replace('/\s+/', ' ', $s);

    $res = $code = $total = $msg = '';
    if (preg_match('/"result"\s*:\s*"?(1|0)"?/i', $s, $m)) $res = $m[1];
    if (preg_match('/"code"\s*:\s*"?(.*?)"?(,|\s|\})/i', $s, $m)) $code = trim($m[1]);
    if (preg_match('/"total"\s*:\s*"?(?<num>[0-9\.,]+)"?/i', $s, $m)) $total = str_replace(',', '.', $m['num']);
    if (preg_match('/"message"\s*:\s*"?(.*?)"?(,|\s|\})/i', $s, $m)) $msg = trim($m[1]);
    if (preg_match('/"token"\s*:\s*"?(.*?)"?(,|\s|\})/i', $s, $m)) {
        if ($res !== '') return ['result'=>$res, 'token'=>trim($m[1]), 'code'=>$code, 'total'=>$total, 'message'=>$msg];
    }
    if ($res !== '') return ['result'=>$res, 'code'=>$code, 'total'=>$total, 'message'=>$msg];
    return null;
}

function sf_parse($body) {
    $j = sf_decode_json($body);
    if (is_array($j)) return $j;
    $j = sf_soft_extract($body);
    if (is_array($j)) return $j;
    return null;
}

// ============================================================
// Lógica principal
// ============================================================

// --- Leer body del request ---
$input = json_decode(file_get_contents('php://input'), true);
if (!$input || empty($input['lineas']) || empty($input['codigo_cliente'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Datos del pedido incompletos']);
    exit;
}

// --- Paso 1: Obtener token ---
$ch = curl_init($SF_ENDPOINT);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => http_build_query(['apikey' => $SF_API_KEY, 'action' => 'get_token']),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 20,
]);
$tokenResp = curl_exec($ch);
$tokenErr  = curl_error($ch);
$tokenHttp = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($tokenErr) {
    http_response_code(502);
    echo json_encode(['error' => 'Error conectando con Sellforge: ' . $tokenErr]);
    exit;
}

$tokenJson = sf_parse($tokenResp);
if (!$tokenJson || (string)($tokenJson['result'] ?? '0') !== '1' || empty($tokenJson['token'])) {
    http_response_code(502);
    echo json_encode([
        'error'   => 'No se pudo obtener token de Sellforge',
        'detail'  => substr(sf_fix_encoding($tokenResp), 0, 500),
        'http'    => $tokenHttp,
    ]);
    exit;
}

$token = $tokenJson['token'];

// --- Paso 2: Enviar pedido ---
$lines = [];
foreach ($input['lineas'] as $l) {
    $lines[] = [
        'products_code' => (string)($l['codigo'] ?? ''),
        'units'         => (int)($l['cantidad'] ?? 0),
        'description'   => (string)($l['referencia'] ?? ''),
    ];
}

$zona = (string)($input['zona'] ?? '');

$data = json_encode([
    'customers_code'       => (string)$input['codigo_cliente'],
    'customers_name'       => (string)($input['nombre_cliente'] ?: $input['codigo_cliente']),
    'date_order'           => (int)(strtotime($input['fecha'] ?? 'now')),
    'customers_order_code' => (string)($input['id'] ?? ''),
    'user'                 => $zona,
    'user_code'            => $zona,
    'agent'                => $zona,
    'agent_code'           => $zona,
    'salesman_code'        => $zona,
    'notes'                => 'Pedido Betrés ON #' . ($input['id'] ?? '') . ' | Zona: ' . $zona . (!empty($input['comentarios']) ? ' | Comentarios: ' . $input['comentarios'] : ''),
    'lines'                => $lines,
]);

$ch = curl_init($SF_ENDPOINT);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => http_build_query([
        'token'  => $token,
        'action' => 'put_order',
        'dealer' => $SF_DEALER,
        'user'   => $zona,
        'data'   => $data,
    ]),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 30,
]);
$orderResp = curl_exec($ch);
$orderErr  = curl_error($ch);
$orderHttp = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($orderErr) {
    http_response_code(502);
    echo json_encode(['error' => 'Error enviando pedido a Sellforge: ' . $orderErr]);
    exit;
}

$orderJson = sf_parse($orderResp);

if (!$orderJson) {
    http_response_code(502);
    echo json_encode([
        'error'  => 'Respuesta no válida de Sellforge',
        'detail' => substr(sf_fix_encoding($orderResp), 0, 500),
        'http'   => $orderHttp,
    ]);
    exit;
}

if ((string)($orderJson['result'] ?? '0') !== '1') {
    $msg = trim((string)($orderJson['message'] ?? ''));
    // result=1 pero con avisos parciales → tratarlo como OK
    if ((string)($orderJson['result'] ?? '0') === '1' && $msg && preg_match('/no encontrado|error/i', $msg)) {
        // OK parcial, sigue adelante
    } else {
        http_response_code(502);
        echo json_encode([
            'error'  => $msg ?: 'Error de Sellforge',
            'detail' => $orderJson,
        ]);
        exit;
    }
}

echo json_encode([
    'result'  => '1',
    'code'    => $orderJson['code'] ?? '',
    'total'   => $orderJson['total'] ?? '',
    'message' => $orderJson['message'] ?? 'Pedido enviado correctamente',
]);
