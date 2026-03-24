import { isFirebaseConfigured, getDb } from './firebaseConfig';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';

const STORAGE_KEY = 'pedidos';
const COLLECTION = 'pedidos';

// --- localStorage (siempre disponible) ---

function getLocal() {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

function setLocal(pedidos) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pedidos));
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
  // Guardar en Firestore en background (no bloquea la UI)
  firestoreGuardar(nuevoPedido);
  return nuevoPedido;
}

export function actualizarPedido(id, cambios) {
  const pedidos = getLocal();
  const idx = pedidos.findIndex(p => p.id === Number(id));
  if (idx === -1) return null;
  pedidos[idx] = { ...pedidos[idx], ...cambios, _updatedAt: Date.now() };
  setLocal(pedidos);
  // Guardar en Firestore en background
  firestoreGuardar(pedidos[idx]);
  return pedidos[idx];
}

export function eliminarPedido(id) {
  const pedidos = getLocal().filter(p => p.id !== Number(id));
  setLocal(pedidos);
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
 * Sincroniza pedidos entre Firestore y localStorage (bidireccional).
 * - Pedidos que solo existen en Firestore → se copian a local
 * - Pedidos que solo existen en local → se suben a Firestore
 * - Pedidos que existen en ambos → se queda la versión más reciente (_updatedAt)
 * Devuelve true si se sincronizó, false si Firebase no está configurado.
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

    // Indexar por ID para merge inteligente
    const mapFirestore = new Map();
    pedidosFirestore.forEach(p => mapFirestore.set(Number(p.id), p));

    const mapLocal = new Map();
    locales.forEach(p => mapLocal.set(Number(p.id), p));

    // Recoger todos los IDs únicos
    const todosIds = new Set([...mapFirestore.keys(), ...mapLocal.keys()]);
    const merged = [];
    const pendientesSubir = [];

    for (const id of todosIds) {
      const enFirestore = mapFirestore.get(id);
      const enLocal = mapLocal.get(id);

      if (enFirestore && !enLocal) {
        // Solo en Firestore → copiar a local
        merged.push(enFirestore);
      } else if (!enFirestore && enLocal) {
        // Solo en local → subir a Firestore
        merged.push(enLocal);
        pendientesSubir.push(enLocal);
      } else {
        // En ambos → quedarse con la versión más completa/reciente
        const tsFirestore = enFirestore._updatedAt || new Date(enFirestore.fecha).getTime() || 0;
        const tsLocal = enLocal._updatedAt || new Date(enLocal.fecha).getTime() || 0;

        if (tsLocal > tsFirestore) {
          // Local es más reciente → usar local y subir a Firestore
          merged.push(enLocal);
          pendientesSubir.push(enLocal);
        } else if (tsFirestore > tsLocal) {
          // Firestore es más reciente → usar Firestore
          merged.push(enFirestore);
        } else {
          // Mismo timestamp → merge de campos (Firestore base + campos extra de local)
          const combinado = { ...enFirestore, ...enLocal, _updatedAt: Date.now() };
          merged.push(combinado);
          pendientesSubir.push(combinado);
        }
      }
    }

    setLocal(merged);

    // Subir pedidos pendientes a Firestore
    for (const pedido of pendientesSubir) {
      await firestoreGuardar(pedido);
    }

    return true;
  } catch (e) {
    console.error('Error sincronizando desde Firestore:', e);
    return false;
  }
}
