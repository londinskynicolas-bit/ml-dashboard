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
    const orders = ordersData.results || [];

    // Detalle completo de cada orden
    const ordersWithDetail = await Promise.all(orders.slice(0, 30).map(async (order) => {
      try {
        const [orderDetailR, shipR] = await Promise.all([
          fetch(`https://api.mercadolibre.com/orders/${order.id}`, { headers }),
          order.shipping?.id
            ? fetch(`https://api.mercadolibre.com/shipments/${order.shipping.id}`, { headers })
            : Promise.resolve(null)
        ]);

        const orderDetail = await orderDetailR.json();
        const shipDetail = shipR ? await shipR.json() : null;

        // Datos del comprador completos
        let buyerDetail = null;
        try {
          const buyerR = await fetch(`https://api.mercadolibre.com/users/${order.buyer?.id}`, { headers });
          buyerDetail = await buyerR.json();
        } catch(e) {}

        const item = orderDetail.order_items?.[0];
        const precioOriginal = item?.full_unit_price || item?.unit_price || 0;
        const precioVenta = item?.unit_price || 0;
        const cantidad = item?.quantity || 1;
        const totalOriginal = precioOriginal * cantidad;
        const totalVenta = precioVenta * cantidad;
        const descuentoPromo = totalOriginal > totalVenta ? totalOriginal - totalVenta : (orderDetail.coupon?.amount || 0);
        const comisionML = totalVenta * 0.13;
        const ingresoNeto = totalVenta - comisionML;

        // Nombre de la promoción
        let promoNombre = 'Sin promoción';
        if (descuentoPromo > 0) {
          promoNombre = item?.sale_fee ? 'Precio especial ML' : 'Descuento aplicado';
        }

        return {
          ...order,
          ...orderDetail,
          shipDetail,
          buyerDetail,
          calculado: {
            precioOriginal: Math.round(totalOriginal),
            precioVenta: Math.round(totalVenta),
            descuentoPromo: Math.round(descuentoPromo),
            descuentoPct: totalOriginal > 0 ? Math.round((descuentoPromo / totalOriginal) * 100) : 0,
            comisionML: Math.round(comisionML),
            ingresoNeto: Math.round(ingresoNeto),
            promoNombre
          }
        };
      } catch(e) {
        return order;
      }
    }));

    // Items básicos con visitas
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

    res.status(200).json({ user, orders: ordersWithDetail, items });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
