// URL de la Cloud Function proxy (evita problemas de CORS/mixed-content)
// Después de desplegar con: firebase deploy --only functions
// la URL será: https://sellforgeproxy-XXXXXXXXXX-uc.a.run.app
// Actualiza esta constante con la URL que te dé el deploy.
const PROXY_URL = 'https://sellforgeproxy-544695215064.us-central1.run.app';

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
    throw new Error(err.error || `Error HTTP: ${res.status}`);
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
