import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const LOCAL_AIRPORTS_PATH = path.join(__dirname, '..', 'data', 'airports.json');

const NASA_APOD_URL = 'https://api.nasa.gov/planetary/apod';
const EONET_EVENTS_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events';
const NASA_DONKI_URL = 'https://api.nasa.gov/DONKI/notifications';
const NASA_POWER_URL = 'https://power.larc.nasa.gov/api/temporal/daily/point';
const NASA_NEO_URL = 'https://api.nasa.gov/neo/rest/v1/feed';
const NASA_SSD_URL = 'https://ssd-api.jpl.nasa.gov/fireball.api';
const NASA_NEWS_URL = 'https://www.nasa.gov/wp-json/wp/v2/posts';
const NASA_MARS_ROVER_URL = 'https://api.nasa.gov/mars-photos/api/v1/rovers';

let FALLBACK_AIRPORTS = [];
let airports = [];
let countriesByCode = new Map();
let ready = true;
let readyError = null;
let initPromise = null;

async function loadFallbackAirports() {
  const raw = await fs.readFile(LOCAL_AIRPORTS_PATH, 'utf-8');
  FALLBACK_AIRPORTS = JSON.parse(raw);
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
}

function initCatalog() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      await loadFallbackAirports();
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
        ready = true;
        console.error('⚠️  Fallback local airports loaded.');
      });
    } catch (error) {
      readyError = error;
      ready = false;
      throw error;
    }
  })();
  return initPromise;
}

export async function getAirports(query = '') {
  await initCatalog();
  if (!ready) {
    throw new Error('Catalogue d\'aéroports indisponible.');
  }

  const normalizedQuery = normalizeText(String(query).trim());
  if (!normalizedQuery) {
    return airports
      .filter((airport) => airport.iata)
      .sort(compareAirportQuality)
      .slice(0, 10)
      .map((airport) => ({
        ...airport,
        matchScore: 1,
        label: `${airportCode(airport)} ${airport.city}, ${airport.country} — ${airport.name}`,
      }));
  }

  return getMatchedAirports(normalizedQuery);
}

export async function getRoute(from, to) {
  await initCatalog();

  const fromAirport = resolveAirport(normalizeText(String(from || '')));
  const toAirport = resolveAirport(normalizeText(String(to || '')));

  if (!fromAirport || !toAirport) {
    throw createValidationError(
      400,
      'from/to invalides. Utilise un code IATA/ICAO (3-4 lettres) ou un nom/ville.',
    );
  }

  if (fromAirport.id && toAirport.id && fromAirport.id === toAirport.id) {
    throw createValidationError(400, 'Les deux aéroports sont identiques.');
  }

  const route = createGreatCircleRoute([fromAirport.lat, fromAirport.lon], [toAirport.lat, toAirport.lon], 96);
  const distanceKm = haversineDistanceKm([fromAirport.lat, fromAirport.lon], [toAirport.lat, toAirport.lon]);
  const durationHours = distanceKm / AIRCRAFT_CRUISE_SPEED_KMH;

  return {
    from: normalizeApiAirport(fromAirport),
    to: normalizeApiAirport(toAirport),
    distanceKm: +distanceKm.toFixed(1),
    durationHours: +durationHours.toFixed(2),
    geometry: {
      type: 'LineString',
      coordinates: route,
    },
  };
}

export function getHealth() {
  return {
    ok: true,
    ready,
    readyError: Boolean(readyError),
  };
}

async function withNasaConfig() {
  return {
    apiKey: process.env.NASA_API_KEY || 'DEMO_KEY',
    timeoutMs: Math.max(3000, parsePositiveInt(process.env.NASA_REQUEST_TIMEOUT_MS, 30000)),
    retries: clampNumber(process.env.NASA_REQUEST_RETRIES, 0, 4, 2),
  };
}

