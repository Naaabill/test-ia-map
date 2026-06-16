import Head from 'next/head';
import Script from 'next/script';

export default function Home() {
  return (
    <>
      <Head>
        <title>Atlas Vols + OpenFreeMap</title>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="stylesheet" href="https://unpkg.com/maplibre-gl/dist/maplibre-gl.css" />
        <link rel="stylesheet" href="/style.css" />
      </Head>

      <button
        id="menu-toggle"
        className="icon-button menu-button"
        aria-label="Ouvrir/fermer le menu"
        aria-expanded="false"
      >
        <span aria-hidden="true">☰</span>
      </button>

      <button
        id="notification-button"
        className="icon-button notification-button"
        aria-label="Menu notifications NASA"
      >
        <span aria-hidden="true">🔔</span>
      </button>

      <div id="drawer-backdrop" className="drawer-backdrop" hidden />

      <div id="drawer" className="drawer">
        <aside className="panel">
          <div className="panel-header">
            <h1>Vols monde</h1>
          </div>
          <p className="subtitle">
            Carte OpenFreeMap + itinéraire aérien géodésique entre deux aéroports.
          </p>
          <label htmlFor="from">Départ (IATA ou ville)</label>
          <div className="field">
            <input id="from" placeholder="CDG, CDG ou Paris" autoComplete="off" />
            <div className="autocomplete" id="from-suggestions" hidden />
          </div>
          <label htmlFor="to">Arrivée (IATA ou ville)</label>
          <div className="field">
            <input id="to" placeholder="JFK, New York..." autoComplete="off" />
            <div className="autocomplete" id="to-suggestions" hidden />
          </div>
          <button id="draw">Tracer la route</button>
          <p id="status" className="status">Choisis deux aéroports pour tracer.</p>
          <div className="metrics">
            <div><strong>Distance</strong><span id="distance">—</span></div>
            <div><strong>Durée estimée</strong><span id="duration">—</span></div>
          </div>

          <hr className="divider" />
          <div className="section-title">Observations NASA</div>
          <div className="nasa-row">
            <button id="open-eonet" type="button">Événements naturels</button>
            <button id="open-donki" type="button">DONKI</button>
          </div>
          <div className="nasa-row">
            <button id="open-power" type="button">NASA POWER</button>
            <button id="open-news" type="button">News</button>
          </div>
          <div id="power-controls" className="power-controls">
            <label htmlFor="power-lat">Lat</label>
            <input id="power-lat" type="number" step="0.01" defaultValue="48.85" />
            <label htmlFor="power-lon">Lon</label>
            <input id="power-lon" type="number" step="0.01" defaultValue="2.35" />
            <label htmlFor="power-start">Début</label>
            <div className="date-field" data-date-field="power-start">
              <input id="power-start" type="text" readOnly />
              <button
                type="button"
                className="icon-button date-trigger"
                aria-label="Choisir une date de début"
                aria-expanded="false"
              >
                📅
              </button>
              <div className="calendar-popover" hidden aria-hidden="true" />
            </div>
            <label htmlFor="power-end">Fin</label>
            <div className="date-field" data-date-field="power-end">
              <input id="power-end" type="text" readOnly />
              <button
                type="button"
                className="icon-button date-trigger"
                aria-label="Choisir une date de fin"
                aria-expanded="false"
              >
                📅
              </button>
              <div className="calendar-popover" hidden aria-hidden="true" />
            </div>
            <label htmlFor="power-params">Params</label>
            <input id="power-params" defaultValue="T2M,WS10M,PS" />
            <button id="load-power" type="button">Charger POWER</button>
          </div>
          <button id="open-ssd" type="button">SSD (Fireballs)</button>
        </aside>
      </div>

      <section id="nasa-modal" className="nasa-modal" hidden>
        <article className="nasa-modal__card">
          <header className="nasa-modal__header">
            <h2 id="nasa-modal-title" />
            <button id="nasa-modal-close" className="icon-button" aria-label="Fermer le panneau">×</button>
          </header>
          <div id="nasa-modal-body" className="nasa-modal__body">
            <p>Chargement…</p>
          </div>
        </article>
      </section>

      <main id="map" />

      <Script
        src="https://unpkg.com/maplibre-gl/dist/maplibre-gl.js"
        strategy="beforeInteractive"
      />
      <Script src="/app.js" strategy="afterInteractive" />
    </>
  );
}
