export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { token, uid } = req.query;
  if (!token || !uid) { res.status(400).json({ error: 'Faltan parámetros' }); return; }

  const headers = { Authorization: `Bearer ${token}` };

  try {
    const [questionsR, itemsR] = await Promise.all([
      fetch(`https://api.mercadolibre.com/questions/search?seller_id=${uid}&status=UNANSWERED&limit=20`, { headers }),
      fetch(`https://api.mercadolibre.com/users/${uid}/items/search?limit=20`, { headers })
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
      const visitsDetail = await visitsR.json();
      items = itemsDetail.map(r => {
        const item = r.body || r;
        return { ...item, visits: visitsDetail[item.id] || 0 };
      }).filter(i => i && i.id);
    }

    res.status(200).json({
      items,
      questions: questions.questions || []
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
