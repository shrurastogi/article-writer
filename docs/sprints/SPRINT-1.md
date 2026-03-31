# Sprint 1 — Auth, Storage & Dashboard

**Status:** Complete  
**Dates:** 2026-03-31

## Goals

Transform the single-user, localStorage-only tool into a multi-user application with server-side storage, Google OAuth + email/password authentication, and a multi-article dashboard.

## Features Delivered

| ID | Feature | PR |
|---|---|---|
| F10-1 | Google Sign-in | PR 2, PR 6 |
| F10-2 | Session management | PR 1, PR 2 |
| F10-3 | Sign-out | PR 2, PR 4, PR 5, PR 6 |
| F10-4 | User identity in header | PR 5, PR 6 |
| F11-1 | Article dashboard | PR 5 |
| F11-2 | New article "+" button | PR 5 |
| F11-3 | Server-side article storage | PR 3 |
| F11-4 | Auto-save to server | PR 6 |
| F11-5 | Open existing article | PR 5, PR 6 |
| F11-6 | Delete article | PR 3, PR 5 |
| F11-7 | Last-updated timestamp | PR 3, PR 5 |
| F12-5 | CI test gate | PR 7 |
| F12-6 | CI lint gate | PR 7 |

## PR Sequence

| PR | Branch | Description |
|---|---|---|
| 3 | feature/sprint1-infrastructure | logger, models, middleware, passport-config, server.js wiring |
| 4 | feature/sprint1-auth | auth-router.js + auth.test.js |
| 5 | feature/sprint1-articles-api | articles-router.js + articles.test.js |
| 6 | feature/sprint1-login-page | login.html |
| 7 | feature/sprint1-dashboard | dashboard.html |
| 8 | feature/sprint1-editor-auth | index.html auth guard + server auto-save |
| 9 | feature/sprint1-ci | ci.yml + SPRINT-1.md |

## Architecture Decisions

- **MongoDB** via Mongoose — fits existing JSON state shape; Mixed type for `sections`
- **express-session** + **connect-mongo** — sessions persisted in MongoDB
- **Passport.js** — Google OAuth 2.0 + Local (bcrypt) strategies; serialize by `_id`
- **Auto-save** — localStorage write-behind (sync) + server PUT (async); server is primary, localStorage is fallback
- **`{ index: false }`** on `express.static` — prevents `index.html` being served without auth check
- **bcrypt rounds** — 12 in production, 1 in `NODE_ENV=test`

## New Environment Variables

```
MONGODB_URI=mongodb://localhost:27017/article-writer
SESSION_SECRET=<64-char hex>
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
LOG_LEVEL=info
NODE_ENV=development
```

## New API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /auth/google | — | Redirect to Google consent screen |
| GET | /auth/google/callback | — | OAuth callback |
| POST | /auth/register | — | Create local account |
| POST | /auth/login | — | Local sign-in |
| POST | /auth/logout | ✓ | Destroy session |
| GET | /auth/me | ✓ | Current user |
| GET | /api/articles | ✓ | List user's articles |
| POST | /api/articles | ✓ | Create blank article |
| GET | /api/articles/:id | ✓ | Full article |
| PUT | /api/articles/:id | ✓ | Full overwrite |
| DELETE | /api/articles/:id | ✓ | Delete article |

## Verification Checklist

- [ ] `npm install` — no errors
- [ ] `npm run lint` — zero errors
- [ ] `npm test` — all integration tests pass (requires MongoDB)
- [ ] Start server: `npm start` — boots, MongoDB connects, pino logs
- [ ] `GET /` — redirected to `/login`
- [ ] Register with email/password → `/dashboard`
- [ ] Click `+` → new article → editor opens with `?id=`
- [ ] Edit section → auto-save after 1.5s → refresh → content persists from server
- [ ] Dashboard shows word count and timestamp on card
- [ ] Delete article → card removed; document deleted from MongoDB
- [ ] Sign in with Google → OAuth flow → `/dashboard`
- [ ] Open PR to `main` → GitHub Actions lint + test jobs pass
