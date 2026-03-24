import { isFirebaseConfigured, getDb } from './firebaseConfig';
import { collection, getDocs, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';

const STORAGE_KEY = 'pedidos';
const DELETED_KEY = 'pedidos_eliminados';
const COLLECTION = 'pedidos';

// --- Listener en tiempo real ---
let _onSnapshotUnsub = null;
let _onChangeCallback = null;

// IDs de pedidos que acabamos de escribir nosotros (para evitar re-subir en el snapshot)
const _recentlyWrittenIds = new Set();

// --- localStorage (siempre disponible) ---

function getLocal() {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

function setLocal(pedidos) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pedidos));
}

// --- Registro de eliminados (para que sync no los re-agregue) ---

function getDeletedIds() {
  const data = localStorage.getItem(DELETED_KEY);
  return data ? JSON.parse(data) : [];
}

function addDeletedId(id) {
  const ids = getDeletedIds();
  if (!ids.includes(Number(id))) {
    ids.push(Number(id));
    localStorage.setItem(DELETED_KEY, JSON.stringify(ids));
  }
}

// --- Firestore (si está configurado) ---

async function firestoreGuardar(pedido) {
  if (!isFirebaseConfigured()) return;
  try {
    const db = getDb();
    await setDoc(doc(db, COLLECTION, String(pedido.id)), pedido);
  } catch (e) {
    console.error('Error guardando en Firestore:', e);
  }
}

async function firestoreEliminar(id) {
  if (!isFirebaseConfigured()) return;
  try {
    const db = getDb();
    await deleteDoc(doc(db, COLLECTION, String(id)));
  } catch (e) {
    console.error('Error eliminando de Firestore:', e);
  }
}

// --- API pública ---

export function getPedidos() {
  return getLocal();
}

export function getPedidoById(id) {
  const pedidos = getLocal();
  return pedidos.find(p => p.id === Number(id)) || null;
}

export function guardarPedido(pedido) {
  const pedidos = getLocal();
  const nuevoPedido = {
    ...pedido,
    id: Date.now(),
    fecha: new Date().toISOString(),
    _updatedAt: Date.now()
  };
  pedidos.push(nuevoPedido);
  setLocal(pedidos);
  // Marcar como escrito por nosotros para que el snapshot no lo re-suba
  _recentlyWrittenIds.add(Number(nuevoPedido.id));
  setTimeout(() => _recentlyWrittenIds.delete(Number(nuevoPedido.id)), 5000);
  firestoreGuardar(nuevoPedido);
  return nuevoPedido;
}

export function actualizarPedido(id, cambios) {
  const pedidos = getLocal();
  const idx = pedidos.findIndex(p => p.id === Number(id));
  if (idx === -1) return null;
  pedidos[idx] = { ...pedidos[idx], ...cambios, _updatedAt: Date.now() };
  setLocal(pedidos);
  // Marcar como escrito por nosotros
  _recentlyWrittenIds.add(Number(id));
  setTimeout(() => _recentlyWrittenIds.delete(Number(id)), 5000);
  firestoreGuardar(pedidos[idx]);
  return pedidos[idx];
}

export function eliminarPedido(id) {
  const pedidos = getLocal().filter(p => p.id !== Number(id));
  setLocal(pedidos);
  addDeletedId(id);
  firestoreEliminar(id);
}

export function getEstadisticas() {
  const pedidos = getLocal();
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
    pedidosMes: pedidosMes.length
  };
}

/**
 * Merge inteligente entre pedidos de Firestore y localStorage.
 * Respeta la lista de eliminados para no re-agregar pedidos borrados.
 */
