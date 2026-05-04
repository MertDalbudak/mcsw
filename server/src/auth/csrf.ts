import { doubleCsrf } from 'csrf-csrf';
import { config } from '../config.js';

const {
  doubleCsrfProtection,
  generateCsrfToken,
  invalidCsrfTokenError,
} = doubleCsrf({
  getSecret: () => config.SESSION_SECRET,
  getSessionIdentifier: (req) => req.session?.id ?? req.sessionID ?? 'anon',
  cookieName: config.COOKIE_SECURE ? '__Host-mcsw.csrf' : 'mcsw.csrf',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.COOKIE_SECURE,
    path: '/',
  },
  size: 32,
  getCsrfTokenFromRequest: (req) => {
    const headerToken = req.headers['x-csrf-token'];
    if (typeof headerToken === 'string') return headerToken;
    if (Array.isArray(headerToken) && headerToken[0]) return headerToken[0];
    return undefined;
  },
});

export const csrfProtection = doubleCsrfProtection;
export { generateCsrfToken, invalidCsrfTokenError };
