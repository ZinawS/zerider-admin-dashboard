import React, { useState } from 'react';
import { api } from '../../api/client';
import { useAuthStore } from '../../stores/auth.store';

interface LoginResponse {
  access_token: string;
  refresh_token?: string;
  user?: { id: string; email: string; full_name?: string | null };
  admin_role?: string;
  region?: string | null;
  mfa_required?: boolean;
}

const EMAIL_KEY = 'admin-login-email';
const PASS_KEY = 'admin-login-pass';
const REMEMBER_KEY = 'admin-login-remember';

function readSavedPassword(): string {
  try {
    return localStorage.getItem(REMEMBER_KEY) === 'true'
      ? atob(localStorage.getItem(PASS_KEY) ?? '')
      : '';
  } catch {
    return '';
  }
}

export function LoginPage(): JSX.Element {
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState(() => localStorage.getItem(EMAIL_KEY) ?? '');
  const [password, setPassword] = useState(readSavedPassword);
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem(REMEMBER_KEY) === 'true');
  const [showPassword, setShowPassword] = useState(false);
  const [totp, setTotp] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleRememberMe(checked: boolean) {
    setRememberMe(checked);
    if (!checked) {
      localStorage.removeItem(REMEMBER_KEY);
      localStorage.removeItem(PASS_KEY);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<LoginResponse>('/auth/admin/login', {
        method: 'POST',
        body: { email, password, totp: needsMfa ? totp : undefined },
      });
      localStorage.setItem(EMAIL_KEY, email);
      if (rememberMe) {
        localStorage.setItem(REMEMBER_KEY, 'true');
        localStorage.setItem(PASS_KEY, btoa(password));
      } else {
        localStorage.removeItem(REMEMBER_KEY);
        localStorage.removeItem(PASS_KEY);
      }
      if (res.mfa_required) {
        setNeedsMfa(true);
      } else {
        setSession({
          access: res.access_token,
          refresh: res.refresh_token ?? '',
          user: res.user ?? { id: '', email },
          admin_role: (res.admin_role ?? 'super_admin') as any,
          region: res.region ?? null,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <form onSubmit={handleSubmit} className="bg-bg border border-border rounded-lg p-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold mb-1">RideShare admin</h1>
        <p className="text-sm text-muted mb-6">Sign in to continue.</p>

        {!needsMfa ? (
          <>
            <div className="mb-4">
              <label className="block text-sm text-muted mb-1" htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full px-3 py-2 border border-border rounded"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm text-muted mb-1" htmlFor="login-password">Password</label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 pr-10 border border-border rounded"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 px-3 flex items-center text-muted hover:text-ink"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 mb-5 text-sm text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => handleRememberMe(e.target.checked)}
                className="rounded"
              />
              Remember me
            </label>
          </>
        ) : (
          <div className="mb-4">
            <label className="block text-sm text-muted mb-1" htmlFor="login-totp">Authenticator code</label>
            <input
              id="login-totp"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={totp}
              onChange={(e) => setTotp(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2 border border-border rounded tracking-widest text-center text-lg"
            />
          </div>
        )}

        {error && <p className="text-sm text-danger mb-3">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-ink text-white py-2 rounded disabled:opacity-60"
        >
          {loading ? 'Signing in…' : needsMfa ? 'Verify' : 'Continue'}
        </button>
      </form>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
