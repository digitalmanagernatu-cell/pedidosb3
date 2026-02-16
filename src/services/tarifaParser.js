import { read, utils } from 'xlsx';

export function parseTarifaExcel(buffer) {
  const wb = read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = utils.sheet_to_json(ws, { header: 1, defval: null });

  const productos = [];
  let categoriaActual = null;
  let ofertaActual = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => c === null || c === '')) continue;

    const colA = row[0] != null ? String(row[0]).trim() : '';
    const colB = row[1] != null ? String(row[1]).trim() : '';
    const colC = row[2] != null ? String(row[2]).trim() : '';
    const colD = row[3];
    const colG = row[6] != null ? String(row[6]).trim() : '';
    const colL = row[11];

    // Skip title row and header row
    if (colA === 'CODG' || colA.startsWith('TARIFA')) continue;

    // Detect offer in column G (e.g. "2X1")
    if (colG && /^\d+[xX]\d+$/.test(colG) && colA && colC && typeof colD === 'number') {
      ofertaActual = colG.toUpperCase();
    }

    // Category row: text in A, rest empty
    if (colA && !colB && !colC && (colD === null || colD === '' || typeof colD !== 'number')) {
      // Skip escalado headers and threshold rows
      if (colA.toUpperCase().includes('ESCALADO') || colA.includes('>')) continue;

      categoriaActual = normalizarCategoria(colA);
      ofertaActual = null;
      continue;
    }

    // Escalado threshold row (">X UNID" pattern) — skip
    if (colA.includes('>') || (typeof colD === 'string' && colD.includes('>'))) continue;

    // Product row: has code, reference, and numeric PVL
    if (colA && colC && typeof colD === 'number') {
      const ean = colB ? colB.replace(/\s+/g, '') : '';
      const pvpRec = typeof colL === 'number' ? colL : null;

      const producto = {
        codigo: colA,
        ean,
        referencia: colC,
        pvl: colD,
        pvpRec,
        categoria: categoriaActual || 'OTROS'
      };

      // Check for offer in column G of this row
      if (colG && /^\d+[xX]\d+$/.test(colG)) {
        producto.oferta = colG.toUpperCase();
      } else if (ofertaActual) {
        producto.oferta = ofertaActual;
      }

      productos.push(producto);
    }
  }

  return productos;
}

function normalizarCategoria(texto) {
  const t = texto.toUpperCase().trim();

  if (t.includes('MIKADO') && (t.includes('925') || t.includes('AMBIENTACION') || t.includes('AMBIENTACIÓN'))) {
    return 'AMBIENTACIÓN - MIKADOS 925ML';
  }

  const mapeo = {
    'AMBIENTACION': 'AMBIENTACIÓN',
    'PERFUMERIA': 'PERFUMERÍA',
    'GELES 750ML.': 'GELES DE BAÑO 750ML',
    'GELES 750ML': 'GELES DE BAÑO 750ML',
    'GELES 1L.': 'GELES DE BAÑO 1L',
    'GELES 1L': 'GELES DE BAÑO 1L',
    'JABONES': 'JABONES DE MANOS',
    'CHAMPUS': 'CHAMPÚS',
    'LINEA FACIAL': 'LÍNEA FACIAL'
  };

  // Try exact match first
  for (const [key, val] of Object.entries(mapeo)) {
    if (t === key || t.startsWith(key)) return val;
  }

  return t;
}
