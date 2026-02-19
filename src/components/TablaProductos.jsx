import { useState, useMemo } from 'react';
import { Search, AlertTriangle } from 'lucide-react';
import { calcularPrecioUnitario, calcularAhorro, tieneEscalado, getEscaladosCategoria, calcularTotalesPorCategoriaEscalado, determinarCategoriaEscalado } from '../services/preciosService';

function EscaladoBadge({ producto }) {
  const [mostrar, setMostrar] = useState(false);
  const info = getEscaladosCategoria(producto);
  if (!info) return null;

  return (
    <span
      className="relative inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 cursor-help"
      onMouseEnter={() => setMostrar(true)}
      onMouseLeave={() => setMostrar(false)}
    >
      ESCALADO
      {mostrar && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-52 bg-gray-900 text-white text-xs rounded-lg shadow-xl p-3 pointer-events-none">
          <p className="font-bold mb-1.5 text-green-300">{info.categoria}</p>
          <table className="w-full">
            <tbody>
              {info.escalados.map((e, i) => {
                const siguiente = info.escalados[i + 1];
                const rango = siguiente
                  ? `${e.desde} - ${siguiente.desde - 1} uds`
                  : `${e.desde}+ uds`;
                return (
                  <tr key={e.desde} className="border-t border-gray-700 first:border-0">
                    <td className="py-0.5 pr-2 text-gray-300">{rango}</td>
                    <td className="py-0.5 text-right font-mono font-bold">{e.precio.toFixed(2)} €</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-gray-900"></div>
        </div>
      )}
    </span>
  );
}

export default function TablaProductos({ productos, seleccion, onSeleccionChange, avisosCajas = {} }) {
  const [busqueda, setBusqueda] = useState('');

  const totalesCatEscalado = useMemo(
    () => calcularTotalesPorCategoriaEscalado(seleccion, productos),
    [seleccion, productos]
  );

  const productosFiltrados = useMemo(() => {
    if (!busqueda.trim()) return productos;
    const termino = busqueda.toLowerCase();
    return productos.filter(
      p => p.codigo.toLowerCase().includes(termino) || p.referencia.toLowerCase().includes(termino)
    );
  }, [productos, busqueda]);

  const productosAgrupados = useMemo(() => {
    const grupos = [];
    let categoriaActual = null;

    productosFiltrados.forEach(producto => {
      if (producto.categoria !== categoriaActual) {
        categoriaActual = producto.categoria;
        grupos.push({ tipo: 'categoria', nombre: categoriaActual });
      }
      grupos.push({ tipo: 'producto', data: producto });
    });

    return grupos;
  }, [productosFiltrados]);

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
              <th className="px-3 py-3 font-semibold text-gray-700">EAN13</th>
              <th className="px-3 py-3 font-semibold text-gray-700">Producto</th>
              <th className="px-3 py-3 font-semibold text-gray-700 text-center">Ud/Caja</th>
              <th className="px-3 py-3 font-semibold text-gray-700 text-center">Cantidad</th>
              <th className="px-3 py-3 font-semibold text-gray-700 text-right">PVL</th>
              <th className="px-3 py-3 font-semibold text-gray-700 text-right">PVP Rec.</th>
              <th className="px-3 py-3 font-semibold text-gray-700 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {productosAgrupados.map((item, idx) => {
              if (item.tipo === 'categoria') {
                const aviso = avisosCajas[item.nombre];
                return (
                  <tr key={`cat-${item.nombre}`} className="bg-black">
                    <td colSpan={9} className="px-4 py-2 text-white text-sm tracking-wide">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-bold">{item.nombre}</span>
                        {aviso && (
                          <span className="flex items-center gap-1.5 text-yellow-300 text-xs font-normal">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {aviso.total} uds — Faltan {aviso.faltan} para completar caja (caja de {aviso.udCaja})
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              }

              const producto = item.data;
              const sel = seleccion[producto.codigo];
              const isChecked = !!sel?.checked;
              const cantidad = sel?.cantidad || 0;
              const catEsc = determinarCategoriaEscalado(producto);
              const totalCat = catEsc ? totalesCatEscalado[catEsc] : undefined;
              const precioUnit = isChecked ? calcularPrecioUnitario(producto, cantidad, totalCat) : producto.pvl;
              const subtotal = isChecked ? precioUnit * cantidad : 0;
              const ahorro = isChecked ? calcularAhorro(producto, cantidad, totalCat) : 0;

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
                  <td className="px-3 py-2.5 font-mono text-gray-500 text-xs">{producto.ean || '—'}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-gray-900">{producto.referencia}</span>
                      <EscaladoBadge producto={producto} />
                      {producto.oferta && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                          {producto.oferta}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center text-gray-600 text-xs">{producto.udCaja || '—'}</td>
                  <td className="px-3 py-2.5 text-center">
                    <input
                      type="number"
                      min="0"
                      value={isChecked ? cantidad : ''}
                      onChange={(e) => handleCantidad(producto.codigo, e.target.value)}
                      onFocus={() => { if (!isChecked) handleCheck(producto.codigo, true); }}
                      className="w-20 px-2 py-1.5 text-center border-2 border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={ahorro > 0 ? 'text-green-600 font-semibold' : 'text-gray-700'}>
                      {precioUnit.toFixed(2)} €
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-500">
                    {producto.pvpRec ? `${producto.pvpRec.toFixed(2)} €` : '—'}
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
