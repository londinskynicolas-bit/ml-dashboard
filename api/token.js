export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { code, client_id, client_secret, redirect_uri, refresh_token, grant_type } = req.body;

  try {
    let params;
    
    if (grant_type === 'refresh_token') {
      if (!refresh_token || !client_id || !client_secret) {
        return res.status(400).json({ error: 'Faltan parámetros para refresh' });
      }
      params = {
        grant_type: 'refresh_token',
        client_id,
        client_secret,
        refresh_token
      };
    } else {
      if (!code || !client_id || !client_secret || !redirect_uri) {
        return res.status(400).json({ error: 'Faltan parámetros para authorization_code' });
      }
      params = {
        grant_type: 'authorization_code',
        client_id,
        client_secret,
        code,
        redirect_uri
      };
    }

    const resp = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams(params)
    });

    const data = await resp.json();
    
    if (!resp.ok) {
      return res.status(resp.status).json(data);
    }
    
    res.status(200).json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
