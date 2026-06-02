export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { token, uid } = req.query;
  if (!token || !uid) { res.status(400).json({ error: 'Faltan parámetros' }); return; }

  const headers = { Authorization: `Bearer ${token}` };

  try {
    const [userR, ordersR, itemsR, billingR] = await Promise.all([
      fetch('https://api.mercadolibre.com/users/me', { headers }),
      fetch(`https://api.mercadolibre.com/orders/search?seller=${uid}&sort=date_desc&limit=50`, { headers }),
      fetch(`https://api.mercadolibre.com/users/${uid}/items/search?limit=50`, { headers }),
      fetch(`https://api.mercadolibre.com/users/${uid}/mercadopago_account/balance`, { headers })
    ]);

    const user = await userR.json();
    const ordersData = await ordersR.json();
    const itemsSearch = await itemsR.json();
    const billing = await billingR.json().catch(() => ({}));

    const orders = ordersData.results || [];

    // Detalle completo de cada orden
    const ordersWithDetail = await Promise.all(orders.slice(0, 30).map(async (order) => {
      try {
        const [orderDetailR, shipR] = await Promise.all([
          fetch(`https://api.mercadolibre.com/orders/${order.id}`, { headers }),
          order.shipping?.id ? fetch(`https://api.mercadolibre.com/shipments/${order.shipping.id}`, { headers }) : Promise.resolve(null)
        ]);
        const orderDetail = await orderDetailR.json();
        const shipDetail = shipR ? await shipR.json() : null;

        // Calcular ingreso neto real
        const item = orderDetail.order_items?.[0];
        const precioVenta = item?.unit_price * (item?.quantity || 1) || orderDetail.total_amount || 0;
        const descuento = orderDetail.coupon?.amount || 0;
        const comisionML = precioVenta * 0.13;
        const costoEnvio = orderDetail.shipping?.cost || 0;
        const ingresoNeto = precioVenta - comisionML - descuento;

        return {
          ...order,
          ...orderDetail,
          shipDetail,
          calculado: {
            precioVenta,
            descuento,
            comisionML: Math.round(comisionML),
            costoEnvio,
            ingresoNeto: Math.round(ingresoNeto)
          }
        };
      } catch(e) {
        return order;
      }
    }));

    // Items con detalle y visitas
    let items = [];
    const itemIds = (itemsSearch.results || []).slice(0, 20);
    if (itemIds.length > 0) {
      const [itemsDetailR, visitsR] = await Promise.all([
        fetch(`https://api.mercadolibre.com/items?ids=${itemIds.join(',')}`, { headers }),
        fetch(`https://api.mercadolibre.com/users/${uid}/items/visits?ids=${itemIds.join(',')}&last_30_days=true`, { headers })
      ]);
      const itemsData = await itemsDetailR.json();
      const visitsData = await visitsR.json().catch(() => ({}));
      items = itemsData.map(r => {
        const item = r.body || r;
        return { ...item, visits: visitsData[item.id] || 0 };
      }).filter(i => i && i.id);
    }

    // Métricas de publicidad real
    let adsData = {};
    try {
      const adsR = await fetch(`https://api.mercadolibre.com/users/${uid}/ads/campaigns`, { headers });
      adsData = await adsR.json();
    } catch(e) {}

    res.status(200).json({ user, orders: ordersWithDetail, items, billing, adsData });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
