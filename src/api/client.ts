import { useAuthStore } from '../stores/auth.store.js';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

interface FetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  idempotencyKey?: string;
}

/**
 * Admin fetch wrapper. All admin endpoints require MFA-verified session
 * (NFR-SEC-008); the bearer token issued at login already carries that claim.
 */
export async function api<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { accessToken, logout } = useAuthStore.getState();
  const headers = new Headers(opts.headers as HeadersInit | undefined);
  headers.set('Accept', 'application/json');
  if (opts.body !== undefined) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (opts.idempotencyKey) headers.set('Idempotency-Key', opts.idempotencyKey);

  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401) {
    // Attempt silent refresh before logging out
    const { refreshToken, setSession, user, admin_role, region } = useAuthStore.getState();
    if (refreshToken) {
      try {
        const refreshRes = await fetch(`${API_URL}/auth/token/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (refreshRes.ok) {
          const tokens = await refreshRes.json() as { access_token: string; refresh_token: string };
          setSession({ access: tokens.access_token, refresh: tokens.refresh_token, user: user!, admin_role, region });
          // Retry the original request with the new token
          headers.set('Authorization', `Bearer ${tokens.access_token}`);
          const retry = await fetch(`${API_URL}${path}`, { ...opts, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
          if (!retry.ok) throw new ApiError('RETRY_FAILED', 'Request failed after refresh', retry.status);
          if (retry.status === 204) return undefined as T;
          return (await retry.json()) as T;
        }
      } catch { /* refresh failed, fall through to logout */ }
    }
    logout();
    throw new ApiError('UNAUTHENTICATED', 'Session expired', 401);
  }

  if (!res.ok) {
    let code = 'UNKNOWN';
    let message = res.statusText;
    try {
      const err = (await res.json()) as any;
      // Support both shapes:
      //   {error: {code, message}}  (custom errors)
      //   {message, error, statusCode}  (Nest's HttpException)
      code = err?.error?.code ?? err?.error ?? code;
      // Nest message can be a string or string[]
      const m = err?.error?.message ?? err?.message;
      message = Array.isArray(m) ? m.join('; ') : (m ?? message);
    } catch { /* not JSON */ }
    throw new ApiError(code, message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
