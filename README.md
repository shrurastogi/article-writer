# MM Article Writer

An AI-assisted writing app for composing peer-reviewed review articles on **Multiple Myeloma**. Powered by Groq (free AI) using Llama 3.3 70B.

## Features

- **Structured editor** — 13 pre-defined sections covering a full MM review article (Abstract through References)
- **AI Generate Draft** — generates a complete section draft tailored to Multiple Myeloma, using domain-specific context per section
- **AI Improve** — rewrites existing text for academic rigor, flow, and proper citation style
- **Key Points** — lists the essential topics, trials, and recent data to cover in each section
- **Notes/hints** — optional per-section input to guide AI generation (e.g. "focus on CAR-T post 2022")
- **Live preview** — real-time formatted article preview on the right
- **Word count** — per-section and total word count tracking
- **Auto-save** — work is automatically saved to browser localStorage
- **Export as PDF** — clean A4 PDF via html2pdf.js
- **Export as DOCX** — properly formatted Word document via the `docx` package

## Prerequisites

- [Node.js](https://nodejs.org) v18 or later
- A free [Groq API key](https://console.groq.com) (no credit card required)

## Setup

1. **Install dependencies**
   ```bash
   cd article-writer
   npm install
   ```

2. **Add your Groq API key** — create a `.env` file:
   ```
   GROQ_API_KEY=your_groq_api_key_here
   ```
   Get a free key at [console.groq.com](https://console.groq.com).

3. **Start the server**
   ```bash
   npm start
   ```

4. **Open the app** at [http://localhost:3000](http://localhost:3000)

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

## How to Use

1. Fill in **Article Details** (title, authors, keywords) at the top
2. Click any **section header** to expand it
3. Write your content in the textarea, or use AI to get started:
   - **✨ Generate Draft** — creates a full section draft (add optional notes to guide it)
   - **✨ Improve** — refines your existing text
   - **💡 Key Points** — shows what to cover in that section
4. Click **Apply** to use an AI suggestion, or **Dismiss** to close it
5. Export with **⬇ PDF** or **⬇ DOCX** in the header

## Project Structure

```
article-writer/
├── index.html    # Frontend (accordion editor, live preview, AI features)
├── server.js     # Express server + Groq API proxy + DOCX export
├── package.json  # Dependencies
└── .env          # Groq API key (not committed to source control)
```
