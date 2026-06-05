export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  const { token, uid } = req.query;
  if (!token || !uid) { res.status(400).json({ error: 'Faltan parámetros' }); return; }
  const headers = { Authorization: `Bearer ${token}` };
  try {
    const ordersR = await fetch(
      `https://api.mercadolibre.com/orders/search?seller=${uid}&sort=date_desc&limit=15`,
      { headers }
    );
    const ordersData = await ordersR.json();
    const orders = ordersData.results || [];
    const messages = [];

    for (const order of orders.slice(0, 10)) {
      try {
        // Usar pack_id si existe, sino order_id
        const packId = order.pack_id || order.id;
        const msgR = await fetch(
          `https://api.mercadolibre.com/messages/packs/${packId}/sellers/${uid}?tag=post_sale`,
          { headers }
        );
        const msgData = await msgR.json();
        const msgs = msgData.messages || [];
        if (msgs.length > 0) {
          // Tomar el último mensaje
          const last = msgs[msgs.length - 1];
          messages.push({
            order_id: order.id,
            pack_id: packId,
            from: {
              nickname: last.from?.user_id === parseInt(uid)
                ? 'Vos'
                : (order.buyer?.nickname || 'Comprador')
            },
            text: last.text || { plain: last.text?.plain || '' },
            date_received: last.date_received || last.date_created,
            status: last.status === 'unread' ? 'unread' : 'read',
            total_messages: msgs.length,
            buyer_nickname: order.buyer?.nickname || '—'
          });
        }
      } catch(e) {}
    }

    res.status(200).json({ messages });
  } catch(e) {
    res.status(500).json({ error: e.message, messages: [] });
  }
}
