export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  const { token, uid } = req.query;
  if (!token || !uid) { res.status(400).json({ error: 'Faltan parámetros' }); return; }
  const headers = { Authorization: `Bearer ${token}` };
  try {
    const ordersR = await fetch(`https://api.mercadolibre.com/orders/search?seller=${uid}&sort=date_desc&limit=10`, { headers });
    const ordersData = await ordersR.json();
    const orders = ordersData.results || [];
    const messages = [];
    for (const order of orders.slice(0, 8)) {
      try {
        const msgR = await fetch(`https://api.mercadolibre.com/messages/packs/${order.pack_id || order.id}/sellers/${uid}`, { headers });
        const msgData = await msgR.json();
        if (msgData.messages && msgData.messages.length > 0) {
          const last = msgData.messages[msgData.messages.length - 1];
          messages.push({
            order_id: order.id,
            from: { nickname: order.buyer?.nickname || 'Comprador' },
            text: last.text,
            date_received: last.date_received || last.date_created,
            status: last.status || 'read'
          });
        }
      } catch(e) {}
    }
    res.status(200).json({ messages });
  } catch(e) {
    res.status(500).json({ error: e.message, messages: [] });
  }
}
