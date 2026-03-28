# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Start the server (runs on http://localhost:3000)
npm start
```

Requires a `.env` file with `GROQ_API_KEY=your_key_here` (free key at console.groq.com).

## Architecture

This is a two-file full-stack app with no build step:

**`server.js`** — Express server that:
- Serves `index.html` as a static file
- Proxies three streaming AI endpoints to Groq (`/api/generate`, `/api/improve`, `/api/keypoints`) using the `openai` npm package pointed at `https://api.groq.com/openai/v1` with model `llama-3.3-70b-versatile`
- Handles DOCX export at `/api/export-docx` using the `docx` package, building the Word document server-side and streaming the buffer back

**`index.html`** — Single-file frontend with all CSS and JS inline:
- 13 pre-defined sections stored in the `SECTIONS` array with IDs matching keys in `SECTION_CONTEXT` (server-side) and `state.sections` (client-side)
- AI responses stream via `ReadableStream` / `TextDecoder` and render directly into `.ai-box-content` elements
- Auto-save uses `localStorage` key `mm-article` with a 1500ms debounce
- PDF export uses `html2pdf.js` (CDN) to render `#article-preview` directly — what you see in the preview is what exports
- The preview pane renders escaped HTML from `state.sections`; it does not sanitize beyond `htmlEsc()` (entity escaping only)

## Key data flow

1. User types → `updateSection(id, value)` → updates `state.sections[id]` + re-renders preview
2. AI button → `streamToAiBox()` → POST to `/api/*` → streams text chunks into the AI suggestion box
3. "Apply" → `applyAiSuggestion(id)` → copies AI box text into the section textarea → triggers `updateSection`
4. "⬇ DOCX" → `downloadDOCX()` → POST `/api/export-docx` with all sections → receives `.docx` blob → triggers browser download
5. "⬇ PDF" → `downloadPDF()` → `html2pdf` renders `#article-preview` in-browser → no server involvement
