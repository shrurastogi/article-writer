# Development Rules — Medical Article Writer

These rules apply to all contributors and to every Claude Code session working in this repository. Claude must read and follow these rules before making any changes.

---

## 1. Git & Branching

- **Never commit directly to `main`.** All changes must go through a pull request.
- Branch naming: `feature/<short-description>`, `fix/<short-description>`, `chore/<short-description>`, `docs/<short-description>`, `test/<short-description>`, `refactor/<short-description>`
- One logical change per branch. Do not bundle unrelated changes.
- PRs require at least one review before merging (self-review acceptable for solo contributors, but the PR step is mandatory).
- PR title format: `<type>: <short description>` — e.g. `feat: add Google OAuth login`
- Every PR must pass the CI test and lint gates before merge (see Section 6).
- Delete the branch after the PR is merged.

### Release Flow

```
feature/* or chore/* or fix/*
        ↓ PR
       dev  ← integration branch; auto-deploys to Railway dev
        ↓ PR (when ready to release)
       main ← production; triggers semantic-release + Railway prod deploy
```

- All day-to-day work merges into `dev`, not `main`.
- Merges to `main` trigger `semantic-release`, which reads conventional commits since the last release and bumps the version automatically.
- Never merge directly to `main` without going through `dev` first (except Sprint 2 setup PRs that establish the `dev` branch itself).

### Conventional Commit Format (required for semantic-release)

All commits **must** use the conventional commit format. `semantic-release` reads commit messages to determine the next version number automatically. Non-conforming commits are ignored by the version bump logic.

| Prefix | Meaning | Version bump |
|---|---|---|
| `feat:` | New user-facing feature | MINOR (e.g. 1.0.0 → 1.1.0) |
| `fix:` | Bug fix | PATCH (e.g. 1.0.0 → 1.0.1) |
| `feat!:` | Breaking change | MAJOR (e.g. 1.0.0 → 2.0.0) |
| `chore:` | Tooling, deps, config — no production code | No bump |
| `docs:` | Documentation only | No bump |
| `refactor:` | Code restructure without behaviour change | No bump |
| `test:` | Adding or updating tests | No bump |
| `perf:` | Performance improvement | PATCH |

**Examples:**
```
feat: add dark mode toggle with GSK-compliant theme
fix: prevent auto-save on locked articles
chore: add semantic-release configuration
refactor: extract sectionContext to src/services/sectionContext.js
test: add integration tests for article CRUD endpoints
docs: update ARCHITECTURE.md for Sprint 1 modular structure
feat!: replace 13 pre-defined sections with 7 standard sections
```

Scope is optional: `feat(auth): add Google OAuth callback` is also valid.

**Never use** vague messages like `fix bug`, `update`, or `wip` — they produce no version bump and provide no history value.

---

## 2. Sprint Planning

- All new features must be planned in a sprint before implementation begins.
- Create a sprint plan file at `docs/sprints/SPRINT-<N>.md` using the template below.
- The sprint plan must reference PRD feature IDs (e.g. `F10-1`, `F11-2`) for every work item.
- No code for a feature is written until it appears in an active sprint plan.
- Sprint files are never deleted — they form a permanent record of what was planned vs. delivered.

**Sprint file template:**
```markdown
# Sprint N — <Theme>

| Field | Value |
|---|---|
| Sprint | N |
| Start | YYYY-MM-DD |
| End | YYYY-MM-DD |
| Goal | One sentence |

## Planned Items
| ID | PRD Ref | Description | Status |
|---|---|---|---|
| S<N>-1 | F10-1 | Google sign-in backend | 📋 Planned |

## Notes
```

---

## 3. Documentation

- All product artifacts live in `docs/`: PRD, architecture, sprint plans, API docs, rules.
- `docs/PRD.md` is the source of truth for what is being built and why.
- `docs/ARCHITECTURE.md` must be updated whenever the system architecture changes (new endpoints, new storage layer, new external dependencies).
- `docs/API.md` must be updated whenever a new API endpoint is added or an existing one changes.
- `CLAUDE.md` (repo root) is the entry point for Claude Code — it must always reference the docs that are relevant to the current session.
- Do not put architecture decisions, product decisions, or API contracts in commit messages alone — they must be in a `docs/` file.

---

## 4. Coding Standards

