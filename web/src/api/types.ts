// Shared shapes the web app reads off the API.

export interface MeResponse {
  id: string;
  email: string;
  emailVerified: boolean;
  isAdmin: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  mojang: {
    uuid: string;
    username: string;
    linkedAt: string;
    verified: boolean;
  } | null;
}

export interface AuthUser {
  id: string;
  email: string;
  isAdmin: boolean;
  emailVerified: boolean;
}

export interface InvitationDto {
  id: string;
  code: string;
  createdAt: string;
  expiresAt: string | null;
  consumedAt: string | null;
  consumedBy: { id: string; email: string } | null;
  note: string | null;
}

export interface McsmInstanceDto {
  id: string;
  name: string;
  baseUrl: string;
  hasToken: boolean;
  isPrimary: boolean;
  enabled: boolean;
  source: 'manual' | 'discovered';
  notes: string | null;
  lastSeenAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export type SlotState =
  | 'idle' | 'mounting' | 'starting' | 'running'
  | 'stopping' | 'crashed' | 'error';

export interface SlotDto {
  name: string;
  port: number;
  public_address?: string;
  state: SlotState;
  state_since: string;
  mounted_server?: {
    id: string;
    name: string;
    type: string;
    version: string;
    pid?: number;
    started_at?: string;
    rcon_connected?: boolean;
    slp?: {
      online: boolean;
      players?: { online: number; max: number };
      tps_1m?: number;
      motd?: string;
      latency_ms?: number;
    };
  } | null;
  mounted_server_id?: string | null;
  last_error?: { code: string; message: string; at: string } | null;
}

export interface FederatedSlot {
  instanceId: string;
  instanceName: string;
  slot: SlotDto;
  canControl: boolean;
}

export interface DiscoveredServerDto {
  id: string;
  name: string;
  type: string;
  version: string;
  path?: string;
  level_name?: string;
  icon_b64?: string | null;
  ownership: {
    state: 'free' | 'owned-self' | 'owned-other' | 'stale';
    instance?: string;
    slot?: string;
    host?: string;
    pid?: number;
    since?: string;
    heartbeat?: string;
    conflict_with?: string;
  };
  reachable_via?: string;
}

export interface FederationSource {
  instance: string;
  self?: boolean;
  ok: boolean;
  rtt_ms?: number;
  error?: string;
}

export interface FederationDiscovery {
  scanned_at: string;
  sources: FederationSource[];
  servers: DiscoveredServerDto[];
}

export interface UserDto {
  id: string;
  email: string;
  emailVerified: boolean;
  isAdmin: boolean;
  isDisabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  mojang: { uuid: string; username: string } | null;
}

export interface PlayerDto {
  name: string;
  uuid?: string;
  ping_ms?: number;
  joined_at?: string;
}

export interface PlayersResponse {
  online: number;
  max: number;
  players: PlayerDto[];
}

export interface WhitelistEntry { uuid?: string; name: string }
export interface WhitelistResponse { enabled: boolean; players: WhitelistEntry[] }

export interface BanEntry {
  name?: string;
  uuid?: string;
  ip?: string;
  reason?: string;
  source?: string;
  created?: string;
  expires?: string | 'forever';
}
export interface BanlistResponse { players?: BanEntry[]; ips?: BanEntry[] }

export interface PropertiesResponse {
  values: Record<string, string | number | boolean>;
  raw_path: string;
}
export interface PropertiesPatchResponse {
  applied: string[];
  requires_restart: string[];
  rejected: string[];
}

export interface BackupDto {
  id: string;
  label?: string;
  created_at: string;
  size_bytes?: number;
  include_logs?: boolean;
}
export interface BackupsResponse { backups: BackupDto[] }

export interface ServerUpdateInfo {
  flavor: string;
  mc_version: string;
  build: number;
  download_url: string;
  sha256: string;
  jar_name: string;
  published_at: string;
}

export interface LogEntry {
  ts: string;
  thread?: string;
  level?: string;
  source?: string | null;
  message: string;
  raw?: string;
}
export interface LogsResponse { entries: LogEntry[]; truncated: boolean }

export interface SystemTemperature {
  celsius: number;
  sensor: string;
  sampled_at: string;
  history?: Array<{ at: string; celsius: number }>;
}
export interface SystemResources {
  cpu: { cores: number; used_pct?: number };
  mem?: { total_bytes: number; used_bytes: number; used_pct: number };
  load?: { '1m': number; '5m': number; '15m': number };
  disk?: Array<{ mount: string; total_bytes: number; used_bytes: number; used_pct: number }>;
}

export interface SystemOverview {
  instances: Array<{
    instanceId: string;
    name: string;
    baseUrl: string;
    resources: SystemResources | { _error: string };
    temperature: SystemTemperature | { _error: string };
  }>;
}

export interface AuditLocalEntry {
  id: string;
  ts: string;
  actor: { id: string; email: string } | null;
  action: string;
  target: unknown;
  result: string;
  errorCode: string | null;
  ip: string | null;
  userAgent: string | null;
}
export interface AuditLocalResponse {
  entries: AuditLocalEntry[];
  nextCursor: string | null;
}

export interface AuditMcsmEntry {
  id: number;
  at: string;
  actor: { kind: string; name: string };
  kind: string;
  subject: unknown;
  result: string;
  status?: number;
  trace_id?: string;
}
export interface AuditMcsmResponse {
  entries: AuditMcsmEntry[];
  next_cursor?: string | null;
}

export interface GrantDto {
  id: string;
  userId: string;
  instance: { id: string; name: string; baseUrl: string };
  serverId: string;
  permissions: {
    start: boolean;
    stop: boolean;
    restart: boolean;
    command: boolean;
    moderate: boolean;
    admin: boolean;
    invite: boolean;
  };
  createdAt: string;
}
