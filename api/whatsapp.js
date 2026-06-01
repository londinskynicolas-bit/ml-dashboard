export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { order } = req.body;
  if (!order) { res.status(400).json({ error: 'Faltan datos' }); return; }

  const accountSid = process.env.TWILIO_SID;
  const authToken = process.env.TWILIO_TOKEN;
  const to = process.env.TWILIO_TO;
  const from = 'whatsapp:+14155238886';

  const producto = order.order_items?.[0]?.item?.title || 'Producto';
  const comprador = order.buyer?.nickname || 'Comprador';
  const monto = '$' + Math.round(order.total_amount || 0).toLocaleString('es-AR');
  const direccion = order.shipping?.receiver_address;
  const domicilio = direccion ? `${direccion.street_name} ${direccion.street_number}, ${direccion.city?.name}, ${direccion.state?.name}` : 'Sin dirección';
  const nombre = `${order.buyer?.first_name || ''} ${order.buyer?.last_name || ''}`.trim() || comprador;

  const mensaje = `🛒 *NUEVA VENTA - DECOANDHOME*

📦 *Producto:* ${producto}
👤 *Cliente:* ${nombre} (@${comprador})
💰 *Monto:* ${monto}
📍 *Dirección:* ${domicilio}
🆔 *Orden #:* ${order.id}

¡Preparar pedido! 🚀`;

  try {
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: from, To: `whatsapp:${to}`, Body: mensaje })
    });
    const data = await resp.json();
    if (data.sid) {
      res.status(200).json({ success: true, sid: data.sid });
    } else {
      res.status(400).json({ error: data.message || 'Error enviando mensaje' });
    }
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
