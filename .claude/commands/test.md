# Testing Agent

You are acting as a **test engineer** for the Medical Article Writer project. Before writing tests, read `CLAUDE.md`, `docs/RULES.md`, and `docs/ARCHITECTURE.md`.

## Test structure

```
tests/
  unit/
    server/         # Unit tests for server.js functions (parsePubMedXML, getSectionContext, etc.)
    frontend/       # Unit tests for pure JS functions extracted from index.html
  integration/
    api/            # Integration tests for Express endpoints (mocked Groq + NCBI)
  e2e/
    flows/          # Playwright tests for critical user flows
  fixtures/
    pubmed/         # Recorded NCBI XML/JSON responses for deterministic tests
```

## What to test

### Unit tests (Jest)
- `parsePubMedXML(xml)` — structured abstract, plain abstract, missing fields, malformed XML
- `getSectionContext(topic, sectionId, sectionTitle)` — all 13 known section IDs, unknown ID fallback
- `parseTableHTML(html)` — headers, rows, empty table, missing tbody
- Frontend: `wordCount(text)`, `htmlEsc(str)`, `enhanceCitations(text, library)` — citation match, no match, amber highlight
- Frontend: `getSelectedPubmedContext()` — selected entries only, empty library, mix of OA and abstract-only

### Integration tests (Jest + supertest)
- `POST /api/generate` — missing topic (400), valid request streams text
- `POST /api/improve` — missing content (400), valid request
- `POST /api/keypoints` — with and without pubmedContext
- `POST /api/pubmed-search` — empty query (400), valid query returns articles array
- `POST /api/fetch-pmids` — invalid PMIDs filtered, max 50 enforced, enrichment pipeline
- `POST /api/export-docx` — returns valid .docx buffer, tables included
- `POST /api/coherence-check` — missing sections (400), valid request streams analysis

### E2E tests (Playwright)
- **Article creation**: open app → fill metadata → verify preview updates
- **Generate draft**: expand section → click Generate Draft → AI box appears → Apply → content in textarea
- **Expand to prose**: paste bullets → Expand to Prose → AI box → Apply
- **Add to library via PMID**: open Reference Library → paste PMID → Fetch → article in list
- **PubMed search tab**: switch tab → search → result appears → Add to Library → button disabled
- **Paper flow check**: fill 2+ sections → Run Check → output appears
- **PDF export**: fill title → click PDF → download triggered
- **DOCX export**: fill content → click DOCX → download triggered
- **Google login flow** *(once F10 is implemented)*: redirect to Google → mock OAuth → lands on dashboard

## Test conventions
- Test file naming: `<module>.test.js`
- Describe blocks: feature name. It blocks: `should <behaviour>`
- Mock all external calls (Groq, NCBI) — never hit real APIs in tests
- Use fixture files in `tests/fixtures/` for NCBI responses
- Each test must be independent — no shared mutable state between tests
- Run with `npm test`; individual file: `npm test -- tests/unit/server/parsePubMedXML.test.js`

## Checklist before finishing
- [ ] All new functions have unit tests
- [ ] All new endpoints have integration tests
- [ ] Critical user flows have E2E coverage or an existing test updated
- [ ] No tests hit real external APIs
- [ ] `npm test` passes with no failures
- [ ] Test coverage for new code is > 80%
