import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileDown, Mail, X } from 'lucide-react';
import { getPedidos } from '../services/pedidosService';
import { isEmailConfigured } from '../services/emailService';
import emailjs from '@emailjs/browser';

const EMAILJS_SERVICE_ID = 'service_betreson';
const EMAILJS_TEMPLATE_ID = 'template_zzuw4ew';
const EMAILJS_PUBLIC_KEY = 'KIeBhWzfOq7akpXce';

function calcularEstadisticas(pedidos) {
  const mapa = new Map();
  for (const pedido of pedidos) {
    if (!pedido.lineas) continue;
    // Factor para que el importe por producto incluya IVA y descuentos proporcionales,
    // de forma que la suma total coincida con pedido.totales.total (= total facturado)
    const sumaLineas = pedido.lineas.reduce((s, l) => s + (l.subtotal || 0), 0);
    const totalReal = pedido.totales?.total || 0;
    const factor = sumaLineas > 0 ? totalReal / sumaLineas : 1;

    for (const linea of pedido.lineas) {
      const key = linea.codigo;
      if (!mapa.has(key)) {
        mapa.set(key, {
          codigo: linea.codigo,
          referencia: linea.referencia,
          unidades: 0,
          importe: 0
        });
      }
      const entry = mapa.get(key);
      entry.unidades += linea.cantidad;
      entry.importe += (linea.subtotal || 0) * factor;
    }
  }
  return Array.from(mapa.values()).sort((a, b) => b.importe - a.importe);
}

