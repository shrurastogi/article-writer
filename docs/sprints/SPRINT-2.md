# Sprint 2 — Infrastructure & Environment Setup

**Status:** Planned  
**Dates:** TBD  
**Priority tier:** Critical — do before any feature work  

> **Note:** This sprint replaces the previous SPRINT-2 (Core UX Overhaul), which has been
> renumbered to SPRINT-4. See `docs/FEATURE-EXPANSION-ANALYSIS.md` for the full context
> and `docs/sprints/SPRINT-4.md` for that sprint's content.

## Goals

Establish a production-grade development and deployment pipeline before any new features
are built. Separate dev and prod environments completely. Automate versioning. Prove that
a code change on `dev` reaches Railway dev and a merge to `main` reaches Railway prod —
each showing the correct version number. Zero new user-facing features.

---

## Manual Setup Steps (done once, outside of PRs)

These require browser/console access and cannot be done by Claude automatically.

### Step 1 — MongoDB Atlas (two projects, one account)
1. Log in to existing Atlas account
2. Create new **Project**: `article-writer-dev` → free M0 cluster → user `aw-dev-user` → Network: allow all IPs
3. Create new **Project**: `article-writer-prod` → free M0 cluster (upgrade to M10 when needed) → user `aw-prod-user` → Network: restrict to Railway IPs later
4. Copy both connection strings (replace `<password>`, set DB name: `article-writer-dev` / `article-writer-prod`)

### Step 2 — Railway (two projects, one Hobby account)
1. Log in to Railway
2. **New Project** → `article-writer-dev` → Add Service → GitHub repo → branch: **`dev`** → Auto-deploy ON
3. **New Project** → `article-writer-prod` → Add Service → GitHub repo → branch: **`main`** → Auto-deploy ON (or manual)
4. In each project Variables tab, add all env vars from the checklist below
5. Note both Railway-generated URLs

### Step 3 — Google OAuth (existing Cloud project, add redirect URIs)
1. Google Cloud Console → APIs & Services → Credentials → existing OAuth 2.0 Client
2. Add all redirect URIs:
   ```
   http://localhost:3000/auth/google/callback
   https://<railway-dev-url>/auth/google/callback
   https://<railway-prod-url>/auth/google/callback
   ```
3. Save — same Client ID and Secret work for all environments

### Step 4 — GitHub branch protection
1. GitHub → repo Settings → Branches → Add rule: `main` → Require PR + 1 review, require status checks
2. Add rule: `dev` → Require PR + 1 review
3. Create `dev` branch from `main` if it doesn't exist: `git checkout -b dev && git push -u origin dev`

---

## Environment Variable Checklist

| Variable | Dev value | Prod value |
|---|---|---|
| `NODE_ENV` | `development` | `production` |
| `MONGODB_URI` | Atlas dev connection string | Atlas prod connection string |
| `SESSION_SECRET` | Any 32-char string | `openssl rand -hex 32` output |
| `GOOGLE_CLIENT_ID` | Same for both | Same for both |
| `GOOGLE_CLIENT_SECRET` | Same for both | Same for both |
| `GOOGLE_CALLBACK_URL` | `http://localhost:3000/auth/google/callback` | Railway prod URL + `/auth/google/callback` |
| `GROQ_API_KEY` | Dev key (or shared) | Prod key |
| `NCBI_API_KEY` | Optional | Optional |
| `LOG_LEVEL` | `debug` | `info` |
| `ENCRYPTION_KEY` | Any 32-char string | `openssl rand -hex 32` output |
| `BUILD_SHA` | Set by CI | Set by CI |

---

## PRs in This Sprint

### PR 1 — `chore/git-branching`
- Create `dev` branch from `main` (if not exists)
- Update `docs/RULES.md`: add conventional commit format requirements, document `dev → main` release flow
- Add `.github/PULL_REQUEST_TEMPLATE.md`

### PR 2 — `chore/dev-prod-env`
- Update `server.js` line 1:
  ```js
  const _envFile = process.env.NODE_ENV === 'production' ? '.env' : `.env.${process.env.NODE_ENV || 'development'}`;
  require('dotenv').config({ path: _envFile });
  ```
- Update `package.json` scripts:
  ```json
  "start": "NODE_ENV=production node server.js",
  "dev":   "NODE_ENV=development node server.js"
  ```
- Update `.gitignore`: `.env` → `.env*` + `!.env.example`
- Update `.env.example` to document all variables with dev vs prod notes
- Create `.env.development` locally (not committed)

### PR 3 — `chore/semantic-release`
- Install: `npm install --save-dev semantic-release @semantic-release/commit-analyzer @semantic-release/release-notes-generator @semantic-release/npm @semantic-release/git @semantic-release/github`
- Add `.releaserc.json`:
  ```json
  {
    "branches": [
      "main",
      { "name": "dev", "prerelease": "dev" }
    ],
    "plugins": [
      "@semantic-release/commit-analyzer",
      "@semantic-release/release-notes-generator",
      ["@semantic-release/npm", { "npmPublish": false }],
      "@semantic-release/git",
      "@semantic-release/github"
    ]
  }
  ```
- Add `GET /api/version` endpoint (reads `package.version` + `process.env.BUILD_SHA`)
- Add version + environment badge to app footer: `v1.0.0-dev.1 · a3f2b1c` (dev) / `v1.0.0 · a3f2b1c` (prod)
- Badge color: blue pill for dev, grey pill for prod

### PR 4 — `chore/ci-cd`
- Add `.github/workflows/ci.yml`: on push to any branch → `npm run lint` + `npm test`
- Add `.github/workflows/deploy-dev.yml`: on push to `dev` (after CI passes) → Railway deploy dev + inject `BUILD_SHA`
- Add `.github/workflows/deploy-prod.yml`: on push to `main` (after CI passes) → `semantic-release` → Railway deploy prod + inject `BUILD_SHA`

---

## New Test Requirements

| File | Type | Covers |
|---|---|---|
| `tests/unit/config.test.js` | Unit | Startup validation: throws with clear message on missing required env vars |
| `tests/unit/version-endpoint.test.js` | Unit | `/api/version` returns correct `version`, `sha`, `env` fields |

## Definition of Done

- [ ] `npm run dev` starts locally, connects to Atlas **dev** cluster
- [ ] `npm start` connects to Atlas **prod** cluster
- [ ] App footer shows version badge with correct env label and SHA
- [ ] Push to `dev` → CI passes → Railway dev URL auto-deploys, shows updated SHA
- [ ] Push to `main` → CI passes → `semantic-release` bumps version → Railway prod URL auto-deploys
- [ ] Dev and prod show different SHAs (and different version if semver bumped)
- [ ] All existing tests green (`npm test`)
- [ ] No existing functionality broken (manual smoke test: login, create article, AI generate, export DOCX)

**Effort:** ~1 day coding + 2–3 hours manual setup (Atlas, Railway, Google OAuth, GitHub branch protection)
