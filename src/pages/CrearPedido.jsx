import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Check, X } from 'lucide-react';
import productos from '../data/productos.json';
import TablaProductos from '../components/TablaProductos';
import ResumenPedido from '../components/ResumenPedido';
import { calcularPrecioUnitario, calcularAhorro } from '../services/preciosService';
import { guardarPedido } from '../services/pedidosService';

export default function CrearPedido() {
  const navigate = useNavigate();
  const [codigoCliente, setCodigoCliente] = useState('');
  const [cif, setCif] = useState('');
  const [zona, setZona] = useState('');
  const [seleccion, setSeleccion] = useState({});
  const [modal, setModal] = useState(null);
  const [errores, setErrores] = useState({});

  const totales = useMemo(() => {
    let subtotal = 0;
    let ahorro = 0;
    let totalProductos = 0;

    Object.entries(seleccion).forEach(([codigo, { cantidad, checked }]) => {
      if (!checked || cantidad <= 0) return;
      const producto = productos.find(p => p.codigo === codigo);
      if (!producto) return;
      const precioUnit = calcularPrecioUnitario(producto, cantidad);
      subtotal += precioUnit * cantidad;
      ahorro += calcularAhorro(producto, cantidad);
      totalProductos++;
    });

    const iva = subtotal * 0.21;
    const total = subtotal + iva;

    return { totalProductos, subtotal, ahorro, iva, total };
  }, [seleccion]);

  const validar = useCallback(() => {
    const errs = {};
    if (!codigoCliente.trim()) errs.codigoCliente = 'El código de cliente es obligatorio';
    if (!cif.trim()) {
      errs.cif = 'El CIF/NIF es obligatorio';
    } else if (!/^[A-Za-z]\d{7,8}[A-Za-z0-9]?$/.test(cif.trim()) && !/^\d{8}[A-Za-z]$/.test(cif.trim())) {
      errs.cif = 'Formato de CIF/NIF no válido';
    }
    if (!zona.trim()) errs.zona = 'La zona es obligatoria';
    if (totales.totalProductos === 0) errs.productos = 'Selecciona al menos un producto';
    return errs;
  }, [codigoCliente, cif, zona, totales.totalProductos]);

  const handleCrearPedido = () => {
    const errs = validar();
    setErrores(errs);
    if (Object.keys(errs).length > 0) return;

    const lineas = [];
    Object.entries(seleccion).forEach(([codigo, { cantidad, checked }]) => {
      if (!checked || cantidad <= 0) return;
      const producto = productos.find(p => p.codigo === codigo);
      if (!producto) return;
      const precioUnitario = calcularPrecioUnitario(producto, cantidad);
      lineas.push({
        codigo: producto.codigo,
        referencia: producto.referencia,
        cantidad,
        precio_unitario: precioUnitario,
        subtotal: precioUnitario * cantidad,
        tiene_escalado: calcularAhorro(producto, cantidad) > 0
      });
    });

    const pedido = guardarPedido({
      codigo_cliente: codigoCliente.trim(),
      cif: cif.trim().toUpperCase(),
      zona: zona.trim(),
      lineas,
      totales: {
        subtotal: totales.subtotal,
        ahorro: totales.ahorro,
        iva: totales.iva,
        total: totales.total
      }
    });

    setModal(pedido.id);
  };

  const cerrarModal = () => {
    setModal(null);
    setCodigoCliente('');
    setCif('');
    setZona('');
    setSeleccion({});
    setErrores({});
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">
            Betrés ON — <span className="text-blue-600">Crear Pedido</span>
          </h1>
          <button
            onClick={() => navigate('/login')}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
          >
            <Settings className="w-4 h-4" />
            Admin
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 pb-28">
        <div className="bg-white rounded-lg shadow-md p-5 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Datos del cliente</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Código de Cliente *</label>
              <input
                type="text"
                value={codigoCliente}
                onChange={(e) => setCodigoCliente(e.target.value)}
                placeholder="Ej: FARM001"
                className={`w-full px-3 py-2.5 border-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 ${errores.codigoCliente ? 'border-red-400' : 'border-gray-200 focus:border-blue-500'}`}
              />
              {errores.codigoCliente && <p className="text-red-500 text-xs mt-1">{errores.codigoCliente}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CIF/NIF *</label>
              <input
                type="text"
                value={cif}
                onChange={(e) => setCif(e.target.value)}
                placeholder="Ej: B12345678"
                className={`w-full px-3 py-2.5 border-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 ${errores.cif ? 'border-red-400' : 'border-gray-200 focus:border-blue-500'}`}
              />
              {errores.cif && <p className="text-red-500 text-xs mt-1">{errores.cif}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Código de Zona *</label>
              <input
                type="text"
                value={zona}
                onChange={(e) => setZona(e.target.value)}
                placeholder="Ej: MURCIA"
                className={`w-full px-3 py-2.5 border-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 ${errores.zona ? 'border-red-400' : 'border-gray-200 focus:border-blue-500'}`}
              />
              {errores.zona && <p className="text-red-500 text-xs mt-1">{errores.zona}</p>}
            </div>
          </div>
          {errores.productos && (
            <p className="text-red-500 text-sm mt-3 font-medium">{errores.productos}</p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-md p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Catálogo de productos</h2>
          <TablaProductos
            productos={productos}
            seleccion={seleccion}
            onSeleccionChange={setSeleccion}
          />
        </div>
      </main>

      <ResumenPedido
        totales={totales}
        onCrearPedido={handleCrearPedido}
        disabled={totales.totalProductos === 0}
      />

      {modal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Pedido creado</h3>
            <p className="text-gray-600 mb-6">
              Pedido <span className="font-mono font-bold">#{modal}</span> registrado correctamente.
            </p>
            <button
              onClick={cerrarModal}
              className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
            >
              Aceptar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