export async function getNasaApod({ date = '', hd = false } = {}) {
  const { apiKey } = await withNasaConfig();
  const safeDate = sanitizeDate(date) || '';
  const params = new URLSearchParams({ api_key: apiKey });
  if (safeDate) params.set('date', safeDate);
  if (parseBoolean(hd)) params.set('hd', 'true');
  const data = await fetchNasaJson(`${NASA_APOD_URL}?${params}`);
  return {
    source: 'NASA APOD',
    date: data.date,
    title: data.title,
    explanation: data.explanation,
    mediaType: data.media_type,
    url: data.url,
    hdurl: data.hdurl,
    copyright: data.copyright || '',
    serviceVersion: data.service_version,
  };
}

export async function getNasaNeo({
  startDate = '',
  endDate = '',
} = {}) {
  const { apiKey } = await withNasaConfig();
  const { safeStart, safeEnd } = clampNasaDateRange(startDate, endDate, 7);
  const params = new URLSearchParams({
    start_date: safeStart,
    end_date: safeEnd,
    api_key: apiKey,
  });
  const raw = await fetchNasaJson(`${NASA_NEO_URL}?${params}`);

  const objectsByDate = raw?.near_earth_objects;
  const objects = Object.entries(objectsByDate || {})
    .flatMap(([date, values]) => {
      if (!Array.isArray(values)) return [];
      return values.map((asteroid) => {
        const approach = Array.isArray(asteroid.close_approach_data) && asteroid.close_approach_data.length
          ? asteroid.close_approach_data[0]
          : null;
        return {
          neoReferenceId: asteroid.neo_reference_id || asteroid.id,
          name: asteroid.name || 'N/A',
          date,
          absoluteMagnitude: toFiniteNumber(asteroid.absolute_magnitude_h),
          diameterMinM: toFiniteNumber(asteroid.estimated_diameter?.meters?.estimated_diameter_min),
          diameterMaxM: toFiniteNumber(asteroid.estimated_diameter?.meters?.estimated_diameter_max),
          potentiallyHazardous: Boolean(asteroid.is_potentially_hazardous_asteroid),
          closeApproachDate: approach?.close_approach_date || date,
          relativeSpeedKmh: toFiniteNumber(approach?.relative_velocity?.kilometers_per_hour),
          missDistanceKm: toFiniteNumber(approach?.miss_distance?.kilometers),
          orbitingBody: approach?.orbiting_body || '',
          nasaJplLink: asteroid.nasa_jpl_url || '',
        };
      });
    })
    .sort((a, b) => {
      if (!Number.isFinite(a.missDistanceKm) && !Number.isFinite(b.missDistanceKm)) return 0;
      if (!Number.isFinite(a.missDistanceKm)) return 1;
      if (!Number.isFinite(b.missDistanceKm)) return -1;
      return a.missDistanceKm - b.missDistanceKm;
    })
    .map((item) => ({
      ...item,
      diameterMinM: item.diameterMinM == null ? null : +item.diameterMinM.toFixed(2),
      diameterMaxM: item.diameterMaxM == null ? null : +item.diameterMaxM.toFixed(2),
      relativeSpeedKmh: item.relativeSpeedKmh == null ? null : +item.relativeSpeedKmh.toFixed(2),
      missDistanceKm: item.missDistanceKm == null ? null : +item.missDistanceKm.toFixed(0),
    }))
    .slice(0, 60);

  return {
    source: 'NASA NEO Feed',
    range: {
      startDate: safeStart,
      endDate: safeEnd,
    },
    count: objects.length,
    objects,
  };
}

export async function getNasaEonet({
  limit = 10,
  days = 14,
  status = 'open',
  category,
} = {}) {
  const safeLimit = clampNumber(limit, 1, 100, 10);
  const safeDays = clampNumber(days, 1, 365, 14);
  const safeStatus = sanitizeStatus(status, 'open');

  const params = new URLSearchParams({
    limit: String(safeLimit),
    status: safeStatus,
    days: String(safeDays),
  });
  if (category) params.set('category', String(category));

  const events = await fetchNasaJson(`${EONET_EVENTS_URL}?${params}`);
  return {
    source: 'EONET',
    count: events?.events?.length || 0,
    events: events?.events || [],
  };
}

