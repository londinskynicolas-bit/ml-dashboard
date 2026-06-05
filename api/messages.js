export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { token, uid } = req.query;
  if (!token || !uid) { res.status(400).json({ error: 'Faltan parámetros' }); return; }

  const headers = { Authorization: `Bearer ${token}` };

  try {
    // Primero obtener órdenes recientes
    const ordersR = await fetch(
      `https://api.mercadolibre.com/orders/search?seller=${uid}&sort=date_desc&limit=20`,
      { headers }
    );
    const ordersData = await ordersR.json();
    const orders = ordersData.results || [];

    const messages = [];

    for (const order of orders.slice(0, 15)) {
      try {
        // Usar pack_id si existe, sino order_id (ambos van en /packs/)
        const packId = order.pack_id || order.id;
        
        const msgR = await fetch(
          `https://api.mercadolibre.com/messages/packs/${packId}/sellers/${uid}?tag=post_sale&mark_as_read=false`,
          { headers }
        );
        
        if (!msgR.ok) continue;
        
        const msgData = await msgR.json();
        const msgs = msgData.messages || [];
        
        if (msgs.length > 0) {
          // Mensajes del comprador (no del vendedor)
          const buyerMsgs = msgs.filter(m => String(m.from?.user_id) !== String(uid));
          const allMsgs = msgs;
          const lastMsg = allMsgs[allMsgs.length - 1];
          const lastBuyerMsg = buyerMsgs[buyerMsgs.length - 1];
          const msgToShow = lastBuyerMsg || lastMsg;
          
          if (msgToShow) {
            const isUnread = msgToShow.status === 'unread' || 
                            (msgToShow.date_read === null && String(msgToShow.from?.user_id) !== String(uid));
            
            messages.push({
              order_id: order.id,
              pack_id: packId,
              buyer_nickname: order.buyer?.nickname || 'Comprador',
              from: { 
                nickname: order.buyer?.nickname || 'Comprador',
                user_id: msgToShow.from?.user_id
              },
              text: { plain: msgToShow.text?.plain || msgToShow.text || '' },
              date_received: msgToShow.date_received || msgToShow.date_created,
              status: isUnread ? 'unread' : 'read',
              total_messages: msgs.length,
              unread_count: buyerMsgs.filter(m => m.status === 'unread').length
            });
          }
        }
      } catch(e) {
        // Silently continue if one order fails
      }
    }

    // Ordenar por fecha más reciente
    messages.sort((a, b) => new Date(b.date_received) - new Date(a.date_received));

    res.status(200).json({ messages });
  } catch(e) {
    res.status(500).json({ error: e.message, messages: [] });
  }
}
