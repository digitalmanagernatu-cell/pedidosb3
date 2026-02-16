import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { calcularPrecioUnitario, calcularAhorro, tieneEscalado } from '../services/preciosService';

export default function TablaProductos({ productos, seleccion, onSeleccionChange }) {
  const [busqueda, setBusqueda] = useState('');

  const productosFiltrados = useMemo(() => {
    if (!busqueda.trim()) return productos;
    const termino = busqueda.toLowerCase();
    return productos.filter(
      p => p.codigo.toLowerCase().includes(termino) || p.referencia.toLowerCase().includes(termino)
    );
  }, [productos, busqueda]);

  const handleCheck = (codigo, checked) => {
    const nuevo = { ...seleccion };
    if (checked) {
      nuevo[codigo] = { cantidad: 1, checked: true };
    } else {
      delete nuevo[codigo];
    }
    onSeleccionChange(nuevo);
  };

  const handleCantidad = (codigo, cantidad) => {
    const valor = Math.max(0, parseInt(cantidad) || 0);
    if (valor === 0) {
      const nuevo = { ...seleccion };
      delete nuevo[codigo];
      onSeleccionChange(nuevo);
      return;
    }
    onSeleccionChange({
      ...seleccion,
      [codigo]: { cantidad: valor, checked: true }
    });
  };

  return (
    <div>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Buscar por código o nombre de producto..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-3 py-3 w-10"></th>
              <th className="px-3 py-3 font-semibold text-gray-700">Código</th>
              <th className="px-3 py-3 font-semibold text-gray-700">Producto</th>
              <th className="px-3 py-3 font-semibold text-gray-700 text-center">Cantidad</th>
              <th className="px-3 py-3 font-semibold text-gray-700 text-right">Precio Unit.</th>
              <th className="px-3 py-3 font-semibold text-gray-700 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {productosFiltrados.map((producto, idx) => {
              const sel = seleccion[producto.codigo];
              const isChecked = !!sel?.checked;
              const cantidad = sel?.cantidad || 0;
              const precioUnit = isChecked ? calcularPrecioUnitario(producto, cantidad) : producto.pvl;
              const subtotal = isChecked ? precioUnit * cantidad : 0;
              const ahorro = isChecked ? calcularAhorro(producto, cantidad) : 0;
              const escalado = tieneEscalado(producto);

              return (
                <tr
                  key={producto.codigo}
                  className={`border-t border-gray-100 hover:bg-blue-50/50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} ${isChecked ? 'bg-blue-50' : ''}`}
                >
                  <td className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => handleCheck(producto.codigo, e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2.5 font-mono text-gray-600 text-xs">{producto.codigo}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-gray-900">{producto.referencia}</span>
                      {escalado && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          ESCALADO
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <input
                      type="number"
                      min="0"
                      value={isChecked ? cantidad : ''}
                      disabled={!isChecked}
                      onChange={(e) => handleCantidad(producto.codigo, e.target.value)}
                      className="w-20 px-2 py-1.5 text-center border-2 border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-400"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={ahorro > 0 ? 'text-green-600 font-semibold' : 'text-gray-700'}>
                      {precioUnit.toFixed(2)} €
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-gray-900">
                    {isChecked ? `${subtotal.toFixed(2)} €` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {productosFiltrados.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No se encontraron productos con "{busqueda}"
          </div>
        )}
      </div>
    </div>
  );
}
