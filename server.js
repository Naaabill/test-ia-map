import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { parse } from 'csv-parse/sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
await loadEnvironment(path.join(__dirname, '.env'));

const app = express();
const port = process.env.PORT || 3000;

const AIRCRAFT_CRUISE_SPEED_KMH = 900;
const EARTH_RADIUS_KM = 6371;
const AIRPORT_TYPE_PRIORITY = {
  large_airport: 6,
  medium_airport: 4,
  small_airport: 2,
  seaplane_base: 1,
  heliport: 0,
};

const REMOTE_AIRPORTS_URL =
  process.env.REMOTE_AIRPORTS_URL ||
  'https://davidmegginson.github.io/ourairports-data/airports.csv';
const REMOTE_COUNTRIES_URL =
  process.env.REMOTE_COUNTRIES_URL ||
  'https://davidmegginson.github.io/ourairports-data/countries.csv';
const LOCAL_AIRPORTS_PATH = path.join(__dirname, 'data', 'airports.json');

const NASA_API_KEY = process.env.NASA_API_KEY || 'DEMO_KEY';
const NASA_REQUEST_TIMEOUT_MS = Number.parseInt(
  process.env.NASA_REQUEST_TIMEOUT_MS || '10000',
  10,
) || 10000;
const NASA_APOD_URL = 'https://api.nasa.gov/planetary/apod';
const EONET_EVENTS_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events';
const NASA_DONKI_URL = 'https://api.nasa.gov/DONKI/notifications';
const NASA_POWER_URL = 'https://power.larc.nasa.gov/api/temporal/daily/point';
const NASA_SSD_URL = 'https://ssd-api.jpl.nasa.gov/fireball.api';
const NASA_NEWS_URL = 'https://www.nasa.gov/wp-json/wp/v2/posts';

const FALLBACK_AIRPORTS = JSON.parse(
  await fs.readFile(LOCAL_AIRPORTS_PATH, 'utf-8'),
);

let airports = FALLBACK_AIRPORTS.map((airport) => ({
  ...airport,
  iata: airport.iata || '',
  icao: airport.icao || '',
  gps: airport.gps || '',
  localCode: airport.localCode || '',
  type: airport.type || 'airport',
  scheduledService: airport.scheduledService || 'yes',
  country: airport.country || 'Unknown',
}));
let countriesByCode = new Map();
let ready = true;
let readyError = null;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

loadAirportCatalog().catch((error) => {
  readyError = error;
  airports = FALLBACK_AIRPORTS.map((airport) => ({
    ...airport,
    iata: airport.iata || '',
    icao: airport.icao || '',
    gps: airport.gps || '',
    localCode: airport.localCode || '',
    type: airport.type || 'airport',
    scheduledService: airport.scheduledService || 'yes',
    country: airport.country || 'Unknown',
  }));
  console.error('⚠️  Fallback local airports loaded.');
  ready = true;
});

app.get('/api/airports', (req, res) => {
  // Le catalogue local permet déjà d'autocompléter dès le premier démarrage.
  // Le chargement distant enrichit ensuite la base en arrière-plan.
  const query = normalizeText(String(req.query.q || '').trim());

  if (!query) {
    return res.json(
      airports
        .filter((airport) => airport.iata)
        .sort(compareAirportQuality)
        .slice(0, 10)
        .map((airport) => ({
          ...airport,
          matchScore: 1,
          label: `${airportCode(airport)} ${airport.city}, ${airport.country} — ${airport.name}`,
        })),
    );
  }

  const matches = getMatchedAirports(query);
  res.json(matches);
});

app.get('/api/route', (req, res) => {
  const from = resolveAirport(normalizeText(String(req.query.from || '')));
  const to = resolveAirport(normalizeText(String(req.query.to || '')));

  if (!from || !to) {
    return res.status(400).json({
      error: 'from/to invalides. Utilise un code IATA/ICAO (3-4 lettres) ou un nom/ville.',
    });
  }

  if (from.id && to.id && from.id === to.id) {
    return res.status(400).json({ error: 'Les deux aéroports sont identiques.' });
  }

  const route = createGreatCircleRoute(
    [from.lat, from.lon],
    [to.lat, to.lon],
    96,
  );
  const distanceKm = haversineDistanceKm([from.lat, from.lon], [to.lat, to.lon]);
  const durationHours = distanceKm / AIRCRAFT_CRUISE_SPEED_KMH;

  res.json({
    from: normalizeApiAirport(from),
    to: normalizeApiAirport(to),
    distanceKm: +distanceKm.toFixed(1),
    durationHours: +durationHours.toFixed(2),
    geometry: {
      type: 'LineString',
      coordinates: route,
    },
  });
});

