# Sprint 5 — Dashboard & Editor Enhancements

**Status:** ✅ Complete  
**Dates:** 2026-04-05  
**Priority tier:** Medium  
**Renumbered from:** Sprint 3 (was SPRINT-3.md)

## Goals

Improve the dashboard with richer views, filtering, and article cloning. Add UI preferences
(dark mode, font zoom), grammar/style quality check, content language selector, section
drag-and-drop reordering, and the one-click agentic full-draft with human approval checkpoints.

---

## Features in Scope

| ID | Feature | PRD Ref | Notes |
|---|---|---|---|
| F11-8 | Dashboard List & Card Views | F11-8 | Toggle between card grid and compact list/table view; both show created + last modified |
| F11-9 | Dashboard Filtering | F11-9 | Text search + date range + word count filter; active filters shown as chips |
| F11-13 | Clone Article | F11-13 | Dashboard action — one-click duplicate, renames to "Copy of …", opens in editor |
| F8-4 | Spell Check | F8-4 | Browser-native `spellcheck="true"` on all textareas |
| F3-11 | User-supplied Context for AI | F3-11 | "Add Your Data" collapsible per section; passed as additional AI context |
| F15-1 | Dark Mode (GSK-compliant) | F15-1 | `[data-theme="dark"]` CSS variable set; GSK orange + navy as accents; toggle in header |
| F15-2 | Font Size Control | F15-2 | Increase/decrease base font via `--base-font-size` CSS variable; controls in header |
| F17-1 | Grammar & Style Check | F17-1 | New `/api/grammar-check` endpoint (Groq-powered); checks passive voice, sentence length, academic register |
| F19-1 | Content Language Selector | F19-1 | "Output Language" dropdown in article metadata; injected into all AI prompts |
| F20-2 | Section Drag-and-Drop Reorder | F20-2 | Drag handle on each section accordion; reorder persisted to `state.sections` order |
| F18-MVP | One-Click Full Draft (Agentic MVP) | F18 | "Write Full Article" button — sequentially calls existing AI endpoints for each section; human approve/skip checkpoint per section before proceeding |

---

## PR Sequence

| PR | Branch | Description |
|---|---|---|
| 1 | `feature/sprint5-dashboard-views` | List/Card view toggle; add `createdAt` display |
| 2 | `feature/sprint5-dashboard-filter` | Filter panel + chip UI; client-side filtering |
| 3 | `feature/sprint5-clone-article` | Clone endpoint `POST /api/articles/:id/clone`; dashboard button |
| 4 | `feature/sprint5-spell-check` | `spellcheck="true"` on all textareas |
| 5 | `feature/sprint5-user-data-context` | "Add Your Data" textarea per section; wire into AI payloads |
| 6 | `feature/sprint5-dark-mode` | CSS variable theme system; toggle button; update RULES.md |
| 7 | `feature/sprint5-font-zoom` | `--base-font-size` variable; +/- controls |
| 8 | `feature/sprint5-grammar-check` | `/api/grammar-check` endpoint + UI panel |
| 9 | `feature/sprint5-language-selector` | Language dropdown in metadata; prompt injection |
| 10 | `feature/sprint5-drag-drop` | Drag-and-drop section reorder |
| 11 | `feature/sprint5-one-click-draft` | "Write Full Article" agent MVP with per-section human checkpoints |

---

## Architecture Notes

- **Clone (PR 3):** Shallow copy of Article document — new `_id`, `title: "Copy of …"`, same `userId`, reset `createdAt`/`updatedAt`. Sections, library, and metadata all copied.
- **Dark mode (PR 6):** Add `[data-theme="dark"]` overrides to `public/style.css`. Toggle sets `data-theme` attribute on `<html>` and persists to `localStorage`. Update `RULES.md` to document approved dark theme as exception to GSK-only color rule.
- **Language selector (PR 9):** `article.language` field (default: `"English"`). All AI endpoints receive `language` in body and inject: *"Write in [language] at a clinical academic level."* PubMed search still returns English abstracts; AI synthesizes in target language.
- **One-click draft (PR 11):** New `POST /api/agent/draft` endpoint streams a multi-step SSE response. Steps: (1) search PubMed for topic → (2) for each section, generate draft → stream progress events to UI. Frontend shows progress panel with "Apply" / "Skip" per section. If user skips, section is unchanged.

---

## New Test Requirements

| File | Type | Covers |
|---|---|---|
| `tests/integration/clone.test.js` | Integration | Clone happy path (all content preserved, new `_id`, "Copy of …" title); clone of locked article |
| `tests/integration/agent-draft.test.js` | Integration | `POST /api/agent/draft` streams progress events; approve/skip per section |
| `tests/e2e/dashboard.spec.ts` | E2E | Card/List toggle; filter by text + date + word count; clone from dashboard; delete confirmation |
| `tests/e2e/flow-check.spec.ts` | E2E | Run flow check with 3 filled sections; verify recommendations appear; click "Apply to Section" |
| `tests/e2e/references.spec.ts` | E2E | PMID import; PubMed search + add to library; sync references section |

## Verification Checklist

- [ ] Dashboard: Card/List toggle; both views show title, topic, word count, dates
- [ ] Filtering: text search, date range, word count filter all work; Clear Filters resets
- [ ] Clone: "Copy of [title]" appears in dashboard; full content preserved
- [ ] Spellcheck: browser underlines misspelled words in all textareas
- [ ] "Add Your Data" content included in AI generation and persists on reload
- [ ] Dark mode: toggle switches theme; GSK orange/navy accents visible; preference persists across sessions
- [ ] Font zoom: +/- buttons change text size across the app; resets on "Reset"
- [ ] Grammar check: identifies passive voice, long sentences, informal language; shows in a panel
- [ ] Language selector: set to Spanish; Generate Draft produces Spanish academic text
- [ ] Sections can be reordered by drag; new order persists after page reload
- [ ] "Write Full Article": progress panel appears; each section shows approve/skip; approved sections populated in editor
