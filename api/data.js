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

    // Detalle completo de cada orden con datos del comprador
    const ordersWithDetail = await Promise.all(orders.slice(0, 30).map(async (order) => {
      try {
        const [orderDetailR, shipR, buyerR] = await Promise.all([
          fetch(`https://api.mercadolibre.com/orders/${order.id}`, { headers }),
          order.shipping?.id
            ? fetch(`https://api.mercadolibre.com/shipments/${order.shipping.id}`, { headers })
            : Promise.resolve(null),
          order.buyer?.id
            ? fetch(`https://api.mercadolibre.com/users/${order.buyer.id}`, { headers })
            : Promise.resolve(null)
        ]);

        const orderDetail = await orderDetailR.json();
        const shipDetail = shipR ? await shipR.json() : null;
        const buyerDetail = buyerR ? await buyerR.json() : null;

        const item = orderDetail.order_items?.[0];
        const precioOriginal = (item?.full_unit_price || item?.unit_price || 0) * (item?.quantity || 1);
        const precioVenta = (item?.unit_price || 0) * (item?.quantity || 1);
        const descuentoPromo = precioOriginal > precioVenta ? precioOriginal - precioVenta : (orderDetail.coupon?.amount || 0);
        const comisionML = precioVenta * 0.13;
        const ingresoNeto = precioVenta - comisionML;
        const descuentoPct = precioOriginal > 0 ? Math.round((descuentoPromo / precioOriginal) * 100) : 0;
        const promoNombre = descuentoPromo > 0 ? 'Descuento aplicado' : 'Sin promoción';

        // Datos del comprador con DNI/CUIT
        const buyerMerged = {
          ...order.buyer,
          ...buyerDetail,
          identification: buyerDetail?.identification || order.buyer?.identification,
          phone: buyerDetail?.phone || order.buyer?.phone,
          email: buyerDetail?.email || order.buyer?.email,
          first_name: buyerDetail?.first_name || order.buyer?.first_name,
          last_name: buyerDetail?.last_name || order.buyer?.last_name,
        };

        return {
          ...order,
          ...orderDetail,
          buyer: buyerMerged,
          shipDetail,
          calculado: {
            precioOriginal: Math.round(precioOriginal),
            precioVenta: Math.round(precioVenta),
            descuentoPromo: Math.round(descuentoPromo),
            descuentoPct,
            comisionML: Math.round(comisionML),
            ingresoNeto: Math.round(ingresoNeto),
            promoNombre
          }
        };
      } catch(e) {
        return order;
      }
    }));

    // Items con visitas
    let items = [];
    const itemIds = (itemsSearch.results || []).slice(0, 20);
    if (itemIds.length > 0) {
      const [itemsDetailR, visitsR] = await Promise.all([
        fetch(`https://api.mercadolibre.com/items?ids=${itemIds.join(',')}`, { headers }),
        fetch(`https://api.mercadolibre.com/users/${uid}/items/visits?ids=${itemIds.join(',')}&last_30_days=true`, { headers })
      ]);
      const itemsData = await itemsDetailR.json();
      const visitsRaw = await visitsR.json().catch(() => ({}));
      
      // Normalizar visitas - puede venir como objeto o array
      const visitsMap = {};
      if (Array.isArray(visitsRaw)) {
        visitsRaw.forEach(v => { if(v.item_id) visitsMap[v.item_id] = v.visits || 0; });
      } else if (visitsRaw.data_by_date) {
        // Formato alternativo
        Object.keys(visitsRaw).forEach(k => { visitsMap[k] = visitsRaw[k] || 0; });
      } else {
        Object.assign(visitsMap, visitsRaw);
      }

      items = itemsData.map(r => {
        const item = r.body || r;
        if (!item?.id) return null;
        const visits = visitsMap[item.id] || visitsMap[String(item.id)] || 0;
        return { ...item, visits };
      }).filter(Boolean);
    }

    res.status(200).json({ user, orders: ordersWithDetail, items });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
