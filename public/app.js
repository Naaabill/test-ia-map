(() => {
  const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
  const API = '';

  const map = new maplibregl.Map({
    container: 'map',
    style: MAP_STYLE,
    center: [2.35, 48.85],
    zoom: 2,
    hash: false,
  });

  const fields = {
    from: {
      input: document.getElementById('from'),
      panel: document.getElementById('from-suggestions'),
      timer: null,
    },
    to: {
      input: document.getElementById('to'),
      panel: document.getElementById('to-suggestions'),
      timer: null,
    },
  };

  const drawButton = document.getElementById('draw');
  const status = document.getElementById('status');
  const distanceText = document.getElementById('distance');
  const durationText = document.getElementById('duration');
  const menuToggle = document.getElementById('menu-toggle');
  const menuClose = document.getElementById('menu-close');
  const drawer = document.getElementById('drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  const notificationButton = document.getElementById('notification-button');
  const apodDate = document.getElementById('apod-date');
  const openApod = document.getElementById('open-apod');
  const openEonet = document.getElementById('open-eonet');
  const openDonki = document.getElementById('open-donki');
  const openPower = document.getElementById('open-power');
  const openSsd = document.getElementById('open-ssd');
  const openNews = document.getElementById('open-news');
  const loadPower = document.getElementById('load-power');
  const powerControls = document.getElementById('power-controls');
  const powerLat = document.getElementById('power-lat');
  const powerLon = document.getElementById('power-lon');
  const powerStart = document.getElementById('power-start');
  const powerEnd = document.getElementById('power-end');
  const powerParams = document.getElementById('power-params');
  const nasaModal = document.getElementById('nasa-modal');
  const nasaModalTitle = document.getElementById('nasa-modal-title');
  const nasaModalBody = document.getElementById('nasa-modal-body');
  const nasaModalClose = document.getElementById('nasa-modal-close');

  const state = {
    from: 'CDG',
    to: 'JFK',
    suggestions: { from: [], to: [] },
    activeSuggestion: { from: -1, to: -1 },
  };

  map.on('load', () => {
    map.addSource('flight-route', {
      type: 'geojson',
      data: emptyLine(),
    });
    map.addSource('flight-airports', {
      type: 'geojson',
      data: emptyPoints(),
    });

    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'flight-route',
      paint: {
        'line-color': '#3d82f6',
        'line-width': 3,
        'line-opacity': 0.9,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
    });

    map.addLayer({
      id: 'airport-points',
      type: 'circle',
      source: 'flight-airports',
      paint: {
        'circle-radius': 6,
        'circle-color': '#f59e0b',
        'circle-stroke-color': '#111827',
        'circle-stroke-width': 2,
      },
    });

    fields.from.input.value = state.from;
    fields.to.input.value = state.to;
    powerStart.value = isoDateDaysAgo(7);
    powerEnd.value = isoDateDaysAgo(0);
    drawButton.click();
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  menuToggle.addEventListener('click', openDrawer);
  menuClose.addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);
  notificationButton.addEventListener('click', async () => {
    await showNasaNews();
  });
  nasaModalClose.addEventListener('click', hideModal);
  nasaModal.addEventListener('click', (event) => {
    if (event.target === nasaModal) {
      hideModal();
    }
  });

  openApod.addEventListener('click', async () => {
    await showApod();
  });
  openEonet.addEventListener('click', async () => {
    await showEonet();
  });
  openDonki.addEventListener('click', async () => {
    await showDonki();
  });
  openPower.addEventListener('click', () => {
    const wasOpen = powerControls.classList.contains('is-open');
    powerControls.classList.toggle('is-open', !wasOpen);
  });
  openNews.addEventListener('click', async () => {
    await showNasaNews();
  });
  openSsd.addEventListener('click', async () => {
    await showSsd();
  });
  loadPower.addEventListener('click', async () => {
    await showPower();
  });

  Object.entries(fields).forEach(([key, field]) => {
    field.input.value = state[key];

    field.input.addEventListener('input', () => {
      state[key] = field.input.value.trim();
      scheduleSuggestions(key);
    });

    field.input.addEventListener('focus', () => {
      scheduleSuggestions(key);
    });

    field.input.addEventListener('blur', () => {
      window.setTimeout(() => hideSuggestions(key), 150);
    });

    field.input.addEventListener('keydown', (event) => {
      handleKeyboardNavigation(key, event);
    });
  });

  Object.entries(fields).forEach(([key, field]) => {
    field.panel.addEventListener('click', (event) => {
      const button = event.target.closest('.autocomplete-item');
      if (!button) return;
      const code = button.dataset.code;
      const airport = state.suggestions[key].find((item) => getAirportDisplayCode(item) === code);
      if (!airport) return;
      applySelection(key, airport);
    });
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('.field')) return;
    hideSuggestions('from');
    hideSuggestions('to');
  });

  drawButton.addEventListener('click', async () => {
    const from = state.from.trim();
    const to = state.to.trim();

    if (!from || !to) {
      status.textContent = 'Renseigne un départ et une arrivée (IATA ou ville).';
      return;
    }

    status.textContent = 'Calcul de la route…';
    try {
      const response = await fetch(`${API}/api/route?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
        status.textContent = error.error || 'Erreur lors de la recherche.';
        return;
      }
      const data = await response.json();
      displayRoute(data);
      const fromCode = data.from.code || data.from.iata || data.from.icao || '';
      const toCode = data.to.code || data.to.iata || data.to.icao || '';
      status.textContent = `Route tracée: ${fromCode} → ${toCode}`;
    } catch (error) {
      status.textContent = `Erreur réseau: ${error.message}`;
    }
  });

  function openDrawer() {
    drawer.classList.add('is-open');
    backdrop.hidden = false;
    menuToggle.setAttribute('aria-expanded', 'true');
  }

  function closeDrawer() {
    drawer.classList.remove('is-open');
    backdrop.hidden = true;
    menuToggle.setAttribute('aria-expanded', 'false');
  }

  async function showApod() {
    showModal();
    nasaModalTitle.textContent = 'NASA APOD';
    nasaModalBody.innerHTML = '<p>Chargement…</p>';
    closeDrawer();

    try {
      const params = {};
      if (apodDate.value) params.date = apodDate.value;
      const apod = await fetchNasaJson('apod', params);
      const title = text(apod.title);
      const body = apod.explanation || '';
      const card = document.createElement('div');
      card.className = 'nasa-list';
      const titleRow = document.createElement('h3');
      titleRow.textContent = title;
      const meta = document.createElement('div');
      meta.className = 'nasa-meta';
      meta.textContent = `${apod.date || ''} · ${apod.mediaType || ''}`;
      const text = document.createElement('p');
      text.textContent = body;
      text.className = 'nasa-card p';
      card.appendChild(titleRow);
      card.appendChild(meta);

      if (apod.mediaType === 'image' && apod.url) {
        const image = document.createElement('img');
        image.className = 'nasa-media';
        image.src = apod.url;
        image.alt = title;
        card.appendChild(image);
      } else if (apod.url) {
        const link = document.createElement('a');
        link.href = apod.url;
        link.textContent = 'Ouvrir le média';
        link.target = '_blank';
        link.rel = 'noreferrer';
        card.appendChild(link);
      }

      card.appendChild(text);
      if (apod.copyright) {
        const credit = document.createElement('p');
        credit.className = 'nasa-meta';
        credit.textContent = `© ${apod.copyright}`;
        card.appendChild(credit);
      }

      nasaModalBody.replaceChildren(card);
    } catch (error) {
      nasaModalBody.replaceChildren(renderError(`APOD: ${error.message}`));
    }
  }

  async function showEonet() {
    showModal('Événements naturels (EONET)', '');
    nasaModalBody.innerHTML = '<p>Chargement…</p>';
    closeDrawer();
    try {
      const data = await fetchNasaJson('eonet', {
        days: '14',
        status: 'open',
        limit: '12',
      });
      const container = document.createElement('div');
      container.className = 'nasa-list';

      if (!Array.isArray(data.events) || !data.events.length) {
        container.appendChild(renderEmpty('Aucun événement naturel actif trouvé.'));
      } else {
        data.events.forEach((event) => {
          const card = document.createElement('div');
          card.className = 'nasa-card';
          const title = document.createElement('h3');
          title.textContent = text(event.title || `Événement ${event.id || ''}`);
          const meta = document.createElement('div');
          meta.className = 'nasa-meta';
          const closed = event.closed ? `Clos: ${event.closed}` : 'En cours';
          const categories = Array.isArray(event.categories)
            ? event.categories.map((c) => c.title).filter(Boolean).join(', ')
            : '';
          meta.textContent = `ID: ${event.id || 'N/A'} · ${closed}${categories ? ` · ${categories}` : ''}`;
          const sourceLink = document.createElement('a');
          sourceLink.href = event.link || '#';
          sourceLink.target = '_blank';
          sourceLink.rel = 'noreferrer';
          sourceLink.textContent = 'Voir la fiche';
          const desc = document.createElement('p');
          desc.textContent = text(event.description || '');

          card.appendChild(title);
          card.appendChild(meta);
          if (desc.textContent) card.appendChild(desc);
          card.appendChild(sourceLink);
          container.appendChild(card);
        });
      }
      nasaModalBody.replaceChildren(container);
    } catch (error) {
      nasaModalBody.replaceChildren(renderError(`EONET: ${error.message}`));
    }
  }

  async function showDonki() {
    showModal('DONKI', '');
    nasaModalBody.innerHTML = '<p>Chargement…</p>';
    closeDrawer();
    try {
      const end = isoDateDaysAgo(0);
      const start = isoDateDaysAgo(-14);
      const data = await fetchNasaJson('donki', {
        startDate: start,
        endDate: end,
      });
      const container = document.createElement('div');
      container.className = 'nasa-list';

      if (!Array.isArray(data.events) || !data.events.length) {
        container.appendChild(renderEmpty('Aucun événement DONKI sur la période.'));
      } else {
        data.events.forEach((entry) => {
          const card = document.createElement('div');
          card.className = 'nasa-card';
          const title = document.createElement('h3');
          title.textContent = text(entry.messageType || 'Notification');
          const meta = document.createElement('div');
          meta.className = 'nasa-meta';
          meta.textContent = `Publié: ${entry.messageIssueTime || 'N/A'}`;
          const body = document.createElement('p');
          body.textContent = text(entry.messageBody || entry.messageID || '');
          const link = document.createElement('a');
          link.href = entry.messageURL || '#';
          link.target = '_blank';
          link.rel = 'noreferrer';
          link.textContent = entry.messageURL ? 'Voir la notification officielle' : '';
          card.appendChild(title);
          card.appendChild(meta);
          if (body.textContent) card.appendChild(body);
          if (link.textContent) card.appendChild(link);
          container.appendChild(card);
        });
      }
      nasaModalBody.replaceChildren(container);
    } catch (error) {
      nasaModalBody.replaceChildren(renderError(`DONKI: ${error.message}`));
    }
  }

  async function showPower() {
    showModal('NASA POWER', '');
    nasaModalBody.innerHTML = '<p>Chargement…</p>';
    closeDrawer();
    powerControls.classList.add('is-open');

    const lat = Number.parseFloat(powerLat.value);
    const lon = Number.parseFloat(powerLon.value);
    const start = powerStart.value || isoDateDaysAgo(-7);
    const end = powerEnd.value || isoDateDaysAgo(0);
    const parameters = powerParams.value || 'T2M,WS10M,PS';

    try {
      const data = await fetchNasaJson('power', {
        lat: String(lat),
        lon: String(lon),
        start,
        end,
        parameters,
      });

      const container = document.createElement('div');
      container.className = 'nasa-list';
      const summary = document.createElement('div');
      summary.className = 'nasa-card';
      const heading = document.createElement('h3');
      heading.textContent = 'Points météo';
      const subtitle = document.createElement('div');
      subtitle.className = 'nasa-meta';
      subtitle.textContent = `Coordonnées ${data.properties?.latitude ?? lat}, ${data.properties?.longitude ?? lon} · ${data.properties?.start} → ${data.properties?.end}`;
      summary.appendChild(heading);
      summary.appendChild(subtitle);
      container.appendChild(summary);

      const params = data.properties?.parameters || [];
      const entries = Object.entries(data.data || {});
      if (!entries.length) {
        container.appendChild(renderEmpty('Aucune donnée retournée pour cette période.'));
      } else {
        entries.slice(0, 20).forEach(([param, values]) => {
          const card = document.createElement('div');
          card.className = 'nasa-card';
          const p = document.createElement('h3');
          p.textContent = text(param);
          const points = Object.entries(values || {})
            .slice(0, 15)
            .map(([date, value]) => `${date}: ${value}`);
          const c = document.createElement('p');
          c.textContent = points.join(' · ');
          if (!points.length) {
            c.textContent = 'Aucune valeur de la période.';
          }
          card.appendChild(p);
          card.appendChild(c);
          if (params.includes(param)) {
            const p2 = document.createElement('div');
            p2.className = 'nasa-meta';
            p2.textContent = `Paramètre demandé: ${param}`;
            card.appendChild(p2);
          }
          container.appendChild(card);
        });
      }
      if (params.length) {
        const selected = document.createElement('p');
        selected.className = 'nasa-meta';
        selected.textContent = `Paramètres demandés: ${params.join(', ')}`;
        container.prepend(selected);
      }
      nasaModalBody.replaceChildren(container);
    } catch (error) {
      nasaModalBody.replaceChildren(renderError(`NASA POWER: ${error.message}`));
    }
  }

  async function showSsd() {
    showModal('NASA SSD (Fireball)', '');
    nasaModalBody.innerHTML = '<p>Chargement…</p>';
    closeDrawer();
    try {
      const data = await fetchNasaJson('ssd', {
        limit: '10',
      });
      const container = document.createElement('div');
      container.className = 'nasa-list';

      if (!Array.isArray(data.events) || !data.events.length) {
        container.appendChild(renderEmpty('Aucun incident de fireball récent.'));
      } else {
        data.events.forEach((event) => {
          const card = document.createElement('div');
          card.className = 'nasa-card';
          const title = document.createElement('h3');
          title.textContent = text(`Impact ${event.date || ''}`.trim());
          const meta = document.createElement('div');
          meta.className = 'nasa-meta';
          meta.textContent = `Énergie: ${event.energy || 'N/A'} · Alt: ${event.alt || 'N/A'} km`;
          const body = document.createElement('p');
          body.textContent = text(
            `Latitude ${event.lat || 'N/A'} ${event['lat-dir'] || ''}, longitude ${event.lon || 'N/A'} ${event['lon-dir'] || ''}`,
          );
          card.appendChild(title);
          card.appendChild(meta);
          card.appendChild(body);
          container.appendChild(card);
        });
      }
      nasaModalBody.replaceChildren(container);
    } catch (error) {
      nasaModalBody.replaceChildren(renderError(`SSD: ${error.message}`));
    }
  }

  async function showNasaNews() {
    showModal('NASA News', '');
    nasaModalBody.innerHTML = '<p>Chargement…</p>';
    closeDrawer();
    try {
      const data = await fetchNasaJson('news', {
        per_page: '8',
      });
      const container = document.createElement('div');
      container.className = 'nasa-list';

      if (!Array.isArray(data.items) || !data.items.length) {
        container.appendChild(renderEmpty('Aucune actualité trouvée pour le moment.'));
      } else {
        data.items.forEach((item) => {
          const card = document.createElement('div');
          card.className = 'nasa-card';
          const title = document.createElement('h3');
          title.textContent = text(item.title);
          const meta = document.createElement('div');
          meta.className = 'nasa-meta';
          meta.textContent = item.date || '';
          const excerpt = document.createElement('p');
          excerpt.textContent = item.excerpt || '';
          const link = document.createElement('a');
          link.href = item.link;
          link.target = '_blank';
          link.rel = 'noreferrer';
          link.textContent = 'Lire sur nasa.gov';
          card.appendChild(title);
          card.appendChild(meta);
          if (excerpt.textContent) card.appendChild(excerpt);
          card.appendChild(link);
          container.appendChild(card);
        });
      }
      nasaModalBody.replaceChildren(container);
    } catch (error) {
      nasaModalBody.replaceChildren(renderError(`News: ${error.message}`));
    }
  }

  function showModal(title = '') {
    nasaModalTitle.textContent = title;
    nasaModal.hidden = false;
  }

  function hideModal() {
    nasaModal.hidden = true;
  }

  function renderError(message) {
    const card = document.createElement('div');
    card.className = 'nasa-card';
    const p = document.createElement('p');
    p.textContent = message;
    card.appendChild(p);
    return card;
  }

  function renderEmpty(message) {
    const card = document.createElement('div');
    card.className = 'nasa-card';
    const p = document.createElement('p');
    p.textContent = message;
    card.appendChild(p);
    return card;
  }

  function text(value) {
    return String(value || '');
  }

  async function fetchNasaJson(path, params = {}) {
    const query = new URLSearchParams(params);
    const response = await fetch(`${API}/api/nasa/${path}${query.toString() ? `?${query}` : ''}`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const message = payload.message || payload.error || `Erreur ${response.status}`;
      throw new Error(message);
    }

    return response.json();
  }

  async function scheduleSuggestions(key) {
    clearTimeout(fields[key].timer);
    fields[key].timer = setTimeout(() => loadSuggestions(key), 150);
  }

  async function loadSuggestions(key) {
    const query = fields[key].input.value.trim();
    if (!query) {
      hideSuggestions(key);
      return;
    }

    try {
      const response = await fetch(`${API}/api/airports?q=${encodeURIComponent(query)}`);
      if (!response.ok) return;
      const data = await response.json();
      state.suggestions[key] = data;
      state.activeSuggestion[key] = -1;
      renderSuggestions(key, data);
    } catch (_) {
      // ignore
    }
  }

  function renderSuggestions(key, suggestions) {
    const panel = fields[key].panel;
    panel.replaceChildren();

    if (!suggestions.length) {
      const empty = document.createElement('div');
      empty.className = 'autocomplete-empty';
      empty.textContent = 'Aucun aéroport trouvé';
      panel.appendChild(empty);
      panel.hidden = false;
      return;
    }

    suggestions.forEach((airport) => {
      const code = getAirportDisplayCode(airport);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'autocomplete-item';
      button.dataset.code = code;
      button.innerHTML = `<strong>${code}</strong> ${airport.city}, ${airport.country}<br><small>${airport.name}</small>`;
      panel.appendChild(button);
    });

    panel.hidden = false;
  }

  function handleKeyboardNavigation(key, event) {
    const panel = fields[key].panel;
    const suggestions = state.suggestions[key];
    if (panel.hidden || !suggestions.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      state.activeSuggestion[key] = Math.min(
        state.activeSuggestion[key] + 1,
        suggestions.length - 1,
      );
      paintActiveSuggestion(key);
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      state.activeSuggestion[key] = Math.max(state.activeSuggestion[key] - 1, 0);
      paintActiveSuggestion(key);
    }

    if (event.key === 'Enter') {
      const index = state.activeSuggestion[key];
      if (index < 0 || index >= suggestions.length) return;
      event.preventDefault();
      applySelection(key, suggestions[index]);
    }

    if (event.key === 'Escape') {
      hideSuggestions(key);
    }
  }

  function paintActiveSuggestion(key) {
    const items = fields[key].panel.querySelectorAll('.autocomplete-item');
    items.forEach((item) => item.classList.remove('is-active'));

    const activeIndex = state.activeSuggestion[key];
    if (activeIndex >= 0 && activeIndex < items.length) {
      items[activeIndex].classList.add('is-active');
      items[activeIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  function applySelection(key, airport) {
    const code = getAirportDisplayCode(airport);
    state[key] = code;
    fields[key].input.value = `${code} • ${airport.name}`;
    hideSuggestions(key);
    status.textContent = '';
  }

  function hideSuggestions(key) {
    fields[key].panel.hidden = true;
    fields[key].panel.replaceChildren();
    state.suggestions[key] = [];
    state.activeSuggestion[key] = -1;
  }

  function displayRoute(data) {
    const distanceKm = data.distanceKm;
    const durationHours = data.durationHours;
    const hours = Math.floor(durationHours);
    const minutes = Math.round((durationHours - hours) * 60);

    distanceText.textContent = `${distanceKm.toLocaleString('fr-FR')} km`;
    durationText.textContent = `${hours} h ${minutes} min`;

    const lineData = {
      type: 'Feature',
      properties: {},
      geometry: data.geometry,
    };
    const pointData = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { label: data.from.code || data.from.iata || data.from.icao || '' },
          geometry: {
            type: 'Point',
            coordinates: [data.from.lon, data.from.lat],
          },
        },
        {
          type: 'Feature',
          properties: { label: data.to.code || data.to.iata || data.to.icao || '' },
          geometry: {
            type: 'Point',
            coordinates: [data.to.lon, data.to.lat],
          },
        },
      ],
    };

    map.getSource('flight-route').setData({
      type: 'FeatureCollection',
      features: [lineData],
    });
    map.getSource('flight-airports').setData(pointData);

    const bounds = new maplibregl.LngLatBounds();
    data.geometry.coordinates.forEach((coord) => bounds.extend(coord));
    map.fitBounds(bounds, { padding: 60, duration: 700, maxZoom: 6 });
  }

  function getAirportDisplayCode(airport) {
    return airport.iata || airport.icao || airport.gps || airport.localCode || '';
  }

  function emptyLine() {
    return {
      type: 'FeatureCollection',
      features: [],
    };
  }

  function emptyPoints() {
    return {
      type: 'FeatureCollection',
      features: [],
    };
  }

  function isoDateDaysAgo(offsetDays = 0) {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    return date.toISOString().slice(0, 10);
  }
})();
