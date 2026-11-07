export type Role = 'user' | 'admin';
export type SessionKind = 'official' | 'private';
export type SessionStatus = 'draft' | 'published' | 'live' | 'ended' | 'archived';
export type ParticipantStatus = 'invited' | 'accepted' | 'declined' | 'tracking' | 'finished';
export type AlertType = 'help' | 'emergency' | 'signal_lost';
export type CheckpointKind = 'start' | 'stop' | 'finish';

export interface Point {
  lat: number;
  lng: number;
}

export interface Fix extends Point {
  accuracy: number; // metros
  recordedAt: string; // ISO
}

export interface Session {
  id: string;
  kind: SessionKind;
  name: string;
  status: SessionStatus;
  owner_id: string;
  starts_at: string | null;
  is_test: boolean;
}

export interface Checkpoint extends Point {
  id: string;
  session_id: string;
  name: string;
  km: number;
  kind: CheckpointKind;
}

export interface Participant {
  session_id: string;
  user_id: string;
  status: ParticipantStatus;
  sharing: boolean;
  last_lat: number | null;
  last_lng: number | null;
  last_at: string | null;
  distance_m: number;
}
