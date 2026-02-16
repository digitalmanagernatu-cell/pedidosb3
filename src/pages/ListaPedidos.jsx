import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Eye, Search } from 'lucide-react';
import { getPedidos, getEstadisticas } from '../services/pedidosService';
import { getUsuario, logout } from '../services/authService';
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

  const pedidos = useMemo(() => {
    return getPedidos().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }, []);

  const stats = useMemo(() => getEstadisticas(), []);

  const pedidosFiltrados = useMemo(() => {
    if (!filtro.trim()) return pedidos;
    const t = filtro.toLowerCase();
    return pedidos.filter(p =>
      p.codigo_cliente?.toLowerCase().includes(t) ||
      p.cif?.toLowerCase().includes(t) ||
      p.zona?.toLowerCase().includes(t) ||
      String(p.id).includes(t)
    );
  }, [pedidos, filtro]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handlePrint = (pedido) => {
    const win = window.open('', '_blank');
    const lineasHTML = pedido.lineas.map(l => `
      <tr>
        <td style="padding:6px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px">${l.codigo}</td>
        <td style="padding:6px;border-bottom:1px solid #eee">${l.referencia} ${l.tiene_escalado ? '<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:12px;font-size:11px">ESCALADO</span>' : ''}</td>
        <td style="padding:6px;border-bottom:1px solid #eee;text-align:center">${l.cantidad}</td>
        <td style="padding:6px;border-bottom:1px solid #eee;text-align:right">${l.precio_unitario.toFixed(2)} &euro;</td>
        <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${l.subtotal.toFixed(2)} &euro;</td>
      </tr>
    `).join('');

    win.document.write(`<!DOCTYPE html><html><head><title>Pedido #${pedido.id}</title></head><body style="font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:20px">
      <h1 style="color:#2563eb;margin-bottom:4px">Betrés ON</h1>
      <h2 style="color:#666;font-weight:400;margin-top:0">Pedido #${pedido.id}</h2>
      <div style="display:flex;gap:40px;margin:20px 0;padding:16px;background:#f9fafb;border-radius:8px">
        <div><strong>Fecha:</strong> ${formatFecha(pedido.fecha)}</div>
        <div><strong>Cliente:</strong> ${pedido.codigo_cliente}</div>
        <div><strong>CIF:</strong> ${pedido.cif}</div>
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
        ${pedido.totales.ahorro > 0 ? `<div style="color:#16a34a">Ahorro: <strong>${pedido.totales.ahorro.toFixed(2)} &euro;</strong></div>` : ''}
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

        <div className="bg-white rounded-lg shadow-md p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Pedidos</h2>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar por cliente, CIF, zona..."
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
                    <th className="px-3 py-3 font-semibold text-gray-700">Cliente</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">CIF</th>
                    <th className="px-3 py-3 font-semibold text-gray-700">Zona</th>
                    <th className="px-3 py-3 font-semibold text-gray-700 text-center">Productos</th>
                    <th className="px-3 py-3 font-semibold text-gray-700 text-right">Total</th>
                    <th className="px-3 py-3 font-semibold text-gray-700 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidosFiltrados.map((pedido, idx) => (
                    <tr key={pedido.id} className={`border-t border-gray-100 hover:bg-blue-50/50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-600">#{pedido.id}</td>
                      <td className="px-3 py-2.5 text-gray-700">{formatFecha(pedido.fecha)}</td>
                      <td className="px-3 py-2.5 font-medium text-gray-900">{pedido.codigo_cliente}</td>
                      <td className="px-3 py-2.5 text-gray-600">{pedido.cif}</td>
                      <td className="px-3 py-2.5 text-gray-600">{pedido.zona}</td>
                      <td className="px-3 py-2.5 text-center">{pedido.lineas?.length || 0}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-gray-900">{pedido.totales?.total?.toFixed(2)} €</td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => navigate(`/admin/pedido/${pedido.id}`)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Ver
                          </button>
                          <button
                            onClick={() => handlePrint(pedido)}
                            className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors cursor-pointer"
                          >
                            PDF
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
    </div>
  );
}
