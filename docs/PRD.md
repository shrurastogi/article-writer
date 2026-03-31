# Product Requirements Document: Medical Article Writer

---

## Document Info

| Field | Value |
|---|---|
| Product | Medical Article Writer |
| Version | 1.1 |
| Last Updated | 2026-03-31 |
| Status | Living Document |

**How to use this document:** Features marked ✅ are shipped. Features marked 📋 are planned. Add new requirements under the relevant module or in Section 9 (Roadmap). Each requirement has a short ID (e.g. `F2-3`) for cross-referencing.

---

## 1. Overview

Medical Article Writer is a browser-based AI writing tool that helps clinicians, researchers, and medical writers compose structured, peer-reviewed review articles. It provides a structured section editor, AI draft generation grounded in real PubMed literature, reference management, and professional export to PDF and Word.

The app runs as a lightweight Node/Express server with a single-file frontend. Users sign in with Google to access a personal dashboard where all their articles are saved server-side and accessible across devices.

---

## 2. Problem Statement

Writing a peer-reviewed medical review article is time-intensive and structurally demanding. Authors must:
- Maintain consistent narrative flow across 10+ distinct sections
- Ground every claim in citable evidence
- Balance completeness with conciseness
- Format exports to journal standards

Existing tools (Word, Google Docs) provide no structural guidance, no AI assistance grounded in real literature, and no coherence checking. General AI tools (ChatGPT) hallucinate citations and have no sense of article structure.

---

## 3. Target Users

### Primary — Clinical Researcher / Academic Physician
Writing systematic review or narrative review articles for peer-reviewed journals. Has deep domain expertise but limited time. Wants AI to accelerate drafting, not replace clinical judgement.

### Secondary — Medical Writer
Professional writer creating content for pharmaceutical companies, academic institutions, or clinical trial teams. Needs reliable citation grounding and journal-quality output.

### Tertiary — Resident / Fellow
Writing a first review article as part of training. Needs structural scaffolding and guidance on what to cover in each section.

---

## 4. Goals

| Goal | Metric |
|---|---|
| Reduce time to first full draft | Target: < 2 hours for a 13-section review |
| All AI output grounded in real literature | 100% of generated content uses PubMed abstracts or full-text as context when papers are selected |
| Export ready for journal submission | DOCX and PDF output require no manual reformatting |
| Zero data loss | Auto-save ensures work is never lost on accidental close |
| Article history | Users can access all previously created articles from any device after sign-in |

---

## 5. Feature Requirements

Status legend: ✅ Completed · 📋 Planned · 🔄 In Progress

---

### Module F1 — Article Setup

| ID | Feature | Description | Status |
|---|---|---|---|
| F1-1 | Medical Topic | Free-text field that seeds all AI prompts with domain context | ✅ |
| F1-2 | Article Metadata | Title, Authors & Affiliations, Keywords fields | ✅ |
| F1-3 | Live Metadata in Preview | Title, authors, keywords render immediately in the preview pane | ✅ |
| F1-4 | Auto-save | All content saved to `localStorage` with 1500ms debounce. Restored on page load | ✅ |
| F1-5 | Clear All | Wipes all sections, metadata, library, and localStorage with confirmation | ✅ |

---

### Module F2 — Section Editor

| ID | Feature | Description | Status |
|---|---|---|---|
| F2-1 | 13 Pre-defined Sections | Abstract, Introduction, Epidemiology, Pathophysiology, Diagnosis, Staging, Treatment (ND), Treatment (R/R), Novel Therapies, Supportive Care, Future Directions, Conclusion, References — in fixed order | ✅ |
| F2-2 | Accordion Layout | Each section collapses/expands. Only open sections are visible | ✅ |
| F2-3 | Per-section Textarea | Freeform text input for each section | ✅ |
| F2-4 | Notes / Hints Field | Per-section optional input to guide AI generation (e.g. "focus on CAR-T post 2022") | ✅ |
| F2-5 | Per-section Word Count | Live word count badge on each section header | ✅ |
| F2-6 | Total Word Count | Running total in the header bar across all sections and metadata | ✅ |
| F2-7 | Add Custom Section | Modal to add a custom-titled section at any position before References | ✅ |
| F2-8 | Rename Custom Section | Inline rename for user-created sections | ✅ |
| F2-9 | Delete Section | Remove any section (custom or pre-defined) | ✅ |
| F2-10 | Custom Section Persistence | Custom sections saved to localStorage and restored on page load | ✅ |

