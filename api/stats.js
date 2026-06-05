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

    let items = [];
    const itemIds = (itemsSearch.results || []).slice(0, 20);

    if (itemIds.length > 0) {
      const [itemsDetailR, visitsR] = await Promise.all([
        fetch(`https://api.mercadolibre.com/items?ids=${itemIds.join(',')}`, { headers }),
        fetch(`https://api.mercadolibre.com/users/${uid}/items/visits?ids=${itemIds.join(',')}&last_30_days=true`, { headers })
      ]);

      const itemsDetail = await itemsDetailR.json();
      const visitsRaw = await visitsR.json().catch(() => ({}));

      // Normalizar visitas
      const visitsMap = {};
      if (Array.isArray(visitsRaw)) {
        visitsRaw.forEach(v => { if(v.item_id) visitsMap[v.item_id] = v.visits || 0; });
      } else {
        Object.assign(visitsMap, visitsRaw);
      }

      items = await Promise.all(itemsDetail.map(async r => {
        const item = r.body || r;
        if (!item?.id) return null;

        const visits = visitsMap[item.id] || visitsMap[String(item.id)] || 0;

        // Precio promocional real
        let precioPromo = null;
        let nombrePromo = null;
        let descuentoPct = 0;

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
