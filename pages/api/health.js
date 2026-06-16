import { getHealth } from '../../lib/flightService.js';

export default function handler(_req, res) {
  res.status(200).json(getHealth());
}
