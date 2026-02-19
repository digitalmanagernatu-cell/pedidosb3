import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Eye, Search, Trash2, Upload, Mail, RefreshCw, CheckCircle } from 'lucide-react';
import { getPedidos, getEstadisticas, eliminarPedido, sincronizarDesdeFirestore } from '../services/pedidosService';
import { getUsuario, logout } from '../services/authService';
import { setProductos, sincronizarTarifaDesdeFirestore } from '../services/productosService';
import { parseTarifaExcel } from '../services/tarifaParser';
import { enviarPedidoEmail, isEmailConfigured } from '../services/emailService';
import EstadisticasAdmin from '../components/EstadisticasAdmin';

function formatFecha(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ListaPedidos() {
  const navigate = useNavigate();
  const usuario = getUsuario();
  const [filtro, setFiltro] = useState('');
  const [version, setVersion] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [emailModal, setEmailModal] = useState(null);
  const [emailInput, setEmailInput] = useState('');
  const [emailStatus, setEmailStatus] = useState(null);
  const [uploadMsg, setUploadMsg] = useState(null);
  const [productosSubidos, setProductosSubidos] = useState(null);
  const fileInputRef = useRef(null);

  const pedidos = useMemo(() => {
    return getPedidos().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const stats = useMemo(() => getEstadisticas(), [version]);

  const pedidosFiltrados = useMemo(() => {
    if (!filtro.trim()) return pedidos;
    const t = filtro.toLowerCase();
    return pedidos.filter(p =>
      p.codigo_cliente?.toLowerCase().includes(t) ||
      p.nombre_cliente?.toLowerCase().includes(t) ||
      p.cif?.toLowerCase().includes(t) ||
      p.zona?.toLowerCase().includes(t) ||
      String(p.id).includes(t)
    );
  }, [pedidos, filtro]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleEliminar = (id) => {
    eliminarPedido(id);
    setConfirmDelete(null);
    setVersion(v => v + 1);
  };

  const handleRefresh = async () => {
    await sincronizarDesdeFirestore();
    setVersion(v => v + 1);
  };

  // Sincronizar desde Firestore al cargar la página
  useEffect(() => {
    sincronizarDesdeFirestore().then(ok => {
      if (ok) setVersion(v => v + 1);
    });
    sincronizarTarifaDesdeFirestore();
  }, []);

  const handleEnviarEmail = async () => {
    if (!emailInput.trim() || !emailModal) return;
    setEmailStatus({ tipo: 'enviando', texto: 'Enviando...' });
    try {
      const pedido = pedidos.find(p => p.id === emailModal);
      if (!pedido) throw new Error('Pedido no encontrado');
      await enviarPedidoEmail(pedido, emailInput.trim());
      setEmailStatus({ tipo: 'ok', texto: 'Email enviado correctamente' });
      setTimeout(() => { setEmailModal(null); setEmailInput(''); setEmailStatus(null); }, 2000);
    } catch (err) {
      setEmailStatus({ tipo: 'error', texto: err.message });
    }
  };

  const handleUploadTarifa = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const { productos, filasDescartadas } = parseTarifaExcel(buffer);

      if (productos.length === 0) {
        let msg = 'No se encontraron productos en el archivo.';
        if (filasDescartadas.length > 0) {
          msg += ` Se descartaron ${filasDescartadas.length} filas con datos incompletos (sin precio válido).`;
        }
        setUploadMsg({ tipo: 'error', texto: msg });
        return;
      }

      await setProductos(productos);
      setProductosSubidos(productos);

      // Build category summary
      const porCategoria = {};
      productos.forEach(p => {
        if (!porCategoria[p.categoria]) porCategoria[p.categoria] = [];
        porCategoria[p.categoria].push(p);
      });

      let texto = `Tarifa actualizada: ${productos.length} productos en ${Object.keys(porCategoria).length} categorías.`;
      if (filasDescartadas.length > 0) {
        const ejemplos = filasDescartadas.slice(0, 5).map(f => `${f.codigo} - ${f.referencia} (fila ${f.fila}, PVL: "${f.pvl ?? 'vacío'}")`).join('; ');
        texto += ` ⚠ ${filasDescartadas.length} fila(s) descartadas: ${ejemplos}`;
        if (filasDescartadas.length > 5) texto += `... y ${filasDescartadas.length - 5} más`;
      }
      setUploadMsg({ tipo: filasDescartadas.length > 0 ? 'warning' : 'ok', texto, porCategoria });
    } catch (err) {
      setUploadMsg({ tipo: 'error', texto: `Error al procesar el archivo: ${err.message}` });
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePrint = (pedido) => {
    const lineasHTML = pedido.lineas.map(l => `
      <tr>
        <td style="padding:6px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px">${l.codigo}</td>
        <td style="padding:6px;border-bottom:1px solid #eee">${l.referencia} ${l.tiene_escalado ? '<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:12px;font-size:11px">ESCALADO</span>' : ''} ${l.tiene_promo_2x1 ? '<span style="background:#ffedd5;color:#c2410c;padding:2px 8px;border-radius:12px;font-size:11px">2X1</span>' : ''}</td>
        <td style="padding:6px;border-bottom:1px solid #eee;text-align:center">${l.cantidad}</td>
        <td style="padding:6px;border-bottom:1px solid #eee;text-align:right">${l.precio_unitario.toFixed(2)} &euro;</td>
        <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${l.subtotal.toFixed(2)} &euro;</td>
      </tr>
    `).join('');

    const nombreDisplay = pedido.nombre_cliente || pedido.codigo_cliente;
    const idDisplay = pedido.nombre_cliente ? pedido.codigo_cliente : (pedido.cif || '');

    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Pedido #${pedido.id}</title></head><body style="font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:20px">
      <h1 style="color:#2563eb;margin-bottom:4px">Betrés ON</h1>
      <h2 style="color:#666;font-weight:400;margin-top:0">Pedido #${pedido.id}</h2>
      <div style="display:flex;gap:40px;margin:20px 0;padding:16px;background:#f9fafb;border-radius:8px">
        <div><strong>Fecha:</strong> ${formatFecha(pedido.fecha)}</div>
        <div><strong>Cliente:</strong> ${nombreDisplay}</div>
        <div><strong>ID/CIF:</strong> ${idDisplay}</div>
        <div><strong>Zona:</strong> ${pedido.zona}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead><tr style="background:#f1f5f9">
          <th style="padding:8px;text-align:left">Código</th>
          <th style="padding:8px;text-align:left">Producto</th>
          <th style="padding:8px;text-align:center">Cant.</th>
          <th style="padding:8px;text-align:right">P. Unit.</th>
          <th style="padding:8px;text-align:right">Subtotal</th>
        </tr></thead>
        <tbody>${lineasHTML}</tbody>
      </table>
      <div style="margin-top:20px;text-align:right;font-size:15px;line-height:2">
        <div>Subtotal: <strong>${pedido.totales.subtotal.toFixed(2)} &euro;</strong></div>
        ${pedido.totales.ahorro > 0 ? `<div style="color:#16a34a">Ahorro escalado: <strong>${pedido.totales.ahorro.toFixed(2)} &euro;</strong></div>` : ''}
        ${(pedido.totales.descuento_2x1 || 0) > 0 ? `<div style="color:#c2410c">Promo 2x1: <strong>-${pedido.totales.descuento_2x1.toFixed(2)} &euro;</strong></div>` : ''}
        <div>IVA (21%): <strong>${pedido.totales.iva.toFixed(2)} &euro;</strong></div>
        <div style="font-size:20px;margin-top:8px;border-top:2px solid #2563eb;padding-top:8px">TOTAL: <strong style="color:#2563eb">${pedido.totales.total.toFixed(2)} &euro;</strong></div>
      </div>
      <script>window.print();</script>
    </body></html>`);
    win.document.close();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">
            Betrés ON — <span className="text-blue-600">Administración</span>
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:inline">{usuario?.email}</span>
            <button
              onClick={handleRefresh}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              title="Refrescar datos"
            >
              <RefreshCw className="w-4 h-4" />
              Refrescar
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Cerrar Sesión
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <EstadisticasAdmin stats={stats} />

        {/* Tariff upload section */}
        <div className="bg-white rounded-lg shadow-md p-5 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Gestión de Tarifa</h2>
              <p className="text-sm text-gray-500 mt-1">Sube un archivo Excel (.xlsx) con la nueva tarifa de productos</p>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleUploadTarifa}
                className="hidden"
                id="tarifa-upload"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors cursor-pointer text-sm"
              >
                <Upload className="w-4 h-4" />
                Subir Nueva Tarifa
              </button>
            </div>
          </div>
          {uploadMsg && (
            <div className={`mt-3 p-3 rounded-lg text-sm ${
              uploadMsg.tipo === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' :
              uploadMsg.tipo === 'warning' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
              'bg-red-50 text-red-700 border border-red-200'
            }`}>
              <p>{uploadMsg.texto}</p>
              {uploadMsg.porCategoria && (
                <details className="mt-2">
                  <summary className="cursor-pointer font-semibold">Ver productos por categoría</summary>
                  <div className="mt-2 max-h-64 overflow-y-auto text-xs space-y-2">
                    {Object.entries(uploadMsg.porCategoria).map(([cat, prods]) => (
                      <div key={cat}>
                        <p className="font-bold">{cat} ({prods.length})</p>
                        <ul className="ml-4 list-disc">
                          {prods.map(p => (
                            <li key={p.codigo}>{p.codigo} — {p.referencia} — {p.pvl.toFixed(2)}€</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-md p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Pedidos</h2>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar por cliente, nombre, zona..."
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
              />
            </div>
          </div>

          {pedidosFiltrados.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {pedidos.length === 0 ? 'No hay pedidos registrados' : 'No se encontraron resultados'}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-3 py-3 font-semibold text-gray-700">ID</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Fecha</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">ID/CIF</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Nombre</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Zona</th>
                    <th className="px-3 py-3 font-semibold text-gray-700 text-center">Productos</th>
                    <th className="px-3 py-3 font-semibold text-gray-700 text-right">Total</th>
                    <th className="px-3 py-3 font-semibold text-gray-700 text-center">Sellforge</th>
                    <th className="px-3 py-3 font-semibold text-gray-700 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidosFiltrados.map((pedido, idx) => (
                    <tr key={pedido.id} className={`border-t border-gray-100 hover:bg-blue-50/50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-600">#{pedido.id}</td>
                      <td className="px-3 py-2.5 text-gray-700">{formatFecha(pedido.fecha)}</td>
                      <td className="px-3 py-2.5 font-medium text-gray-900">
                        {pedido.codigo_cliente}
                        {pedido.cif && !pedido.nombre_cliente && <span className="text-gray-500 text-xs ml-1">({pedido.cif})</span>}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">{pedido.nombre_cliente || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600">{pedido.zona}</td>
                      <td className="px-3 py-2.5 text-center">{pedido.lineas?.length || 0}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-gray-900">{pedido.totales?.total?.toFixed(2)} €</td>
                      <td className="px-3 py-2.5 text-center">
                        {pedido.enviadoSellforge ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700" title={`Enviado el ${formatFecha(pedido.enviadoSellforge.fecha)}`}>
                            <CheckCircle className="w-3.5 h-3.5" />
                            Enviado
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                            Pendiente
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => navigate(`/admin/pedido/${pedido.id}`)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Ver
                          </button>
                          <button
                            onClick={() => handlePrint(pedido)}
                            className="px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors cursor-pointer"
                          >
                            PDF
                          </button>
                          <button
                            onClick={() => { setEmailModal(pedido.id); setEmailInput(''); setEmailStatus(null); }}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 rounded-md hover:bg-purple-100 transition-colors cursor-pointer"
                            title="Enviar por email"
                          >
                            <Mail className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(pedido.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-md hover:bg-red-100 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 text-center">
            <div className="mx-auto w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <Trash2 className="w-7 h-7 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Eliminar pedido</h3>
            <p className="text-gray-600 text-sm mb-5">
              ¿Estás seguro de que quieres eliminar el pedido <span className="font-mono font-bold">#{confirmDelete}</span>? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-5 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleEliminar(confirmDelete)}
                className="px-5 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email send modal */}
      {emailModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <div className="mx-auto w-14 h-14 bg-purple-100 rounded-full flex items-center justify-center mb-4">
              <Mail className="w-7 h-7 text-purple-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2 text-center">Enviar pedido por email</h3>
            <p className="text-gray-600 text-sm mb-4 text-center">
              Introduce el email del destinatario
            </p>
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="email@ejemplo.com"
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm mb-3"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleEnviarEmail()}
            />
            {emailStatus && (
              <div className={`mb-3 p-2.5 rounded-lg text-xs ${
                emailStatus.tipo === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' :
                emailStatus.tipo === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
                'bg-blue-50 text-blue-700 border border-blue-200'
              }`}>
                {emailStatus.texto}
              </div>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => { setEmailModal(null); setEmailInput(''); setEmailStatus(null); }}
                className="px-5 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleEnviarEmail}
                disabled={!emailInput.trim() || emailStatus?.tipo === 'enviando'}
                className="px-5 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