---

### Module F3 — AI Writing Assistance

All AI calls stream responses token-by-token into the AI suggestion box. The suggestion box supports Apply (copies to textarea) and Dismiss.

| ID | Feature | Description | Status |
|---|---|---|---|
| F3-1 | Generate Draft | Generates a full section draft using topic + section context + notes + selected library papers | ✅ |
| F3-2 | Improve | Rewrites existing section text for academic rigor, flow, and citation style | ✅ |
| F3-3 | Key Points | Lists essential topics, landmark trials, and recent data to cover in a section. Uses selected library papers as grounding | ✅ |
| F3-4 | Expand to Prose | Converts bullet points or rough notes in the textarea into flowing academic prose | ✅ |
| F3-5 | Refine | After generation, user types an instruction (e.g. "make more concise", "add MAIA trial data") to iteratively refine the AI output | ✅ |
| F3-6 | Undo Refinement | Up to 5 levels of undo within the AI suggestion box | ✅ |
| F3-7 | Editable AI Box | AI suggestion text is directly editable before applying | ✅ |
| F3-8 | Section-aware Prompts | Each section has a distinct, topic-aware system prompt (e.g. references section requests Vancouver format, abstract requests structured IMRAD format) | ✅ |
| F3-9 | Paper Flow Checker | AI reviews the full article across all filled sections and returns: overall verdict, section-by-section transition analysis (✅/⚠️/❌), specific issues found, and numbered recommendations | ✅ |

---

### Module F4 — Reference Management

| ID | Feature | Description | Status |
|---|---|---|---|
| F4-1 | Reference Library Panel | Collapsible panel with two tabs: References and PubMed Search | ✅ |
| F4-2 | PMID Import | Paste comma- or newline-separated PMIDs; fetch metadata + OA full-text from NCBI in batch | ✅ |
| F4-3 | OA Full-text Enrichment | For Open Access papers, fetches full-text via PMC BioC API (intro, results, discussion, conclusion, abstract) up to 6000 chars | ✅ |
| F4-4 | OA Badge | Library entries sourced from OA papers display an "OA" badge | ✅ |
| F4-5 | Library AI Toggle | Per-entry "Use in AI" toggle. Selected entries feed their abstract/full-text as context to all AI actions | ✅ |
| F4-6 | Select All / Deselect All | Bulk toggle all library entries for AI context | ✅ |
| F4-7 | Sync References Section | Overwrites the References textarea with a numbered Vancouver-style list generated from the library | ✅ |
| F4-8 | Remove from Library | Delete individual entries from the library | ✅ |
| F4-9 | PubMed Search Tab | Live search PubMed by keyword (defaults to Medical Topic if blank). Returns up to 10 results with title, authors, journal, year, PMID, and abstract | ✅ |
| F4-10 | Add to Library from Search | Single "Add to Library" button per search result. Adds article to library (selected by default), appends citation to References section, and marks button as "✓ In Library" | ✅ |
| F4-11 | Citation Linking in Preview | `[Author et al., Year]` placeholders in section text are converted to superscript reference numbers in the preview, linked to the matching library entry | ✅ |
| F4-12 | Unmatched Citation Highlight | Citations not found in the library are highlighted in amber in the preview | ✅ |

---

### Module F5 — Tables

| ID | Feature | Description | Status |
|---|---|---|---|
| F5-1 | Generate Table | Per-section modal: user describes the table in plain English; AI returns a formatted HTML table with caption, headers, and data rows. Grounded in selected library papers if present | ✅ |
| F5-2 | Table Preview in Editor | Generated tables render inline below the section textarea | ✅ |
| F5-3 | Delete Table | Remove any generated table from a section | ✅ |
| F5-4 | Tables in Preview | Tables render in the article preview pane with journal-style formatting | ✅ |
| F5-5 | Tables in DOCX Export | Tables are exported as native Word tables in the DOCX file | ✅ |

---

### Module F6 — Export

| ID | Feature | Description | Status |
|---|---|---|---|
| F6-1 | PDF Export | Client-side export via html2pdf.js. Renders `#article-preview` directly — WYSIWYG output on A4 | ✅ |
| F6-2 | DOCX Export | Server-side export via `docx` package. Produces properly formatted Word document with title, authors, keywords, section headings, body paragraphs, and tables | ✅ |
| F6-3 | Auto-named File | Exported files are named from the article title (sanitised, underscored, 60-char max) | ✅ |

