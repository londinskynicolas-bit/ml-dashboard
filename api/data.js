export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { token, uid } = req.query;
  if (!token || !uid) { res.status(400).json({ error: 'Faltan parámetros' }); return; }

  const headers = { Authorization: `Bearer ${token}` };

  try {
    const [userR, ordersR, itemsR] = await Promise.all([
      fetch('https://api.mercadolibre.com/users/me', { headers }),
      fetch(`https://api.mercadolibre.com/orders/search?seller=${uid}&sort=date_desc&limit=20`, { headers }),
      fetch(`https://api.mercadolibre.com/users/${uid}/items/search?limit=20`, { headers })
    ]);

    const user = await userR.json();
    const ordersData = await ordersR.json();
    const itemsSearch = await itemsR.json();

    let items = [];
    const itemIds = itemsSearch.results || [];
    if (itemIds.length > 0) {
      const itemsR2 = await fetch(`https://api.mercadolibre.com/items?ids=${itemIds.slice(0,15).join(',')}`, { headers });
      const itemsData = await itemsR2.json();
      items = itemsData.map(r => r.body || r).filter(i => i && i.id);
    }

    res.status(200).json({
      user,
      orders: ordersData.results || [],
      items
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
