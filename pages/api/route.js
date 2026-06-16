import { getRoute } from '../../lib/flightService.js';

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Méthode non autorisée' });
    return;
  }

  try {
    const from = req.query.from;
    const to = req.query.to;
    const route = await getRoute(from, to);
    res.status(200).json(route);
  } catch (error) {
    const status = error?.statusCode || 500;
    res.status(status).json({
      error: error.message || 'Erreur interne',
    });
  }
}

export { handler };
export default handler;
