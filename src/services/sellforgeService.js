// URL del proxy PHP en tu WordPress (HTTPS).
// Sube el archivo sellforge-proxy.php a la raíz de tu WordPress
// y pon aquí la URL completa. Ejemplo:
// const PROXY_URL = 'https://tu-dominio.com/sellforge-proxy.php';
const PROXY_URL = 'https://b2b.betreson.com/sellforge-proxy.php';

/**
 * Envía un pedido a Sellforge a través de la Cloud Function proxy.
 * @param {Object} pedido - Pedido con campos: id, codigo_cliente, nombre_cliente, fecha, zona, lineas[]
 * @returns {Promise<{code: string, total: string, message: string}>}
 */
export async function enviarPedidoSellforge(pedido) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: pedido.id,
      codigo_cliente: pedido.codigo_cliente,
      nombre_cliente: pedido.nombre_cliente,
      fecha: pedido.fecha,
      zona: pedido.zona,
      lineas: pedido.lineas.map(l => ({
        codigo: l.codigo,
        cantidad: l.cantidad,
        referencia: l.referencia
      }))
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail ? ` | Detalle: ${typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail)}` : '';
    throw new Error((err.error || `Error HTTP: ${res.status}`) + detail);
  }

  const json = await res.json();

  if (String(json.result) !== '1') {
    throw new Error(json.error || json.message || 'Error al enviar pedido a Sellforge');
  }

  return {
    code: json.code || '',
    total: json.total || '',
    message: json.message || 'Pedido enviado correctamente'
  };
}