export async function getNasaPower({
  lat,
  lon,
  start,
  end,
  parameters = 'T2M',
} = {}) {
  const latitude = Number.parseFloat(lat);
  const longitude = Number.parseFloat(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw createValidationError(400, 'lat et lon sont requis et doivent être valides.');
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw createValidationError(
      400,
      'lat/lon hors limites: lat [-90, 90], lon [-180, 180].',
    );
  }

  const safeStart = sanitizeDateForPower(start, -7);
  const safeEnd = sanitizeDateForPower(end, 0);
  const safeParameters = (String(parameters || 'T2M').replace(/\s+/g, '').toUpperCase() || 'T2M')
    .split(',')
    .filter(Boolean)
    .slice(0, 10)
    .join(',');

  const params = new URLSearchParams({
    parameters: safeParameters,
    community: 'SB',
    longitude: String(longitude),
    latitude: String(latitude),
    start: safeStart,
    end: safeEnd,
    format: 'JSON',
  });
  const raw = await fetchNasaJson(`${NASA_POWER_URL}?${params}`);
  return {
    source: 'NASA POWER',
    header: raw?.header || {},
    geometry: raw?.geometry || {},
    data: raw?.properties?.parameter || {},
    properties: {
      start: safeStart,
      end: safeEnd,
      parameters: safeParameters.split(','),
      latitude,
      longitude,
    },
  };
}

export async function getNasaDonki({
  startDate = '',
  endDate = '',
} = {}) {
  const { apiKey } = await withNasaConfig();
  const safeStartDate = sanitizeDate(startDate, -7);
  const safeEndDate = sanitizeDate(endDate, 0);
  const params = new URLSearchParams({
    api_key: apiKey,
    startDate: safeStartDate,
    endDate: safeEndDate,
  });
  const data = await fetchNasaJson(`${NASA_DONKI_URL}?${params}`);
  return {
    source: 'NASA DONKI',
    count: Array.isArray(data) ? data.length : 0,
    events: Array.isArray(data) ? data : [],
    requested: {
      startDate: safeStartDate,
      endDate: safeEndDate,
    },
  };
}

export async function getNasaSsd({ limit = 10 } = {}) {
  const safeLimit = clampNumber(limit, 1, 200, 10);
  const params = new URLSearchParams({ limit: String(safeLimit) });
  const data = await fetchNasaJson(`${NASA_SSD_URL}?${params}`);
  const fields = Array.isArray(data?.fields) ? data.fields : [];
  const events = Array.isArray(data?.data)
    ? data.data.map((row) => Object.fromEntries(row.map((value, index) => [fields[index], value])))
    : [];

  return {
    source: 'JPL SSD (Fireball)',
    signature: data?.signature || {},
    count: events.length,
    events,
  };
}

