import {
  getNasaApod,
  getNasaDonki,
  getNasaEonet,
  getNasaNews,
  getNasaPower,
  getNasaSsd,
  nasaErrorPayload,
} from '../../../lib/flightService.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Méthode non autorisée' });
    return;
  }

  const source = String(req.query.source || '');
  try {
    if (source === 'apod') {
      const payload = await getNasaApod({
        date: req.query.date,
        hd: req.query.hd,
      });
      res.status(200).json(payload);
      return;
    }

    if (source === 'eonet') {
      const payload = await getNasaEonet({
        limit: req.query.limit,
        days: req.query.days,
        status: req.query.status,
        category: req.query.category,
      });
      res.status(200).json(payload);
      return;
    }

    if (source === 'power') {
      const payload = await getNasaPower({
        lat: req.query.lat,
        lon: req.query.lon,
        start: req.query.start,
        end: req.query.end,
        parameters: req.query.parameters,
      });
      res.status(200).json(payload);
      return;
    }

    if (source === 'donki') {
      const payload = await getNasaDonki({
        startDate: req.query.startDate,
        endDate: req.query.endDate,
      });
      res.status(200).json(payload);
      return;
    }

    if (source === 'ssd') {
      const payload = await getNasaSsd({
        limit: req.query.limit,
      });
      res.status(200).json(payload);
      return;
    }

    if (source === 'news') {
      const payload = await getNasaNews({
        perPage: req.query.per_page,
      });
      res.status(200).json(payload);
      return;
    }

    res.status(404).json({ error: 'Ressource NASA inconnue' });
  } catch (error) {
    const { status, payload } = nasaErrorPayload(error, source.toUpperCase());
    res.status(status).json(payload);
  }
}