app.get('/api/nasa/apod', async (req, res) => {
  const date = sanitizeDate(req.query.date) || '';
  const hd = parseBoolean(req.query.hd);

  try {
    const params = new URLSearchParams({
      api_key: NASA_API_KEY,
    });
    if (date) params.set('date', date);
    if (hd) params.set('hd', 'true');

    const url = `${NASA_APOD_URL}?${params}`;
    const data = await fetchNasaJson(url);

    res.json({
      source: 'NASA APOD',
      date: data.date,
      title: data.title,
      explanation: data.explanation,
      mediaType: data.media_type,
      url: data.url,
      hdurl: data.hdurl,
      copyright: data.copyright || '',
      serviceVersion: data.service_version,
    });
  } catch (error) {
    handleNasaError(res, error, 'APOD');
  }
});

app.get('/api/nasa/eonet', async (req, res) => {
  try {
    const limit = clampNumber(req.query.limit, 1, 100, 10);
    const days = clampNumber(req.query.days, 1, 365, 14);
    const status = sanitizeStatus(req.query.status, 'open');

    const params = new URLSearchParams({
      limit: String(limit),
      status,
      days: String(days),
    });

    if (req.query.category) params.set('category', String(req.query.category));
    if (req.query.source) params.set('source', String(req.query.source));

    const events = await fetchNasaJson(`${EONET_EVENTS_URL}?${params}`);
    res.json({
      source: 'EONET',
      count: events?.events?.length || 0,
      events: events?.events || [],
    });
  } catch (error) {
    handleNasaError(res, error, 'EONET');
  }
});

app.get('/api/nasa/power', async (req, res) => {
  try {
    const lat = Number.parseFloat(req.query.lat);
    const lon = Number.parseFloat(req.query.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ error: 'lat et lon sont requis et doivent être valides.' });
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return res.status(400).json({
        error: 'lat/lon hors limites: lat [-90, 90], lon [-180, 180].',
      });
    }

    const start = sanitizeDateForPower(req.query.start, -7);
    const end = sanitizeDateForPower(req.query.end, 0);
    const paramsList = (String(req.query.parameters || 'T2M').replace(/\s+/g, '').toUpperCase() || 'T2M')
      .split(',')
      .filter(Boolean)
      .slice(0, 10)
      .join(',');

    const params = new URLSearchParams({
      parameters: paramsList,
      community: 'SB',
      longitude: String(lon),
      latitude: String(lat),
      start,
      end,
      format: 'JSON',
    });

    const raw = await fetchNasaJson(`${NASA_POWER_URL}?${params}`);
    res.json({
      source: 'NASA POWER',
      header: raw?.header || {},
      geometry: raw?.geometry || {},
      data: raw?.properties?.parameter || {},
      properties: {
        start,
        end,
        parameters: paramsList.split(','),
        latitude: lat,
        longitude: lon,
      },
    });
  } catch (error) {
    handleNasaError(res, error, 'NASA POWER');
  }
});

app.get('/api/nasa/donki', async (req, res) => {
  try {
    const startDate = sanitizeDate(req.query.startDate, -7);
    const endDate = sanitizeDate(req.query.endDate, 0);

    const params = new URLSearchParams({
      api_key: NASA_API_KEY,
      startDate,
      endDate,
    });

    const data = await fetchNasaJson(`${NASA_DONKI_URL}?${params}`);
    res.json({
      source: 'NASA DONKI',
      count: Array.isArray(data) ? data.length : 0,
      events: Array.isArray(data) ? data : [],
      requested: {
        startDate,
        endDate,
      },
    });
  } catch (error) {
    handleNasaError(res, error, 'DONKI');
  }
});

app.get('/api/nasa/ssd', async (req, res) => {
  try {
    const limit = clampNumber(req.query.limit, 1, 200, 10);

    const params = new URLSearchParams({
      limit: String(limit),
    });

    const data = await fetchNasaJson(`${NASA_SSD_URL}?${params}`);
    const fields = Array.isArray(data?.fields) ? data.fields : [];
    const events = Array.isArray(data?.data)
      ? data.data.map((row) => Object.fromEntries(row.map((value, index) => [fields[index], value])))
      : [];

    res.json({
      source: 'JPL SSD (Fireball)',
      signature: data?.signature || {},
      count: events.length,
      events,
    });
  } catch (error) {
    handleNasaError(res, error, 'SSD');
  }
});