export async function getNasaNews({ perPage = 8 } = {}) {
  const safePerPage = clampNumber(perPage, 1, 20, 8);
  const params = new URLSearchParams({
    per_page: String(safePerPage),
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

  return {
    source: 'NASA News (WordPress API)',
    count: items.length,
    items,
  };
}

export async function getNasaMarsPhotos({
  rover = 'curiosity',
  camera = '',
  earthDate = '',
  sol = '',
  page = 1,
} = {}) {
  const { apiKey } = await withNasaConfig();

  const safeRover = String(rover || 'curiosity').toLowerCase();
  const normalizedRover = ['curiosity', 'opportunity', 'perseverance', 'spirit'].includes(safeRover)
    ? safeRover
    : 'curiosity';

  const safeCamera = String(camera || '').toLowerCase().trim();
  const safePage = clampNumber(page, 1, 50, 1);
  const safeEarthDate = sanitizeDate(earthDate, !earthDate ? -1 : 0);
  const safeSol = Number.parseInt(String(sol), 10);

  const params = new URLSearchParams({
    page: String(safePage),
    api_key: apiKey,
  });

  if (Number.isFinite(safeSol) && safeSol > 0) {
    params.set('sol', String(safeSol));
  } else {
    params.set('earth_date', safeEarthDate);
  }
  if (safeCamera) {
    params.set('camera', safeCamera);
  }

  const data = await fetchNasaJson(
    `${NASA_MARS_ROVER_URL}/${normalizedRover}/photos?${params}`,
  );

  const photos = (Array.isArray(data?.photos) ? data.photos : [])
    .slice(0, 12)
    .map((photo) => ({
      id: photo.id,
      earthDate: photo.earth_date || '',
      sol: Number.isFinite(Number(photo?.sol)) ? Number(photo.sol) : null,
      camera: photo.camera?.full_name || photo.camera?.name || 'N/A',
      rover: photo.rover?.name || normalizedRover,
      imageUrl: photo.img_src || '',
      landingDate: photo.rover?.landing_date || '',
      missionStatus: photo.rover?.status || '',
    }));

  return {
    source: 'NASA Mars Rover Photos',
    rover: normalizedRover,
    count: photos.length,
    camera: safeCamera || 'all',
    page: safePage,
    photos,
  };
}

export function nasaErrorPayload(error, source, defaultTimeoutMs) {
  const timeoutMs = defaultTimeoutMs || Math.max(3000, parsePositiveInt(process.env.NASA_REQUEST_TIMEOUT_MS, 30000));
  if (error?.name === 'AbortError') {
    return {
      status: 504,
      payload: {
        error: `${source}: délai dépassé`,
        message: `Timeout de ${timeoutMs}ms`,
      },
    };
  }
  return {
    status: error?.statusCode || 502,
    payload: {
      error: `${source} indisponible`,
      message: error?.message || 'Erreur inconnue',
    },
  };
}

function createValidationError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function loadAirportCatalog() {
  const [airportsCsv, countriesCsv] = await Promise.all([fetchText(REMOTE_AIRPORTS_URL), fetchText(REMOTE_COUNTRIES_URL)]);

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
  return airports
    .map((airport) => ({ airport, score: airportScore(airport, normalized) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => sortAirportMatches(a, b))
    .slice(0, 12)
    .map((entry) => ({
      ...entry.airport,
      matchScore: entry.score,
      label: `${airportCode(entry.airport)} ${entry.airport.city}, ${entry.airport.country} — ${entry.airport.name}`,
    }));
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
  const country = countriesByCode.get((row.iso_country || '').toUpperCase()) || row.iso_country || 'Unknown';
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
  return rawCity.split('(')[0].split(',')[0].trim();
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
  const tokens = allText.split(' ').map((token) => token.trim()).filter(Boolean);

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
  if (city === query || name === query) bonus += 12;
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
  if (Boolean(a.airport.iata) !== Boolean(b.airport.iata)) return Boolean(b.airport.iata) - Boolean(a.airport.iata);
  if ((a.airport.scheduledService === 'yes') !== (b.airport.scheduledService === 'yes')) {
    return Number(b.airport.scheduledService === 'yes') - Number(a.airport.scheduledService === 'yes');
  }
  const aTypePriority = getAirportTypePriority(a.airport.type);
  const bTypePriority = getAirportTypePriority(b.airport.type);
  if (aTypePriority !== bTypePriority) return bTypePriority - aTypePriority;

  const aQuality = airportQuality(a.airport);
  const bQuality = airportQuality(b.airport);
  if (aQuality !== bQuality) return bQuality - aQuality;

  return (a.airport.city || '').localeCompare(b.airport.city || '') ||
    (a.airport.name || '').localeCompare(b.airport.name || '');
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
  if (δ === 0) return [[lon1, lat1], [lon2, lat2]];
  const coordinates = [];
  for (let i = 0; i <= points; i += 1) {
    const f = i / points;
    const a = Math.sin((1 - f) * δ) / Math.sin(δ);
    const b = Math.sin(f * δ) / Math.sin(δ);
    const x = a * Math.cos(φ1) * Math.cos(λ1) + b * Math.cos(φ2) * Math.cos(λ2);
    const y = a * Math.cos(φ1) * Math.sin(λ1) + b * Math.cos(φ2) * Math.sin(λ2);
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
  const hav = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(Math.max(0, 1 - hav)));
}

function haversineDistanceKm(a, b) {
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const angle = haversineAngleRadians(φ1, toRad(lon1), φ2, toRad(lon2));
  return EARTH_RADIUS_KM * angle;
}

async function fetchNasaJson(url) {
  const { timeoutMs, retries } = await withNasaConfig();
  return fetchNasaJsonWithRetry(url, 1, timeoutMs, retries);
}

async function fetchNasaJsonWithRetry(url, attempt, timeoutMs, retries) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const payloadText = await response.text();
    let payload;
    try {
      payload = JSON.parse(payloadText);
    } catch (error) {
      const raw = payloadText.trim();
      const message = raw ? `Réponse NASA invalide (${raw.slice(0, 180)})` : 'Réponse NASA vide';
      const parseError = new Error(message);
      parseError.statusCode = response.status >= 200 && response.status < 300 ? 502 : response.status || 502;
      parseError.raw = raw;
      throw parseError;
    }
    if (!response.ok) {
      const message =
        payload?.error?.message ||
        payload?.msg ||
        payload?.reason ||
        (typeof payload?.reason === 'string' ? payload.reason.replace(/<[^>]*>/g, ' ') : '')
        || payload?.title ||
        payloadText.slice(0, 220) ||
        `Erreur HTTP ${response.status}`;
      const error = new Error(message);
      error.statusCode = response.status;
      error.raw = payloadText;
      throw error;
    }
    return payload;
  } catch (error) {
    const shouldRetry = attempt < retries + 1 && (error.name === 'AbortError' || isRetryableNasaError(error));
    if (shouldRetry) {
      const delayMs = 350 * attempt;
      await sleep(delayMs);
      return fetchNasaJsonWithRetry(url, attempt + 1, timeoutMs, retries);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function isRetryableNasaError(error) {
  if (!error || !Number.isFinite(error.statusCode)) return false;
  return [408, 429, 500, 502, 503, 504].includes(error.statusCode);
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

function sanitizeStatus(value, fallback = 'open') {
  const status = String(value || fallback).toLowerCase();
  if (status === 'open' || status === 'closed' || status === 'all') return status;
  return fallback;
}

function sanitizeDate(value, offsetDays = null) {
  const base = new Date();
  if (offsetDays !== null && Number.isFinite(offsetDays)) {
    base.setDate(base.getDate() + Number(offsetDays));
  }
  const parsed = value ? new Date(String(value)) : base;
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return base.toISOString().slice(0, 10);
}

function clampNasaDateRange(startDate, endDate, maxRangeDays = 7) {
  const now = new Date();
  const startCandidate = parseNasaDate(startDate) || offsetDate(now, -7);
  const endCandidate = parseNasaDate(endDate) || now;

  let start = startCandidate;
  let end = endCandidate;
  if (end.getTime() < start.getTime()) {
    const swap = start;
    start = end;
    end = swap;
  }

  const rangeMs = maxRangeDays - 1;
  const maxDistanceMs = rangeMs * 24 * 60 * 60 * 1000;
  if (end.getTime() - start.getTime() > maxDistanceMs) {
    end = new Date(start);
    end.setDate(start.getDate() + rangeMs);
  }

  return {
    safeStart: formatNasaDate(start),
    safeEnd: formatNasaDate(end),
  };
}

function parseNasaDate(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  const parsed = new Date(`${candidate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatNasaDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function offsetDate(referenceDate, offsetDays) {
  const date = new Date(referenceDate);
  date.setDate(date.getDate() + Number(offsetDays));
  return date;
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

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toFiniteNumber(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