---

## 6. User Flows

### UF-1: Start a New Article

1. Open app at `http://localhost:3000`
2. Enter **Medical Topic** (e.g. "Multiple Myeloma") — this seeds all AI calls
3. Enter Article Title, Authors & Affiliations, Keywords
4. Preview pane on the right updates live
5. Work is auto-saved to localStorage; resuming later restores all content

---

### UF-2: Write a Section with AI (Generate Draft)

1. Click a section header to expand it
2. *(Optional)* Type notes in the hints field — e.g. "emphasise MAIA trial, include updated NCCN guidelines"
3. *(Optional)* Ensure relevant papers are selected in the Reference Library ("✓ In AI")
4. Click **✨ Generate Draft**
5. AI streams a draft into the suggestion box below the textarea
6. Review and edit the suggestion directly in the box
7. *(Optional)* Type a refinement instruction and click **↺ Refine** — e.g. "cut to 400 words", "add more on proteasome inhibitors"
8. *(Optional)* Click **↩ Undo** to revert a refinement
9. Click **Apply** — draft moves into the section textarea
10. Content is auto-saved

---

### UF-3: Improve Existing Text

1. Write or paste content into any section textarea
2. Click **✨ Improve**
3. AI rewrites the text for academic rigour, flow, and citation placeholders
4. Review → Apply or Dismiss

---

### UF-4: Bullet Points to Prose

1. Paste rough notes or bullet points into a section textarea
2. Click **✍ Expand to Prose**
3. AI converts them to flowing academic prose, preserving all content
4. Review → Refine if needed → Apply

---

### UF-5: Discover What to Cover (Key Points)

1. *(Optional)* Select relevant library papers ("✓ In AI")
2. Click **💡 Key Points** on any section
3. AI returns a bulleted list of essential topics, landmark trials, and recent data specific to that section
4. Use the list as a writing guide — it appears in the suggestion box (Apply disabled; informational only)

---

### UF-6: Import References by PMID

1. Open **Reference Library** panel → **References** tab
2. Paste PMIDs (comma- or newline-separated) into the text area
3. Click **Fetch References**
4. App calls NCBI: fetches metadata for all PMIDs, checks PMC for OA full-text
5. Articles appear in the library numbered, with OA badge where applicable
6. By default all fetched articles are selected ("✓ In AI")
7. Toggle individual articles off with the "Use in AI" / "✓ In AI" button
8. Click **↺ Sync References** to overwrite the References section with a numbered Vancouver list

---

### UF-7: Find References via PubMed Search

1. Open **Reference Library** panel → **PubMed Search** tab
2. Type a query (or leave blank to use the Medical Topic)
3. Click **Search** or press Enter
4. Up to 10 results appear with title, authors, journal, year, PMID, and abstract
5. Click **Show more** to expand a long abstract
6. Click **+ Add to Library** on any result
7. Article is added to the Reference Library (selected by default), citation appended to the References section
8. Button changes to **✓ In Library** (disabled) — no duplicates possible
9. Switch to **References** tab to manage AI toggles

---

### UF-8: Generate a Table

1. Expand a section, click **+ Table**
2. Describe the table — e.g. "Comparison of approved CAR-T therapies: product, trial, ORR, PFS, key toxicities"
3. Click **Generate Table**
4. AI returns a formatted HTML table; it renders inline below the section textarea and in the preview
5. Table is included in both PDF and DOCX exports
6. Click **✕** on any table card to delete it

---

### UF-9: Check Paper Coherence

1. Fill content in at least 2 sections
2. Scroll to the **Check Paper Flow** panel at the bottom of the left column
3. Click **Run Check**
4. AI analyses all filled sections and streams back:
   - **Overall Assessment** — one-sentence verdict
   - **Section-by-Section Flow** — ✅ / ⚠️ / ❌ for each adjacent section pair with reasons
   - **Key Issues Found** — specific problems named by section
   - **Recommendations** — numbered, actionable fixes
5. Return to specific sections and use **↺ Refine** or edit directly to address issues
6. Re-run the check to verify improvements

---

### UF-10: Export the Article

