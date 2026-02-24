import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Check } from 'lucide-react';
import { getProductos, sincronizarTarifaDesdeFirestore } from '../services/productosService';
import TablaProductos from '../components/TablaProductos';
import ResumenPedido from '../components/ResumenPedido';
import { calcularPrecioUnitario, calcularAhorro, calcularDescuento2x1, calcularTotalesPorCategoriaEscalado, determinarCategoriaEscalado, esCategoríaSinSurtido, esCategoríaFacial, getSubgrupoFacial } from '../services/preciosService';
import { guardarPedido } from '../services/pedidosService';
import { CIUDADES_ZONAS } from '../services/authService';

export default function CrearPedido() {
  const navigate = useNavigate();
  const [productos, setProductos] = useState(() => getProductos());
  const [codigoCliente, setCodigoCliente] = useState('');

  // Sincronizar tarifa desde Firestore al cargar y cuando la ventana recupera el foco
  useEffect(() => {
    sincronizarTarifaDesdeFirestore().then(actualizado => {
      if (actualizado) setProductos(getProductos());
    });

    const handleFocus = () => {
      sincronizarTarifaDesdeFirestore().then(actualizado => {
        if (actualizado) setProductos(getProductos());
      });
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);
  const [nombreCliente, setNombreCliente] = useState('');
  const [ciudadSeleccionada, setCiudadSeleccionada] = useState('');
  const zona = CIUDADES_ZONAS.find(c => c.ciudad === ciudadSeleccionada)?.zona || '';
  const [seleccion, setSeleccion] = useState({});
  const [modal, setModal] = useState(null);
  const [errores, setErrores] = useState({});

  const totalesCatEscalado = useMemo(
    () => calcularTotalesPorCategoriaEscalado(seleccion, productos),
    [seleccion, productos]
  );

  const totales = useMemo(() => {
    let subtotal = 0;
    let ahorro = 0;
    let totalProductos = 0;

    Object.entries(seleccion).forEach(([codigo, { cantidad, checked }]) => {
      if (!checked || cantidad <= 0) return;
      const producto = productos.find(p => p.codigo === codigo);
      if (!producto) return;
      const catEsc = determinarCategoriaEscalado(producto);
      const totalCat = catEsc ? totalesCatEscalado[catEsc] : undefined;
      const precioUnit = calcularPrecioUnitario(producto, cantidad, totalCat);
      subtotal += precioUnit * cantidad;
      ahorro += calcularAhorro(producto, cantidad, totalCat);
      totalProductos++;
    });

    const descuento2x1 = calcularDescuento2x1(seleccion, productos);
    const subtotalNeto = subtotal - descuento2x1;
    const iva = subtotalNeto * 0.21;
    const total = subtotalNeto + iva;

    return { totalProductos, subtotal: subtotalNeto, ahorro, descuento2x1, iva, total };
  }, [seleccion, productos, totalesCatEscalado]);

  const avisosCajas = useMemo(() => {
    const grupos = {}; // clave → { total, udCaja, label }

    Object.entries(seleccion).forEach(([codigo, { cantidad, checked }]) => {
      if (!checked || cantidad <= 0) return;
      const producto = productos.find(p => p.codigo === codigo);
      if (!producto || !producto.udCaja || producto.udCaja <= 1) return;

      const cat = producto.categoria;
      let clave;
      let label;

      if (esCategoríaSinSurtido(cat)) {
        // Geles, Jabones, Champús: cada referencia por separado
        clave = `ref:${producto.codigo}`;
        label = `${cat} — ${producto.referencia}`;
      } else if (esCategoríaFacial(cat)) {
        // Línea Facial: subgrupos (sérum, crema, limpieza)
        const subgrupo = getSubgrupoFacial(producto.referencia);
        clave = `facial:${subgrupo}`;
        const nombres = { SERUM: 'Sérum', CREMA: 'Cremas', LIMPIEZA: 'Limpieza Facial', OTROS_FACIAL: 'Facial - Otros' };
        label = `${cat} — ${nombres[subgrupo] || subgrupo}`;
      } else {
        // Resto: surtido por categoría
        clave = `cat:${cat}`;
        label = cat;
      }

      if (!grupos[clave]) {
        grupos[clave] = { total: 0, udCaja: producto.udCaja, label };
      }
      grupos[clave].total += cantidad;
    });

    const avisos = {};
    Object.entries(grupos).forEach(([clave, { total, udCaja, label }]) => {
      const resto = total % udCaja;
      if (resto > 0) {
        avisos[clave] = { total, udCaja, faltan: udCaja - resto, label };
      }
    });

    return avisos;
  }, [seleccion, productos]);

  const validar = useCallback(() => {
    const errs = {};
    if (!codigoCliente.trim()) errs.codigoCliente = 'El código de cliente o CIF/NIF es obligatorio';
    if (!nombreCliente.trim()) errs.nombreCliente = 'El nombre del cliente es obligatorio';
    if (!ciudadSeleccionada) errs.zona = 'Selecciona una zona';
    if (totales.totalProductos === 0) errs.productos = 'Selecciona al menos un producto';
    if (Object.keys(avisosCajas).length > 0) {
      const cats = Object.values(avisosCajas)
        .map(({ label, faltan, udCaja }) => `${label}: faltan ${faltan} uds (caja de ${udCaja})`)
        .join('; ');
      errs.cajas = `Cajas incompletas: ${cats}`;
    }
    return errs;
  }, [codigoCliente, nombreCliente, ciudadSeleccionada, totales.totalProductos, avisosCajas]);

  const handleCrearPedido = () => {
    const errs = validar();
    setErrores(errs);
    if (Object.keys(errs).length > 0) return;

    const lineas = [];
    Object.entries(seleccion).forEach(([codigo, { cantidad, checked }]) => {
      if (!checked || cantidad <= 0) return;
      const producto = productos.find(p => p.codigo === codigo);
      if (!producto) return;
      const catEsc = determinarCategoriaEscalado(producto);
      const totalCat = catEsc ? totalesCatEscalado[catEsc] : undefined;
      const precioUnitario = calcularPrecioUnitario(producto, cantidad, totalCat);
      lineas.push({
        codigo: producto.codigo,
        referencia: producto.referencia,
        cantidad,
        precio_unitario: precioUnitario,
        subtotal: precioUnitario * cantidad,
        tiene_escalado: calcularAhorro(producto, cantidad, totalCat) > 0,
        tiene_promo_2x1: !!producto.oferta
      });
    });

    const pedido = guardarPedido({
      codigo_cliente: codigoCliente.trim(),
      nombre_cliente: nombreCliente.trim(),
      zona,
      lineas,
      totales: {
        subtotal: totales.subtotal,
        ahorro: totales.ahorro,
        descuento_2x1: totales.descuento2x1,
        iva: totales.iva,
        total: totales.total
      }
    });

    setModal(pedido.id);
  };

  const cerrarModal = () => {
    setModal(null);
    setCodigoCliente('');
    setNombreCliente('');
    setCiudadSeleccionada('');
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Código de Cliente o CIF/NIF *</label>
              <input
                type="text"
                value={codigoCliente}
                onChange={(e) => setCodigoCliente(e.target.value)}
                placeholder="Ej. CF0001 o B12345678"
                className={`w-full px-3 py-2.5 border-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 ${errores.codigoCliente ? 'border-red-400' : 'border-gray-200 focus:border-blue-500'}`}
              />
              {errores.codigoCliente && <p className="text-red-500 text-xs mt-1">{errores.codigoCliente}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del Cliente *</label>
              <input
                type="text"
                value={nombreCliente}
                onChange={(e) => setNombreCliente(e.target.value)}
                placeholder="Ej: Farmacia Central"
                className={`w-full px-3 py-2.5 border-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 ${errores.nombreCliente ? 'border-red-400' : 'border-gray-200 focus:border-blue-500'}`}
              />
              {errores.nombreCliente && <p className="text-red-500 text-xs mt-1">{errores.nombreCliente}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zona *</label>
              <select
                value={ciudadSeleccionada}
                onChange={(e) => setCiudadSeleccionada(e.target.value)}
                className={`w-full px-3 py-2.5 border-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white ${errores.zona ? 'border-red-400' : 'border-gray-200 focus:border-blue-500'}`}
              >
                <option value="">Selecciona zona...</option>
                {CIUDADES_ZONAS.map(c => (
                  <option key={c.ciudad} value={c.ciudad}>{c.ciudad}</option>
                ))}
              </select>
              {errores.zona && <p className="text-red-500 text-xs mt-1">{errores.zona}</p>}
            </div>
          </div>
          {errores.productos && (
            <p className="text-red-500 text-sm mt-3 font-medium">{errores.productos}</p>
          )}
          {errores.cajas && (
            <p className="text-red-500 text-sm mt-2 font-medium">{errores.cajas}</p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-md p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Catálogo de productos</h2>
          <TablaProductos
            productos={productos}
            seleccion={seleccion}
            onSeleccionChange={setSeleccion}
            avisosCajas={avisosCajas}
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
