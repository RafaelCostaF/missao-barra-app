// Mapa da versão web (prévia de layout e vídeo de demonstração): Leaflet com a mesma API usada do react-native-maps.
// O app no celular continua usando react-native-maps; isto só entra no bundle web (metro.config.js).
const React = require('react');
const { View } = require('react-native');
const { createPortal } = require('react-dom');
const L = require('leaflet');
require('leaflet/dist/leaflet.css');

const Ctx = React.createContext(null);
const ll = (c) => [c.latitude, c.longitude];
const zoomOf = (delta) => Math.max(3, Math.min(18, Math.round(Math.log2(360 / Math.max(delta || 0.1, 1e-4)))));
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const MapView = React.forwardRef(function MapView(props, ref) {
  const { style, children, initialRegion, showsUserLocation } = props;
  const el = React.useRef(null);
  const cb = React.useRef(props);
  const [map, setMap] = React.useState(null);
  React.useEffect(() => { cb.current = props; });

  React.useEffect(() => {
    const m = L.map(el.current, { zoomControl: false, attributionControl: false, zoomSnap: 0.25 });
    L.tileLayer(TILES, { maxZoom: 19 }).addTo(m);
    const r = initialRegion || { latitude: -12.985, longitude: -38.44, latitudeDelta: 0.15 };
    m.setView(ll(r), zoomOf(r.latitudeDelta));
    m.on('dragstart', () => cb.current.onPanDrag && cb.current.onPanDrag());
    m.on('moveend', () => cb.current.onRegionChangeComplete && cb.current.onRegionChangeComplete());
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    setMap(m);
    return () => { ro.disconnect(); m.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ponto azul + onUserLocationChange a partir da geolocalização do navegador.
  React.useEffect(() => {
    if (!map || !showsUserLocation || !navigator.geolocation) return undefined;
    let dot = null, halo = null;
    const id = navigator.geolocation.watchPosition((p) => {
      const pos = [p.coords.latitude, p.coords.longitude];
      if (!dot) {
        halo = L.circleMarker(pos, { radius: 18, stroke: false, fillColor: '#1A73E8', fillOpacity: 0.15, interactive: false }).addTo(map);
        dot = L.circleMarker(pos, { radius: 8, color: '#fff', weight: 3, fillColor: '#1A73E8', fillOpacity: 1, interactive: false }).addTo(map);
      } else { dot.setLatLng(pos); halo.setLatLng(pos); }
      dot.bringToFront();
      const f = cb.current.onUserLocationChange;
      if (f) f({ nativeEvent: { coordinate: { latitude: pos[0], longitude: pos[1], heading: p.coords.heading, speed: p.coords.speed } } });
    }, () => {}, { enableHighAccuracy: true, maximumAge: 0 });
    return () => { navigator.geolocation.clearWatch(id); if (dot) { dot.remove(); halo.remove(); } };
  }, [map, showsUserLocation]);

  React.useImperativeHandle(ref, () => ({
    // setView animado (flyTo do Leaflet gera NaN quando origem = destino).
    animateCamera(cam, o) { if (map && cam.center) map.setView(ll(cam.center), cam.zoom || map.getZoom(), { animate: true, duration: Math.max(0.05, ((o && o.duration) || 500) / 1000) }); },
    setCamera(cam) { if (map && cam.center) map.setView(ll(cam.center), cam.zoom || map.getZoom(), { animate: false }); },
    animateToRegion(r, d) { if (map) map.setView(ll(r), zoomOf(r.latitudeDelta), { animate: (d || 0) > 0 }); },
    fitToCoordinates(pts, o) {
      if (!map || !pts.length) return;
      const e = (o && o.edgePadding) || {};
      map.fitBounds(L.latLngBounds(pts.map(ll)), { paddingTopLeft: [e.left || 30, e.top || 30], paddingBottomRight: [e.right || 30, e.bottom || 30], animate: !(o && o.animated === false) });
    },
    async getCamera() { const c = map.getCenter(); return { center: { latitude: c.lat, longitude: c.lng }, zoom: map.getZoom(), heading: 0, pitch: 0 }; },
  }), [map]);

  return React.createElement(View, { style: [{ overflow: 'hidden' }, style] },
    React.createElement('div', { ref: el, style: { position: 'absolute', inset: 0, background: '#e9e5dc' } }),
    map ? React.createElement(Ctx.Provider, { value: map }, children) : null);
});

const Marker = React.forwardRef(function Marker(props, ref) {
  const { coordinate, children, title, description, pinColor, zIndex, opacity, onCalloutPress } = props;
  const map = React.useContext(Ctx);
  const [box] = React.useState(() => {
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;left:0;top:0;transform:translate(-50%,-50%);';
    return d;
  });
  const mk = React.useRef(null);
  const pin = () => L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9],
    html: `<div style="width:14px;height:14px;border-radius:7px;background:${pinColor || '#C93C05'};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>` });
  React.useEffect(() => {
    if (!map) return undefined;
    const icon = children ? L.divIcon({ className: '', html: box, iconSize: [0, 0] }) : pin();
    const m = L.marker(ll(coordinate), { icon, zIndexOffset: (zIndex || 0) * 100, opacity: opacity == null ? 1 : opacity, interactive: props.tappable !== false }).addTo(map);
    if (title) {
      m.bindPopup(`<b>${title}</b>${description ? `<br>${description}` : ''}`, { closeButton: false });
      m.on('popupopen', (e) => { const n = e.popup.getElement(); if (n && onCalloutPress) n.onclick = () => onCalloutPress(); });
    }
    mk.current = m;
    return () => m.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  React.useEffect(() => { if (mk.current) mk.current.setLatLng(ll(coordinate)); }, [coordinate.latitude, coordinate.longitude]);
  React.useEffect(() => { if (mk.current) mk.current.setOpacity(opacity == null ? 1 : opacity); }, [opacity]);
  React.useEffect(() => { if (mk.current && !children) mk.current.setIcon(pin()); }, [pinColor]); // eslint-disable-line
  React.useImperativeHandle(ref, () => ({ showCallout() { if (mk.current) mk.current.openPopup(); }, hideCallout() { if (mk.current) mk.current.closePopup(); } }), []);
  return children ? createPortal(children, box) : null;
});

function Polyline({ coordinates, strokeColor, strokeWidth, lineDashPattern }) {
  const map = React.useContext(Ctx);
  const line = React.useRef(null);
  React.useEffect(() => {
    if (!map) return undefined;
    line.current = L.polyline([], { interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(map);
    return () => line.current.remove();
  }, [map]);
  React.useEffect(() => {
    if (!line.current) return;
    line.current.setLatLngs(coordinates.map(ll));
    line.current.setStyle({ color: strokeColor || '#C93C05', weight: strokeWidth || 4, dashArray: lineDashPattern ? lineDashPattern.join(' ') : null });
  });
  return null;
}

module.exports = MapView;
module.exports.default = MapView;
module.exports.Marker = Marker;
module.exports.Polyline = Polyline;
module.exports.Callout = () => null;
module.exports.PROVIDER_GOOGLE = 'google';
