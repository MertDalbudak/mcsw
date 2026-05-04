import { createHash, randomBytes } from 'node:crypto';

// Generate a URL-safe random token (base64url, no padding).
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
