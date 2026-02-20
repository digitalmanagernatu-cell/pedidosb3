import { read, utils } from 'xlsx';

// Try to parse a value as a number (handles strings like "3,50" or "3.50")
function parseNumero(val) {
  if (typeof val === 'number') return val;
  if (val == null || val === '') return null;
  const str = String(val).trim().replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

export function parseTarifaExcel(buffer) {
  const wb = read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = utils.sheet_to_json(ws, { header: 1, defval: null });

  const productos = [];
  const filasDescartadas = [];
  let categoriaActual = null;
  let ofertaActual = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => c === null || c === '')) continue;

    const colA = row[0] != null ? String(row[0]).trim() : '';
    const colB = row[1] != null ? String(row[1]).trim() : '';
    const colC = row[2] != null ? String(row[2]).trim() : '';
    const colD = row[3]; // UD/CAJA
    const colE = row[4]; // PVL
    const colH = row[7] != null ? String(row[7]).trim() : '';
    const colM = row[12]; // PVP REC

    const pvlNum = parseNumero(colE);

    // Skip title row and header row
    if (colA === 'CODG' || colA.startsWith('TARIFA')) continue;

    // Detect offer in column H (e.g. "2X1")
    if (colH && /^\d+[xX]\d+$/.test(colH) && colA && colC) {
      ofertaActual = colH.toUpperCase();
    }

    // Category row: text in A, rest empty
    if (colA && !colB && !colC && pvlNum == null) {
      // Skip escalado headers and threshold rows
      if (colA.toUpperCase().includes('ESCALADO') || colA.includes('>')) continue;

      categoriaActual = normalizarCategoria(colA);
      ofertaActual = null;
      continue;
    }

    // Escalado threshold row (">X UNID" pattern) — skip
    if (colA.includes('>') || (typeof colE === 'string' && String(colE).includes('>'))) continue;

    // Product row: has code and reference (PVL puede ser null para expositores)
    if (colA && colC) {
      const ean = colB ? colB.replace(/\s+/g, '') : '';
      const pvpRec = parseNumero(colM);
      const udCaja = parseNumero(colD);

      const producto = {
        codigo: colA,
        ean,
        referencia: colC,
        udCaja,
        pvl: pvlNum ?? 0,
        pvpRec,
        categoria: categoriaActual || 'OTROS'
      };

      // Check for offer in column H of this row
      if (colH && /^\d+[xX]\d+$/.test(colH)) {
        producto.oferta = colH.toUpperCase();
      } else if (ofertaActual) {
        producto.oferta = ofertaActual;
      }

      productos.push(producto);
    }
  }

  return { productos, filasDescartadas };
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
