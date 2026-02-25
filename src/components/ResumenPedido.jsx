import { ShoppingCart, TrendingDown, Tag, AlertTriangle } from 'lucide-react';

const PEDIDO_MINIMO = 150;

export default function ResumenPedido({ totales, onCrearPedido, disabled }) {
  const { totalProductos, subtotal, ahorro, descuento2x1, iva, total } = totales;
  const porDebajoMinimo = totalProductos > 0 && subtotal < PEDIDO_MINIMO;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] z-50 no-print">
      <div className="max-w-7xl mx-auto px-4 py-3">
        {porDebajoMinimo && (
          <div className="flex items-center gap-2 mb-2 p-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>Pedido mínimo: <strong>{PEDIDO_MINIMO.toFixed(2)} €</strong> (sin IVA). Faltan <strong>{(PEDIDO_MINIMO - subtotal).toFixed(2)} €</strong></span>
          </div>
        )}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-sm">
            <div className="flex items-center gap-1.5">
              <ShoppingCart className="w-4 h-4 text-gray-500" />
              <span className="text-gray-600">Productos:</span>
              <span className="font-bold text-gray-900">{totalProductos}</span>
            </div>
            <div>
              <span className="text-gray-600">Subtotal: </span>
              <span className="font-bold text-gray-900">{subtotal.toFixed(2)} €</span>
            </div>
            {ahorro > 0 && (
              <div className="flex items-center gap-1.5">
                <TrendingDown className="w-4 h-4 text-green-500" />
                <span className="text-green-600 font-bold">Ahorro: {ahorro.toFixed(2)} €</span>
              </div>
            )}
            {descuento2x1 > 0 && (
              <div className="flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-orange-500" />
                <span className="text-orange-600 font-bold">Promo 2x1: -{descuento2x1.toFixed(2)} €</span>
              </div>
            )}
            <div>
              <span className="text-gray-600">IVA (21%): </span>
              <span className="font-semibold text-gray-700">{iva.toFixed(2)} €</span>
            </div>
            <div className="text-lg">
              <span className="text-gray-600">TOTAL: </span>
              <span className="font-black text-blue-600">{total.toFixed(2)} €</span>
            </div>
          </div>
          <button
            onClick={onCrearPedido}
            disabled={disabled}
            className="px-8 py-3 bg-black text-white font-bold rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed text-sm sm:text-base whitespace-nowrap cursor-pointer"
          >
            CREAR PEDIDO
          </button>
        </div>
      </div>
    </div>
  );
}
