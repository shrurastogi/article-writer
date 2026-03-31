# Development Rules — Medical Article Writer

These rules apply to all contributors and to every Claude Code session working in this repository. Claude must read and follow these rules before making any changes.

---

## 1. Git & Branching

- **Never commit directly to `main`.** All changes must go through a pull request.
- Branch naming: `feature/<short-description>`, `fix/<short-description>`, `chore/<short-description>`, `docs/<short-description>`
- One logical change per branch. Do not bundle unrelated changes.
- PRs require at least one review before merging (self-review acceptable for solo contributors, but the PR step is mandatory).
- PR title format: `<type>: <short description>` — e.g. `feat: add Google OAuth login`
- Every PR must pass the CI test and lint gates before merge (see Section 6).
- Delete the branch after the PR is merged.

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

- **Color palette follows GSK brand guidelines.** See CSS variables in `index.html` — do not introduce new colors without updating the variable definitions.
- GSK primary orange: `#F36633`
- GSK navy: `#1A1F71`
- The GSK logo in the header (`assets/gsk-logo.svg`) must not be removed or restyled.
- Any new UI component must use existing CSS variables — no inline hex values.
- UI copy (button labels, placeholders, toast messages) must be professional and concise. No emoji in production UI except existing approved icons (✨, 💡, ✍, ↺, ✕).

---

## 6. Testing & CI

- All new server-side functions must have accompanying unit tests in `tests/unit/`.
- All new API endpoints must have integration tests in `tests/integration/`.
- E2E tests for critical user flows live in `tests/e2e/`.
- Run `npm test` locally before opening a PR. Do not open a PR with failing tests.
- Run `npm run lint` locally before opening a PR. Do not open a PR with lint errors.
- The CI pipeline (GitHub Actions) blocks merge if tests or lint fail.

---

## 7. API Documentation

- Every API endpoint must have an entry in `docs/API.md`.
- Format per endpoint: method, path, description, request body (fields + types), response body, error responses, example.
- Update `docs/API.md` in the same PR that adds or changes the endpoint — not in a follow-up.
