// Mapeo flexible: varias posibles cabeceras del Excel → misma tarifa de escalado
const ESCALADO_ALIASES = {
  'GELES 750ML': 'GELES 750ML',
  'GELES 750ML.': 'GELES 750ML',
  'GELES DE BAÑO 750ML': 'GELES 750ML',
  'GELES 1L': 'GELES 1L',
  'GELES 1L.': 'GELES 1L',
  'GELES DE BAÑO 1L': 'GELES 1L',
  'HAIR & BODY MIST': 'HAIR & BODY MIST',
  'JABONES': 'JABONES',
  'JABONES DE MANOS': 'JABONES',
};

const TARIFAS = {
  'GELES 750ML': [
    { desde: 0, precio: 1.48 },
    { desde: 48, precio: 1.39 },
    { desde: 96, precio: 1.37 },
    { desde: 252, precio: 1.34 },
    { desde: 540, precio: 1.31 },
    { desde: 1080, precio: 1.23 }
  ],
  'GELES 1L': [
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
  'JABONES': [
    { desde: 0, precio: 1.29 },
    { desde: 144, precio: 1.24 },
    { desde: 228, precio: 1.18 },
    { desde: 504, precio: 1.13 }
  ]
};

export function determinarCategoriaEscalado(producto) {
  const cat = producto.categoria?.toUpperCase();
  if (!cat) return null;
  return ESCALADO_ALIASES[cat] || null;
}

// --- Lógica de agrupación de cajas ---

// Categorías donde NO se permiten cajas surtidas (cada referencia va por separado)
const CATEGORIAS_SIN_SURTIDO = ['GELES', 'JABONES', 'CHAMPUS', 'CHAMPÚS'];

export function esCategoríaSinSurtido(categoria) {
  const cat = categoria?.toUpperCase() || '';
  return CATEGORIAS_SIN_SURTIDO.some(c => cat.includes(c));
}

// Subgrupos para línea facial
const FACIAL_SUBGRUPOS = {
  SERUM: ['SERUM', 'SÉRUM'],
  CREMA: ['CREMA', 'CREMAS'],
  LIMPIEZA: ['TÓNICO', 'TONICO', 'LECHE LIMPIADORA', 'AGUA MICELAR', 'MICELAR'],
};

export function esCategoríaFacial(categoria) {
  const cat = categoria?.toUpperCase() || '';
  return cat.includes('FACIAL') || cat.includes('LINEA FACIAL') || cat.includes('LÍNEA FACIAL');
}

export function getSubgrupoFacial(referencia) {
  const ref = referencia?.toUpperCase() || '';
  for (const [grupo, keywords] of Object.entries(FACIAL_SUBGRUPOS)) {
    if (keywords.some(kw => ref.includes(kw))) return grupo;
  }
  return 'OTROS_FACIAL';
}

/**
 * Calcula el precio unitario de un producto según el escalado de su categoría.
 * @param {Object} producto
 * @param {number} cantidad - Cantidad de ESTE producto
 * @param {number} [totalCategoria] - Total de unidades de toda la categoría (surtido variado).
 *   Si se pasa, se usa para determinar el tramo de escalado.
 *   Si no se pasa, se usa la cantidad del producto.
 */
export function calcularPrecioUnitario(producto, cantidad, totalCategoria) {
  const categoria = determinarCategoriaEscalado(producto);

  if (!categoria || cantidad <= 0) return producto.pvl;

  const escalados = TARIFAS[categoria];
  const cantidadEscalado = totalCategoria != null ? totalCategoria : cantidad;

  for (let i = escalados.length - 1; i >= 0; i--) {
    if (cantidadEscalado >= escalados[i].desde) {
      return escalados[i].precio;
    }
  }

  return escalados[0].precio;
}

/**
 * Calcula el ahorro por escalado de un producto.
 * @param {Object} producto
 * @param {number} cantidad - Cantidad de ESTE producto
 * @param {number} [totalCategoria] - Total de unidades de la categoría (surtido variado)
 */
export function calcularAhorro(producto, cantidad, totalCategoria) {
  const categoria = determinarCategoriaEscalado(producto);
  if (!categoria || cantidad <= 0) return 0;

  const precioBase = TARIFAS[categoria][0].precio;
  const precioActual = calcularPrecioUnitario(producto, cantidad, totalCategoria);

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
 * Calcula el total de unidades seleccionadas por categoría de escalado.
 * @param {Object} seleccion - { codigo: { cantidad, checked } }
 * @param {Array} productos - Lista de productos
 * @returns {Object} - { "GELES DE BAÑO 750ML": 120, "JABONES DE MANOS": 50, ... }
 */
export function calcularTotalesPorCategoriaEscalado(seleccion, productos) {
  const totales = {};
  Object.entries(seleccion).forEach(([codigo, { cantidad, checked }]) => {
    if (!checked || cantidad <= 0) return;
    const producto = productos.find(p => p.codigo === codigo);
    if (!producto) return;
    const cat = determinarCategoriaEscalado(producto);
    if (!cat) return;
    totales[cat] = (totales[cat] || 0) + cantidad;
  });
  return totales;
}

/**
 * Calcula el descuento 2x1 agrupando por categoría.
 * Por cada 2 unidades de productos con oferta en la misma categoría,
 * la unidad más barata es gratis.
 */
export function calcularDescuento2x1(seleccion, productos) {
  // Pre-calcular totales por categoría de escalado
  const totalesCatEsc = calcularTotalesPorCategoriaEscalado(seleccion, productos);

  // Agrupar unidades de productos con oferta por categoría
  const categorias = {};

  Object.entries(seleccion).forEach(([codigo, { cantidad, checked }]) => {
    if (!checked || cantidad <= 0) return;
    const producto = productos.find(p => p.codigo === codigo);
    if (!producto || !producto.oferta) return;

    const cat = producto.categoria;
    if (!categorias[cat]) categorias[cat] = [];

    const catEsc = determinarCategoriaEscalado(producto);
    const totalCat = catEsc ? totalesCatEsc[catEsc] : undefined;
    const precioUnit = calcularPrecioUnitario(producto, cantidad, totalCat);
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