function generarHTMLEstadisticas(filas, fechaDesde, fechaHasta) {
  const filasHTML = filas.map(f => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px">${f.codigo}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px">${f.referencia}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;font-size:13px">${f.unidades}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-size:13px;font-weight:600">${f.importe.toFixed(2)} &euro;</td>
    </tr>
  `).join('');
  const totalUnidades = filas.reduce((s, f) => s + f.unidades, 0);
  const totalImporte = filas.reduce((s, f) => s + f.importe, 0);
  const periodoHTML = (fechaDesde || fechaHasta)
    ? `<p style="color:#666;font-size:13px">Período: ${fechaDesde || '—'} → ${fechaHasta || '—'}</p>`
    : '';
  return `
    <div style="font-family:system-ui,sans-serif;max-width:700px;margin:0 auto">
      <h2 style="color:#000;margin-bottom:4px">Betrés ON — Estadísticas de Productos</h2>
      ${periodoHTML}
      <table style="width:100%;border-collapse:collapse;margin-top:12px">
        <thead><tr style="background:#f1f5f9">
          <th style="padding:8px 10px;text-align:left;font-size:12px">Código</th>
          <th style="padding:8px 10px;text-align:left;font-size:12px">Producto</th>
          <th style="padding:8px 10px;text-align:center;font-size:12px">Uds. totales</th>
          <th style="padding:8px 10px;text-align:right;font-size:12px">Importe total</th>
        </tr></thead>
        <tbody>${filasHTML}</tbody>
        <tfoot><tr style="background:#f9fafb;font-weight:700">
          <td colspan="2" style="padding:8px 10px;font-size:13px">TOTAL</td>
          <td style="padding:8px 10px;text-align:center;font-size:13px">${totalUnidades}</td>
          <td style="padding:8px 10px;text-align:right;font-size:13px;color:#2563eb">${totalImporte.toFixed(2)} &euro;</td>
        </tr></tfoot>
      </table>
    </div>
  `;
}

export default function EstadisticasProductos() {
  const navigate = useNavigate();
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [sortCol, setSortCol] = useState('importe');   // 'importe' | 'unidades'
  const [sortDir, setSortDir] = useState('desc');       // 'asc' | 'desc'
  const [emailModal, setEmailModal] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailStatus, setEmailStatus] = useState(null);

  const pedidosFiltrados = useMemo(() => {
    let todos = getPedidos();
    if (fechaDesde) todos = todos.filter(p => new Date(p.fecha) >= new Date(fechaDesde));
    if (fechaHasta) {
      const hasta = new Date(fechaHasta);
      hasta.setHours(23, 59, 59, 999);
      todos = todos.filter(p => new Date(p.fecha) <= hasta);
    }
    return todos;
  }, [fechaDesde, fechaHasta]);

  const filas = useMemo(() => {
    const base = calcularEstadisticas(pedidosFiltrados);
    return [...base].sort((a, b) => {
      const diff = a[sortCol] - b[sortCol];
      return sortDir === 'desc' ? -diff : diff;
    });
  }, [pedidosFiltrados, sortCol, sortDir]);
  const totalUnidades = filas.reduce((s, f) => s + f.unidades, 0);
  const totalImporte = filas.reduce((s, f) => s + f.importe, 0);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const handlePDF = () => window.print();

  const handleEnviarEmail = async () => {
    if (!emailInput.trim()) return;
    setEmailStatus('enviando');
    try {
      const bodyHtml = generarHTMLEstadisticas(filas, fechaDesde, fechaHasta);
      const periodoLabel = (fechaDesde || fechaHasta) ? ` (${fechaDesde || '—'} → ${fechaHasta || '—'})` : '';
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        {
          to_email: emailInput.trim(),
          subject: `Estadísticas de productos${periodoLabel}`,
          body_html: bodyHtml
        },
        EMAILJS_PUBLIC_KEY
      );
      setEmailStatus('ok');
    } catch (e) {
      setEmailStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - no imprime */}
      <header className="bg-white shadow-sm border-b border-gray-200 no-print">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => navigate('/admin')}
            className="flex items-center gap-2 text-gray-600 hover:text-blue-600 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Volver</span>
          </button>
          <div className="flex items-center gap-2">
            {isEmailConfigured() && (
              <button
                onClick={() => { setEmailModal(true); setEmailStatus(null); setEmailInput(''); }}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer"
              >
                <Mail className="w-4 h-4" />
                Enviar por email
              </button>
            )}
            <button
              onClick={handlePDF}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
            >
              <FileDown className="w-4 h-4" />
              Exportar PDF
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="no-print mb-6">
          <h1 className="text-xl font-bold text-gray-900">Estadísticas de Productos</h1>
        </div>

        {/* Filtros de fecha */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6 no-print">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
              <input
                type="date"
                value={fechaDesde}
                onChange={e => setFechaDesde(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
              <input
                type="date"
                value={fechaHasta}
                onChange={e => setFechaHasta(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {(fechaDesde || fechaHasta) && (
              <button
                onClick={() => { setFechaDesde(''); setFechaHasta(''); }}
                className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Limpiar filtro
              </button>
            )}
          </div>
          {(fechaDesde || fechaHasta) && (
            <p className="text-xs text-blue-600 mt-2">
              Mostrando {pedidosFiltrados.length} pedido{pedidosFiltrados.length !== 1 ? 's' : ''} en el período seleccionado
            </p>
          )}
        </div>

        {/* Tabla — print-area para que el CSS global la haga visible al imprimir */}
        <div className="print-area">
        <h1 className="text-xl font-bold text-gray-900 mb-4 no-screen" style={{display:'none'}}>Betrés ON — Estadísticas de Productos</h1>
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {filas.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-lg font-medium">No hay datos</p>
              <p className="text-sm mt-1">No se encontraron pedidos con los filtros seleccionados.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left">
                  <th className="px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Código</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Producto</th>
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wide text-center">
                    <button onClick={() => handleSort('unidades')} className="inline-flex items-center gap-1 cursor-pointer hover:text-gray-900 transition-colors" style={{color: sortCol==='unidades'?'#1d4ed8':'#4b5563'}}>
                      Uds. totales
                      <span className="flex flex-col leading-none">
                        <span style={{opacity: sortCol==='unidades' && sortDir==='asc' ? 1 : 0.3, fontSize:'9px', lineHeight:'1'}}>▲</span>
                        <span style={{opacity: sortCol==='unidades' && sortDir==='desc' ? 1 : 0.3, fontSize:'9px', lineHeight:'1'}}>▼</span>
                      </span>
                    </button>
                  </th>
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wide text-right">
                    <button onClick={() => handleSort('importe')} className="inline-flex items-center gap-1 cursor-pointer hover:text-gray-900 transition-colors ml-auto" style={{color: sortCol==='importe'?'#1d4ed8':'#4b5563'}}>
                      Importe total
                      <span className="flex flex-col leading-none">
                        <span style={{opacity: sortCol==='importe' && sortDir==='asc' ? 1 : 0.3, fontSize:'9px', lineHeight:'1'}}>▲</span>
                        <span style={{opacity: sortCol==='importe' && sortDir==='desc' ? 1 : 0.3, fontSize:'9px', lineHeight:'1'}}>▼</span>
                      </span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila, i) => (
                  <tr key={fila.codigo} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{fila.codigo}</td>
                    <td className="px-4 py-3 text-gray-900">{fila.referencia}</td>
                    <td className="px-4 py-3 text-center font-medium text-gray-800">{fila.unidades}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{fila.importe.toFixed(2)} €</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-blue-50 border-t-2 border-blue-200 font-bold">
                  <td colSpan={2} className="px-4 py-3 text-gray-900">TOTAL</td>
                  <td className="px-4 py-3 text-center text-gray-900">{totalUnidades}</td>
                  <td className="px-4 py-3 text-right text-blue-700">{totalImporte.toFixed(2)} €</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        </div>{/* /print-area */}

        {/* Acciones inferiores */}
        {filas.length > 0 && (
          <div className="flex justify-end gap-3 mt-6 no-print">
            {isEmailConfigured() && (
              <button
                onClick={() => { setEmailModal(true); setEmailStatus(null); setEmailInput(''); }}
                className="flex items-center gap-2 px-5 py-2.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer"
              >
                <Mail className="w-4 h-4" />
                Enviar por email
              </button>
            )}
            <button
              onClick={handlePDF}
              className="flex items-center gap-2 px-5 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
            >
              <FileDown className="w-4 h-4" />
              Exportar PDF
            </button>
          </div>
        )}
      </main>

      {/* Modal email */}
      {emailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Enviar estadísticas por email</h3>
              <button onClick={() => setEmailModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            {emailStatus === 'ok' ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Mail className="w-6 h-6 text-green-600" />
                </div>
                <p className="text-green-700 font-medium">¡Email enviado correctamente!</p>
                <button
                  onClick={() => setEmailModal(false)}
                  className="mt-4 px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dirección de email</label>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={e => setEmailInput(e.target.value)}
                    placeholder="ejemplo@dominio.com"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                {emailStatus === 'error' && (
                  <p className="text-sm text-red-600 mb-3">Error al enviar. Inténtalo de nuevo.</p>
                )}
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setEmailModal(false)}
                    className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleEnviarEmail}
                    disabled={emailStatus === 'enviando' || !emailInput.trim()}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Mail className="w-4 h-4" />
                    {emailStatus === 'enviando' ? 'Enviando...' : 'Enviar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        @media print {
          .no-screen { display: block !important; }
        }
      `}</style>
    </div>
  );
}
