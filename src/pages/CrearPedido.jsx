import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { getProductos, sincronizarTarifaDesdeFirestore } from '../services/productosService';
import TablaProductos from '../components/TablaProductos';
import ResumenPedido from '../components/ResumenPedido';
import { calcularPrecioUnitario, calcularAhorro, calcularDescuento2x1, calcularTotalesPorCategoriaEscalado, determinarCategoriaEscalado, esCategoríaSinSurtido, esCategoríaFacial, getSubgrupoFacial } from '../services/preciosService';
import { guardarPedido, actualizarPedido } from '../services/pedidosService';
import { enviarPedidoSellforge } from '../services/sellforgeService';
import { enviarPedidoEmail, isEmailConfigured } from '../services/emailService';
import { CIUDADES_ZONAS } from '../services/authService';

// --- Configuración tarifas Alta Nueva ---
const TARIFAS_ALTA_NUEVA = {
  M: {
    pedidoMinimo: 600,
    descuento: 0.05,
    gelesMaxPorcentaje: 0.20,
    gelesMaxPVL: 120,
    requisitoMinPorcentaje: 0.50,
    requisitoCategoriasValidas: ['perfumeria100ml', 'oriental', 'ambientacion'],
    requisitoLabel: 'perfumería 100ml, Oriental o ambientación',
    comentarioAuto: 'Alta Nueva PROMOCIÓN M\nTesters incluidos en perfumes 100ml (1 c/ 2 cajas misma ref.)\nPago a 60 días',
  },
  L: {
    pedidoMinimo: 1000,
    descuento: 0.08,
    gelesMaxPorcentaje: 0.15,
    gelesMaxPVL: 150,
    requisitoMinPorcentaje: 0.50,
    requisitoCategoriasValidas: ['perfumeria100ml', 'oriental'],
    requisitoLabel: 'perfumería 100ml u Oriental',
    comentarioAuto: 'Alta Nueva PROMOCIÓN L\nExpositores sobremesa incluidos\nPago 30-60 días',
  },
  XL: {
    pedidoMinimo: 1500,
    descuento: 0.10,
    gelesMaxPorcentaje: 0.10,
    gelesMaxPVL: 150,
    requisitoMinPorcentaje: 0.60,
    requisitoCategoriasValidas: ['perfumeria100ml', 'oriental', 'ambientacion'],
    requisitoLabel: 'perfumería 100ml, Oriental o ambientación',
    comentarioAuto: 'Alta Nueva PROMOCIÓN XL\n3% rappel anual si supera 6.000 €\nPago 30-60-85 días',
  },
};

