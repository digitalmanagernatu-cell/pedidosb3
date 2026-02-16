const STORAGE_KEY = 'pedidos';

export function getPedidos() {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

export function getPedidoById(id) {
  const pedidos = getPedidos();
  return pedidos.find(p => p.id === Number(id)) || null;
}

export function guardarPedido(pedido) {
  const pedidos = getPedidos();
  const nuevoPedido = {
    ...pedido,
    id: Date.now(),
    fecha: new Date().toISOString()
  };
  pedidos.push(nuevoPedido);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pedidos));
  return nuevoPedido;
}

export function eliminarPedido(id) {
  const pedidos = getPedidos().filter(p => p.id !== Number(id));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pedidos));
}

export function getEstadisticas() {
  const pedidos = getPedidos();
  const ahora = new Date();
  const mesActual = ahora.getMonth();
  const anioActual = ahora.getFullYear();

  const pedidosMes = pedidos.filter(p => {
    const fecha = new Date(p.fecha);
    return fecha.getMonth() === mesActual && fecha.getFullYear() === anioActual;
  });

  return {
    totalPedidos: pedidos.length,
    totalFacturado: pedidos.reduce((sum, p) => sum + (p.totales?.total || 0), 0),
    ahorroGenerado: pedidos.reduce((sum, p) => sum + (p.totales?.ahorro || 0), 0),
    pedidosMes: pedidosMes.length
  };
}
