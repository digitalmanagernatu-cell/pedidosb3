const TARIFAS = {
  'GELES DE BAÑO 750 ML': [
    { desde: 0, precio: 1.48 },
    { desde: 48, precio: 1.39 },
    { desde: 96, precio: 1.37 },
    { desde: 252, precio: 1.34 },
    { desde: 540, precio: 1.31 },
    { desde: 1080, precio: 1.23 }
  ],
  'GELES FAMILIARES 1 L': [
    { desde: 0, precio: 1.76 },
    { desde: 36, precio: 1.65 },
    { desde: 72, precio: 1.63 },
    { desde: 180, precio: 1.59 },
    { desde: 360, precio: 1.56 },
    { desde: 720, precio: 1.46 }
  ],
  'BODY MIST': [
    { desde: 0, precio: 1.29 },
    { desde: 25, precio: 1.24 },
    { desde: 121, precio: 1.18 },
    { desde: 241, precio: 1.14 }
  ],
  'JABONES DE MANOS': [
    { desde: 0, precio: 1.29 },
    { desde: 18, precio: 1.24 },
    { desde: 144, precio: 1.18 },
    { desde: 228, precio: 1.13 }
  ]
};

export function determinarCategoriaEscalado(referencia) {
  const ref = referencia.toUpperCase();

  if (ref.includes('GEL DE BAÑO') || ref.includes('GEL BAÑO')) {
    if (ref.includes('FAMILIAR') || ref.includes('1L')) return 'GELES FAMILIARES 1 L';
    if (ref.includes('750')) return 'GELES DE BAÑO 750 ML';
  }
  if (ref.includes('BODY MIST') || ref.includes('BODYMIST')) return 'BODY MIST';
  if (ref.includes('JABÓN') || ref.includes('JABON') || ref.includes('JABÓN DE MANOS') || ref.includes('JABON DE MANOS')) return 'JABONES DE MANOS';

  return null;
}

export function calcularPrecioUnitario(producto, cantidad) {
  const categoria = determinarCategoriaEscalado(producto.referencia);

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
  const categoria = determinarCategoriaEscalado(producto.referencia);
  if (!categoria || cantidad <= 0) return 0;

  const precioBase = TARIFAS[categoria][0].precio;
  const precioActual = calcularPrecioUnitario(producto, cantidad);

  return (precioBase - precioActual) * cantidad;
}

export function tieneEscalado(producto) {
  return determinarCategoriaEscalado(producto.referencia) !== null;
}

export function getEscaladosCategoria(producto) {
  const categoria = determinarCategoriaEscalado(producto.referencia);
  if (!categoria) return null;
  return { categoria, escalados: TARIFAS[categoria] };
}