1. Review the article in the live preview pane (right column)
2. For PDF: click **⬇ PDF** — browser renders `#article-preview` and downloads A4 PDF
3. For Word: click **⬇ DOCX** — server builds a `.docx` file with all sections and tables, browser downloads it
4. File is named from the article title automatically

---

### UF-11: Sign In with Google

1. User visits the app URL
2. If not authenticated, redirected to login page
3. Click **Sign in with Google**
4. Google OAuth consent screen — user grants permission
5. Redirected back to the app, session established
6. Lands on the article dashboard (UF-12)

---

### UF-12: View and Manage Articles (Dashboard)

1. After sign-in, user sees a grid/list of all their articles
2. Each card shows: article title (or "Untitled"), medical topic, last updated date, total word count
3. Click any card → opens the article in the editor
4. Click **+** → creates a new blank article and opens the editor (UF-13)
5. Click the delete icon on a card → confirmation dialog → article permanently deleted

---

### UF-13: Create a New Article

1. From the dashboard, click the **+** (New Article) button
2. A new blank article is created server-side with a default title "Untitled Article"
3. Editor opens with all 13 sections empty
4. User fills in Medical Topic, Title, Authors, Keywords
5. Changes auto-save to the server every 1500ms
6. User can return to the dashboard at any time; the article persists under their account

---

## 7. Technical Constraints

| Constraint | Detail |
|---|---|
| Runtime | Node.js v18+ |
| AI Provider | Groq API (`llama-3.3-70b-versatile`). Requires `GROQ_API_KEY` in `.env` |
| PubMed | NCBI E-utilities (free). Optional `NCBI_API_KEY` raises rate limit from 3 to 10 req/s |
| Storage | Currently `localStorage` only. Planned: server-side DB per user account (see F11-3). TBD: MongoDB vs PostgreSQL vs SQLite |
| Auth | Planned: Google OAuth 2.0 via Passport.js or similar. Requires `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` in `.env` |
| Streaming | All AI endpoints use chunked transfer encoding (`text/plain`) |
| PDF | Client-side only via `html2pdf.js` CDN. No server involvement |
| DOCX | Server-side via `docx` npm package |
| Section content | Each section stores `{ prose: string, tables: [] }`. Max ~2000 chars per section sent to coherence check |

---

## 8. Known Limitations

- `localStorage` cap (~5MB) limits total article size including library *(resolved by F11-3 server-side storage)*
- No multi-user or collaboration support *(partially resolved by F10/F11 — each user has isolated articles)*
- OA full-text availability depends on PMC Open Access Subset; most articles provide abstract only
- Citation matching (`[Author et al., Year]`) is fuzzy — relies on surname + year; disambiguation not supported
- No version history beyond 5-step refinement undo within a session

---

### Module F10 — User Authentication

| ID | Feature | Description | Status |
|---|---|---|---|
| F10-1 | Google Sign-in | OAuth 2.0 login via Google. Users authenticate with their Google account — no separate password | 📋 |
| F10-2 | Session management | Server-side session persists login state. Auto-redirect to login page if unauthenticated | 📋 |
| F10-3 | Sign-out | Clear session and redirect to login page | 📋 |
| F10-4 | User identity in header | Display signed-in user's name and avatar (from Google profile) in the app header | 📋 |

---

### Module F11 — Article Management

| ID | Feature | Description | Status |
|---|---|---|---|
| F11-1 | Article dashboard | Landing page after login showing all articles belonging to the user. Displays article title, topic, last updated date, and word count | 📋 |
| F11-2 | New article button | "+" button on the dashboard to create a new blank article and open it in the editor | 📋 |
| F11-3 | Server-side article storage | Each article (sections, metadata, library, custom sections) stored server-side linked to the user's account. Replaces localStorage as the persistence layer | 📋 |
| F11-4 | Auto-save to server | On every change, article state is persisted to the server (debounced, same 1500ms pattern). localStorage used as a fallback write-behind cache | 📋 |
| F11-5 | Open existing article | Click any article on the dashboard to open it in the editor | 📋 |
| F11-6 | Delete article | Delete an article from the dashboard with confirmation. Permanently removes all sections, library, and tables | 📋 |
| F11-7 | Article last-updated timestamp | Each article card on the dashboard shows when it was last edited | 📋 |

---

### Module F12 — Testing & Quality

