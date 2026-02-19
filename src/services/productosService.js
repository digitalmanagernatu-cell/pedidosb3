import { isFirebaseConfigured, getDb } from './firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import productosDefault from '../data/productos.json';

const STORAGE_KEY = 'productos_tarifa';
const TIMESTAMP_KEY = 'productos_tarifa_timestamp';
const FIRESTORE_COLLECTION = 'configuracion';
const FIRESTORE_DOC = 'tarifa_actual';

// --- localStorage (siempre disponible) ---

export function getProductos() {
  const custom = localStorage.getItem(STORAGE_KEY);
  if (custom) {
    try {
      return JSON.parse(custom);
    } catch {
      return productosDefault;
    }
  }
  return productosDefault;
}

function getTimestampLocal() {
  const ts = localStorage.getItem(TIMESTAMP_KEY);
  return ts ? Number(ts) : 0;
}

function setLocal(productos, timestamp) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(productos));
  localStorage.setItem(TIMESTAMP_KEY, String(timestamp));
}

// --- Firestore (si está configurado) ---

async function firestoreGuardarTarifa(productos, timestamp) {
  if (!isFirebaseConfigured()) return;
  try {
    const db = getDb();
    await setDoc(doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOC), {
      productos,
      timestamp
    });
  } catch (e) {
    console.error('Error guardando tarifa en Firestore:', e);
  }
}

// --- API pública ---

export async function setProductos(productos) {
  const timestamp = Date.now();
  setLocal(productos, timestamp);
  await firestoreGuardarTarifa(productos, timestamp);
}

export function resetProductos() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(TIMESTAMP_KEY);
}

/**
 * Sincroniza la tarifa desde Firestore a localStorage.
 * Solo actualiza si Firestore tiene una versión más nueva.
 * Devuelve true si se actualizó la tarifa local.
 */
export async function sincronizarTarifaDesdeFirestore() {
  if (!isFirebaseConfigured()) return false;
  try {
    const db = getDb();
    const docSnap = await getDoc(doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOC));

    if (!docSnap.exists()) return false;

    const data = docSnap.data();
    const timestampRemoto = data.timestamp || 0;
    const timestampLocal = getTimestampLocal();

    if (timestampRemoto > timestampLocal) {
      setLocal(data.productos, timestampRemoto);
      return true;
    }

    return false;
  } catch (e) {
    console.error('Error sincronizando tarifa desde Firestore:', e);
    return false;
  }
}
