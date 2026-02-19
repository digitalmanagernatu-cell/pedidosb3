<?php
/**
 * Proxy Sellforge para Betrés ON (pedidosb3).
 * Sube este archivo a la raíz de tu WordPress.
 * Ej: https://tu-dominio.com/sellforge-proxy.php
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
curl_close($ch);

if ($tokenErr) {
    http_response_code(502);
    echo json_encode(['error' => 'Error conectando con Sellforge: ' . $tokenErr]);
    exit;
}

$tokenJson = json_decode($tokenResp, true);
if (!$tokenJson || (string)($tokenJson['result'] ?? '0') !== '1' || empty($tokenJson['token'])) {
    http_response_code(502);
    echo json_encode(['error' => 'No se pudo obtener token de Sellforge', 'detail' => $tokenResp]);
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

$data = json_encode([
    'customers_code'       => (string)$input['codigo_cliente'],
    'customers_name'       => (string)($input['nombre_cliente'] ?: $input['codigo_cliente']),
    'date_order'           => (int)(strtotime($input['fecha'] ?? 'now')),
    'customers_order_code' => (string)($input['id'] ?? ''),
    'notes'                => 'Pedido Betrés ON #' . ($input['id'] ?? '') . ' | Zona: ' . ($input['zona'] ?? ''),
    'lines'                => $lines,
]);

$ch = curl_init($SF_ENDPOINT);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => http_build_query([
        'token'  => $token,
        'action' => 'put_order',
        'dealer' => $SF_DEALER,
        'data'   => $data,
    ]),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 30,
]);
$orderResp = curl_exec($ch);
$orderErr  = curl_error($ch);
curl_close($ch);

if ($orderErr) {
    http_response_code(502);
    echo json_encode(['error' => 'Error enviando pedido a Sellforge: ' . $orderErr]);
    exit;
}

$orderJson = json_decode($orderResp, true);
if (!$orderJson) {
    // Intentar extraer JSON del body (a veces la API devuelve HTML envolvente)
    if (preg_match('/\{[^{}]*"result"[^}]*\}/s', $orderResp, $m)) {
        $orderJson = json_decode($m[0], true);
    }
}

if (!$orderJson) {
    http_response_code(502);
    echo json_encode(['error' => 'Respuesta no válida de Sellforge', 'detail' => substr($orderResp, 0, 300)]);
    exit;
}

if ((string)($orderJson['result'] ?? '0') !== '1') {
    http_response_code(502);
    echo json_encode(['error' => $orderJson['message'] ?? 'Error de Sellforge', 'detail' => $orderJson]);
    exit;
}

echo json_encode([
    'result'  => '1',
    'code'    => $orderJson['code'] ?? '',
    'total'   => $orderJson['total'] ?? '',
    'message' => $orderJson['message'] ?? 'Pedido enviado correctamente',
]);
