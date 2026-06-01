export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { token, uid } = req.query;
  if (!token || !uid) { res.status(400).json({ error: 'Faltan parámetros' }); return; }

  const headers = { Authorization: `Bearer ${token}` };

  try {
    const [userR, ordersR, itemsR] = await Promise.all([
      fetch('https://api.mercadolibre.com/users/me', { headers }),
      fetch(`https://api.mercadolibre.com/orders/search?seller=${uid}&sort=date_desc&limit=50`, { headers }),
      fetch(`https://api.mercadolibre.com/users/${uid}/items/search?limit=50`, { headers })
    ]);

    const user = await userR.json();
    const ordersData = await ordersR.json();
    const itemsSearch = await itemsR.json();

    // Detalle completo de cada orden incluyendo envío y datos del comprador
    const orders = ordersData.results || [];
    const ordersWithDetail = await Promise.all(orders.slice(0, 30).map(async (order) => {
      try {
        const [orderDetailR, shipR] = await Promise.all([
          fetch(`https://api.mercadolibre.com/orders/${order.id}`, { headers }),
          order.shipping?.id ? fetch(`https://api.mercadolibre.com/shipments/${order.shipping.id}`, { headers }) : Promise.resolve(null)
        ]);
        const orderDetail = await orderDetailR.json();
        const shipDetail = shipR ? await shipR.json() : null;
        return { ...order, ...orderDetail, shipDetail };
      } catch(e) {
        return order;
      }
    }));

    // Items con detalle
    let items = [];
    const itemIds = (itemsSearch.results || []).slice(0, 20);
    if (itemIds.length > 0) {
      const itemsDetailR = await fetch(`https://api.mercadolibre.com/items?ids=${itemIds.join(',')}`, { headers });
      const itemsData = await itemsDetailR.json();
      items = itemsData.map(r => r.body || r).filter(i => i && i.id);
    }

    res.status(200).json({ user, orders: ordersWithDetail, items });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
