import { isFirebaseConfigured, getDb } from './firebaseConfig';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';

// Zonas válidas
export const ZONAS = Array.from({ length: 13 }, (_, i) => `FAR${String(i + 1).padStart(3, '0')}`);

// Super administradores (hardcoded, no se pueden borrar)
const SUPER_ADMINS = [
  { email: 'admin@natuaromatic.com', password: 'betres2026', nombre: 'Administrador' },
  { email: 'comercial@natuaromatic.com', password: 'betres2026', nombre: 'Comercial' },
  { email: 'irene@natuaromatic.com', password: 'betres2026', nombre: 'Irene' }
];

const USER_KEY = 'user';
const USUARIOS_KEY = 'usuarios_admin';
const USUARIOS_COLLECTION = 'usuarios';

// --- localStorage cache para usuarios creados ---

function getUsuariosLocal() {
  const data = localStorage.getItem(USUARIOS_KEY);
  return data ? JSON.parse(data) : [];
}

function setUsuariosLocal(usuarios) {
  localStorage.setItem(USUARIOS_KEY, JSON.stringify(usuarios));
}

// --- Firestore sync para usuarios ---

async function firestoreGuardarUsuario(usuario) {
  if (!isFirebaseConfigured()) return;
  try {
    const db = getDb();
    await setDoc(doc(db, USUARIOS_COLLECTION, usuario.email), usuario);
  } catch (e) {
    console.error('Error guardando usuario en Firestore:', e);
  }
}

async function firestoreEliminarUsuario(email) {
  if (!isFirebaseConfigured()) return;
  try {
    const db = getDb();
    await deleteDoc(doc(db, USUARIOS_COLLECTION, email));
  } catch (e) {
    console.error('Error eliminando usuario de Firestore:', e);
  }
}

export async function sincronizarUsuariosDesdeFirestore() {
  if (!isFirebaseConfigured()) return false;
  try {
    const db = getDb();
    const snapshot = await getDocs(collection(db, USUARIOS_COLLECTION));
    const usuarios = [];
    snapshot.forEach(docSnap => usuarios.push(docSnap.data()));
    setUsuariosLocal(usuarios);
    return true;
  } catch (e) {
    console.error('Error sincronizando usuarios desde Firestore:', e);
    return false;
  }
}

// --- API pública ---

export function login(email, password) {
  const emailNorm = email.toLowerCase().trim();

  // Buscar primero en super admins
  const superAdmin = SUPER_ADMINS.find(u => u.email === emailNorm && u.password === password);
  if (superAdmin) {
    const userData = { email: superAdmin.email, nombre: superAdmin.nombre, rol: 'superadmin', zona: null };
    localStorage.setItem(USER_KEY, JSON.stringify(userData));
    return userData;
  }

  // Buscar en administradores creados
  const admins = getUsuariosLocal();
  const admin = admins.find(u => u.email === emailNorm && u.password === password);
  if (admin) {
    const userData = { email: admin.email, nombre: admin.nombre, rol: 'admin', zona: admin.zona };
    localStorage.setItem(USER_KEY, JSON.stringify(userData));
    return userData;
  }

  return null;
}

export function logout() {
  localStorage.removeItem(USER_KEY);
}

export function getUsuario() {
  const data = localStorage.getItem(USER_KEY);
  return data ? JSON.parse(data) : null;
}

export function isAuthenticated() {
  return getUsuario() !== null;
}

export function isSuperAdmin() {
  const u = getUsuario();
  return u?.rol === 'superadmin';
}

export function getZonaUsuario() {
  const u = getUsuario();
  return u?.zona || null;
}

export function validarEmailNatuaromatic(email) {
  return email.toLowerCase().trim().endsWith('@natuaromatic.com');
}

// --- Gestión de administradores (solo superadmins) ---

export function getAdministradores() {
  return getUsuariosLocal();
}

export async function crearAdministrador({ email, password, nombre, zona }) {
  const emailNorm = email.toLowerCase().trim();

  // No permitir duplicar super admins
  if (SUPER_ADMINS.some(u => u.email === emailNorm)) {
    throw new Error('Este email ya es un super administrador');
  }

  const admins = getUsuariosLocal();
  if (admins.some(u => u.email === emailNorm)) {
    throw new Error('Este email ya existe como administrador');
  }

  if (!ZONAS.includes(zona)) {
    throw new Error('Zona no válida');
  }

  const nuevoAdmin = { email: emailNorm, password, nombre: nombre.trim(), zona };
  admins.push(nuevoAdmin);
  setUsuariosLocal(admins);
  await firestoreGuardarUsuario(nuevoAdmin);
  return nuevoAdmin;
}

export async function eliminarAdministrador(email) {
  const admins = getUsuariosLocal().filter(u => u.email !== email);
  setUsuariosLocal(admins);
  await firestoreEliminarUsuario(email);
}
