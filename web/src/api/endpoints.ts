import { api } from './client';
import type {
  AuthUser, MeResponse, InvitationDto, McsmInstanceDto,
  FederatedSlot, SlotDto, UserDto, GrantDto,
  PlayersResponse, WhitelistResponse, BanlistResponse,
  PropertiesResponse, PropertiesPatchResponse,
  BackupsResponse, BackupDto, ServerUpdateInfo, LogsResponse,
  SystemOverview, AuditLocalResponse, AuditMcsmResponse,
} from './types';

// ─── Auth ────────────────────────────────────────────────────────────────
export const authApi = {
  signin: (email: string, password: string) =>
    api<{ user: AuthUser }>('/api/auth/signin', { method: 'POST', body: { email, password } }),
  signup: (email: string, password: string, invitationCode?: string) =>
    api<{ user: AuthUser }>('/api/auth/signup', {
      method: 'POST',
      body: { email, password, invitationCode },
    }),
  signout: () => api<{ ok: true }>('/api/auth/signout', { method: 'POST' }),
  verifyEmail: (token: string) =>
    api<{ ok: true }>('/api/auth/verify-email', { method: 'POST', body: { token } }),
  requestPasswordReset: (email: string) =>
    api<{ ok: true }>('/api/auth/password-reset/request', { method: 'POST', body: { email } }),
  confirmPasswordReset: (token: string, password: string) =>
    api<{ ok: true }>('/api/auth/password-reset/confirm', { method: 'POST', body: { token, password } }),
};

// ─── Me ──────────────────────────────────────────────────────────────────
export const meApi = {
  get: () => api<MeResponse>('/api/me/'),
  changePassword: (current: string, next: string) =>
    api<{ ok: true }>('/api/me/password', { method: 'POST', body: { current, next } }),
  linkMojang: (username: string) =>
    api<{ uuid: string; username: string; linkedAt: string; verified: boolean }>(
      '/api/me/mojang', { method: 'POST', body: { username } },
    ),
  unlinkMojang: () => api<{ ok: true }>('/api/me/mojang', { method: 'DELETE' }),
};

