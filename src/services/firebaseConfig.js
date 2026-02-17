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
  apiKey: 'AIzaSyAurvD88a2JgGwP6LprTqJzZH2IUhUc4QE',
  authDomain: 'pedidosb3.firebaseapp.com',
  projectId: 'pedidosb3',
  storageBucket: 'pedidosb3.firebasestorage.app',
  messagingSenderId: '544695215064',
  appId: '1:544695215064:web:9c4ec0d67e74e0bf3ec8ad'
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