### Naming Conventions
- **Files**: `kebab-case` (e.g. `auth-router.js`, `article-store.js`)
- **Variables / functions**: `camelCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **CSS classes**: `kebab-case`
- **Database collections / table names**: `snake_case`
- **Environment variables**: `UPPER_SNAKE_CASE` in `.env`

### JavaScript
- Use `const` by default; `let` only when reassignment is required. Never `var`.
- Prefer `async/await` over `.then()` chains.
- All async functions must have `try/catch` error handling.
- No `console.log` in production code — use the structured logger (see Section 4, Logging).
- No hardcoded secrets, API keys, or URLs. Use environment variables.

### Error Handling
- Every Express route must catch errors and return a structured JSON error response:
  ```js
  res.status(5xx).json({ error: "Human-readable message", code: "MACHINE_CODE" })
  ```
- Client-side fetch calls must handle non-2xx responses and display a user-facing error via `showToast()`.
- Never swallow errors silently — log them (server) or surface them (client).
- Validate all user-supplied input at the boundary (Express route entry). Do not trust the frontend.

### Logging
- Server-side: use a structured logger (e.g. `pino` or `winston`). Do not use `console.log`.
- Log format: JSON with fields `level`, `msg`, `timestamp`, and any relevant context (e.g. `userId`, `endpoint`).
- Log levels: `error` for caught exceptions, `warn` for recoverable issues, `info` for significant events (server start, auth events), `debug` for development detail (disabled in production).
- Never log PII (email addresses, full names, article content).

### Exception Handling Checklist (per PR)
- [ ] All async functions wrapped in `try/catch`
- [ ] All Express routes return structured error JSON on failure
- [ ] No unhandled promise rejections
- [ ] External API failures (Groq, NCBI) degrade gracefully — error surfaced to user, not a server crash

---

## 5. Brand & Design

- **Color palette follows GSK brand guidelines.** See CSS variables in `public/style.css` (post-Sprint 3 refactor) — do not introduce new colors without updating the variable definitions.
- GSK primary orange: `#F36633`
- GSK navy: `#1A1F71`
- The GSK logo in the header (`assets/gsk-logo.svg`) must not be removed or restyled.
- Any new UI component must use existing CSS variables — no inline hex values.
- UI copy (button labels, placeholders, toast messages) must be professional and concise. No emoji in production UI except existing approved icons (✨, 💡, ✍, ↺, ✕).

**Dark Mode Exception (Decision D1, 2026-04-04):** A dark theme variant is permitted alongside the standard GSK light theme. The dark theme uses dark backgrounds (`#1a1a2e`, `#16213e`) with GSK orange (`#F36633`) and GSK navy (`#1A1F71`) as accent colors. Implement using a `[data-theme="dark"]` CSS attribute on `<html>` with overriding CSS variable values. The GSK logo and brand identity remain unchanged in both themes. Do not introduce non-GSK accent colors in either theme.

---

## 6. Testing & CI

See `docs/TESTING.md` for the full testing strategy, directory structure, tooling setup, and edge case catalogue. This section summarises the mandatory rules.

### Test types and where they live

| Type | Location | Runner | Required on |
|---|---|---|---|
| Unit | `tests/unit/` | Jest | Every PR — CI gate |
| Integration | `tests/integration/` | Jest + `mongodb-memory-server` | Every PR — CI gate |
| E2E | `tests/e2e/` | Playwright | Nightly + pre-release |
| Performance | `tests/performance/` | autocannon | Pre-production deploy |

### Rules per PR

- Every new **service function or utility** must have a unit test.
- Every new **API endpoint** must have integration tests covering the happy path and the top error paths.
- Every new **user-facing flow** must have a corresponding E2E spec (can be added in a follow-up PR within the same sprint).
- Run `npm test` locally before opening a PR. **Do not open a PR with failing tests.**
- Run `npm run lint` locally before opening a PR. **Do not open a PR with lint errors.**
- The CI pipeline (GitHub Actions) blocks merge if unit/integration tests or lint fail.
- Coverage threshold is enforced by Jest: 80% lines/functions, 70% branches globally. PRs that drop below threshold are blocked.

### Performance tests

- Performance tests are not part of the standard CI gate (they take too long).
- Run `tests/performance/*.perf.js` manually before merging to `main` if the PR touches AI endpoints, export, or the articles list endpoint.
- Compare results to `tests/performance/baselines.json`. A regression > 20% on any metric must be investigated before deploy.

---

## 7. API Documentation

- Every API endpoint must have an entry in `docs/API.md`.
- Format per endpoint: method, path, description, request body (fields + types), response body, error responses, example.
- Update `docs/API.md` in the same PR that adds or changes the endpoint — not in a follow-up.
