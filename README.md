# Medical Article Writer

An AI-assisted writing tool for composing structured, peer-reviewed medical review articles. Powered by Groq (free AI) using Llama 3.3 70B.

Multi-user web application with Google OAuth and email/password authentication. All articles saved server-side to MongoDB Atlas and accessible across devices.

## Features

- **Structured editor** — 13 pre-defined sections (Abstract through References) plus custom section support
- **AI Generate Draft** — full section draft tailored to the article topic with domain-specific context
- **AI Improve** — rewrites existing text for academic rigour, flow, and citation style
- **AI Expand to Prose** — converts bullet points or rough notes into flowing academic prose
- **AI Key Points** — lists essential topics, trials, and recent data to cover per section
- **AI Refine** — iteratively refine an AI output with a plain-English instruction
- **Paper Flow Checker** — AI reviews the full article for narrative coherence and transitions
- **Coherence Fix** — context-aware one-click fix for flow issues, using adjacent section content to ensure smooth transitions
- **Grammar Check** — per-section check for passive voice, informal language, hedging, and long sentences
- **Generate Table** — AI generates a formatted HTML table from a plain-English description
- **Write Full Article** — agent-mode generation that drafts all sections in one go (SSE stream)
- **PubMed Integration** — search PubMed directly or import PMIDs; Open Access papers include full-text
- **Reference Library** — per-article library with AI toggle (selected papers ground all AI generation)
- **Section Suggestions** — AI recommends custom section names based on topic and existing structure
- **Live Preview** — real-time formatted article preview with citation linking
- **Version History** — save up to 50 named snapshots; restore any previous state
- **Share Link** — generate a public read-only URL for any article
- **Collaborators** — invite other registered users as viewer or editor
- **Article Locking** — lock an article to prevent accidental edits
- **Clone Article** — deep-copy any article as a starting point for a new piece
- **Export as DOCX** — properly formatted Word document via the `docx` package
- **Export as PDF** — server-side via Puppeteer (falls back to client-side html2pdf.js)
- **Dark Mode** — toggle between light and dark themes
- **Font Size** — A+/A− controls adjust editor and preview font size (13–20px range)
- **Writing Style** — configurable writing style applied to all AI generation
- **BYOK (Bring Your Own Key)** — users can supply their own Groq API key (AES-256-GCM encrypted at rest)
- **Groq API Key Rotation** — auto-rotates through up to 4 system Groq keys on rate-limit (429) errors

## Prerequisites

- [Node.js](https://nodejs.org) v18 or later
- A free [Groq API key](https://console.groq.com) (no credit card required)
- MongoDB Atlas free cluster (or any MongoDB instance)
- Google OAuth credentials (Google Cloud Console) — optional for local email/password auth only

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create a `.env` file** (copy from `.env.example`):
   ```
   GROQ_API_KEY=your_groq_api_key_here
   MONGODB_URI=mongodb+srv://...
   SESSION_SECRET=any-long-random-string
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
   ENCRYPTION_KEY=64-char-hex   # openssl rand -hex 32
   ```

3. **Start the dev server**
   ```bash
   npm run dev
   ```

4. **Open the app** at [http://localhost:3000](http://localhost:3000)

## Environment Variables

See `.env.example` for the full list and documentation. Key variables:

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Yes | Primary Groq API key |
| `GROQ_API_KEY_2/3/4` | No | Optional rotation keys — used automatically on 429 |
| `MONGODB_URI` | Yes | MongoDB connection string |
| `SESSION_SECRET` | Yes | Express session secret (32+ char hex in production) |
| `ENCRYPTION_KEY` | Yes | AES-256-GCM key for encrypting stored BYOK keys (32-char hex) |
| `GOOGLE_CLIENT_ID` | Yes (OAuth) | Google OAuth app client ID |
| `GOOGLE_CLIENT_SECRET` | Yes (OAuth) | Google OAuth app client secret |
| `GOOGLE_CALLBACK_URL` | Yes (OAuth) | OAuth redirect URI |
| `NCBI_API_KEY` | No | NCBI API key for higher PubMed rate limit (10 req/s vs 3 req/s) |
| `LOG_LEVEL` | No | `debug` (dev) or `info` (prod) |

## Commands

```bash
npm run dev          # Start dev server on :3000
npm start            # Start production server
npm test             # Run unit + integration tests
npm run test:e2e     # Run E2E tests (requires server running)
npm run lint         # ESLint
```

## Project Structure

```
article-writer/
├── server.js                  # Entry point — starts Express app
├── src/
│   ├── app.js                 # Express app setup, middleware, route mounting
│   ├── config/
│   │   └── index.js           # Startup config validation
│   ├── lib/
│   │   └── passport-config.js # Passport strategies (Google + Local)
│   ├── middleware/
│   │   ├── auth.js            # requireAuth guard
│   │   └── rateLimit.js       # express-rate-limit configs
│   ├── models/
│   │   ├── Article.js
│   │   ├── ArticleVersion.js
│   │   └── User.js
│   ├── routes/
│   │   ├── ai.js              # All AI streaming endpoints
│   │   ├── articles.js        # Article CRUD + clone/lock/share/collaborators
│   │   ├── auth.js            # Authentication routes
│   │   ├── export.js          # DOCX + PDF export
│   │   ├── pubmed.js          # PubMed search + PMID fetch
│   │   ├── settings.js        # User settings + BYOK
│   │   └── versions.js        # Article version history
│   ├── services/
│   │   ├── encryptionService.js
│   │   ├── exportService.js
│   │   ├── llmService.js      # Groq client + key-rotation createCompletion()
│   │   ├── pdfService.js
│   │   ├── pubmedService.js
│   │   └── sectionContext.js
│   └── utils/
│       ├── detectWriteMode.js
│       └── logger.js
├── public/
│   ├── css/
│   │   └── app.css
│   └── js/
│       └── app.js
├── login.html
├── dashboard.html
├── index.html
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── performance/
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── RULES.md
│   ├── TESTING.md
│   ├── BUGS.md
│   └── sprints/
├── .env.example
└── package.json
```

## Article Sections

| # | Section |
|---|---------|
| — | Abstract |
| 1 | Introduction |
| 2 | Epidemiology & Risk Factors |
| 3 | Pathophysiology & Molecular Biology |
| 4 | Clinical Presentation & Diagnosis |
| 5 | Staging & Risk Stratification |
| 6 | Treatment: Newly Diagnosed MM |
| 7 | Treatment: Relapsed/Refractory MM |
| 8 | Novel Therapies & Emerging Treatments |
| 9 | Supportive Care & Complications |
| 10 | Future Directions |
| 11 | Conclusion |
| — | References |

Custom sections can be added at any position before References.

## How to Use

1. Sign in (Google OAuth or email/password)
2. Click **+ New Article** on the dashboard
3. Enter **Medical Topic** — this seeds all AI generation
4. Fill in Title, Authors & Affiliations, Keywords
5. Expand any section and use the AI buttons:
   - **✨ Generate Draft** — creates a full section draft (add optional notes to guide it)
   - **✨ Improve** — refines your existing text
   - **✍ Expand to Prose** — converts bullet points to paragraphs
   - **💡 Key Points** — shows what to cover
6. Use **↺ Refine** to iterate on any AI output before applying
7. Run **Flow Check** (toolbar) to review article coherence, then click **Apply** on any recommendation for a context-aware fix
8. Export with **DOCX** or **PDF** from the preview pane toolbar
