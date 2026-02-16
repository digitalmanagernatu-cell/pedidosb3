const TARIFAS = {
  'GELES DE BAÑO 750ML': [
    { desde: 0, precio: 1.48 },
    { desde: 48, precio: 1.39 },
    { desde: 96, precio: 1.37 },
    { desde: 252, precio: 1.34 },
    { desde: 540, precio: 1.31 },
    { desde: 1080, precio: 1.23 }
  ],
  'GELES DE BAÑO 1L': [
    { desde: 0, precio: 1.24 },
    { desde: 100, precio: 1.18 },
    { desde: 300, precio: 1.13 },
    { desde: 600, precio: 1.08 },
    { desde: 1200, precio: 1.03 }
  ],
  'HAIR & BODY MIST': [
    { desde: 0, precio: 1.29 },
    { desde: 120, precio: 1.24 },
    { desde: 240, precio: 1.18 },
    { desde: 500, precio: 1.14 }
  ],
  'JABONES DE MANOS': [
    { desde: 0, precio: 1.29 },
    { desde: 144, precio: 1.24 },
    { desde: 228, precio: 1.18 },
    { desde: 504, precio: 1.13 }
  ]
};

export function determinarCategoriaEscalado(producto) {
  const cat = producto.categoria;
  if (!cat) return null;

  if (cat === 'GELES DE BAÑO 750ML') return 'GELES DE BAÑO 750ML';
  if (cat === 'GELES DE BAÑO 1L') return 'GELES DE BAÑO 1L';
  if (cat === 'HAIR & BODY MIST') return 'HAIR & BODY MIST';
  if (cat === 'JABONES DE MANOS') return 'JABONES DE MANOS';

  return null;
}

export function calcularPrecioUnitario(producto, cantidad) {
  const categoria = determinarCategoriaEscalado(producto);

  if (!categoria || cantidad <= 0) return producto.pvl;

  const escalados = TARIFAS[categoria];

  for (let i = escalados.length - 1; i >= 0; i--) {
    if (cantidad >= escalados[i].desde) {
      return escalados[i].precio;
    }
  }

  return escalados[0].precio;
}

export function calcularAhorro(producto, cantidad) {
  const categoria = determinarCategoriaEscalado(producto);
  if (!categoria || cantidad <= 0) return 0;

  const precioBase = TARIFAS[categoria][0].precio;
  const precioActual = calcularPrecioUnitario(producto, cantidad);

  return (precioBase - precioActual) * cantidad;
}

export function tieneEscalado(producto) {
  return determinarCategoriaEscalado(producto) !== null;
}

export function getEscaladosCategoria(producto) {
  const categoria = determinarCategoriaEscalado(producto);
  if (!categoria) return null;
  return { categoria, escalados: TARIFAS[categoria] };
}

/**
 * Calcula el descuento 2x1 agrupando por categoría.
 * Por cada 2 unidades de productos con oferta en la misma categoría,
 * la unidad más barata es gratis.
 */
export function calcularDescuento2x1(seleccion, productos) {
  // Agrupar unidades de productos con oferta por categoría
  const categorias = {};

  Object.entries(seleccion).forEach(([codigo, { cantidad, checked }]) => {
    if (!checked || cantidad <= 0) return;
    const producto = productos.find(p => p.codigo === codigo);
    if (!producto || !producto.oferta) return;

    const cat = producto.categoria;
    if (!categorias[cat]) categorias[cat] = [];

    const precioUnit = calcularPrecioUnitario(producto, cantidad);
    for (let i = 0; i < cantidad; i++) {
      categorias[cat].push(precioUnit);
    }
  });

  let descuento = 0;

  Object.values(categorias).forEach(precios => {
    // Ordenar descendente: los más caros se pagan, los más baratos son gratis
    precios.sort((a, b) => b - a);
    // Cada segunda unidad es gratis
    for (let i = 1; i < precios.length; i += 2) {
      descuento += precios[i];
    }
  });

  return descuento;
}
