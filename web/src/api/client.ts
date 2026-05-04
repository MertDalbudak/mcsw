// Single fetch wrapper for the whole app.
//
// Conventions:
//   - All requests go through `api()`.
//   - CSRF token is fetched once on boot and re-fetched on 403 csrf failures.
//   - Server returns errors as { error: { code, message, details, trace_id } };
//     we translate to a typed `ApiError`.
//   - 429 responses pop a toast with the Retry-After hint.

import { useToastStore } from '@/stores/toasts';

let csrfToken = '';

// Hook is set lazily so the api module is importable before Pinia is
// installed (e.g. ensureCsrf() runs before app.use(pinia) at bootstrap).
function safeToast(message: string, kind: 'warn' | 'error' = 'warn'): void {
  try { useToastStore().push(message, kind); }
  catch { /* before Pinia installed */ }
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  /** Upstream trace_id (mcsw → mcsm) — surface in support links. */
  traceId?: string;
  constructor(status: number, code: string, message: string, details?: unknown, traceId?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.traceId = traceId;
  }
}

export async function ensureCsrf(): Promise<void> {
  const res = await fetch('/api/auth/csrf', { credentials: 'include' });
  if (!res.ok) return;
  const json = await res.json();
  csrfToken = json.csrfToken ?? '';
}

interface ApiOptions<B> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: B;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Skip auto-retry on CSRF failure (used internally to avoid loops). */
  noRetry?: boolean;
}

export async function api<T = unknown, B = unknown>(path: string, opts: ApiOptions<B> = {}): Promise<T> {
  const url = new URL(path, window.location.origin);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v == null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  const method = opts.method ?? 'GET';
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!['GET', 'HEAD'].includes(method)) headers['X-CSRF-Token'] = csrfToken;

  const res = await fetch(url.pathname + url.search, {
    method,
    headers,
    credentials: 'include',
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json = text ? safeJson(text) : null;

  if (!res.ok) {
    const code = json?.error?.code ?? 'http_error';
    const message = json?.error?.message ?? `HTTP ${res.status}`;
    // CSRF cookie can drift if the user blew away cookies mid-session; refetch and retry once.
    if (res.status === 403 && code === 'EBADCSRFTOKEN' && !opts.noRetry) {
      await ensureCsrf();
      return api<T, B>(path, { ...opts, noRetry: true });
    }
    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      const hint = retryAfter ? ` Try again in ${retryAfter}s.` : '';
      safeToast(`Rate-limited.${hint}`, 'warn');
    } else if (res.status >= 500 || res.status === 502) {
      safeToast(message, 'error');
    }
    throw new ApiError(res.status, code, message, json?.error?.details, json?.error?.trace_id);
  }
  return (json ?? null) as T;
}

function safeJson(text: string): { error?: { code?: string; message?: string; details?: unknown; trace_id?: string } } | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
