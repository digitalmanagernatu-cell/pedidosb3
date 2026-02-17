import emailjs from '@emailjs/browser';

// ============================================================
// CONFIGURACIÓN EMAILJS - Rellena estos valores con tu cuenta
// ============================================================
// 1. Crea una cuenta gratuita en https://www.emailjs.com/
// 2. Conecta tu cuenta de Gmail en Email Services
// 3. Crea un template con las variables: to_email, subject, body_html
// 4. Copia los IDs aquí abajo:
const EMAILJS_SERVICE_ID = '';   // Ej: 'service_abc123'
const EMAILJS_TEMPLATE_ID = '';  // Ej: 'template_xyz789'
const EMAILJS_PUBLIC_KEY = '';   // Ej: 'AbCdEf123456'
// ============================================================

export function isEmailConfigured() {
  return !!(EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_PUBLIC_KEY);
}

function formatFecha(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function generarHTMLPedido(pedido) {
  const nombreDisplay = pedido.nombre_cliente || pedido.codigo_cliente;
  const idDisplay = pedido.nombre_cliente ? pedido.codigo_cliente : (pedido.cif || '');

  const lineasHTML = pedido.lineas.map(l => `
    <tr>
      <td style="padding:6px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px">${l.codigo}</td>
      <td style="padding:6px;border-bottom:1px solid #eee">${l.referencia}</td>
      <td style="padding:6px;border-bottom:1px solid #eee;text-align:center">${l.cantidad}</td>
      <td style="padding:6px;border-bottom:1px solid #eee;text-align:right">${l.precio_unitario.toFixed(2)} &euro;</td>
      <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${l.subtotal.toFixed(2)} &euro;</td>
    </tr>
  `).join('');

  return `
    <div style="font-family:system-ui,sans-serif;max-width:700px;margin:0 auto">
      <h2 style="color:#000;margin-bottom:4px">Betr&eacute;s ON</h2>
      <p style="color:#666;margin-top:0">Pedido - ${formatFecha(pedido.fecha)}</p>
      <div style="display:flex;gap:30px;margin:16px 0;padding:12px;background:#f9fafb;border-radius:8px;font-size:14px">
        <div><strong>Cliente:</strong> ${nombreDisplay}</div>
        <div><strong>ID/CIF:</strong> ${idDisplay}</div>
        <div><strong>Zona:</strong> ${pedido.zona || '—'}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f1f5f9">
          <th style="padding:8px;text-align:left">C&oacute;digo</th>
          <th style="padding:8px;text-align:left">Producto</th>
          <th style="padding:8px;text-align:center">Cant.</th>
          <th style="padding:8px;text-align:right">P. Unit.</th>
          <th style="padding:8px;text-align:right">Subtotal</th>
        </tr></thead>
        <tbody>${lineasHTML}</tbody>
      </table>
      <div style="margin-top:16px;text-align:right;font-size:14px;line-height:2">
        <div>Subtotal: <strong>${pedido.totales.subtotal.toFixed(2)} &euro;</strong></div>
        ${(pedido.totales.descuento_2x1 || 0) > 0 ? `<div style="color:#c2410c">Promo 2x1: <strong>-${pedido.totales.descuento_2x1.toFixed(2)} &euro;</strong></div>` : ''}
        <div>IVA (21%): <strong>${pedido.totales.iva.toFixed(2)} &euro;</strong></div>
        <div style="font-size:18px;margin-top:6px;border-top:2px solid #000;padding-top:6px">TOTAL: <strong>${pedido.totales.total.toFixed(2)} &euro;</strong></div>
      </div>
    </div>
  `;
}

export async function enviarPedidoEmail(pedido, toEmail) {
  if (!isEmailConfigured()) {
    throw new Error('EmailJS no está configurado. Edita src/services/emailService.js con tus credenciales.');
  }

  const subject = `Pedido ${pedido.codigo_cliente}`;
  const bodyHtml = generarHTMLPedido(pedido);

  const params = {
    to_email: toEmail,
    subject: subject,
    body_html: bodyHtml
  };

  const response = await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, params, EMAILJS_PUBLIC_KEY);
  return response;
}
