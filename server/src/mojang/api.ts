import { request } from 'undici';
import { Errors } from '../error.js';

export interface MojangProfile {
  uuid: string; // 32 hex chars, no dashes
  username: string;
}

const NAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;

export function isValidMojangUsername(name: string): boolean {
  return NAME_PATTERN.test(name);
}

// Mojang's "name → uuid" endpoint. Returns null when the name doesn't exist.
export async function lookupByName(username: string): Promise<MojangProfile | null> {
  if (!isValidMojangUsername(username)) {
    throw Errors.badRequest('Invalid Mojang username format');
  }
  const url = `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`;
  const res = await request(url, { method: 'GET' });
  if (res.statusCode === 404 || res.statusCode === 204) return null;
  if (res.statusCode !== 200) {
    throw Errors.upstream(`Mojang API returned ${res.statusCode}`);
  }
  const body = (await res.body.json()) as { id: string; name: string };
  return { uuid: body.id.toLowerCase(), username: body.name };
}

// Pretty-print a UUID with dashes.
export function formatUuid(uuid: string): string {
  const u = uuid.replace(/-/g, '').toLowerCase();
  if (u.length !== 32) return uuid;
  return `${u.slice(0, 8)}-${u.slice(8, 12)}-${u.slice(12, 16)}-${u.slice(16, 20)}-${u.slice(20)}`;
}

export function avatarUrl(uuid: string): string {
  return `https://crafatar.com/avatars/${formatUuid(uuid)}?size=64&overlay`;
}
