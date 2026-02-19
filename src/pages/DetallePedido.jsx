import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, Send } from 'lucide-react';
import { getPedidoById, actualizarPedido } from '../services/pedidosService';
import { enviarPedidoSellforge } from '../services/sellforgeService';

function formatFecha(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function DetallePedido() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [pedido, setPedido] = useState(() => getPedidoById(id));
  const [sfStatus, setSfStatus] = useState(null); // null | 'enviando' | {tipo:'ok'|'error', texto:string}

  const yaEnviado = !!pedido?.enviadoSellforge;

  const handleEnviarSellforge = async () => {
    if (sfStatus === 'enviando' || yaEnviado) return;
    setSfStatus('enviando');
    try {
      const result = await enviarPedidoSellforge(pedido);
      const datos = {
        enviadoSellforge: {
          fecha: new Date().toISOString(),
          codigo: result.code || '',
          total: result.total || ''
        }
      };
      actualizarPedido(pedido.id, datos);
      setPedido(prev => ({ ...prev, ...datos }));
      setSfStatus({ tipo: 'ok', texto: `Enviado a Sellforge. Código: ${result.code}` });
    } catch (err) {
      setSfStatus({ tipo: 'error', texto: err.message });
    }
  };

  if (!pedido) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Pedido no encontrado</h2>
          <button onClick={() => navigate('/admin')} className="text-blue-600 hover:underline cursor-pointer">Volver</button>
        </div>
      </div>
    );
  }

  const handlePrint = () => window.print();

  // Backward compatibility: old orders have codigo_cliente + cif, new ones have codigo_cliente (as ID/CIF) + nombre_cliente
  const idCifDisplay = pedido.nombre_cliente
    ? pedido.codigo_cliente
    : `${pedido.codigo_cliente}${pedido.cif ? ` / ${pedido.cif}` : ''}`;
  const nombreDisplay = pedido.nombre_cliente || '—';

  return (
    <div className="min-h-screen bg-gray-50">
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
            <button
              onClick={handleEnviarSellforge}
              disabled={sfStatus === 'enviando' || yaEnviado}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed ${
                yaEnviado
                  ? 'bg-gray-400 text-white'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-300'
              }`}
            >
              <Send className="w-4 h-4" />
              {yaEnviado ? 'Ya enviado a Sellforge' : sfStatus === 'enviando' ? 'Enviando...' : 'Enviar a Sellforge'}
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Imprimir / PDF
            </button>
          </div>
        </div>
      </header>

      {yaEnviado && !sfStatus && (
        <div className="max-w-4xl mx-auto px-4 mt-4 no-print">
          <div className="p-3 rounded-lg text-sm bg-emerald-50 text-emerald-700 border border-emerald-200">
            Enviado a Sellforge el {formatFecha(pedido.enviadoSellforge.fecha)}
            {pedido.enviadoSellforge.codigo && ` — Código: ${pedido.enviadoSellforge.codigo}`}
          </div>
        </div>
      )}

      {sfStatus && sfStatus !== 'enviando' && (
        <div className={`max-w-4xl mx-auto px-4 mt-4 no-print`}>
          <div className={`p-3 rounded-lg text-sm ${
            sfStatus.tipo === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' :
            'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {sfStatus.texto}
          </div>
        </div>
      )}

      <main className="max-w-4xl mx-auto px-4 py-6 print-area">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Pedido</h1>
              <p className="text-gray-500 mt-1">{formatFecha(pedido.fecha)}</p>
            </div>
            <div className="mt-3 sm:mt-0 hidden print:block text-right">
              <p className="text-xl font-bold text-blue-600">Betrés ON</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg mb-6">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">ID / CIF</p>
              <p className="font-semibold text-gray-900">{idCifDisplay}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Nombre del Cliente</p>
              <p className="font-semibold text-gray-900">{nombreDisplay}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Zona</p>
              <p className="font-semibold text-gray-900">{pedido.zona}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-3 py-3 font-semibold text-gray-700">Código</th>
                  <th className="px-3 py-3 font-semibold text-gray-700">Producto</th>
                  <th className="px-3 py-3 font-semibold text-gray-700 text-center">Cantidad</th>
                  <th className="px-3 py-3 font-semibold text-gray-700 text-right">Precio Unit.</th>
                  <th className="px-3 py-3 font-semibold text-gray-700 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {pedido.lineas.map((linea, idx) => (
                  <tr key={`${linea.codigo}-${idx}`} className={`border-t border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{linea.codigo}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-gray-900">{linea.referencia}</span>
                      {linea.tiene_escalado && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          ESCALADO
                        </span>
                      )}
                      {linea.tiene_promo_2x1 && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                          2X1
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center font-medium">{linea.cantidad}</td>
                    <td className="px-3 py-2.5 text-right">{linea.precio_unitario.toFixed(2)} €</td>
                    <td className="px-3 py-2.5 text-right font-semibold">{linea.subtotal.toFixed(2)} €</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex justify-end">
            <div className="w-full sm:w-72 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-semibold">{pedido.totales.subtotal.toFixed(2)} €</span>
              </div>
              {pedido.totales.ahorro > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Ahorro escalado</span>
                  <span className="font-bold">{pedido.totales.ahorro.toFixed(2)} €</span>
                </div>
              )}
              {(pedido.totales.descuento_2x1 || 0) > 0 && (
                <div className="flex justify-between text-orange-600">
                  <span>Promo 2x1</span>
                  <span className="font-bold">-{pedido.totales.descuento_2x1.toFixed(2)} €</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">IVA (21%)</span>
                <span className="font-semibold">{pedido.totales.iva.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between pt-3 border-t-2 border-blue-600 text-lg">
                <span className="font-bold text-gray-900">TOTAL</span>
                <span className="font-black text-blue-600">{pedido.totales.total.toFixed(2)} €</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
