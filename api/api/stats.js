export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { token, uid } = req.query;
  if (!token || !uid) { res.status(400).json({ error: 'Faltan parámetros' }); return; }

  const headers = { Authorization: `Bearer ${token}` };

  try {
    const [visitsR, questionsR, paymentsR] = await Promise.all([
      fetch(`https://api.mercadolibre.com/users/${uid}/items/search?limit=50`, { headers }),
      fetch(`https://api.mercadolibre.com/questions/search?seller_id=${uid}&status=UNANSWERED&limit=20`, { headers }),
      fetch(`https://api.mercadolibre.com/collections/orders?seller=${uid}&sort=date_desc&limit=50`, { headers })
    ]);

    const itemsSearch = await visitsR.json();
    const questions = await questionsR.json();
    const payments = await paymentsR.json();

    let itemsWithVisits = [];
    const itemIds = (itemsSearch.results || []).slice(0, 20);
    if (itemIds.length > 0) {
      const [itemsDetailR, visitsDetailR] = await Promise.all([
        fetch(`https://api.mercadolibre.com/items?ids=${itemIds.join(',')}`, { headers }),
        fetch(`https://api.mercadolibre.com/users/${uid}/items/visits?ids=${itemIds.join(',')}&last_30_days=true`, { headers })
      ]);
      const itemsDetail = await itemsDetailR.json();
      const visitsDetail = await visitsDetailR.json();
      
      itemsWithVisits = itemsDetail.map(r => {
        const item = r.body || r;
        return {
          ...item,
          visits: visitsDetail[item.id] || 0
        };
      }).filter(i => i && i.id);
    }

    res.status(200).json({
      items: itemsWithVisits,
      questions: questions.questions || [],
      orders: payments.results || []
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
