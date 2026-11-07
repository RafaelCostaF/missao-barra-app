import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import { getSignalState, type Alert, type Checkpoint, type LiveParticipant } from '@mb/core';
import { fmtTime } from '../lib';

const COLORS = { tracking: '#1f8a4c', stale: '#b98900', not_started: '#4b4c53', finished: '#1d1e22' };

function ClickHandler({ onClick }: { onClick?: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onClick?.(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** Mapa do painel: percurso, pontos de apoio, participantes (cor = estado do sinal) e alertas. */
export function Map(props: {
  checkpoints: Pick<Checkpoint, 'lat' | 'lng' | 'name' | 'km'>[];
  participants?: LiveParticipant[];
  alerts?: Alert[];
  now?: number;
  onClick?: (lat: number, lng: number) => void;
}) {
  const { checkpoints, participants = [], alerts = [], now = Date.now() } = props;
  return (
    <MapContainer className="map" center={[-12.985, -38.44]} zoom={12}>
      <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <ClickHandler onClick={props.onClick} />
      {checkpoints.length > 1 && <Polyline positions={checkpoints.map((c) => [c.lat, c.lng])} pathOptions={{ color: '#d94f16', weight: 4 }} />}
      {checkpoints.map((c, i) => (
        <CircleMarker key={`cp${i}`} center={[c.lat, c.lng]} radius={7} pathOptions={{ color: '#c93c05', fillOpacity: 1 }}>
          <Popup>{c.name} · km {c.km}</Popup>
        </CircleMarker>
      ))}
      {participants.filter((p) => p.last_lat != null).map((p) => {
        const s = getSignalState(p as never, now);
        return (
          <CircleMarker key={p.user_id} center={[p.last_lat!, p.last_lng!]} radius={6} pathOptions={{ color: COLORS[s], fillOpacity: s === 'stale' ? 0.3 : 0.9 }}>
            <Popup>{p.display_name}<br />Última posição: {fmtTime(p.last_at)}</Popup>
          </CircleMarker>
        );
      })}
      {alerts.filter((a) => !a.resolved_at && a.lat != null).map((a) => (
        <CircleMarker key={a.id} center={[a.lat!, a.lng!]} radius={14} pathOptions={{ color: '#b3261e', weight: 3, fillOpacity: 0.2 }}>
          <Popup>Alerta: {a.type} às {fmtTime(a.created_at)}</Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
