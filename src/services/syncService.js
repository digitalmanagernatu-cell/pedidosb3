import { enviarPedidoSellforge } from './sellforgeService';
import { enviarPedidoEmail, isEmailConfigured } from './emailService';
import { actualizarPedido, getPedidoById } from './pedidosService';

const SYNC_QUEUE_KEY = 'sync_queue';

// --- Cola de sincronización en localStorage ---

function getQueue() {
  const data = localStorage.getItem(SYNC_QUEUE_KEY);
  return data ? JSON.parse(data) : [];
}

function setQueue(queue) {
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Añade tareas pendientes de envío para un pedido.
 * @param {Object} params
 * @param {number} params.pedidoId - ID del pedido
 * @param {boolean} params.sellforge - Si hay que enviar a Sellforge
 * @param {string|null} params.emailCliente - Email del cliente (null si no aplica)
 * @param {Object|null} params.emailComercial - { email, nombre } del comercial (null si no aplica)
 */
export function encolarPedido({ pedidoId, sellforge = true, emailCliente = null, emailComercial = null }) {
  const queue = getQueue();
  // Evitar duplicados del mismo pedido
  const existente = queue.find(q => q.pedidoId === pedidoId);
  if (existente) return;

  queue.push({
    pedidoId,
    sellforge,
    emailCliente,
    emailComercial,
    creadoEn: new Date().toISOString(),
    intentos: 0
  });
  setQueue(queue);
  notificarCambio();
}

/**
 * Elimina un pedido de la cola.
 */
function eliminarDeCola(pedidoId) {
  const queue = getQueue().filter(q => q.pedidoId !== pedidoId);
  setQueue(queue);
  notificarCambio();
}

/**
 * Actualiza una entrada de la cola (ej: marcar sellforge como enviado).
 */
function actualizarCola(pedidoId, cambios) {
  const queue = getQueue();
  const idx = queue.findIndex(q => q.pedidoId === pedidoId);
  if (idx === -1) return;
  queue[idx] = { ...queue[idx], ...cambios };
  // Si ya no queda nada pendiente, eliminar de la cola
  if (!queue[idx].sellforge && !queue[idx].emailCliente && !queue[idx].emailComercial) {
    queue.splice(idx, 1);
  }
  setQueue(queue);
  notificarCambio();
}

/**
 * Devuelve el número de pedidos pendientes de sincronizar.
 */
export function getPendientesCount() {
  return getQueue().length;
}

/**
 * Devuelve la cola completa.
 */
export function getPendientes() {
  return getQueue();
}

// --- Listeners para cambios en la cola ---
const listeners = new Set();

export function onSyncChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notificarCambio() {
  const count = getPendientesCount();
  listeners.forEach(cb => cb(count));
}

// --- Proceso de sincronización ---

let sincronizando = false;

/**
 * Procesa todos los pedidos pendientes en la cola.
 * Devuelve { exitosos, fallidos }.
 */
export async function sincronizarPendientes() {
  if (sincronizando) return { exitosos: 0, fallidos: 0 };
  if (!navigator.onLine) return { exitosos: 0, fallidos: 0 };

  sincronizando = true;
  let exitosos = 0;
  let fallidos = 0;

  try {
    const queue = getQueue();

    for (const item of queue) {
      const pedido = getPedidoById(item.pedidoId);
      if (!pedido) {
        eliminarDeCola(item.pedidoId);
        continue;
      }

      let todoOk = true;

      // Sellforge
      if (item.sellforge) {
        try {
          const result = await enviarPedidoSellforge(pedido);
          actualizarPedido(pedido.id, {
            enviadoSellforge: {
              fecha: new Date().toISOString(),
              codigo: result.code || '',
              total: result.total || ''
            }
          });
          actualizarCola(pedido.id, { sellforge: false });
        } catch {
          todoOk = false;
        }
      }

      // Email cliente
      if (item.emailCliente && isEmailConfigured()) {
        try {
          await enviarPedidoEmail(pedido, item.emailCliente);
          actualizarPedido(pedido.id, {
            emailEnviado: { fecha: new Date().toISOString(), destino: item.emailCliente }
          });
          actualizarCola(pedido.id, { emailCliente: null });
        } catch {
          todoOk = false;
        }
      }

      // Email comercial
      if (item.emailComercial && isEmailConfigured()) {
        try {
          await enviarPedidoEmail(pedido, item.emailComercial.email);
          actualizarPedido(pedido.id, {
            emailComercial: {
              fecha: new Date().toISOString(),
              destino: item.emailComercial.email,
              nombre: item.emailComercial.nombre
            }
          });
          actualizarCola(pedido.id, { emailComercial: null });
        } catch {
          todoOk = false;
        }
      }

      if (todoOk) {
        exitosos++;
      } else {
        // Incrementar intentos
        const q2 = getQueue();
        const idx = q2.findIndex(q => q.pedidoId === pedido.id);
        if (idx !== -1) {
          q2[idx].intentos = (q2[idx].intentos || 0) + 1;
          setQueue(q2);
        }
        fallidos++;
      }
    }
  } finally {
    sincronizando = false;
    notificarCambio();
  }

  return { exitosos, fallidos };
}

// --- Auto-sincronización al recuperar conexión ---

let initialized = false;

export function iniciarAutoSync() {
  if (initialized) return;
  initialized = true;

  const handleOnline = () => {
    // Pequeño delay para asegurar que la conexión está estable
    setTimeout(() => {
      sincronizarPendientes();
    }, 2000);
  };

  window.addEventListener('online', handleOnline);

  // Si ya estamos online y hay pendientes, sincronizar
  if (navigator.onLine && getPendientesCount() > 0) {
    setTimeout(() => sincronizarPendientes(), 3000);
  }
}
