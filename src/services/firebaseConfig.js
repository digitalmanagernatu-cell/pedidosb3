import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// ============================================================
// CONFIGURACIÓN FIREBASE - Rellena con los datos de tu proyecto
// ============================================================
// 1. Ve a https://console.firebase.google.com/
// 2. Crea un proyecto nuevo (o usa uno existente)
// 3. En Configuración del proyecto > General, registra una app web
// 4. Copia los valores del firebaseConfig aquí abajo
// 5. En Firestore Database, crea una base de datos en modo de prueba
// ============================================================
const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
};

let db = null;

export function isFirebaseConfigured() {
  return !!(firebaseConfig.apiKey && firebaseConfig.projectId);
}

export function getDb() {
  if (!db && isFirebaseConfigured()) {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
  }
  return db;
}
