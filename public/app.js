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
  const drawer = document.getElementById('drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  const notificationButton = document.getElementById('notification-button');
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
  const dateInputElements = [powerStart, powerEnd];
  const mapOverlays = {
    markers: {
      wind: [],
      cloud: [],
      fire: [],
      events: [],
    },
  };
  let activeNasaPopup = null;
  let activeNasaLayerMode = 'none';

  const state = {
    from: 'CDG',
    to: 'JFK',
    suggestions: { from: [], to: [] },
    activeSuggestion: { from: -1, to: -1 },
  };
  const datePickerState = new Map();
  let activeDatePicker = null;

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

    map.addSource('nasa-weather', {
      type: 'geojson',
      data: emptyPoints(),
    });
    map.addSource('nasa-clouds', {
      type: 'geojson',
      data: emptyPoints(),
    });
    map.addSource('nasa-winds', {
      type: 'geojson',
      data: emptyPoints(),
    });
    map.addSource('nasa-events', {
      type: 'geojson',
      data: emptyPoints(),
    });

    map.addLayer({
      id: 'nasa-thermal-layer',
      type: 'circle',
      source: 'nasa-weather',
      paint: {
        'circle-color': [
          'interpolate',
          ['linear'],
          ['to-number', ['get', 'temperature'], 0],
          -50,
          '#0e3f84',
          -20,
          '#2e84df',
          0,
          '#2eccf8',
          15,
          '#ffe66b',
          30,
          '#ff9a3c',
          45,
          '#ff3d5f',
          60,
          '#7f0000',
        ],
        'circle-radius': ['coalesce', ['get', 'radius'], 16],
        'circle-opacity': 0.55,
        'circle-blur': 0.35,
        'circle-stroke-color': '#e2ecff',
        'circle-stroke-width': 2,
        'circle-stroke-opacity': 0.55,
      },
    });

    map.addLayer({
      id: 'nasa-cloud-layer',
      type: 'circle',
      source: 'nasa-clouds',
      paint: {
        'circle-color': 'rgba(230, 239, 255, 0.55)',
        'circle-radius': ['coalesce', ['get', 'radius'], 32],
        'circle-blur': 0.8,
        'circle-opacity': 0.75,
        'circle-stroke-color': 'rgba(255, 255, 255, 0.6)',
        'circle-stroke-width': 1,
      },
    });

    map.addLayer({
      id: 'nasa-wind-layer',
      type: 'circle',
      source: 'nasa-winds',
      paint: {
        'circle-color': 'rgba(117, 224, 255, 0.22)',
        'circle-radius': ['coalesce', ['get', 'radius'], 36],
        'circle-blur': 0.55,
        'circle-stroke-color': 'rgba(164, 240, 255, 0.7)',
        'circle-stroke-width': 2,
      },
    });

    map.addLayer({
      id: 'nasa-event-layer',
      type: 'symbol',
      source: 'nasa-events',
      layout: {
        'icon-allow-overlap': true,
        'text-allow-overlap': true,
        'text-field': ['get', 'symbol'],
        'text-size': 22,
        'text-font': ['Open Sans Bold', 'Noto Color Emoji', 'Arial Unicode MS', 'sans-serif'],
        'text-justify': 'center',
      },
      paint: {
        'text-color': [
          'match',
          ['get', 'kind'],
          'fire',
          '#ff4d5e',
          'donki',
          '#f59e0b',
          'wind',
          '#6de3ff',
          'cloud',
          'rgba(230, 230, 230, 0.95)',
          'eonet',
          '#f97316',
          '#4f7cdb',
        ],
        'text-halo-color': 'rgba(0,0,0,0.38)',
        'text-halo-width': 1.5,
      },
    });

    map.on('mouseenter', 'nasa-event-layer', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'nasa-event-layer', () => {
      map.getCanvas().style.cursor = '';
    });
    map.on('click', 'nasa-event-layer', (event) => {
      const feature = event.features?.[0];
      if (!feature) return;

      const properties = feature.properties || {};
      const title = toText(properties.title || properties.name || properties.kind || 'Événement');
      const details = toText(properties.details || properties.subtitle || properties.message || properties.description || '');
      const html = details
        ? `<strong>${title}</strong><br>${details}`
        : `<strong>${title}</strong><br>Plus d'information: clic sur la carte`;
      showNasaPopup(event.lngLat, html);
    });
    map.on('click', (event) => {
      const hit = map.queryRenderedFeatures(event.point, {
        layers: ['nasa-event-layer'],
      });
      if (hit.length) return;
      hideNasaPopup();
    });

    fields.from.input.value = state.from;
    fields.to.input.value = state.to;
    setDateValue(powerStart, isoDateDaysAgo(-7));
    setDateValue(powerEnd, isoDateDaysAgo(0));
    drawButton.click();
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  menuToggle.addEventListener('click', toggleDrawer);
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

  dateInputElements.forEach((input) => {
    initializeDateInput(input);
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
    if (!event.target.closest('.date-field')) {
      closeAllDatePickers();
    }
    hideSuggestions('from');
    hideSuggestions('to');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeAllDatePickers();
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

  function toggleDrawer() {
    const isOpen = drawer.classList.contains('is-open');
    if (isOpen) {
      closeDrawer();
    } else {
      drawer.classList.add('is-open');
      backdrop.hidden = false;
      menuToggle.setAttribute('aria-expanded', 'true');
    }
  }

  function closeDrawer() {
    drawer.classList.remove('is-open');
    backdrop.hidden = true;
    closeAllDatePickers();
    menuToggle.setAttribute('aria-expanded', 'false');
  }

  function showActiveNasaMode(nextMode) {
    clearNasaVisuals();
    activeNasaLayerMode = nextMode;
  }

  async function showEonet() {
    showModal('Événements naturels (EONET)', '');
    nasaModalBody.innerHTML = '<p>Chargement…</p>';
    closeDrawer();
    showActiveNasaMode('events');
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
        renderEonetOnMap(data.events);
        container.appendChild(renderInfoOnly('Clique sur un logo sur la carte pour voir les détails.'));
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
    showActiveNasaMode('events');
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
        renderDonkiOnMap(data.events);
        data.events.forEach((entry) => {
          const card = document.createElement('div');
          card.className = 'nasa-card';
          const title = document.createElement('h3');
          title.textContent = toText(entry.messageType || 'Notification');
          const meta = document.createElement('div');
          meta.className = 'nasa-meta';
          meta.textContent = `Publié: ${entry.messageIssueTime || 'N/A'}`;
          const body = document.createElement('p');
          body.textContent = toText(entry.messageBody || entry.messageID || '');
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
    showActiveNasaMode('weather');

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
      renderPowerOnMap(data, lat, lon);

      const params = data.properties?.parameters || [];
      const entries = Object.entries(data.data || {});
      if (!entries.length) {
        container.appendChild(renderEmpty('Aucune donnée retournée pour cette période.'));
      } else {
        entries.slice(0, 20).forEach(([param, values]) => {
          const card = document.createElement('div');
          card.className = 'nasa-card';
          const p = document.createElement('h3');
          p.textContent = toText(param);
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
    showActiveNasaMode('events');
    try {
      const data = await fetchNasaJson('ssd', {
        limit: '10',
      });
      const container = document.createElement('div');
      container.className = 'nasa-list';

      if (!Array.isArray(data.events) || !data.events.length) {
        container.appendChild(renderEmpty('Aucun incident de fireball récent.'));
      } else {
        renderSsdOnMap(data.events);
        data.events.forEach((event) => {
          const card = document.createElement('div');
          card.className = 'nasa-card';
          const title = document.createElement('h3');
          title.textContent = toText(`Impact ${event.date || ''}`.trim());
          const meta = document.createElement('div');
          meta.className = 'nasa-meta';
          meta.textContent = `Énergie: ${event.energy || 'N/A'} · Alt: ${event.alt || 'N/A'} km`;
          const body = document.createElement('p');
          body.textContent = toText(
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
    showActiveNasaMode('none');
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
          title.textContent = toText(item.title);
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

  function initializeDateInput(input) {
    const field = input.closest('.date-field');
    if (!field) return;

    const trigger = field.querySelector('.date-trigger');
    const popover = field.querySelector('.calendar-popover');
    if (!trigger || !popover) return;

    const picker = {
      input,
      popover,
      trigger,
      currentMonth: new Date(),
    };
    datePickerState.set(input, picker);

    const open = () => {
      const selected = parseDateInput(input.value);
      const sourceDate = selected || new Date();
      openDatePicker({
        input,
        popover,
        trigger,
        viewDate: new Date(sourceDate.getFullYear(), sourceDate.getMonth(), 1),
      });
    };

    trigger.addEventListener('click', () => {
      if (!activeDatePicker || activeDatePicker.input !== input) {
        closeAllDatePickers();
        open();
      } else {
        closeAllDatePickers();
      }
    });

    input.addEventListener('focus', (event) => {
      event.preventDefault();
      open();
    });
  }

  function openDatePicker({ input, popover, trigger, viewDate }) {
    const picker = datePickerState.get(input);
    const selected = parseDateInput(input.value);
    const monthDate = viewDate || picker?.currentMonth || new Date();
    const month = monthDate.getMonth();
    const year = monthDate.getFullYear();
    const today = new Date();
    const firstWeekDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstGridOffset = (firstWeekDay + 6) % 7;

    popover.innerHTML = '';
    popover.hidden = false;
    popover.setAttribute('aria-hidden', 'false');
    trigger.setAttribute('aria-expanded', 'true');

    const header = document.createElement('div');
    header.className = 'calendar-header';
    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'icon-button';
    prev.textContent = '‹';
    prev.addEventListener('click', () => {
      openDatePicker({
        input,
        popover,
        trigger,
        viewDate: new Date(year, month - 1, 1),
      });
    });
    const monthLabel = document.createElement('div');
    monthLabel.className = 'calendar-month';
    monthLabel.textContent = new Intl.DateTimeFormat('fr-FR', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(year, month, 1));
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'icon-button';
    next.textContent = '›';
    next.addEventListener('click', () => {
      openDatePicker({
        input,
        popover,
        trigger,
        viewDate: new Date(year, month + 1, 1),
      });
    });

    const weekdays = document.createElement('div');
    weekdays.className = 'calendar-weekdays';
    ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach((dayLetter) => {
      const day = document.createElement('div');
      day.className = 'calendar-weekday';
      day.textContent = dayLetter;
      weekdays.appendChild(day);
    });

    const grid = document.createElement('div');
    grid.className = 'calendar-grid';
    for (let i = 0; i < firstGridOffset; i += 1) {
      const spacer = document.createElement('div');
      spacer.className = 'calendar-empty';
      grid.appendChild(spacer);
    }

    for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
      const dayDate = new Date(year, month, dayNumber);
      const dateText = formatDateInput(dayDate);
      const dayButton = document.createElement('button');
      dayButton.type = 'button';
      dayButton.className = 'calendar-day';
      dayButton.textContent = String(dayNumber);
      dayButton.dataset.date = dateText;

      if (selected && isSameDate(selected, dayDate)) {
        dayButton.classList.add('is-selected');
      }
      if (isSameDate(today, dayDate)) {
        dayButton.classList.add('is-today');
      }

      dayButton.addEventListener('click', () => {
        setDateValue(input, dateText);
        closeAllDatePickers();
      });
      grid.appendChild(dayButton);
    }

    header.appendChild(prev);
    header.appendChild(monthLabel);
    header.appendChild(next);
    popover.appendChild(header);
    popover.appendChild(weekdays);
    popover.appendChild(grid);

    if (picker) {
      picker.currentMonth = monthDate;
    }

    activeDatePicker = { input, popover, trigger };
  }

  function closeAllDatePickers() {
    if (!activeDatePicker) return;
    activeDatePicker.popover.hidden = true;
    activeDatePicker.popover.setAttribute('aria-hidden', 'true');
    activeDatePicker.trigger.setAttribute('aria-expanded', 'false');
    activeDatePicker = null;
  }

  function setDateValue(input, value) {
    input.value = value;
  }

  function parseDateInput(rawValue) {
    const value = String(rawValue || '').trim();
    if (!value) return null;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  function formatDateInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function isSameDate(a, b) {
    return (
      a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate()
    );
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

  function toText(value) {
    return String(value || '');
  }

  function renderInfoOnly(message) {
    const card = document.createElement('div');
    card.className = 'nasa-info';
    card.textContent = message;
    return card;
  }

  function clearNasaVisuals() {
    hideNasaPopup();
    ['wind', 'cloud', 'fire'].forEach((type) => {
      (mapOverlays.markers[type] || []).forEach((marker) => marker.remove());
      mapOverlays.markers[type] = [];
    });
    (mapOverlays.markers.events || []).forEach((marker) => marker.remove());
    mapOverlays.markers.events = [];

    if (map.getSource('nasa-weather')?.setData) {
      map.getSource('nasa-weather').setData(emptyPoints());
    }
    if (map.getSource('nasa-clouds')?.setData) {
      map.getSource('nasa-clouds').setData(emptyPoints());
    }
    if (map.getSource('nasa-winds')?.setData) {
      map.getSource('nasa-winds').setData(emptyPoints());
    }
    if (map.getSource('nasa-events')?.setData) {
      map.getSource('nasa-events').setData(emptyPoints());
    }
  }

  function addNasaMarker(type, lngLat, options = {}) {
    const markerElement = document.createElement('div');
    markerElement.className = `nasa-overlay-marker nasa-overlay-marker--${type}`;
    if (options.variant) {
      markerElement.classList.add(`nasa-overlay-marker--${options.variant}`);
    }
    if (options.angle !== undefined) {
      markerElement.style.setProperty('--nasa-angle', `${options.angle}deg`);
    }

    const icon = document.createElement('div');
    icon.className = 'nasa-overlay-icon';
    icon.textContent = options.icon || '•';
    markerElement.appendChild(icon);

    if (options.speed !== undefined || options.value !== undefined) {
      const label = document.createElement('div');
      label.className = 'nasa-overlay-label';
      label.textContent = `${options.value ?? ''}${options.unit ? options.unit : ''}`.trim();
      markerElement.appendChild(label);
    }

    if (options.rain) {
      const rain = document.createElement('div');
      rain.className = 'nasa-overlay-rain';
      for (let i = 0; i < 4; i += 1) {
        const drop = document.createElement('span');
        drop.className = 'nasa-overlay-drop';
        drop.style.left = `${4 + i * 9}px`;
        drop.style.animationDelay = `${i * 0.25}s`;
        rain.appendChild(drop);
      }
      markerElement.appendChild(rain);
    }

    const marker = new maplibregl.Marker({
      element: markerElement,
      anchor: 'center',
    }).setLngLat(lngLat).addTo(map);

    if (options.popup) {
      markerElement.classList.add('nasa-overlay-marker--clickable');
      markerElement.style.cursor = 'pointer';
      markerElement.addEventListener('click', (event) => {
        event.stopPropagation();
        showNasaPopup(lngLat, options.popup);
      });
    }

    if (!mapOverlays.markers[type]) mapOverlays.markers[type] = [];
    mapOverlays.markers[type].push(marker);
  }

  function showNasaPopup(lngLat, htmlContent) {
    if (!map?.addControl) return;
    hideNasaPopup();
    activeNasaPopup = new maplibregl.Popup({ closeButton: false })
      .setLngLat(lngLat)
      .setHTML(htmlContent)
      .addTo(map);
  }

  function hideNasaPopup() {
    if (activeNasaPopup) {
      activeNasaPopup.remove();
      activeNasaPopup = null;
    }
  }

  function getLatestValue(entryMap) {
    if (!entryMap || typeof entryMap !== 'object') return null;

    const values = Object.entries(entryMap)
      .sort(([dateA], [dateB]) => String(dateA).localeCompare(String(dateB)))
      .map(([, value]) => Number.parseFloat(value))
      .filter((value) => Number.isFinite(value));
    if (!values.length) return null;
    return values[values.length - 1];
  }

  function getLatestValueByAliases(parameters = {}, aliases = []) {
    if (!parameters || typeof parameters !== 'object') return null;

    for (const alias of aliases) {
      const value = getLatestValue(parameters[alias]);
      if (Number.isFinite(value)) return value;
    }
    return null;
  }

  function parseNasaNumber(value) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return null;
    if (parsed === -999 || parsed === -9999 || parsed === 999 || parsed === 9999 || parsed === -99999 || parsed === 99999) {
      return null;
    }
    return parsed;
  }

  function parseDirectionValue(value, direction) {
    const parsed = parseNasaNumber(value);
    if (!Number.isFinite(parsed)) return null;

    const sign = String(direction || '').toUpperCase().trim();
    if (sign === 'S' || sign === 'W') return -parsed;
    if (sign === 'N' || sign === 'E') return parsed;
    return parsed;
  }

  function pickEventPoint(event) {
    const geometries = Array.isArray(event.geometry) ? event.geometry : [];
    for (const geometry of geometries) {
      if (!geometry || !Array.isArray(geometry.coordinates)) continue;

      const point = pickCoordinatesFromShape(geometry.coordinates);
      if (point && Number.isFinite(point[0]) && Number.isFinite(point[1])) {
        return point;
      }
    }

    const maybeLat = parseDirectionValue(event.lat, event['lat-dir']);
    const maybeLon = parseDirectionValue(event.lon, event['lon-dir']);
    if (Number.isFinite(maybeLat) && Number.isFinite(maybeLon)) {
      return [maybeLon, maybeLat];
    }
    return null;
  }

  function pickCoordinatesFromShape(shape) {
    if (!Array.isArray(shape)) return null;
    const first = parseNasaNumber(shape[0]);
    const second = parseNasaNumber(shape[1]);
    if (shape.length >= 2 && Number.isFinite(first) && Number.isFinite(second)) {
      return [first, second];
    }
    for (const value of shape) {
      const nested = pickCoordinatesFromShape(value);
      if (nested) return nested;
    }
    return null;
  }

  function renderEonetOnMap(events = []) {
    if (!Array.isArray(events) || !events.length) return;

    const features = events
      .map((event) => {
        const coordinates = pickEventPoint(event);
        if (!coordinates) return null;

        const name = event.title || event.id || 'Événement';
        const categories = Array.isArray(event.categories)
          ? event.categories.map((category) => category.title).filter(Boolean).join(', ')
          : '';
        const closed = event.closed ? `Clos: ${event.closed}` : 'En cours';
        const subtitle = `${closed}${categories ? ` · ${categories}` : ''}`;
        const source = event.link ? `<a href="${event.link}" target="_blank" rel="noreferrer">Voir la fiche</a>` : '';
        const description = [
          toText(event.description),
          subtitle,
          toText(source),
        ]
          .filter(Boolean)
          .join(' · ');

        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates,
          },
          properties: {
            kind: 'eonet',
            title: name,
            details: description,
            symbol: '🌋',
            radius: 11,
          },
        };
      })
      .filter(Boolean);

    if (!features.length) return;

    map.getSource('nasa-events').setData({
      type: 'FeatureCollection',
      features,
    });
    focusOnNasaFeatures(features);
  }

  function renderDonkiOnMap(events = []) {
    if (!Array.isArray(events) || !events.length) return;

    const visible = events
      .map((entry) => {
        const title = toText(entry.messageType || 'Notification');
        const subtitle = [
          toText(entry.messageID),
          toText(entry.messageIssueTime ? `Publié: ${entry.messageIssueTime}` : ''),
          toText(entry.messageBody),
        ]
          .filter(Boolean)
          .join(' · ');
        const coords = pickEventPoint(entry);

        if (!coords) {
          return null;
        }
        return {
          coords,
          title,
          subtitle,
        };
      })
      .filter(Boolean);

    if (!visible.length) {
      const count = events.length;
      const center = map.getCenter();
      map.getSource('nasa-events').setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [center.lng, center.lat],
            },
            properties: {
              kind: 'donki',
              title: 'Notifications DONKI',
              subtitle: `${count} notification(s) sans coordonnées`,
              details: `${count} notification(s) sans coordonnées`,
              symbol: '☄',
              radius: 12,
            },
          },
        ],
      });
      return;
    }

    map.getSource('nasa-events').setData({
      type: 'FeatureCollection',
      features: visible.map((entry) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: entry.coords,
        },
        properties: {
          kind: 'donki',
          title: entry.title,
          subtitle: entry.subtitle,
          details: entry.subtitle,
          symbol: '☄',
          radius: 12,
        },
      })),
    });
    focusOnNasaFeatures(visible.map((entry) => ({
      geometry: { coordinates: entry.coords },
    })));
  }

  function renderSsdOnMap(events = []) {
    if (!Array.isArray(events) || !events.length) return;

    const features = [];
    events.forEach((event) => {
      const lat = parseDirectionValue(event.lat, event['lat-dir']);
      const lon = parseDirectionValue(event.lon, event['lon-dir']);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const energy = parseNasaNumber(event.energy);
      const alt = parseNasaNumber(event.alt);
      const subtitle = `Énergie ${energy != null ? `${energy} kt` : 'N/A'} · Alt ${alt != null ? `${alt} km` : 'N/A'}`;

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [lon, lat],
        },
        properties: {
          kind: 'fire',
          title: `Impact ${event.date || ''}`.trim(),
          subtitle,
          symbol: '🔥',
          radius: 10 + Math.min(10, Number.isFinite(energy) ? energy / 8 : 0),
        },
      });

      addNasaMarker('fire', [lon, lat], {
        icon: '🔥',
        value: energy,
        unit: 'kT',
      });
    });

    map.getSource('nasa-events').setData({
      type: 'FeatureCollection',
      features,
    });
    if (features.length) {
      focusOnNasaFeatures(features);
    }
  }

  function renderPowerOnMap(data = {}, fallbackLat = null, fallbackLon = null) {
    const lat = Number.isFinite(Number(data?.properties?.latitude))
      ? Number(data.properties.latitude)
      : Number.isFinite(fallbackLat)
        ? fallbackLat
        : 0;
    const lon = Number.isFinite(Number(data?.properties?.longitude))
      ? Number(data.properties.longitude)
      : Number.isFinite(fallbackLon)
        ? fallbackLon
        : 0;

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const params = data?.data || {};
    const thermal = getLatestValueByAliases(params, [
      'T2M',
      'T2M_MAX',
      'T2M_MIN',
      'T10M',
      'T2MDEW',
    ]);
    const wind = getLatestValueByAliases(params, ['WS10M', 'WS10M_MAX', 'WS50M', 'WS2M', 'WSP']);
    const windDir = getLatestValueByAliases(params, ['WD10M', 'WD50M', 'WD2M', 'WDP']);
    const cloud = getLatestValueByAliases(params, [
      'TCCL',
      'TCC',
      'CC',
      'CLC',
      'CLOUD',
      'CLOUD_AMT',
      'CLD',
      'TCLD',
    ]);
    const pressure = getLatestValueByAliases(params, ['PS', 'PSL', 'PRES', 'PRECTOTCORR']);

    if (thermal != null) {
      map.getSource('nasa-weather').setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [lon, lat],
            },
            properties: {
              temperature: thermal,
              radius: Math.max(16, Math.min(52, 16 + Math.abs(thermal) * 0.5)),
              kind: 'temperature',
            },
          },
        ],
      });

      if (pressure != null) {
        showNasaPopup(
          [lon, lat],
          `<strong>Météo POWER</strong><br>Température: ${thermal} °C · Pression: ${pressure} hPa`,
        );
      }
    }

    if (wind != null) {
      const windDirection = Number.isFinite(windDir) ? ((windDir % 360) + 360) % 360 : 0;
      map.getSource('nasa-winds').setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [lon, lat],
            },
            properties: {
              kind: 'wind',
              radius: Math.max(26, Math.min(50, 26 + wind * 1.5)),
              windSpeed: wind,
              symbol: '🌬',
            },
          },
        ],
      });

      addNasaMarker('wind', [lon, lat], {
        icon: '↑',
        value: wind,
        unit: 'm/s',
        angle: windDirection - 90,
      });
    }

    if (cloud != null) {
      const intensity = Math.max(20, Math.min(68, cloud));
      const isRain = cloud >= 60;
      map.getSource('nasa-clouds').setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [lon, lat],
            },
            properties: {
              kind: 'cloud',
              radius: intensity * 0.65,
              cloud: cloud,
              symbol: isRain ? '🌧' : '☁',
              title: `Nuages: ${cloud}%`,
              details: isRain
                ? `Couv. nuageuse élevée (${cloud}%). Conditions de pluie probables.`
                : `Couvercle nuageux: ${cloud}%`,
            },
          },
        ],
      });

      addNasaMarker('cloud', [lon, lat], {
        icon: isRain ? '🌧' : '☁',
        value: cloud,
        unit: '%',
        variant: isRain ? 'cloud-rain' : 'cloud',
        rain: isRain,
        popup: isRain
          ? `<strong>Météo POWER</strong><br>Couvercle nuageux: ${cloud}% avec pluie probable.`
          : `<strong>Météo POWER</strong><br>Couvercle nuageux: ${cloud}%`,
      });
    }

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      focusOnNasaCoordinates([lon, lat], 6);
    }
  }

  function focusOnNasaFeatures(features = []) {
    const points = features
      .filter((feature) => feature?.geometry?.coordinates?.length === 2)
      .map((feature) => feature.geometry.coordinates);
    if (!points.length) return;

    const bounds = new maplibregl.LngLatBounds();
    points.forEach((point) => bounds.extend(point));

    if (points.length === 1) {
      focusOnNasaCoordinates(bounds.getCenter().toArray(), 6);
      return;
    }

    map.fitBounds(bounds, { padding: 90, duration: 650, maxZoom: 7 });
  }

  function focusOnNasaCoordinates(position, zoom = 6) {
    if (!Array.isArray(position) || position.length < 2) return;
    map.flyTo({
      center: position,
      zoom: Math.max(map.getZoom() || 2, zoom),
      duration: 650,
    });
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
