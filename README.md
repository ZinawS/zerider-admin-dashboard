# @rideshare/admin-web

Admin dashboard built with React 18, Vite, Tailwind, React Router, and TanStack Query.

## Quick start

```bash
pnpm install
pnpm --filter @rideshare/admin-web dev
# → http://localhost:5173
```

## Seed credentials

From the dev seed (Doc 09 §9):

```
email: admin@local.test
password: ChangeMe123!
```

MFA secret is set up on first login via the printed QR code (or you can copy the secret from the seed output).

## Structure

- `src/pages/` — one folder per top-level section, each rendering a single `*Page.tsx`
- `src/components/Layout.tsx` — sidebar + outlet
- `src/components/Table.tsx` — generic typed table
- `src/api/client.ts` — fetch wrapper; auto-logs out on 401
- `src/stores/auth.store.ts` — Zustand store, session persisted via the `persist` middleware to localStorage

## What's wired vs stubbed

| Page      | Wired                                             | Stub                                            |
| --------- | ------------------------------------------------- | ----------------------------------------------- |
| Login     | POST /v1/admin/auth/login with optional TOTP step | —                                               |
| Dashboard | Stat cards from /v1/admin/analytics/summary       | Live map of drivers + active rides (FR-ADMIN-003) |
| Users     | List + search                                     | Detail view, suspend modal                      |
| Drivers   | List + approve/reject                             | Document review screen                          |
| Rides     | List + refund                                     | Map preview, manual fare adjustment             |
| Pricing   | List rules and surge zones                        | Editor for rules; surge zone polygon editor     |
| Audit     | List                                              | Filter by actor/action/date                     |
