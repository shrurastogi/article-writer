# Sprint 6 — Collaboration, Versioning & Full Settings

**Status:** Planned  
**Dates:** TBD  
**Priority tier:** Medium  
**Renumbered from:** Sprint 4 (was SPRINT-4.md)

## Goals

Add article versioning with manual labels and restore, article locking for finalized papers,
sharing and collaboration access control, a dedicated View mode, and a full Settings page
covering BYOK API keys (LLM, NCBI), multi-provider model selection, default config with
one-click reset, and per-article writing style capture.

---

## Features in Scope

| ID | Feature | PRD Ref | Notes |
|---|---|---|---|
| F11-10 | View Mode + Article Locking | F11-10 | View (read-only) and Edit buttons on dashboard; explicit Lock/Unlock action stored as `article.isLocked`; owner only |
| F11-11 | Article Versioning | F11-11 | Auto-save snapshots (5-min interval, capped 50); manual "Save Version" button with label; version history panel with diff view (stretch) |
| F11-12 | Article Sharing (LWW) | F11-12 | Shareable read-only link (UUID shareToken); owner grants editor access per-user; last-write-wins for concurrent edits |
| F13-1 | BYOK — LLM API Key | F13-1 | AES-256-GCM encrypted key storage; per-user; fallback to server env key |
| F13-2 | LLM Model Selector | F13-2 | Sprint 4 (Groq + OpenAI + OpenRouter); Claude + Gemini deferred to Sprint 8 |
| F13-3 | NCBI API Key in Settings | F13-3 | User supplies own NCBI key; raises PubMed rate limit to 10 req/s |
| F13-4 | Default Config + Reset-to-Defaults | F13-4 | "Modified" badge on changed settings; single "Reset all" button; `DEFAULT_CONFIG` constant |
| F21 | Writing Style Capture (per article) | F21 | Paste sample text → AI generates style report card (sentence length, formality, voice ratio, citation density) → stored as `article.writingStyle`; injected into AI prompts |

---

## PR Sequence

| PR | Branch | Description |
|---|---|---|
| 1 | `feature/sprint6-view-lock` | Read-only view route; View/Edit/Lock/Unlock on dashboard + editor header; `isLocked` field on Article model |
| 2 | `feature/sprint6-versioning` | `ArticleVersion` Mongoose model; 5-min auto-snapshot; manual save + label; version history panel |
| 3 | `feature/sprint6-sharing` | `shareToken` + `collaborators` on Article; public read-only route; grant/revoke collaborator UI |
| 4 | `feature/sprint6-settings-page` | Full Settings page: BYOK (LLM + NCBI), model selector (Groq/OpenAI/OpenRouter), default config, reset-to-defaults |
| 5 | `feature/sprint6-writing-style` | Writing style section in article metadata; calibrate button; report card display; prompt injection |

---

## Architecture Notes

### Locking (PR 1)
- Add `isLocked: Boolean` (default `false`) to `Article` Mongoose schema.
- When `isLocked: true`: all textareas disabled, AI buttons hidden, auto-save skipped, editor header shows padlock icon.
- Only article owner can lock/unlock. Collaborators see locked state but cannot unlock.

### Versioning (PR 2)
- `ArticleVersion` collection: `{ articleId, userId, snapshot: Mixed, label: String, createdAt, wordCount }`.
- Trigger: 5-minute interval with change detection (compare hash of `state.sections` to last snapshot).
- Cap at 50 per article — delete oldest on overflow.
- Restore: save current state as new version first, then apply snapshot.

### Sharing (PR 3)
- `Article` gains `shareToken` (UUID v4) and `collaborators: [{ userId, role: 'viewer'|'editor' }]`.
- `GET /share/:token` — no auth, renders view mode.
- Real-time concurrent editing deferred to Sprint 8 (Socket.io + CRDT). LWW for now.

### Settings page (PR 4)
- `user.llmConfig: { provider, encryptedApiKey, model }` — AES-256-GCM encryption, `ENCRYPTION_KEY` env var.
- `user.researchConfig: { ncbiApiKey }` — similarly encrypted.
- `user.preferences` — stores UI defaults (theme, font size, language, strictContextMode).
- `DEFAULT_CONFIG` constant: Groq / llama-3.3-70b-versatile / HuggingFace embeddings / LanceDB / Light theme / English / Strict mode OFF.
- "Modified" badge: diff `user.preferences` against `DEFAULT_CONFIG` on every settings load.

### Writing Style (PR 5)
- `article.writingStyle: { sampleText, styleProfile: { avgSentenceLength, voiceRatio, formalityScore, hedgingFrequency, citationDensity }, calibratedAt }`.
- Calibration endpoint: `POST /api/articles/:id/calibrate-style` — sends sample to Groq, returns structured `styleProfile` JSON.
- Report card: displayed as a card in the article metadata panel after calibration.
- Injection: all AI endpoints read `article.writingStyle.styleProfile` and append style instruction to system prompt.

---

## Open Questions (resolved from FEATURE-EXPANSION-ANALYSIS.md)
- Q8 (BYOK key storage): Server-side AES-256-GCM ✅
- Q9 (versioning trigger): 5-minute interval with change detection ✅
- Q10 (collaboration concurrency): Last-write-wins in this sprint; real-time in Sprint 8 ✅

---

## New Test Requirements

| File | Type | Covers |
|---|---|---|
| `tests/integration/versioning.test.js` | Integration | Auto-snapshot (change detection); manual save with label; cap at 50 (oldest deleted); restore saves current first; restore on locked article (400) |
| `tests/integration/sharing.test.js` | Integration | Generate shareToken; public read-only route (no auth); grant collaborator; LWW concurrent save |
| `tests/integration/settings.test.js` | Integration | Save BYOK key (verify encrypted in DB, never returned plaintext); model list endpoint; reset to defaults |
| `tests/unit/services/encryptionService.test.js` | Unit | AES-256-GCM encrypt/decrypt round-trip; different plaintexts produce different ciphertexts; missing `ENCRYPTION_KEY` throws |

## Verification Checklist

- [ ] Dashboard: View button = read-only, Edit button = full editor, Lock button persists `isLocked: true`
- [ ] Locked article: all inputs disabled, auto-save skipped, padlock icon in editor header
- [ ] Unlock: owner can unlock; collaborator cannot
- [ ] Version history panel: lists timestamps, labels, word counts; Restore applies snapshot
- [ ] Version cap: after 50 versions, oldest is deleted on next snapshot
- [ ] Share link: opens article in view mode without login; URL contains UUID token
- [ ] Collaborator grant: invited user sees article in their dashboard with correct role
- [ ] Settings page: enter Groq/OpenAI/OpenRouter API key; model list populates from provider
- [ ] NCBI key: entered in settings; PubMed requests use it (verify with higher rate limit)
- [ ] "Modified" badge appears on changed settings; "Reset all" restores defaults in one click
- [ ] Writing style: paste sample → Calibrate → report card shows metrics
- [ ] AI generation: style profile injected into prompt; output matches user's academic voice
