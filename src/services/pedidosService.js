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
    fecha: new Date().toISOString()
  };
  pedidos.push(nuevoPedido);
  setLocal(pedidos);
  firestoreGuardar(nuevoPedido);
  return nuevoPedido;
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
 * Sincroniza pedidos desde Firestore a localStorage.
 * Llama a esta función al cargar la app o al pulsar "Refrescar".
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

    // Merge: los de Firestore son la fuente de verdad,
    // pero conservamos pedidos locales que no estén en Firestore (por si se crearon offline)
    const locales = getLocal();
    const idsFirestore = new Set(pedidosFirestore.map(p => p.id));
    const soloLocales = locales.filter(p => !idsFirestore.has(p.id));

    // Subir los pedidos locales que no están en Firestore
    for (const pedido of soloLocales) {
      await firestoreGuardar(pedido);
    }

    const merged = [...pedidosFirestore, ...soloLocales];
    setLocal(merged);
    return true;
  } catch (e) {
    console.error('Error sincronizando desde Firestore:', e);
    return false;
  }
}