// ─── Invitations ─────────────────────────────────────────────────────────
export const invitationsApi = {
  list: () => api<{ invitations: InvitationDto[] }>('/api/invitations/'),
  create: (input: { expiresInDays?: number; note?: string } = {}) =>
    api<InvitationDto>('/api/invitations/', { method: 'POST', body: input }),
  delete: (id: string) =>
    api<{ ok: true }>(`/api/invitations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// ─── mcsm instances ──────────────────────────────────────────────────────
export const mcsmApi = {
  list: () => api<{ instances: McsmInstanceDto[] }>('/api/mcsm-instances/'),
  create: (input: {
    name: string; baseUrl: string; authToken: string;
    isPrimary?: boolean; enabled?: boolean; notes?: string;
  }) => api<McsmInstanceDto>('/api/mcsm-instances/', { method: 'POST', body: input }),
  update: (id: string, input: Partial<{
    name: string; baseUrl: string; authToken: string;
    isPrimary: boolean; enabled: boolean; notes: string;
  }>) => api<McsmInstanceDto>(`/api/mcsm-instances/${encodeURIComponent(id)}`, { method: 'PATCH', body: input }),
  delete: (id: string) =>
    api<{ ok: true }>(`/api/mcsm-instances/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  probe: (host: string, port: number) =>
    api<{ result: { reachable: boolean; authRequired: boolean; instanceName?: string; version?: string } | null }>(
      '/api/mcsm-instances/probe', { method: 'POST', body: { host, port } },
    ),
  testConnection: (baseUrl: string, authToken: string) =>
    api<{ ok: boolean; instance?: unknown; error?: string }>(
      '/api/mcsm-instances/test-connection', { method: 'POST', body: { baseUrl, authToken } },
    ),
  scan: () => api<{ hits: unknown[]; added: number }>('/api/mcsm-instances/scan', { method: 'POST' }),
};

// ─── Slots — lifecycle ───────────────────────────────────────────────────
export const slotsApi = {
  list: () => api<{ slots: FederatedSlot[]; sources: unknown[] }>('/api/slots/'),
  get: (instanceId: string, slot: string) =>
    api<{ instanceId: string; slot: SlotDto }>(
      `/api/slots/${encodeURIComponent(instanceId)}/${encodeURIComponent(slot)}`,
    ),
  start: (instanceId: string, slot: string, serverId: string, force = false) =>
    api(`/api/slots/${encodeURIComponent(instanceId)}/${encodeURIComponent(slot)}/start`, {
      method: 'POST', body: { serverId, force },
    }),
  stop: (instanceId: string, slot: string, body: { graceful_seconds?: number } = {}) =>
    api(`/api/slots/${encodeURIComponent(instanceId)}/${encodeURIComponent(slot)}/stop`, {
      method: 'POST', body,
    }),
  restart: (instanceId: string, slot: string, body: { graceful_seconds?: number } = {}) =>
    api(`/api/slots/${encodeURIComponent(instanceId)}/${encodeURIComponent(slot)}/restart`, {
      method: 'POST', body,
    }),
  abortStop: (instanceId: string, slot: string) =>
    api(`/api/slots/${encodeURIComponent(instanceId)}/${encodeURIComponent(slot)}/abort-stop`, {
      method: 'POST',
    }),
};

// ─── Mounted-server actions ──────────────────────────────────────────────
function srvBase(instanceId: string, slot: string): string {
  return `/api/slots/${encodeURIComponent(instanceId)}/${encodeURIComponent(slot)}/server`;
}

export const serverApi = {
  // Players
  players: (i: string, s: string) => api<PlayersResponse>(`${srvBase(i, s)}/players`),
  command: (i: string, s: string, command: string) =>
    api<{ command: string; response: string; elapsed_ms: number }>(
      `${srvBase(i, s)}/command`, { method: 'POST', body: { command } },
    ),
  say: (i: string, s: string, message: string) =>
    api(`${srvBase(i, s)}/say`, { method: 'POST', body: { message } }),
  kick: (i: string, s: string, player: string, reason?: string) =>
    api(`${srvBase(i, s)}/players/${encodeURIComponent(player)}/kick`, {
      method: 'POST', body: { reason },
    }),
  ban: (i: string, s: string, player: string, body: { reason?: string; duration?: string; ban_ip?: boolean }) =>
    api(`${srvBase(i, s)}/players/${encodeURIComponent(player)}/ban`, {
      method: 'POST', body,
    }),
  unban: (i: string, s: string, player: string) =>
    api(`${srvBase(i, s)}/players/${encodeURIComponent(player)}/unban`, { method: 'POST' }),
  op: (i: string, s: string, player: string, level?: number) =>
    api(`${srvBase(i, s)}/players/${encodeURIComponent(player)}/op`, {
      method: 'POST', body: level !== undefined ? { level } : undefined,
    }),
  deop: (i: string, s: string, player: string) =>
    api(`${srvBase(i, s)}/players/${encodeURIComponent(player)}/deop`, { method: 'POST' }),

  // Whitelist
  whitelist: (i: string, s: string) => api<WhitelistResponse>(`${srvBase(i, s)}/whitelist`),
  addWhitelist: (i: string, s: string, player: string) =>
    api(`${srvBase(i, s)}/whitelist/${encodeURIComponent(player)}`, { method: 'PUT' }),
  removeWhitelist: (i: string, s: string, player: string) =>
    api(`${srvBase(i, s)}/whitelist/${encodeURIComponent(player)}`, { method: 'DELETE' }),
  reloadWhitelist: (i: string, s: string) =>
    api(`${srvBase(i, s)}/whitelist/reload`, { method: 'POST' }),

  // Banlist
  banlist: (i: string, s: string) => api<BanlistResponse>(`${srvBase(i, s)}/banlist`),
  ipBanlist: (i: string, s: string) => api<BanlistResponse>(`${srvBase(i, s)}/banlist/ips`),

  // Properties
  properties: (i: string, s: string) => api<PropertiesResponse>(`${srvBase(i, s)}/properties`),
  patchProperties: (i: string, s: string, values: Record<string, string | number | boolean>) =>
    api<PropertiesPatchResponse>(`${srvBase(i, s)}/properties`, {
      method: 'PATCH', body: { values },
    }),

  // Logs (HTTP tail; live streaming uses the /api/proxy WS instead)
  logs: (i: string, s: string, q: { tail?: number; since?: string; level?: string[] } = {}) =>
    api<LogsResponse>(`${srvBase(i, s)}/logs`, { query: { tail: q.tail, since: q.since } }),

  // Backups
  backups: (i: string, s: string) => api<BackupsResponse>(`${srvBase(i, s)}/backups`),
  createBackup: (i: string, s: string, body: { label?: string; stop_server?: boolean; include_logs?: boolean }) =>
    api<BackupDto>(`${srvBase(i, s)}/backups`, { method: 'POST', body }),
  restoreBackup: (i: string, s: string, id: string) =>
    api(`${srvBase(i, s)}/backups/${encodeURIComponent(id)}/restore`, { method: 'POST' }),
  deleteBackup: (i: string, s: string, id: string) =>
    api(`${srvBase(i, s)}/backups/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Update
  checkUpdate: (i: string, s: string, mc_version?: string) =>
    api<ServerUpdateInfo>(`${srvBase(i, s)}/update`, { query: { mc_version } }),
  applyUpdate: (i: string, s: string, body: { mc_version: string; backup?: boolean }) =>
    api(`${srvBase(i, s)}/update`, { method: 'POST', body }),
};

// ─── Admin: system & audit ───────────────────────────────────────────────
export const systemApi = {
  overview: () => api<SystemOverview>('/api/admin/system/'),
  temperature: (instanceId: string) =>
    api(`/api/admin/system/${encodeURIComponent(instanceId)}/temperature`),
  resources: (instanceId: string) =>
    api(`/api/admin/system/${encodeURIComponent(instanceId)}/resources`),
};

export const auditApi = {
  local: (q: { since?: string; until?: string; actor?: string; action?: string; limit?: number; cursor?: string } = {}) =>
    api<AuditLocalResponse>('/api/admin/audit/local', { query: q }),
  mcsm: (instanceId: string, q: { since?: string; until?: string; actor?: string; kind?: string; limit?: number; cursor?: string } = {}) =>
    api<AuditMcsmResponse>(`/api/admin/audit/${encodeURIComponent(instanceId)}`, { query: q }),
};

// ─── Discovery (servers across peers) ────────────────────────────────────
export const discoveryApi = {
  list: () => api<import('./types').FederationDiscovery>('/api/discovery/'),
  refresh: (instanceId: string) =>
    api(`/api/discovery/${encodeURIComponent(instanceId)}/refresh`, { method: 'POST' }),
};

// ─── Grants ──────────────────────────────────────────────────────────────
export const grantsApi = {
  listForUser: (userId: string) =>
    api<{ grants: GrantDto[] }>('/api/grants/', { query: { userId } }),
  upsert: (input: {
    userId: string; mcsmInstanceId: string; serverId: string;
    permissions: Partial<{
      start: boolean; stop: boolean; restart: boolean;
      command: boolean; moderate: boolean; admin: boolean; invite: boolean;
    }>;
  }) => api<{ id: string }>('/api/grants/', { method: 'PUT', body: input }),
  delete: (id: string) =>
    api<{ ok: true }>(`/api/grants/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// ─── Admin: users ────────────────────────────────────────────────────────
export const adminUsersApi = {
  list: () => api<{ users: UserDto[] }>('/api/admin/users/'),
  update: (id: string, body: { isAdmin?: boolean; isDisabled?: boolean }) =>
    api<UserDto>(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  delete: (id: string) =>
    api<{ ok: true }>(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
