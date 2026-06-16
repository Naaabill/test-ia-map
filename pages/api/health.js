import { getHealth } from '../../lib/flightService.js';

function handler(_req, res) {
  res.status(200).json(getHealth());
}

export { handler };
export default handler;
