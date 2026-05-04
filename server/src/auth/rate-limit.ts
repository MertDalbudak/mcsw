import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'rate_limited', message: 'Too many auth attempts, slow down.' } },
});

export const signinRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Key by IP + email so a guessed email doesn't lock out everyone behind a NAT.
  keyGenerator: (req) => {
    const ip = ipKeyGenerator(req.ip ?? 'unknown');
    const email = (req.body as { email?: string })?.email?.toLowerCase() ?? '';
    return `${ip}|${email}`;
  },
  message: { error: { code: 'rate_limited', message: 'Too many sign-in attempts, slow down.' } },
});

export const writeRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