function normalizarTexto(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function clasificarCategoria(cat) {
  const upper = normalizarTexto(cat || '');
  if (upper.includes('GELES')) return 'geles';
  // Perfumería 100ml: FOR HER 100ML, FOR HIM 100ML (no incluye NICHO)
  if (upper.includes('PERFUMERIA') && upper.includes('100ML') && !upper.includes('NICHO')) return 'perfumeria100ml';
  // Oriental = línea NICHO
  if (upper.includes('NICHO')) return 'oriental';
  // Ambientación: todas las subcategorías (MIKADOS, ROSA, FLOR, MIKADO DECORATIVO)
  if (upper.includes('AMBIENTACION')) return 'ambientacion';
  return null;
}

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
  const [comentarios, setComentarios] = useState('');
  const [modal, setModal] = useState(null);
  const [errores, setErrores] = useState({});
  const [emailCliente, setEmailCliente] = useState('');
  const [altaNueva, setAltaNueva] = useState('no');
  const [tarifaAlta, setTarifaAlta] = useState('');

  const totalesCatEscalado = useMemo(
    () => calcularTotalesPorCategoriaEscalado(seleccion, productos),
    [seleccion, productos]
  );

  // Totales por grupo de categoría (para validaciones Alta Nueva)
  const totalesPorGrupo = useMemo(() => {
    const grupos = { geles: 0, perfumeria100ml: 0, oriental: 0, ambientacion: 0 };
    Object.entries(seleccion).forEach(([codigo, { cantidad, checked }]) => {
      if (!checked || cantidad <= 0) return;
      const producto = productos.find(p => p.codigo === codigo);
      if (!producto) return;
      const catEsc = determinarCategoriaEscalado(producto);
      const totalCat = catEsc ? totalesCatEscalado[catEsc] : undefined;
      const precioUnit = calcularPrecioUnitario(producto, cantidad, totalCat);
      const grupo = clasificarCategoria(producto.categoria);
      if (grupo) grupos[grupo] += precioUnit * cantidad;
    });
    return grupos;
  }, [seleccion, productos, totalesCatEscalado]);

  const configTarifa = altaNueva === 'si' && tarifaAlta ? TARIFAS_ALTA_NUEVA[tarifaAlta] : null;

  const totales = useMemo(() => {
    let subtotalBruto = 0;
    let ahorro = 0;
    let totalProductos = 0;

    Object.entries(seleccion).forEach(([codigo, { cantidad, checked }]) => {
      if (!checked || cantidad <= 0) return;
      const producto = productos.find(p => p.codigo === codigo);
      if (!producto) return;
      const catEsc = determinarCategoriaEscalado(producto);
      const totalCat = catEsc ? totalesCatEscalado[catEsc] : undefined;
      const precioUnit = calcularPrecioUnitario(producto, cantidad, totalCat);
      subtotalBruto += precioUnit * cantidad;
      ahorro += calcularAhorro(producto, cantidad, totalCat);
      totalProductos++;
    });

    const descuento2x1 = calcularDescuento2x1(seleccion, productos);
    const subtotalNeto = subtotalBruto - descuento2x1;

    // Descuento Alta Nueva
    const descuentoAltaNueva = configTarifa ? subtotalNeto * configTarifa.descuento : 0;
    const subtotalConAlta = subtotalNeto - descuentoAltaNueva;

    const iva = subtotalConAlta * 0.21;
    const total = subtotalConAlta + iva;

    return { totalProductos, subtotal: subtotalConAlta, subtotalBruto, subtotalSinDescuento: subtotalNeto, ahorro, descuento2x1, descuentoAltaNueva, iva, total };
  }, [seleccion, productos, totalesCatEscalado, configTarifa]);

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

    // Alta Nueva: validar tarifa seleccionada
    if (altaNueva === 'si' && !tarifaAlta) {
      errs.tarifaAlta = 'Selecciona un tipo de tarifa de alta (M, L o XL)';
    }

    // Pedido mínimo (Alta Nueva o estándar)
    const minimoRequerido = configTarifa ? configTarifa.pedidoMinimo : 150;
    const subtotalParaMinimo = configTarifa ? totales.subtotalSinDescuento : totales.subtotal;
    if (totales.totalProductos > 0 && subtotalParaMinimo < minimoRequerido) {
      errs.minimo = `Pedido mínimo: ${minimoRequerido.toFixed(2)} € (sin IVA). Faltan ${(minimoRequerido - subtotalParaMinimo).toFixed(2)} €`;
    }

    // Validaciones específicas Alta Nueva
    if (configTarifa && totales.totalProductos > 0) {
      // Usar subtotalBruto (suma de todos los productos, antes de 2x1 y descuentos)
      // para calcular porcentajes de forma coherente con totalesPorGrupo
      const subtotalBase = totales.subtotalBruto;

      // Límite de geles
      const totalGeles = totalesPorGrupo.geles;
      const gelesMaxPorPorcentaje = subtotalBase * configTarifa.gelesMaxPorcentaje;
      const gelesMaxAbsoluto = configTarifa.gelesMaxPVL;
      if (totalGeles > gelesMaxPorPorcentaje || totalGeles > gelesMaxAbsoluto) {
        const limitePct = (configTarifa.gelesMaxPorcentaje * 100).toFixed(0);
        errs.gelesAlta = `Tarifa ${tarifaAlta}: Geles (${totalGeles.toFixed(2)} €) superan el máx. ${limitePct}% del pedido (${gelesMaxPorPorcentaje.toFixed(2)} €) o el tope de ${gelesMaxAbsoluto} € PVL`;
      }

      // Requisito mínimo de categorías (suma de perfumería 100ml + oriental + ambientación según tarifa)
      const totalRequisito = configTarifa.requisitoCategoriasValidas.reduce(
        (sum, grupo) => sum + (totalesPorGrupo[grupo] || 0), 0
      );
      const minimoRequisito = subtotalBase * configTarifa.requisitoMinPorcentaje;
      if (totalRequisito < minimoRequisito) {
        const pctReq = (configTarifa.requisitoMinPorcentaje * 100).toFixed(0);
        const pctActual = subtotalBase > 0 ? ((totalRequisito / subtotalBase) * 100).toFixed(1) : '0.0';
        errs.requisitoAlta = `Tarifa ${tarifaAlta}: Mín. ${pctReq}% en ${configTarifa.requisitoLabel}. Actual: ${pctActual}% (${totalRequisito.toFixed(2)} € de ${minimoRequisito.toFixed(2)} € necesarios)`;
      }
    }

    if (Object.keys(avisosCajas).length > 0) {
      const cats = Object.values(avisosCajas)
        .map(({ label, faltan, udCaja }) => `${label}: faltan ${faltan} uds (caja de ${udCaja})`)
        .join('; ');
      errs.cajas = `Cajas incompletas: ${cats}`;
    }
    return errs;
  }, [codigoCliente, nombreCliente, ciudadSeleccionada, totales.totalProductos, totales.subtotal, totales.subtotalBruto, avisosCajas, altaNueva, tarifaAlta, configTarifa, totalesPorGrupo]);

  const [sfStatus, setSfStatus] = useState(null); // null | 'enviando' | {tipo:'ok'|'error', texto:string}
  const [emailStatus, setEmailStatus] = useState(null); // null | 'enviando' | {tipo:'ok'|'error', texto:string}

  const handleCrearPedido = async () => {
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

    // Construir comentarios con texto automático de Alta Nueva
    let comentariosFinal = comentarios.trim();
    if (configTarifa) {
      const textoAlta = configTarifa.comentarioAuto;
      comentariosFinal = comentariosFinal
        ? `${textoAlta}\n\n${comentariosFinal}`
        : textoAlta;
    }

    const pedido = guardarPedido({
      codigo_cliente: codigoCliente.trim(),
      nombre_cliente: nombreCliente.trim(),
      email_cliente: emailCliente.trim() || null,
      zona,
      comentarios: comentariosFinal,
      alta_nueva: altaNueva === 'si' ? tarifaAlta : null,
      lineas,
      totales: {
        subtotal: totales.subtotal,
        subtotal_sin_descuento: totales.subtotalSinDescuento,
        ahorro: totales.ahorro,
        descuento_2x1: totales.descuento2x1,
        descuento_alta_nueva: totales.descuentoAltaNueva,
        iva: totales.iva,
        total: totales.total
      }
    });

    setModal(pedido.id);
    setSfStatus('enviando');
    if (pedido.email_cliente) setEmailStatus('enviando');

    // Envío automático a Sellforge
    try {
      const result = await enviarPedidoSellforge(pedido);
      actualizarPedido(pedido.id, {
        enviadoSellforge: {
          fecha: new Date().toISOString(),
          codigo: result.code || '',
          total: result.total || ''
        }
      });
      setSfStatus({ tipo: 'ok', texto: `Enviado a Sellforge. Código: ${result.code}` });
    } catch (err) {
      setSfStatus({ tipo: 'error', texto: `Error al enviar a Sellforge: ${err.message}. Puedes reenviarlo desde el panel de administración.` });
    }

    // Envío automático de email al cliente
    if (pedido.email_cliente && isEmailConfigured()) {
      try {
        await enviarPedidoEmail(pedido, pedido.email_cliente);
        actualizarPedido(pedido.id, {
          emailEnviado: { fecha: new Date().toISOString(), destino: pedido.email_cliente }
        });
        setEmailStatus({ tipo: 'ok', texto: `Email enviado a ${pedido.email_cliente}` });
      } catch (err) {
        setEmailStatus({ tipo: 'error', texto: `Error al enviar email: ${err.message}` });
      }
    }
  };

  const cerrarModal = () => {
    setModal(null);
    setSfStatus(null);
    setEmailStatus(null);
    setCodigoCliente('');
    setNombreCliente('');
    setEmailCliente('');
    setCiudadSeleccionada('');
    setSeleccion({});
    setComentarios('');
    setErrores({});
    setAltaNueva('no');
    setTarifaAlta('');
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email del cliente</label>
              <input
                type="email"
                value={emailCliente}
                onChange={(e) => setEmailCliente(e.target.value)}
                placeholder="cliente@email.com"
                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Alta Nueva */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Alta Nueva</label>
              <select
                value={altaNueva}
                onChange={(e) => {
                  setAltaNueva(e.target.value);
                  if (e.target.value === 'no') setTarifaAlta('');
                }}
                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="no">No</option>
                <option value="si">S&iacute;</option>
              </select>
            </div>
            {altaNueva === 'si' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de tarifa de alta *</label>
                <select
                  value={tarifaAlta}
                  onChange={(e) => setTarifaAlta(e.target.value)}
                  className={`w-full px-3 py-2.5 border-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white ${errores.tarifaAlta ? 'border-red-400' : 'border-gray-200 focus:border-blue-500'}`}
                >
                  <option value="">Selecciona tarifa...</option>
                  <option value="M">M - Dto. 5% (min. 600 &euro;)</option>
                  <option value="L">L - Dto. 8% (min. 1.000 &euro;)</option>
                  <option value="XL">XL - Dto. 10% (min. 1.500 &euro;)</option>
                </select>
                {errores.tarifaAlta && <p className="text-red-500 text-xs mt-1">{errores.tarifaAlta}</p>}
              </div>
            )}
            {configTarifa && (
              <div className="sm:col-span-1 flex items-end">
                <div className="w-full p-2.5 bg-purple-50 border-2 border-purple-200 rounded-lg text-xs text-purple-800">
                  <p className="font-bold mb-1">Promocion {tarifaAlta}:</p>
                  <p>Dto. {(configTarifa.descuento * 100).toFixed(0)}% | Min. {configTarifa.pedidoMinimo} &euro;</p>
                  <p>Geles max. {(configTarifa.gelesMaxPorcentaje * 100).toFixed(0)}% (hasta {configTarifa.gelesMaxPVL} &euro;)</p>
                  <p>Min. {(configTarifa.requisitoMinPorcentaje * 100).toFixed(0)}% en {configTarifa.requisitoLabel}</p>
                </div>
              </div>
            )}
          </div>
          {errores.productos && (
            <p className="text-red-500 text-sm mt-3 font-medium">{errores.productos}</p>
          )}
          {errores.cajas && (
            <p className="text-red-500 text-sm mt-2 font-medium">{errores.cajas}</p>
          )}
          {errores.minimo && (
            <p className="text-red-500 text-sm mt-2 font-medium">{errores.minimo}</p>
          )}
          {errores.gelesAlta && (
            <p className="text-red-500 text-sm mt-2 font-medium">{errores.gelesAlta}</p>
          )}
          {errores.requisitoAlta && (
            <p className="text-red-500 text-sm mt-2 font-medium">{errores.requisitoAlta}</p>
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

        <div className="bg-white rounded-lg shadow-md p-5 mt-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Comentarios</h2>
          <textarea
            value={comentarios}
            onChange={(e) => setComentarios(e.target.value)}
            placeholder="Añade observaciones o comentarios al pedido..."
            rows={3}
            className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y text-sm"
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
            <p className="text-gray-600 mb-3">
              Pedido <span className="font-mono font-bold">#{modal}</span> registrado correctamente.
            </p>

            {/* Estado envío Sellforge */}
            {sfStatus === 'enviando' && (
              <div className="flex items-center justify-center gap-2 mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                <Loader2 className="w-4 h-4 animate-spin" />
                Enviando a Sellforge...
              </div>
            )}
            {sfStatus?.tipo === 'ok' && (
              <div className="flex items-center justify-center gap-2 mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                <Check className="w-4 h-4" />
                {sfStatus.texto}
              </div>
            )}
            {sfStatus?.tipo === 'error' && (
              <div className="flex items-start gap-2 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 text-left">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {sfStatus.texto}
              </div>
            )}

            {/* Estado envío Email */}
            {emailStatus === 'enviando' && (
              <div className="flex items-center justify-center gap-2 mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                <Loader2 className="w-4 h-4 animate-spin" />
                Enviando email al cliente...
              </div>
            )}
            {emailStatus?.tipo === 'ok' && (
              <div className="flex items-center justify-center gap-2 mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                <Check className="w-4 h-4" />
                {emailStatus.texto}
              </div>
            )}
            {emailStatus?.tipo === 'error' && (
              <div className="flex items-start gap-2 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 text-left">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {emailStatus.texto}
              </div>
            )}

            <button
              onClick={cerrarModal}
              disabled={sfStatus === 'enviando' || emailStatus === 'enviando'}
              className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors cursor-pointer disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Aceptar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