| ID | Feature | Description | Status |
|---|---|---|---|
| F12-1 | Unit tests for server endpoints | Jest test suite covering all `/api/*` endpoints with mocked Groq and NCBI calls. Validates request validation, error handling, and response shape | 📋 |
| F12-2 | Unit tests for frontend utilities | Tests for `parsePubMedXML`, `enhanceCitations`, `getSelectedPubmedContext`, `wordCount`, and `htmlEsc` functions | 📋 |
| F12-3 | Integration tests for PubMed pipeline | Tests for the full PMID fetch → enrich → parse flow with recorded NCBI fixture responses | 📋 |
| F12-4 | E2E tests for critical user flows | Playwright tests covering: article creation, section generate/apply, add to library, PDF/DOCX export, Google login flow | 📋 |
| F12-5 | CI pipeline — test gate | GitHub Actions workflow that runs the full test suite on every PR. PRs cannot be merged if tests fail | 📋 |
| F12-6 | CI pipeline — lint gate | ESLint run on every PR to catch syntax errors and undefined references before merge | 📋 |

---

## 9. Roadmap / Backlog

*Add planned features here. Use the same table format as Section 5.*

### Module F7 — Planned: Citation & Reference Improvements

| ID | Feature | Description | Status |
|---|---|---|---|
| F7-1 | DOI / URL support | Allow importing references by DOI or URL in addition to PMID | 📋 |
| F7-2 | Citation format selector | Export citations in Vancouver, APA, AMA, or custom format | 📋 |
| F7-3 | Section-specific full-text | Store BioC sections (intro, results, discussion) separately to enable section-matched literature context | 📋 |

### Module F8 — Planned: Editor Improvements

| ID | Feature | Description | Status |
|---|---|---|---|
| F8-1 | Rich text editor | Replace plain textarea with lightweight rich-text editor (bold, italic, lists) | 📋 |
| F8-2 | Section reordering | Drag-and-drop to reorder sections | 📋 |
| F8-3 | Word count targets | Per-section target word counts with progress indicator | 📋 |

### Module F9 — Planned: Collaboration & Persistence

| ID | Feature | Description | Status |
|---|---|---|---|
| F9-1 | Export/import project | Save and load full article state as a JSON file | 📋 |
| F9-2 | Multi-article management | Support multiple articles in localStorage with a project switcher | 📋 |

---

## 10. Open Questions

| # | Question | Raised | Resolution |
|---|---|---|---|
| Q1 | Should the topic field lock the article to a specific disease (e.g. MM) or remain fully general? | 2026-03-31 | Remains general — topic field used to guide AI, not enforce structure |
| Q2 | Should "Add to Library" auto-open the References tab to confirm the addition? | 2026-03-31 | Open |
| Q3 | Which database for server-side article storage? MongoDB (flexible JSON), PostgreSQL (relational, strong consistency), or SQLite (zero-infra, single-file)? | 2026-03-31 | Open |
| Q4 | Should auto-save to server be a full-article overwrite or a diff/patch? Full overwrite is simpler; diff reduces bandwidth for large articles | 2026-03-31 | Open |
| Q5 | Should the dashboard support article search/filter (by topic, date, word count)? | 2026-03-31 | Open |
| Q6 | Which test framework for E2E? Playwright (recommended — better WSL support) vs Cypress | 2026-03-31 | Open |
| Q7 | Should Google login be the only auth method, or also support email/password as fallback? | 2026-03-31 | Open |

---

## 11. Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-03-31 | Merged "Use in AI" + "Add to References" into single "Add to Library" button | Two parallel AI context flows (in-memory Set vs. persistent library) were fragile and confusing. Library is single source of truth |
| 2026-03-31 | PubMed Search moved into Reference Library as a tab | Reduces panel count; reinforces that search → library is the intended flow |
| 2026-03-31 | Key Points uses selected library papers as context | Makes Key Points actionable based on the author's actual evidence base, not just general knowledge |
| 2026-03-31 | Google OAuth chosen over email/password for initial auth | Eliminates password management complexity; target users (clinicians, researchers) universally have Google accounts |
| 2026-03-31 | Server-side storage replaces localStorage as persistence layer | localStorage is device-bound and capped at ~5MB; server-side storage enables multi-device access and removes the size constraint |
| 2026-03-31 | Test gate added to PR process (F12-5) | Prevents regressions as the codebase grows beyond two files; critical before adding auth and database layers |
