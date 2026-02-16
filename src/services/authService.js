const USUARIOS = [
  { email: 'admin@natuaromatic.com', password: 'betres2026', nombre: 'Administrador' },
  { email: 'comercial@natuaromatic.com', password: 'betres2026', nombre: 'Comercial' },
  { email: 'irene@natuaromatic.com', password: 'betres2026', nombre: 'Irene' }
];

const USER_KEY = 'user';

export function login(email, password) {
  const usuario = USUARIOS.find(
    u => u.email === email.toLowerCase().trim() && u.password === password
  );

  if (!usuario) return null;

  const userData = { email: usuario.email, nombre: usuario.nombre };
  localStorage.setItem(USER_KEY, JSON.stringify(userData));
  return userData;
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

export function validarEmailNatuaromatic(email) {
  return email.toLowerCase().trim().endsWith('@natuaromatic.com');
}
