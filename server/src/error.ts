import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from './logger.js';

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;
  /** Upstream trace_id (e.g. from mcsm) so bug reports can correlate. */
  traceId?: string;
  /** Extra response headers to set when this error is rendered. */
  headers?: Record<string, string>;

  constructor(status: number, code: string, message: string, details?: unknown, opts?: { traceId?: string; headers?: Record<string, string> }) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.traceId = opts?.traceId;
    this.headers = opts?.headers;
  }
}

export const Errors = {
  badRequest: (msg = 'Bad request', details?: unknown) => new HttpError(400, 'bad_request', msg, details),
  validation: (details: unknown) => new HttpError(400, 'validation_failed', 'Validation failed', details),
  unauthorized: (msg = 'Unauthorized') => new HttpError(401, 'unauthorized', msg),
  forbidden: (msg = 'Forbidden') => new HttpError(403, 'forbidden', msg),
  notFound: (msg = 'Not found') => new HttpError(404, 'not_found', msg),
  conflict: (code: string, msg: string, details?: unknown) => new HttpError(409, code, msg, details),
  rateLimited: (msg = 'Too many requests') => new HttpError(429, 'rate_limited', msg),
  internal: (msg = 'Internal server error') => new HttpError(500, 'internal', msg),
  upstream: (msg: string, details?: unknown) => new HttpError(502, 'upstream_error', msg, details),
};

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'validation_failed',
        message: 'Validation failed',
        details: err.issues,
      },
    });
    return;
  }
  if (err instanceof HttpError) {
    if (err.status >= 500) {
      logger.error({ err, path: req.path }, 'request error');
    }
    if (err.headers) {
      for (const [k, v] of Object.entries(err.headers)) res.setHeader(k, v);
    }
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details ?? undefined,
        trace_id: err.traceId,
      },
    });
    return;
  }
  logger.error({ err, path: req.path }, 'unhandled error');
  res.status(500).json({
    error: { code: 'internal', message: 'Internal server error' },
  });
}