function mergePedidos(pedidosFirestore, locales) {
  const deletedIds = getDeletedIds();

  const mapFirestore = new Map();
  pedidosFirestore.forEach(p => mapFirestore.set(Number(p.id), p));

  const mapLocal = new Map();
  locales.forEach(p => mapLocal.set(Number(p.id), p));

  const todosIds = new Set([...mapFirestore.keys(), ...mapLocal.keys()]);
  const merged = [];
  const pendientesSubir = [];

  for (const id of todosIds) {
    // Si fue eliminado localmente, no re-agregar
    if (deletedIds.includes(id)) continue;

    const enFirestore = mapFirestore.get(id);
    const enLocal = mapLocal.get(id);

    if (enFirestore && !enLocal) {
      merged.push(enFirestore);
    } else if (!enFirestore && enLocal) {
      // Solo existe en local → subir a Firestore (si no lo acabamos de escribir)
      merged.push(enLocal);
      if (!_recentlyWrittenIds.has(id)) {
        pendientesSubir.push(enLocal);
      }
    } else {
      // Existe en ambos → tomar el más reciente
      const tsFirestore = enFirestore._updatedAt || new Date(enFirestore.fecha).getTime() || 0;
      const tsLocal = enLocal._updatedAt || new Date(enLocal.fecha).getTime() || 0;

      if (tsLocal > tsFirestore && !_recentlyWrittenIds.has(id)) {
        // Local es más reciente y no lo acabamos de escribir → subir
        merged.push(enLocal);
        pendientesSubir.push(enLocal);
      } else if (tsFirestore > tsLocal) {
        // Firestore es más reciente → actualizar local
        merged.push(enFirestore);
      } else {
        // Timestamps iguales o lo acabamos de escribir → están sincronizados, no hacer nada
        merged.push(enFirestore);
      }
    }
  }

  return { merged, pendientesSubir };
}

/**
 * Sincronización bidireccional con merge inteligente.
 * Ahora respeta eliminaciones locales.
 */
export async function sincronizarDesdeFirestore() {
  if (!isFirebaseConfigured()) return false;
  try {
    const db = getDb();
    const snapshot = await getDocs(collection(db, COLLECTION));
    const pedidosFirestore = [];
    snapshot.forEach(docSnap => {
      pedidosFirestore.push(docSnap.data());
    });

    const locales = getLocal();
    const { merged, pendientesSubir } = mergePedidos(pedidosFirestore, locales);

    setLocal(merged);

    for (const pedido of pendientesSubir) {
      await firestoreGuardar(pedido);
    }

    // Limpiar eliminados que ya no existen en Firestore
    const deletedIds = getDeletedIds();
    const firestoreIds = new Set(pedidosFirestore.map(p => Number(p.id)));
    const stillNeeded = deletedIds.filter(id => firestoreIds.has(id));
    localStorage.setItem(DELETED_KEY, JSON.stringify(stillNeeded));

    return true;
  } catch (e) {
    console.error('Error sincronizando desde Firestore:', e);
    return false;
  }
}

/**
 * Inicia listener en tiempo real de Firestore.
 * Llama al callback cada vez que hay cambios en la colección.
 */
export function iniciarListenerPedidos(onChange) {
  if (!isFirebaseConfigured()) return;
  // Limpiar listener anterior
  if (_onSnapshotUnsub) {
    _onSnapshotUnsub();
    _onSnapshotUnsub = null;
  }

  _onChangeCallback = onChange;

  try {
    const db = getDb();
    _onSnapshotUnsub = onSnapshot(collection(db, COLLECTION), (snapshot) => {
      const pedidosFirestore = [];
      snapshot.forEach(docSnap => {
        pedidosFirestore.push(docSnap.data());
      });

      const locales = getLocal();
      const { merged, pendientesSubir } = mergePedidos(pedidosFirestore, locales);

      setLocal(merged);

      // Subir pedidos que solo existen en local (el merge ya filtra los recién escritos)
      for (const pedido of pendientesSubir) {
        _recentlyWrittenIds.add(Number(pedido.id));
        setTimeout(() => _recentlyWrittenIds.delete(Number(pedido.id)), 5000);
        firestoreGuardar(pedido);
      }

      if (_onChangeCallback) _onChangeCallback();
    }, (error) => {
      console.error('Error en listener de Firestore:', error);
      // Aún así notificar para que la UI se actualice con datos locales
      if (_onChangeCallback) _onChangeCallback();
    });
  } catch (e) {
    console.error('Error iniciando listener:', e);
  }
}

/**
 * Detiene el listener en tiempo real.
 */
export function detenerListenerPedidos() {
  if (_onSnapshotUnsub) {
    _onSnapshotUnsub();
    _onSnapshotUnsub = null;
  }
  _onChangeCallback = null;
}