app.get('/api/nasa/news', async (req, res) => {
  try {
    const perPage = clampNumber(req.query.per_page, 1, 20, 8);

    const params = new URLSearchParams({
      per_page: String(perPage),
      orderby: 'date',
      order: 'desc',
      _fields: 'id,date,title,link,excerpt',
    });

    const data = await fetchNasaJson(`${NASA_NEWS_URL}?${params}`);
    const items = Array.isArray(data)
      ? data.map((post) => ({
          id: post.id,
          date: post.date,
          title: stripHtml(post.title?.rendered || ''),
          link: post.link,
          excerpt: stripHtml(post.excerpt?.rendered || '', 220),
        }))
      : [];

    res.json({
      source: 'NASA News (WordPress API)',
      count: items.length,
      items,
    });
  } catch (error) {
    handleNasaError(res, error, 'NASA News');
  }
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    ready,
    readyError: Boolean(readyError),
  });
});

app.listen(port, () => {
  console.log(`✈️ API + carte avion démarrée sur http://localhost:${port}`);
});

async function loadEnvironment(filepath) {
  try {
    const envRaw = await fs.readFile(filepath, 'utf-8');
    envRaw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .forEach((line) => {
        const index = line.indexOf('=');
        if (index < 0) return;
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim().replace(/^"|"$/g, '');
        if (key) process.env[key] = value;
      });
  } catch (_) {
    // No .env file needed: default values are used.
  }
}

async function fetchNasaJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NASA_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const payloadText = await response.text();
    let payload;
    try {
      payload = JSON.parse(payloadText);
    } catch (error) {
      const raw = payloadText.trim();
      const message = raw
        ? `Réponse NASA invalide (${raw.slice(0, 180)})`
        : 'Réponse NASA vide';
      const parseError = new Error(message);
      parseError.statusCode =
        response.status >= 200 && response.status < 300 ? 502 : response.status || 502;
      parseError.raw = raw;
      throw parseError;
    }

    if (!response.ok) {
      const message =
        payload?.error?.message ||
        payload?.msg ||
        payload?.reason ||
        payload?.reason?.replace(/<[^>]*>/g, ' ') ||
        payload?.title ||
        payloadText.slice(0, 220) ||
        `Erreur HTTP ${response.status}`;
      const error = new Error(message);
      error.statusCode = response.status;
      error.raw = payloadText;
      throw error;
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function sanitizeStatus(value, fallback = 'open') {
  const status = String(value || fallback).toLowerCase();
  if (status === 'open' || status === 'closed' || status === 'all') return status;
  return fallback;
}

function parseBoolean(value) {
  return String(value).toLowerCase() === 'true';
}

function stripHtml(html, maxLength = 0) {
  const text = String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!maxLength || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}…`;
}

function sanitizeDate(value, offsetDays = null) {
  const base = new Date();
  if (offsetDays !== null && Number.isFinite(offsetDays)) {
    base.setDate(base.getDate() + Number(offsetDays));
  }
  if (value) {
    const parsed = new Date(String(value));
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  return base.toISOString().slice(0, 10);
}

function sanitizeDateForPower(value, offsetDays = null) {
  const base = new Date();
  if (offsetDays !== null && Number.isFinite(offsetDays)) {
    base.setDate(base.getDate() + Number(offsetDays));
  }
  const parsed = value ? new Date(String(value)) : base;
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getUTCFullYear();
    const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const day = String(parsed.getUTCDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }
  if (offsetDays !== null && Number.isFinite(offsetDays)) {
    const year = base.getUTCFullYear();
    const month = String(base.getUTCMonth() + 1).padStart(2, '0');
    const day = String(base.getUTCDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }
  return base.toISOString().slice(0, 10);
}

function handleNasaError(res, error, source) {
  if (error.name === 'AbortError') {
    return res.status(504).json({
      error: `${source}: délai dépassé`,
      message: `Timeout de ${NASA_REQUEST_TIMEOUT_MS}ms`,
    });
  }

  const status = error.statusCode || 502;
  return res.status(status).json({
    error: `${source} indisponible`,
    message: error.message,
  });
}

async function loadAirportCatalog() {
  const [airportsCsv, countriesCsv] = await Promise.all([
    fetchText(REMOTE_AIRPORTS_URL),
    fetchText(REMOTE_COUNTRIES_URL),
  ]);

  const parsedCountries = parseCsvSafe(countriesCsv);
  countriesByCode = new Map(
    parsedCountries
      .filter((row) => row.iso_country && row.name)
      .map((row) => [row.iso_country.toUpperCase(), row.name]),
  );

  const parsedAirports = parseCsvSafe(airportsCsv);
  airports = parsedAirports
    .map((row) => mapAirportRow(row))
    .filter(Boolean);

  readyError = null;
  ready = true;
  console.log(`📦 Catalogue aéroports chargé: ${airports.length} entrées`);
}

function parseCsvSafe(csvText) {
  return parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  });
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Impossible de récupérer ${url}: ${response.status}`);
  }
  return response.text();
}

