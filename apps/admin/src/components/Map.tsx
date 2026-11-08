import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { CircleMarker as LCircleMarker, LatLngBoundsExpression, Map as LMap } from 'leaflet';
import { getSignalState, SIGNAL_LABEL, type Alert, type Checkpoint, type LiveParticipant } from '@mb/core';
import { fmtTime } from '../lib';

const COLORS = { tracking: '#1f8a4c', stale: '#b98900', not_started: '#4b4c53', finished: '#1d1e22' };
const SALVADOR: [number, number] = [-12.985, -38.44];

function ClickHandler({ onClick }: { onClick?: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onClick?.(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** Expõe a instância do Leaflet para os botões fora do mapa. */
function Grab({ onMap }: { onMap: (m: LMap) => void }) {
  const map = useMap();
  useEffect(() => onMap(map), [map, onMap]);
  return null;
}

/**
 * Mapa do painel: percurso, pontos de apoio, participantes (cor = estado do sinal) e alertas.
 * Interativo: clicar num participante seleciona (onSelect); `focus` voa até a pessoa e abre o balão;
 * `highlight` destaca um grupo (trecho, retardatários…); "Centralizar" volta à visão inicial.
 */
export function Map(props: {
  checkpoints: Pick<Checkpoint, 'lat' | 'lng' | 'name' | 'km'>[];
  participants?: LiveParticipant[];
  alerts?: Alert[];
  now?: number;
  onClick?: (lat: number, lng: number) => void;
  focus?: string | null;
  highlight?: Set<string>;
  onSelect?: (userId: string) => void;
  profileHref?: (userId: string) => string;
  /** Caminho real pelas ruas; sem ele, liga os pontos de apoio em linha reta. */
  path?: { lat: number; lng: number }[] | null;
}) {
  const { checkpoints, participants = [], alerts = [], now = Date.now(), focus, highlight, onSelect, profileHref } = props;
  const [map, setMap] = useState<LMap | null>(null);
  const markers = useRef(new globalThis.Map<string, LCircleMarker>());
  const fitted = useRef(false);

  const positioned = participants.filter((p) => p.last_lat != null);
  // Visão inicial: percurso + quem tem posição (ou Salvador se não houver nada).
  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    const pts: [number, number][] = [...checkpoints.map((c) => [c.lat, c.lng] as [number, number]), ...positioned.map((p) => [p.last_lat!, p.last_lng!] as [number, number])];
    return pts.length ? pts : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkpoints, positioned.length]);

  const recenter = (animate = true) => {
    if (!map) return;
    if (bounds) map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15, animate });
    else map.setView(SALVADOR, 12, { animate });
  };
  useEffect(() => {
    if (map && bounds && !fitted.current) {
      fitted.current = true;
      recenter(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, bounds]);

  // Foco numa pessoa: voa até ela e abre o balão.
  useEffect(() => {
    if (!map || !focus) return;
    const p = participants.find((x) => x.user_id === focus);
    if (p?.last_lat == null) return;
    map.flyTo([p.last_lat, p.last_lng!], Math.max(map.getZoom(), 16), { duration: 0.6 });
    setTimeout(() => markers.current.get(focus)?.openPopup(), 650);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, focus]);

  // Destaque de grupo: enquadra só essas pessoas (só quando o grupo muda, não a cada atualização).
  const hlKey = highlight ? [...highlight].sort().join(',') : '';
  useEffect(() => {
    if (!map || !highlight?.size) return;
    const pts = positioned.filter((p) => highlight.has(p.user_id)).map((p) => [p.last_lat!, p.last_lng!] as [number, number]);
    if (pts.length) map.fitBounds(pts, { padding: [48, 48], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, hlKey]);

  return (
    <div className="map-wrap">
      <MapContainer className="map" center={SALVADOR} zoom={12}>
        <Grab onMap={setMap} />
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <ClickHandler onClick={props.onClick} />
        {(props.path?.length ?? checkpoints.length) > 1 && <Polyline positions={(props.path ?? checkpoints).map((c) => [c.lat, c.lng])} pathOptions={{ color: '#d94f16', weight: 4 }} />}
        {checkpoints.map((c, i) => (
          <CircleMarker key={`cp${i}`} center={[c.lat, c.lng]} radius={7} pathOptions={{ color: '#c93c05', fillOpacity: 1 }}>
            <Popup>{c.name} · km {c.km}</Popup>
          </CircleMarker>
        ))}
        {alerts.filter((a) => !a.resolved_at && a.lat != null).map((a) => (
          <CircleMarker key={a.id} center={[a.lat!, a.lng!]} radius={14} pathOptions={{ color: '#b3261e', weight: 3, fillOpacity: 0.2 }}
            eventHandlers={{ click: () => onSelect?.(a.user_id) }}>
            <Popup>Alerta: {a.type} às {fmtTime(a.created_at)}</Popup>
          </CircleMarker>
        ))}
        {positioned.map((p) => {
          const s = getSignalState(p as never, now);
          const on = focus === p.user_id || highlight?.has(p.user_id);
          const dim = highlight?.size && !highlight.has(p.user_id) && focus !== p.user_id;
          return (
            <CircleMarker key={p.user_id} center={[p.last_lat!, p.last_lng!]} radius={on ? 10 : 7}
              ref={(m) => { if (m) markers.current.set(p.user_id, m); else markers.current.delete(p.user_id); }}
              pathOptions={{ color: on ? '#d94f16' : COLORS[s], weight: on ? 4 : 2, fillColor: COLORS[s], fillOpacity: dim ? 0.15 : s === 'stale' ? 0.35 : 0.9, opacity: dim ? 0.3 : 1 }}
              eventHandlers={{ click: () => onSelect?.(p.user_id) }}>
              <Popup>
                <b>{p.display_name}</b><br />
                {SIGNAL_LABEL[s]} · {(p.distance_m / 1000).toFixed(1)} km<br />
                Última posição: {fmtTime(p.last_at)}{p.battery != null ? ` · bateria ${p.battery}%` : ''}
                {profileHref && <><br /><a href={profileHref(p.user_id)}>Ver perfil e contato →</a></>}
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
      <button type="button" className="map-recenter secondary" onClick={() => recenter()} title="Voltar à visão inicial do percurso">⌖ Centralizar</button>
    </div>
  );
}
