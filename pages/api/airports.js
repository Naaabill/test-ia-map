import { getAirports } from '../../lib/flightService.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Méthode non autorisée' });
    return;
  }

  try {
    const data = await getAirports(req.query.q);
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({
      error: 'Impossible de charger le catalogue',
      message: error.message,
    });
  }
}
