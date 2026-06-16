(() => {
  const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

  const map = new maplibregl.Map({
    container: 'map',
    style: MAP_STYLE,
    center: [2.35, 48.85],
    zoom: 2,
    hash: false,
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-right');
})();
