const { onRequest } = require("firebase-functions/v2/https");

const SELLFORGE_ENDPOINT = "http://natuaromatic.no-ip.net:85/sellforge/api/index.php";
const SELLFORGE_API_KEY = "EBA091C2D8F9E282CCE109AF1DD173B";
const SELLFORGE_DEALER = "BET";

// Cache del token en memoria (se renueva cada cold start o cada 3.5h)
let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const body = new URLSearchParams();
  body.append("apikey", SELLFORGE_API_KEY);
  body.append("action", "get_token");

  const res = await fetch(SELLFORGE_ENDPOINT, { method: "POST", body });
  if (!res.ok) throw new Error(`Token HTTP error: ${res.status}`);

  const text = await res.text();
  const json = parseResponse(text);

  if (String(json.result) !== "1" || !json.token) {
    throw new Error(json.message || "No se pudo obtener token");
  }

  cachedToken = json.token;
  tokenExpiry = Date.now() + 3.5 * 60 * 60 * 1000;
  return cachedToken;
}

function parseResponse(text) {
  try {
    const j = JSON.parse(text);
    if (typeof j === "object" && j !== null) return j;
  } catch { /* fallback */ }

  const match = text.match(/\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/s);
  if (match) {
    try {
      const j = JSON.parse(match[0]);
      if (typeof j === "object" && j !== null) return j;
    } catch { /* fallback */ }
  }

  throw new Error("Respuesta no válida: " + text.substring(0, 200));
}

exports.sellforgeProxy = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Solo POST" });
    return;
  }

  try {
    const pedido = req.body;

    if (!pedido || !pedido.lineas || !pedido.codigo_cliente) {
      res.status(400).json({ error: "Datos del pedido incompletos" });
      return;
    }

    const token = await getToken();

    const zona = pedido.zona || '';
    const data = {
      customers_code: pedido.codigo_cliente,
      customers_name: pedido.nombre_cliente || pedido.codigo_cliente,
      date_order: Math.floor(new Date(pedido.fecha).getTime() / 1000),
      customers_order_code: String(pedido.id),
      user: zona,
      user_code: zona,
      agent: zona,
      agent_code: zona,
      salesman_code: zona,
      notes: `Pedido Betrés ON #${pedido.id} | Zona: ${zona}${pedido.comentarios ? ` | Comentarios: ${pedido.comentarios}` : ''}`,
      lines: pedido.lineas.map((l) => ({
        products_code: l.codigo,
        units: l.cantidad,
        description: l.referencia,
      })),
    };

    const body = new URLSearchParams();
    body.append("token", token);
    body.append("action", "put_order");
    body.append("dealer", SELLFORGE_DEALER);
    body.append("user", pedido.zona || "");
    body.append("data", JSON.stringify(data));

    const sfRes = await fetch(SELLFORGE_ENDPOINT, { method: "POST", body });
    if (!sfRes.ok) throw new Error(`Sellforge HTTP error: ${sfRes.status}`);

    const sfText = await sfRes.text();
    const sfJson = parseResponse(sfText);

    if (String(sfJson.result) !== "1") {
      res.status(502).json({
        error: sfJson.message || "Error de Sellforge",
        detail: sfJson,
      });
      return;
    }

    res.json({
      result: "1",
      code: sfJson.code || "",
      total: sfJson.total || "",
      message: sfJson.message || "Pedido enviado correctamente",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
