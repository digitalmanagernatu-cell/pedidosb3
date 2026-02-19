const ENDPOINT = 'http://natuaromatic.no-ip.net:85/sellforge/api/index.php';
const API_KEY = 'EBA091C2D8F9E282CCE109AF1DD173B';
const DEALER = 'BET';

// Cache del token (3.5h como en WordPress)
let cachedToken = null;
let tokenExpiry = 0;

function parseResponse(text) {
  // Intento directo
  try {
    const j = JSON.parse(text);
    if (typeof j === 'object' && j !== null) return j;
  } catch { /* fallback */ }

  // Extraer primer objeto JSON del cuerpo (la API a veces envuelve en HTML)
  const match = text.match(/\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/s);
  if (match) {
    try {
      const j = JSON.parse(match[0]);
      if (typeof j === 'object' && j !== null) return j;
    } catch { /* fallback */ }
  }

  throw new Error('Respuesta no válida de Sellforge: ' + text.substring(0, 200));
}

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const body = new URLSearchParams();
  body.append('apikey', API_KEY);
  body.append('action', 'get_token');

  const res = await fetch(ENDPOINT, { method: 'POST', body });
  if (!res.ok) throw new Error(`Error HTTP al obtener token: ${res.status}`);

  const json = parseResponse(await res.text());
  if (String(json.result) !== '1' || !json.token) {
    throw new Error(json.message || 'No se pudo obtener token de Sellforge');
  }

  cachedToken = json.token;
  tokenExpiry = Date.now() + 3.5 * 60 * 60 * 1000;
  return cachedToken;
}

/**
 * Envía un pedido a Sellforge.
 * @param {Object} pedido - Pedido con campos: id, codigo_cliente, nombre_cliente, fecha, zona, lineas[]
 * @returns {Promise<{code: string, total: string, message: string}>}
 */
export async function enviarPedidoSellforge(pedido) {
  const token = await getToken();

  const data = {
    customers_code: pedido.codigo_cliente,
    customers_name: pedido.nombre_cliente || pedido.codigo_cliente,
    date_order: Math.floor(new Date(pedido.fecha).getTime() / 1000),
    customers_order_code: String(pedido.id),
    notes: `Pedido Betrés ON #${pedido.id} | Zona: ${pedido.zona}`,
    lines: pedido.lineas.map(l => ({
      products_code: l.codigo,
      units: l.cantidad,
      description: l.referencia
    }))
  };

  const body = new URLSearchParams();
  body.append('token', token);
  body.append('action', 'put_order');
  body.append('dealer', DEALER);
  body.append('data', JSON.stringify(data));

  const res = await fetch(ENDPOINT, { method: 'POST', body });
  if (!res.ok) throw new Error(`Error HTTP al enviar pedido: ${res.status}`);

  const json = parseResponse(await res.text());

  if (String(json.result) !== '1') {
    throw new Error(json.message || 'Error al enviar pedido a Sellforge');
  }

  return {
    code: json.code || '',
    total: json.total || '',
    message: json.message || 'Pedido enviado correctamente'
  };
}