function getMatchedAirports(query) {
  const normalized = normalizeText(query);
  const matches = airports
    .map((airport) => ({ airport, score: airportScore(airport, normalized) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => sortAirportMatches(a, b))
    .slice(0, 12)
    .map((entry) => ({
      ...entry.airport,
      matchScore: entry.score,
      label: `${airportCode(entry.airport)} ${entry.airport.city}, ${entry.airport.country} — ${entry.airport.name}`,
    }));

  return matches;
}

function resolveAirport(query) {
  if (!query) return null;

  const exact = airports.find((airport) =>
    normalizeText(airport.iata) === query ||
    normalizeText(airport.icao) === query ||
    normalizeText(airport.gps || '').toUpperCase() === query.toUpperCase() ||
    normalizeText(airport.localCode || '') === query,
  );
  if (exact) return exact;

  const matches = airports
    .map((airport) => ({ airport, score: airportScore(airport, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => sortAirportMatches(a, b));

  if (!matches.length) return null;
  return matches[0].airport;
}

function mapAirportRow(row) {
  const iata = normalizeText(row.iata_code || '');
  const icao = (row.icao_code || '').toUpperCase();
  const gps = (row.gps_code || '').toUpperCase();
  const localCode = (row.local_code || '').toUpperCase();
  const city = extractCityName(row.municipality || '');
  const country = countriesByCode.get((row.iso_country || '').toUpperCase()) ||
    row.iso_country || 'Unknown';
  const lat = Number.parseFloat(row.latitude_deg);
  const lon = Number.parseFloat(row.longitude_deg);

  const hasUsableCode = Boolean(iata || icao || gps);
  const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lon);
  const isAirportLike = typeof row.type === 'string'
    && (row.type.endsWith('airport') || row.type === 'heliport' || row.type === 'seaplane_base');

  if (!hasUsableCode || !hasCoordinates || !isAirportLike) return null;

  return {
    id: row.ident || row.id || '',
    name: row.name || '',
    city,
    country,
    iata: (iata || '').toUpperCase(),
    icao,
    gps,
    localCode,
    lat,
    lon,
    type: row.type,
    scheduledService: row.scheduled_service,
  };
}

function extractCityName(rawCity) {
  if (!rawCity) return '';
  return rawCity
    .split('(')[0]
    .split(',')[0]
    .trim();
}

function normalizeText(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function airportScore(airport, query) {
  if (!query) return 0;

  const iata = normalizeText(airport.iata || '');
  const icao = normalizeText(airport.icao || '');
  const gps = normalizeText(airport.gps || '');
  const localCode = normalizeText(airport.localCode || '');
  const city = normalizeText(airport.city || '');
  const name = normalizeText(airport.name || '');
  const country = normalizeText(airport.country || '');
  const allText = `${iata} ${icao} ${gps} ${localCode} ${city} ${name} ${country}`;
  const tokens = allText
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);

  let score = 0;

  if (iata === query) score = 180;
  if (icao === query) score = Math.max(score, 170);
  if (gps === query) score = Math.max(score, 160);
  if (localCode === query) score = Math.max(score, 150);

  if (!score) {
    if (iata.startsWith(query)) score = Math.max(score, 140);
    if (icao.startsWith(query)) score = Math.max(score, 130);
    if (gps.startsWith(query)) score = Math.max(score, 120);
  }

  if (!score) {
    if (city === query) score = Math.max(score, 110);
    if (name === query) score = Math.max(score, 100);
  }

  if (!score) {
    if (city.startsWith(query)) score = Math.max(score, 80);
    if (name.startsWith(query)) score = Math.max(score, 70);
    if (tokens.some((token) => token.startsWith(query))) score = Math.max(score, 50);
    if (allText.includes(query)) score = Math.max(score, 30);
  }

  if (!score) return 0;

  let bonus = 0;
  if (airport.iata) bonus += 8;
  if (airport.scheduledService === 'yes') bonus += 12;
  bonus += getAirportTypePriority(airport.type) * 3;

  if (city === query || name === query) {
    bonus += 12;
  }

  if ((airport.type === 'heliport' || airport.type === 'seaplane_base' || airport.type === 'balloonport') && score >= 80) {
    bonus -= 10;
  }

  if (!airport.iata && (city === query || tokens.some((token) => token === query)) && query.length >= 3) {
    bonus -= 6;
  }

  return score + bonus;
}

function airportCode(airport) {
  return airport.iata || airport.icao || airport.gps || airport.localCode || '';
}

function getAirportTypePriority(type) {
  return AIRPORT_TYPE_PRIORITY[type] || 0;
}

function airportQuality(airport) {
  let score = 0;
  score += getAirportTypePriority(airport.type) * 5;
  if (airport.scheduledService === 'yes') score += 12;
  if (airport.iata) score += 10;
  return score;
}

function compareAirportQuality(a, b) {
  const qualityA = airportQuality(a);
  const qualityB = airportQuality(b);
  if (qualityB !== qualityA) return qualityB - qualityA;
  return (a.city || '').localeCompare(b.city || '') || (a.name || '').localeCompare(b.name || '');
}

function sortAirportMatches(a, b) {
  if (b.score !== a.score) return b.score - a.score;

  const aHasIata = Boolean(a.airport.iata);
  const bHasIata = Boolean(b.airport.iata);
  if (aHasIata !== bHasIata) return bHasIata - aHasIata;

  const aScheduled = a.airport.scheduledService === 'yes';
  const bScheduled = b.airport.scheduledService === 'yes';
  if (aScheduled !== bScheduled) return Number(bScheduled) - Number(aScheduled);

  const aTypePriority = getAirportTypePriority(a.airport.type);
  const bTypePriority = getAirportTypePriority(b.airport.type);
  if (aTypePriority !== bTypePriority) return bTypePriority - aTypePriority;

  const aQuality = airportQuality(a.airport);
  const bQuality = airportQuality(b.airport);
  if (aQuality !== bQuality) return bQuality - aQuality;

  return (a.airport.city || '').localeCompare(b.airport.city || '')
    || (a.airport.name || '').localeCompare(b.airport.name || '');
}

function normalizeApiAirport(airport) {
  return {
    id: airport.id,
    name: airport.name,
    city: airport.city,
    country: airport.country,
    iata: airport.iata,
    code: airportCode(airport),
    icao: airport.icao,
    lat: airport.lat,
    lon: airport.lon,
  };
}

function createGreatCircleRoute(from, to, points = 100) {
  const [lat1, lon1] = from;
  const [lat2, lon2] = to;

  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;

  const φ1 = toRad(lat1);
  const λ1 = toRad(lon1);
  const φ2 = toRad(lat2);
  const λ2 = toRad(lon2);

  const δ = haversineAngleRadians(φ1, λ1, φ2, λ2);

  if (δ === 0) {
    return [
      [lon1, lat1],
      [lon2, lat2],
    ];
  }

  const coordinates = [];
  for (let i = 0; i <= points; i += 1) {
    const f = i / points;
    const a = Math.sin((1 - f) * δ) / Math.sin(δ);
    const b = Math.sin(f * δ) / Math.sin(δ);

    const x =
      a * Math.cos(φ1) * Math.cos(λ1) + b * Math.cos(φ2) * Math.cos(λ2);
    const y =
      a * Math.cos(φ1) * Math.sin(λ1) + b * Math.cos(φ2) * Math.sin(λ2);
    const z = a * Math.sin(φ1) + b * Math.sin(φ2);

    const φ = Math.atan2(z, Math.sqrt(x * x + y * y));
    const λ = Math.atan2(y, x);
    coordinates.push([toDeg(λ), toDeg(φ)]);
  }

  return coordinates;
}

function haversineAngleRadians(φ1, λ1, φ2, λ2) {
  const dφ = φ2 - φ1;
  const dλ = λ2 - λ1;
  const hav = Math.sin(dφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(Math.max(0, 1 - hav)));
}

function haversineDistanceKm(a, b) {
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const angle = haversineAngleRadians(
    φ1,
    toRad(lon1),
    φ2,
    toRad(lon2),
  );
  return EARTH_RADIUS_KM * angle;
}
