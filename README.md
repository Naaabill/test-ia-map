# Atlas Vols (OpenFreeMap + Node.js)

Petit MVP pour afficher une carte mondiale (OpenFreeMap) et tracer des trajets aériens entre
des aéroports à partir de codes IATA/ICAO/villes, avec intégration NASA dans une popup.

## Stack

- **Frontend**: HTML/CSS/JS + [MapLibre GL JS](https://maplibre.org/)
- **Backend**: [Express](https://expressjs.com/) (Node.js)
- **Source aéroports**: `OurAirports` (fichier CSV public chargé au démarrage:
  `airports.csv` + `countries.csv`)
- **NASA APIs**: proxy backend via `/api/nasa/*` avec clé dans `.env`.

## Lancer le projet

```bash
npm install
npm start
```

Puis ouvrir :

```
http://localhost:3000
```

## Variables d’environnement

Copie `.env.example` vers `.env` et renseigne ton clé.

```bash
cp .env.example .env
```

Le backend lit :

- `NASA_API_KEY` (recommandé pour APOD / DONKI),
- `PORT` (optionnel),
- `NASA_REQUEST_TIMEOUT_MS` (optionnel),
- `REMOTE_AIRPORTS_URL`, `REMOTE_COUNTRIES_URL` (optionnel).

## API disponibles

- `GET /api/airports?q=par` → recherche d’aéroports
- `GET /api/route?from=CDG&to=JFK` → itinéraire + distance + durée estimée
- `GET /health` → état service
- `GET /api/nasa/apod?date=2026-06-15`
- `GET /api/nasa/eonet?days=14&status=open&limit=12`
- `GET /api/nasa/power?lat=48.85&lon=2.35&start=20260101&end=20260116&parameters=T2M,WS10M`
- `GET /api/nasa/donki?startDate=2026-06-01&endDate=2026-06-16`
- `GET /api/nasa/ssd?limit=10`
- `GET /api/nasa/news?per_page=8`

`POWER` attend des dates au format NASA (`YYYYMMDD`, sans tirets).

## UI actuelle

- Menu burger en haut à gauche (panel custom, pas de `<select>` natif),
- carte full screen OpenFreeMap,
- panel route (départ/arrivée) + route aérienne,
- bouton notification (`🔔`) en haut à droite,
- popup central réutilisable pour APOD, événements naturels, POWER, DONKI, SSD, News.

## Note

`NEWS` est proxifié depuis le flux WordPress public `https://www.nasa.gov/wp-json/wp/v2/posts` (pas de clé NASA requise).

Le mode sans clé (`DEMO_KEY`) fonctionne mais a des limites strictes (`APOD` et `DONKI` peuvent être limités plus vite).
