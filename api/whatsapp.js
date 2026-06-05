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

  try {
    const producto = order.order_items?.[0]?.item?.title || 'Producto';
    const comprador = order.buyer?.nickname || 'Comprador';
    const nombre = `${order.buyer?.first_name || ''} ${order.buyer?.last_name || ''}`.trim() || comprador;
    const monto = '$' + Math.round(order.total_amount || 0).toLocaleString('es-AR');
    const ingresoNeto = order.calculado?.ingresoNeto
      ? '$' + Math.round(order.calculado.ingresoNeto).toLocaleString('es-AR')
      : monto;
    const dir = order.shipDetail?.receiver_address || order.shipping?.receiver_address;
    const domicilio = dir
      ? `${dir.street_name || ''} ${dir.street_number || ''}, ${dir.city?.name || ''}, ${dir.state?.name || ''}`.trim()
      : 'Sin dirección';
    const dni = order.buyer?.identification?.number || '—';
    const promo = order.calculado?.descuentoPromo > 0
      ? `\n🏷 *Promo aplicada:* -$${Math.round(order.calculado.descuentoPromo).toLocaleString('es-AR')} (${order.calculado.descuentoPct || 0}%)`
      : '';

    const mensaje = `🛒 *NUEVA VENTA - DECOANDHOME*

📦 *Producto:* ${producto}
👤 *Cliente:* ${nombre} (@${comprador})
🆔 *DNI/CUIT:* ${dni}
💰 *Precio cliente:* ${monto}${promo}
✅ *Tu ingreso neto:* ${ingresoNeto}
📍 *Dirección:* ${domicilio}
🔢 *Orden #:* ${order.id}

¡Preparar pedido! 🚀`;

    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          From: from,
          To: `whatsapp:${to}`,
          Body: mensaje
        })
      }
    );

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
