import bcrypt from 'bcrypt';
import { config } from '../config.js';

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, config.BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Minimum requirements: 10+ chars, contains a letter and a digit.
// Tuned to be friendlier than the standard "8 chars + symbol" alphabet
// soup — length matters more than character classes.
export function validatePassword(plain: string): string | null {
  if (plain.length < 10) return 'Password must be at least 10 characters';
  if (plain.length > 200) return 'Password is too long';
  if (!/[A-Za-z]/.test(plain)) return 'Password must contain a letter';
  if (!/\d/.test(plain)) return 'Password must contain a number';
  return null;
}
