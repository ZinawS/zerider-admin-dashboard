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

/**
 * Admin email + password + TOTP login. Two-step UI: first email/password,
 * then the TOTP code if the backend signals `mfa_required` (NFR-SEC-008).
 */
export function LoginPage(): JSX.Element {
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState(() => localStorage.getItem('admin-login-email') ?? '');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<LoginResponse>('/auth/admin/login', {
        method: 'POST',
        body: { email, password, totp: needsMfa ? totp : undefined },
      });
      localStorage.setItem('admin-login-email', email);
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
            <Field label="Email">
              <input type="email" name="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus className="w-full px-3 py-2 border border-border rounded" />
            </Field>
            <Field label="Password">
              <input type="password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full px-3 py-2 border border-border rounded" />
            </Field>
          </>
        ) : (
          <Field label="Authenticator code">
            <input type="text" inputMode="numeric" maxLength={6} value={totp} onChange={(e) => setTotp(e.target.value)} required autoFocus className="w-full px-3 py-2 border border-border rounded tracking-widest text-center text-lg" />
          </Field>
        )}
        {error && <p className="text-sm text-danger mb-3">{error}</p>}
        <button type="submit" disabled={loading} className="w-full bg-ink text-white py-2 rounded disabled:opacity-60">
          {loading ? 'Signing in…' : needsMfa ? 'Verify' : 'Continue'}
        </button>
      </form>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-4">
      <span className="block text-sm text-muted mb-1">{label}</span>
      {children}
    </label>
  );
}
