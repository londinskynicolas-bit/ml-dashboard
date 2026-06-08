export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { token, uid } = req.query;
  if (!token || !uid) { res.status(400).json({ error: 'Faltan parámetros' }); return; }

  const headers = { Authorization: `Bearer ${token}` };

  try {
    const [questionsR, itemsR] = await Promise.all([
      fetch(`https://api.mercadolibre.com/questions/search?seller_id=${uid}&status=UNANSWERED&limit=20`, { headers }),
      fetch(`https://api.mercadolibre.com/users/${uid}/items/search?limit=50`, { headers })
    ]);

    const questions = await questionsR.json();
    const itemsSearch = await itemsR.json();
    const itemIds = (itemsSearch.results || []).slice(0, 20);

    let items = [];

    if (itemIds.length > 0) {
      // Traer detalle de items
      const itemsDetailR = await fetch(
        `https://api.mercadolibre.com/items?ids=${itemIds.join(',')}`,
        { headers }
      );
      const itemsDetail = await itemsDetailR.json();

      // Traer visitas con formato correcto
      let visitsMap = {};
      try {
        const visitsR = await fetch(
          `https://api.mercadolibre.com/users/${uid}/items/visits?ids=${itemIds.join(',')}&last_30_days=true`,
          { headers }
        );
        const visitsRaw = await visitsR.json();
        
        // ML puede devolver el dato en distintos formatos
        if (visitsRaw && typeof visitsRaw === 'object') {
          if (Array.isArray(visitsRaw)) {
            visitsRaw.forEach(v => {
              if (v.item_id) visitsMap[v.item_id] = v.visits || 0;
            });
          } else if (visitsRaw.data_by_date) {
            // formato con fecha
            Object.keys(visitsRaw.data_by_date || {}).forEach(itemId => {
              const total = (visitsRaw.data_by_date[itemId] || []).reduce((s, d) => s + (d.visits || 0), 0);
              visitsMap[itemId] = total;
            });
          } else {
            // formato directo {item_id: visits}
            Object.assign(visitsMap, visitsRaw);
          }
        }
      } catch(e) {}

      // Intentar endpoint alternativo si visitas son 0
      if (Object.values(visitsMap).every(v => v === 0)) {
        try {
          for (const itemId of itemIds.slice(0, 5)) {
            const vR = await fetch(
              `https://api.mercadolibre.com/items/${itemId}/visits?last_30_days=true`,
              { headers }
            );
            const vData = await vR.json();
            if (vData.visits) visitsMap[itemId] = vData.visits;
            else if (typeof vData === 'number') visitsMap[itemId] = vData;
          }
        } catch(e) {}
      }

      items = await Promise.all(itemsDetail.map(async r => {
        const item = r.body || r;
        if (!item?.id) return null;

        const visits = visitsMap[item.id] || visitsMap[String(item.id)] || 0;

        // Calcular promoción desde original_price
        let precioPromo = null;
        let nombrePromo = null;
        let descuentoPct = 0;

        if (item.original_price && item.original_price > item.price) {
          precioPromo = item.price;
          descuentoPct = Math.round((1 - item.price / item.original_price) * 100);
          nombrePromo = 'Promoción activa';
        } else {
          // Intentar endpoint de sale_price
          try {
            const salePriceR = await fetch(
              `https://api.mercadolibre.com/items/${item.id}/sale_price?context=channel_marketplace`,
              { headers }
            );
            const salePrice = await salePriceR.json();
            if (salePrice?.amount && salePrice.amount < item.price) {
              precioPromo = salePrice.amount;
              nombrePromo = salePrice.metadata?.promotion_type || 'Promoción activa';
              descuentoPct = Math.round((1 - salePrice.amount / item.price) * 100);
            }
          } catch(e) {}
        }

        return { ...item, visits, precioPromo, nombrePromo, descuentoPct };
      }));

      items = items.filter(Boolean);
    }

    res.status(200).json({
      items,
      questions: questions.questions || []
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
