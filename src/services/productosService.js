import productosDefault from '../data/productos.json';

const STORAGE_KEY = 'productos_tarifa';

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

export function setProductos(productos) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(productos));
}

export function resetProductos() {
  localStorage.removeItem(STORAGE_KEY);
}
