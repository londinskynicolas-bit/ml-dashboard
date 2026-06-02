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

    // Traer promociones activas del vendedor
    let promociones = [];
    try {
      const promoR = await fetch(`https://api.mercadolibre.com/seller-promotions/promotions?seller_id=${uid}&app_version=v2&status=started`, { headers });
      const promoData = await promoR.json();
      promociones = promoData.results || promoData || [];
    } catch(e) {}

    // Detalle completo de cada orden
    const ordersWithDetail = await Promise.all(orders.slice(0, 30).map(async (order) => {
      try {
        const [orderDetailR, shipR] = await Promise.all([
          fetch(`https://api.mercadolibre.com/orders/${order.id}`, { headers }),
          order.shipping?.id ? fetch(`https://api.mercadolibre.com/shipments/${order.shipping.id}`, { headers }) : Promise.resolve(null)
        ]);
        const orderDetail = await orderDetailR.json();
        const shipDetail = shipR ? await shipR.json() : null;

        // Calcular ingreso neto real con promociones
        const item = orderDetail.order_items?.[0];
        const precioVenta = (item?.unit_price || 0) * (item?.quantity || 1);
        const precioOriginal = (item?.full_unit_price || item?.unit_price || 0) * (item?.quantity || 1);
        const descuentoPromo = precioOriginal > precioVenta ? precioOriginal - precioVenta : (orderDetail.coupon?.amount || 0);
        const comisionML = precioVenta * 0.13;
        const ingresoNeto = precioVenta - comisionML;

        // Buscar nombre de promoción
        const promoNombre = item?.sale_fee ? `Promoción activa` : (descuentoPromo > 0 ? 'Descuento aplicado' : 'Sin promoción');

        return {
          ...order,
          ...orderDetail,
          shipDetail,
          calculado: {
            precioVenta: Math.round(precioVenta),
            precioOriginal: Math.round(precioOriginal),
            descuentoPromo: Math.round(descuentoPromo),
            comisionML: Math.round(comisionML),
            ingresoNeto: Math.round(ingresoNeto),
            promoNombre
          }
        };
      } catch(e) {
        return order;
      }
    }));

    // Items con detalle, visitas y promociones
    let items = [];
    const itemIds = (itemsSearch.results || []).slice(0, 20);
    if (itemIds.length > 0) {
      const [itemsDetailR, visitsR] = await Promise.all([
        fetch(`https://api.mercadolibre.com/items?ids=${itemIds.join(',')}`, { headers }),
        fetch(`https://api.mercadolibre.com/users/${uid}/items/visits?ids=${itemIds.join(',')}&last_30_days=true`, { headers })
      ]);
      const itemsData = await itemsDetailR.json();
      const visitsData = await visitsR.json().catch(() => ({}));

      items = await Promise.all(itemsData.map(async r => {
        const item = r.body || r;
        if (!item?.id) return null;

        // Buscar precio de venta con promoción
        let precioPromo = null;
        let nombrePromo = null;
        try {
          const salePriceR = await fetch(`https://api.mercadolibre.com/items/${item.id}/sale_price?context=channel_marketplace`, { headers });
          const salePrice = await salePriceR.json();
          if (salePrice.amount && salePrice.amount < item.price) {
            precioPromo = salePrice.amount;
            nombrePromo = salePrice.metadata?.promotion_type || 'Promoción activa';
          }
        } catch(e) {}

        return {
          ...item,
          visits: visitsData[item.id] || 0,
          precioPromo,
          nombrePromo
        };
      }));
      items = items.filter(Boolean);
    }

    res.status(200).json({ user, orders: ordersWithDetail, items, promociones });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
