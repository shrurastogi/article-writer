// ── Section definitions ──
let SECTIONS = [
  { id: "abstract",     num: "",  title: "Abstract",     placeholder: "Structured abstract: Background, Key Findings, Conclusions (250–350 words)...", isCustom: false },
  { id: "introduction", num: "1", title: "Introduction", placeholder: "Disease background, clinical burden, rationale for the review...", isCustom: false },
  { id: "main_body",    num: "2", title: "Main Body",    placeholder: "Use + Add Section to insert thematic subsections (e.g. Epidemiology, Pathophysiology, Diagnosis, Treatment).\n\nAlternatively write general overview content here...", isCustom: false },
  { id: "discussion",   num: "3", title: "Discussion",   placeholder: "Synthesis of evidence, clinical implications, limitations, comparison with existing reviews...", isCustom: false },
  { id: "conclusions",  num: "4", title: "Conclusions",  placeholder: "Summary of key findings, remaining challenges, future directions, clinical take-aways...", isCustom: false },
  { id: "references",   num: "",  title: "References",   placeholder: "1. Author A, et al. Title. Journal. Year;Vol:Pages.\n2. ...", isCustom: false },
];

// Legacy section IDs for articles created before the Sprint 2 section restructure.
// Used in applyArticleData to migrate old content into custom sections.
const LEGACY_TITLES = {
  epidemiology:      "Epidemiology & Risk Factors",
  pathophysiology:   "Pathophysiology & Molecular Biology",
  diagnosis:         "Clinical Presentation & Diagnosis",
  staging:           "Staging & Risk Stratification",
  treatment_nd:      "Treatment: Newly Diagnosed",
  treatment_rr:      "Treatment: Relapsed/Refractory",
  novel_therapies:   "Novel Therapies & Emerging Treatments",
  supportive_care:   "Supportive Care & Complications",
  future_directions: "Future Directions",
};

// ── State ──
const state = {
  sections: Object.fromEntries(SECTIONS.map(s => [s.id, { prose: "", tables: [] }])),
  library: [],  // [{ pmid, title, authors, year, journal, abstract, pmcid, isOA, fullText, refNumber, selected }]
  writingStyle: null, // { sampleText, styleProfile, calibratedAt } — set via Calibrate button
};

const refinementHistory = {};  // { [sectionId]: string[] }
let tableModalSectionId = null;
let dragSourceId = null;
let autoSaveTimer = null;
let lastVersionHash = null;
const articleId = new URLSearchParams(window.location.search).get("id");
const viewMode = new URLSearchParams(window.location.search).get("mode") === "view";

// ── Dark mode ──
function applyTheme() {
  const dark = localStorage.getItem("theme") === "dark";
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "");
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.textContent = dark ? "☀️" : "🌙";
}

function toggleDarkMode() {
  const dark = localStorage.getItem("theme") === "dark";
  localStorage.setItem("theme", dark ? "light" : "dark");
  applyTheme();
}

const FONT_SIZES = [12, 13, 14, 15, 16, 17, 18];
const FONT_DEFAULT = 14;

function applyFontSize(size) {
  document.documentElement.style.setProperty("--base-font-size", size + "px");
}

function adjustFontSize(delta) {
  if (delta === 0) {
    localStorage.removeItem("font-size");
    applyFontSize(FONT_DEFAULT);
    return;
  }
  const current = parseInt(localStorage.getItem("font-size") || FONT_DEFAULT);
  const idx = FONT_SIZES.indexOf(current);
  const newIdx = Math.max(0, Math.min(FONT_SIZES.length - 1, idx + delta));
  const newSize = FONT_SIZES[newIdx];
  localStorage.setItem("font-size", newSize);
  applyFontSize(newSize);
}

// ── Init ──
(async () => {
  applyTheme();
  applyFontSize(parseInt(localStorage.getItem("font-size") || FONT_DEFAULT));
  await checkAuth();
  await loadArticle();
  renderSections();
  renderConfidenceBars();
  updatePreview();

  // Auto-snapshot every 5 minutes if content changed
  setInterval(autoSnapshot, 5 * 60 * 1000);

  // BUG-003: delegated listener for "Apply to Section" buttons in coherence output
  document.getElementById("coherence-output")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-action='apply-rec']");
    if (!btn) return;
    applyFlowRecommendation(btn.dataset.sectionId, btn.dataset.recText);
  });
})();

// ── Section numbering ──
function renumberSections() {
  let num = 1;
  SECTIONS.forEach(s => {
    if (s.id === "abstract" || s.id === "references") {
      s.num = "";
    } else {
      s.num = String(num++);
    }
  });
}

// ── Drag-and-drop section reorder ──
function onDragStart(e, id) {
  dragSourceId = id;
  e.stopPropagation();
  setTimeout(() => document.getElementById(`section-${id}`)?.classList.add("dragging"), 0);
}

function onDragOver(e, id) {
  e.preventDefault();
  if (id && id !== dragSourceId) {
    document.querySelectorAll(".section-panel").forEach(el => el.classList.remove("drag-over"));
    document.getElementById(`section-${id}`)?.classList.add("drag-over");
  }
}

function onDrop(e, targetId) {
  e.preventDefault();
  if (!dragSourceId || dragSourceId === targetId) return;
  reorderSection(dragSourceId, targetId);
}

function onDragEnd(e) {
  document.querySelectorAll(".section-panel").forEach(el => {
    el.classList.remove("dragging");
    el.classList.remove("drag-over");
  });
  dragSourceId = null;
}

function reorderSection(fromId, toId) {
  const fromIdx = SECTIONS.findIndex(s => s.id === fromId);
  const toIdx   = SECTIONS.findIndex(s => s.id === toId);
  if (fromIdx === -1 || toIdx === -1) return;
  const [moved] = SECTIONS.splice(fromIdx, 1);
  SECTIONS.splice(toIdx, 0, moved);
  renumberSections();
  renderSections();
  scheduleAutoSave();
}

// ── Render accordion sections ──
function renderSections() {
  renumberSections();
  const container = document.getElementById("sections-container");
  // Ensure state exists for every section
  SECTIONS.forEach(s => {
    if (!state.sections[s.id]) state.sections[s.id] = { prose: "", tables: [], userContext: "" };
  });
  container.innerHTML = SECTIONS.map(s => {
    const titleEsc = s.title.replace(/'/g, "\\'");
    return `
    <div class="section-panel" id="section-${s.id}" ondragover="onDragOver(event,'${s.id}')" ondrop="onDrop(event,'${s.id}')">
      <div class="section-head" onclick="toggleSection('${s.id}')">
        <div class="section-head-left">
          <span class="drag-handle" draggable="true" ondragstart="onDragStart(event,'${s.id}')" ondragend="onDragEnd(event)" onclick="event.stopPropagation()" title="Drag to reorder">⠿</span>
          <span class="section-toggle">▶</span>
          ${s.num ? `<span class="section-num">${s.num}.</span>` : ""}
          <span class="section-name">${s.title}</span>
        </div>
        <div class="section-head-right">
          <span class="section-wc" id="wc-${s.id}">0 words</span>
          <button class="btn-grammar-icon" title="Grammar & Style Check" onclick="runGrammarCheck('${s.id}','${titleEsc}');event.stopPropagation()">📝</button>
          ${s.isCustom ? `<button class="btn-icon" title="Rename" onclick="event.stopPropagation();renameSection('${s.id}')">✎</button>` : ""}
          <button class="btn-icon" title="Delete section" onclick="event.stopPropagation();deleteSection('${s.id}')">✕</button>
        </div>
      </div>
      <div class="section-body" id="body-${s.id}">
        <textarea
          id="content-${s.id}"
          rows="9"
          placeholder="${s.placeholder.replace(/"/g, '&quot;')}"
          oninput="updateSection('${s.id}', this.value)"
          style="margin-bottom:8px"
          spellcheck="true"
        ></textarea>
        <div class="notes-label-row">
          <span class="notes-label">Focus / angle for AI</span>
          <a class="suggest-outline-link" onclick="suggestOutline('${s.id}','${titleEsc}');event.stopPropagation()">💡 Suggest what to cover</a>
        </div>
        <input
          type="text"
          id="notes-${s.id}"
          class="notes-input"
          placeholder="e.g. 'emphasise RCT data and hazard ratios', 'focus on paediatric dosing'"
          onclick="event.stopPropagation()"
          spellcheck="true"
        />
        <div class="user-ctx-toggle" onclick="toggleUserCtx('${s.id}');event.stopPropagation()">
          <span class="user-ctx-hint">+ Add Your Data</span>
          <span class="user-ctx-chevron" id="user-ctx-chevron-${s.id}">▶</span>
        </div>
        <div class="user-ctx-body" id="user-ctx-body-${s.id}" style="display:none">
          <textarea
            class="user-ctx-input"
            id="user-ctx-${s.id}"
            rows="4"
            placeholder="Paste your own data, patient numbers, trial results, statistics, or notes here. AI will treat this as authoritative when generating content for this section."
            oninput="updateUserCtx('${s.id}', this.value)"
            spellcheck="true"
          ></textarea>
        </div>
        <div class="section-ai-actions">
          <button class="btn btn-ai btn-sm section-action-btn" onclick="smartWrite('${s.id}','${titleEsc}')">✨ Write</button>
          <button class="btn btn-outline btn-sm section-action-btn" onclick="openTablePrompt('${s.id}','${titleEsc}')">+ Table</button>
          <div class="confidence-bar" id="conf-${s.id}"></div>
        </div>
        <div class="grammar-panel" id="grammar-${s.id}" style="display:none">
          <div class="grammar-panel-header">
            <span>📝 Grammar & Style</span>
            <button class="btn btn-secondary btn-sm" onclick="closeGrammarPanel('${s.id}')">✕</button>
          </div>
          <div class="grammar-results" id="grammar-results-${s.id}"></div>
        </div>
        <div class="ai-box" id="ai-${s.id}">
          <div class="ai-box-header">
            <span id="ai-label-${s.id}">✨ AI Suggestion</span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-secondary btn-sm" id="ai-undo-${s.id}" style="display:none" onclick="undoRefinement('${s.id}')">↩ Undo</button>
              <button class="btn btn-secondary btn-sm" onclick="closeAiBox('${s.id}')">✕</button>
            </div>
          </div>
          <div class="ai-box-content" id="ai-content-${s.id}" contenteditable="false"></div>
          <div class="refine-row" id="refine-row-${s.id}" style="display:none">
            <input type="text" id="refine-input-${s.id}" class="refine-input"
              placeholder="Refine: 'make concise', 'add statistics', 'focus on CAR-T post 2022'..."
              onkeydown="if(event.key==='Enter')refineSection('${s.id}','${titleEsc}')" />
            <button class="btn btn-outline btn-sm" onclick="refineSection('${s.id}','${titleEsc}')">↺ Refine</button>
          </div>
          <div class="ai-box-actions" id="ai-actions-${s.id}">
            <button class="btn btn-ai btn-sm" onclick="applyAiSuggestion('${s.id}')">Apply</button>
            <button class="btn btn-secondary btn-sm" onclick="closeAiBox('${s.id}')">Dismiss</button>
          </div>
        </div>
        <div id="tables-${s.id}" class="section-tables"></div>
      </div>
    </div>
  `}).join("");
  // Re-populate textarea values from state
  SECTIONS.forEach(s => {
    const el = document.getElementById(`content-${s.id}`);
    if (el) el.value = state.sections[s.id]?.prose || "";
    const ctxEl = document.getElementById(`user-ctx-${s.id}`);
    if (ctxEl) {
      ctxEl.value = state.sections[s.id]?.userContext || "";
      if (ctxEl.value) {
        document.getElementById(`user-ctx-body-${s.id}`).style.display = "block";
        document.getElementById(`user-ctx-chevron-${s.id}`).textContent = "▼";
      }
    }
    updateWordCount(s.id);
    renderSectionTables(s.id);
  });
}

// ── Accordion toggle ──
function toggleSection(id) {
  const panel = document.getElementById(`section-${id}`);
  panel.classList.toggle("open");
}

function openSection(id) {
  document.getElementById(`section-${id}`).classList.add("open");
}

// ── State updates ──
function updateSection(id, value) {
  if (!state.sections[id]) state.sections[id] = { prose: "", tables: [] };
  state.sections[id].prose = value;
  updateWordCount(id);
  updateTotalWordCount();
  updatePreview();
  scheduleAutoSave();
}

function updateMeta() {
  updatePreview();
  scheduleAutoSave();
}

// ── Word count ──
function wordCount(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function updateWordCount(id) {
  const wc = wordCount(state.sections[id]?.prose || "");
  const el = document.getElementById(`wc-${id}`);
  if (el) el.textContent = `${wc} words`;
}

function updateTotalWordCount() {
  const total = Object.values(state.sections).reduce((sum, v) => sum + wordCount(typeof v === "string" ? v : v?.prose || ""), 0);
  const title = document.getElementById("article-title").value;
  const authors = document.getElementById("authors").value;
  const keywords = document.getElementById("keywords").value;
  const metaWc = wordCount(title) + wordCount(authors) + wordCount(keywords);
  document.getElementById("total-wc").textContent = `${total + metaWc} words`;
}

// ── Preview ──
function htmlEsc(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function updatePreview() {
  const title = document.getElementById("article-title")?.value.trim() || "";
  const authors = document.getElementById("authors")?.value.trim() || "";
  const keywords = document.getElementById("keywords")?.value.trim() || "";
  const hasContent = title || authors || SECTIONS.some(s => state.sections[s.id]);

  if (!hasContent) {
    document.getElementById("article-preview").innerHTML = `<div class="p-empty">Fill in the details on the left to preview your article here.</div>`;
    return;
  }

  let html = "";

  if (title) html += `<div class="p-title">${htmlEsc(title)}</div>`;
  if (authors) html += `<div class="p-authors">${htmlEsc(authors)}</div>`;

  const abstractProse = state.sections["abstract"]?.prose || "";
  if (abstractProse) {
    html += `<div class="p-abstract-box"><div class="p-abstract-label">Abstract</div><div class="p-body">${enhanceCitations(abstractProse, state.library)}</div></div>`;
  }

  if (keywords) {
    html += `<div class="p-keywords"><strong>Keywords:</strong> ${htmlEsc(keywords)}</div>`;
  }

  // Numbered body sections
  let num = 1;
  for (const s of SECTIONS) {
    if (s.id === "abstract") continue;
    const sec = state.sections[s.id];
    const prose = typeof sec === "string" ? sec : sec?.prose || "";
    const tables = typeof sec === "object" ? (sec?.tables || []) : [];
    if (!prose.trim() && !tables.length) continue;

    if (s.id === "references") {
      html += `<div class="p-section-title">References</div><div class="p-body">${htmlEsc(prose)}</div>`;
    } else {
      html += `<div class="p-section-title">${num}. ${htmlEsc(s.title)}</div>`;
      if (prose.trim()) html += `<div class="p-body">${enhanceCitations(prose, state.library)}</div>`;
      for (const t of tables) {
        html += `<div class="p-table-wrap">${t.html || ""}</div>`;
      }
      num++;
    }
  }

  document.getElementById("article-preview").innerHTML = html;
}

// ── Streaming helper ──
async function streamToAiBox(url, body, sectionId, label, canApply, warnNoRefs = false) {
  openSection(sectionId);
  const box = document.getElementById(`ai-${sectionId}`);
  const contentEl = document.getElementById(`ai-content-${sectionId}`);
  const actionsEl = document.getElementById(`ai-actions-${sectionId}`);
  const labelEl = document.getElementById(`ai-label-${sectionId}`);

  box.classList.add("visible");
  labelEl.textContent = label;
  const warningHtml = warnNoRefs
    ? `<div class="grounding-warning">⚠ No references selected — AI will generate without source grounding.</div>`
    : "";
  contentEl.innerHTML = `${warningHtml}<span class="ai-loading">✨ Generating...</span>`;
  actionsEl.style.display = canApply ? "" : "none";

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) { const e = await resp.json(); throw new Error(e.error); }

    // Preserve grounding warning if present, then stream text after it
    if (warnNoRefs) {
      contentEl.innerHTML = `<div class="grounding-warning">⚠ No references selected — AI will generate without source grounding.</div>`;
    } else {
      contentEl.textContent = "";
    }
    const textNode = document.createTextNode("");
    contentEl.appendChild(textNode);
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      textNode.textContent += decoder.decode(value, { stream: true });
    }
    // Enable editing and show refine row after generation
    if (canApply) {
      contentEl.contentEditable = "true";
      const refineRow = document.getElementById(`refine-row-${sectionId}`);
      if (refineRow) refineRow.style.display = "flex";
    }
  } catch (err) {
    contentEl.innerHTML = `<span style="color:#ef4444">Error: ${err.message}</span>`;
  }
}

// ── AI features ──
function getTopic() {
  return document.getElementById("medical-topic")?.value.trim() || "";
}

function isStrictMode() {
  return document.getElementById("strict-mode-toggle")?.checked || false;
}

function hasSelectedRefs() {
  return state.library.some(e => e.selected);
}

// Returns false and shows a toast/warning if context grounding check fails.
// Returns true if the call should proceed (with optional inline warning).
function checkContextGrounding(sectionId) {
  if (isStrictMode() && !hasSelectedRefs()) {
    showToast("Strict mode: select at least one reference first.", "error");
    return false;
  }
  return true;
}

function onStrictModeChange() {
  renderConfidenceBars();
}

// ── Smart Write — auto-detects section state and calls the right endpoint ──
function detectWriteMode(id) {
  const prose = state.sections[id]?.prose?.trim() || "";
  if (!prose) return "generate";
  const lines = prose.split("\n").filter(l => l.trim());
  const bulletLines = lines.filter(l => /^[-•*]|\d+\./.test(l.trim()));
  if (lines.length > 0 && bulletLines.length / lines.length > 0.4) return "expand";
  return "improve";
}

function smartWrite(id, title) {
  const mode = detectWriteMode(id);
  if (mode === "generate") generateDraft(id, title);
  else if (mode === "expand") expandToProse(id, title);
  else improveSection(id, title);
}

function generateDraft(id, title) {
  if (!checkContextGrounding(id)) return;
  const notes = document.getElementById(`notes-${id}`)?.value || "";
  const topic = getTopic();
  const pubmedContext = getSelectedPubmedContext();
  const userContext = state.sections[id]?.userContext || "";
  const warn = !hasSelectedRefs();
  streamToAiBox("/api/generate", { sectionId: id, sectionTitle: title, notes, topic, pubmedContext, userContext, language: getLanguage(), writingStyle: state.writingStyle }, id, "✨ Generated Draft", true, warn);
}

function improveSection(id, title) {
  if (!checkContextGrounding(id)) return;
  const content = state.sections[id]?.prose;
  if (!content?.trim()) { showToast("Please write something in this section first.", "error"); return; }
  const topic = getTopic();
  const pubmedContext = getSelectedPubmedContext();
  const userContext = state.sections[id]?.userContext || "";
  const warn = !hasSelectedRefs();
  streamToAiBox("/api/improve", { sectionTitle: title, content, topic, pubmedContext, userContext, language: getLanguage(), writingStyle: state.writingStyle }, id, "✨ Improved Text", true, warn);
}

function getKeyPoints(id, title) {
  if (!checkContextGrounding(id)) return;
  const topic = getTopic();
  const pubmedContext = getSelectedPubmedContext();
  const userContext = state.sections[id]?.userContext || "";
  const warn = !hasSelectedRefs();
  streamToAiBox("/api/keypoints", { sectionId: id, sectionTitle: title, topic, pubmedContext, userContext, language: getLanguage(), writingStyle: state.writingStyle }, id, "💡 Key Points to Cover", false, warn);
}

async function suggestOutline(id, title) {
  const notesEl = document.getElementById(`notes-${id}`);
  if (!notesEl) return;
  const link = document.querySelector(`.suggest-outline-link[onclick*="suggestOutline('${id}'"]`);
  if (link) { link.textContent = "Loading…"; link.style.pointerEvents = "none"; }
  try {
    const resp = await fetch("/api/keypoints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: getTopic(), sectionId: id, sectionTitle: title,
        pubmedContext: getSelectedPubmedContext(),
        userContext: state.sections[id]?.userContext || "",
        language: getLanguage(),
        writingStyle: state.writingStyle,
      }),
    });
    if (!resp.ok) throw new Error();
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    notesEl.value = text.trim();
    notesEl.dispatchEvent(new Event("input"));
    showToast("Outline added to notes — edit it, then click Write.", "success");
  } catch {
    showToast("Could not suggest outline. Please try again.", "error");
  } finally {
    if (link) { link.textContent = "💡 Suggest what to cover"; link.style.pointerEvents = ""; }
  }
}

async function checkCoherence() {
  const topic = getTopic();
  if (!topic) { showToast("Set a Medical Topic first.", "error"); return; }

  const filled = SECTIONS.filter(s => state.sections[s.id]?.prose?.trim());
  if (filled.length < 2) { showToast("Write content in at least 2 sections before checking flow.", "error"); return; }

  const sections = filled.map(s => ({
    title: s.num ? `${s.num}. ${s.title}` : s.title,
    prose: state.sections[s.id].prose,
  }));

  const btn = document.getElementById("coherence-btn");
  const body = document.getElementById("coherence-body");
  const output = document.getElementById("coherence-output");

  btn.disabled = true;
  btn.textContent = "Checking...";
  body.classList.add("visible");
  output.innerHTML = `<span class="co-loading">✨ Analysing paper flow across ${sections.length} sections...</span>`;

  try {
    const resp = await fetch("/api/coherence-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, sections, language: getLanguage() }),
    });

    if (!resp.ok) { const e = await resp.json(); throw new Error(e.error); }

    output.textContent = "";
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      accumulated += chunk;
      output.textContent += chunk;
    }
    // Re-render with interactive "Apply to Section" buttons on recommendations
    renderCoherenceWithActions(accumulated);
  } catch (err) {
    output.innerHTML = `<span style="color:#ef4444">Error: ${err.message}</span>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Run Check";
  }
}

// Parse the coherence output and add "Apply to Section" buttons to each recommendation
function renderCoherenceWithActions(text) {
  const output = document.getElementById("coherence-output");
  const blocks = text.split(/(^## .+)/m).filter(s => s.trim());
  let html = "";
  let inRecs = false;

  for (const block of blocks) {
    if (block.startsWith("## ")) {
      const heading = htmlEsc(block.replace(/^## /, "").trim());
      inRecs = heading.toLowerCase().startsWith("recommendation");
      html += `<div class="co-heading">${heading}</div>`;
    } else if (inRecs) {
      for (const line of block.trim().split("\n")) {
        const recMatch = line.match(/^(\d+)\.\s+(.+)/);
        if (recMatch) {
          const recText = recMatch[2].trim();
          const sectionId = inferSectionFromText(recText);
          const section = sectionId ? SECTIONS.find(s => s.id === sectionId) : null;
          const btnHtml = section
            ? `<button class="btn btn-outline btn-sm" style="margin-top:6px;font-size:0.75rem" data-action="apply-rec" data-section-id="${section.id}" data-rec-text="${recText.replace(/"/g, "&quot;")}">Apply to ${htmlEsc(section.title)} ↗</button>`
            : "";
          html += `<div class="co-rec-card"><div class="co-rec-num">${recMatch[1]}.</div><div class="co-rec-body"><div>${htmlEsc(recText)}</div>${btnHtml}</div></div>`;
        } else if (line.trim()) {
          html += `<div style="margin-bottom:4px">${htmlEsc(line)}</div>`;
        }
      }
    } else {
      html += `<div class="co-block">${htmlEsc(block.trim())}</div>`;
    }
  }

  output.innerHTML = html;
}

// Match a recommendation sentence to a section ID by looking for section title keywords
function inferSectionFromText(text) {
  const lower = text.toLowerCase();
  let best = null;
  let bestLen = 0;
  for (const s of SECTIONS) {
    const t = s.title.toLowerCase();
    if (lower.includes(t) && t.length > bestLen) {
      best = s.id;
      bestLen = t.length;
    }
  }
  return best;
}

// Open a section and immediately stream a refinement using the given recommendation as instruction
function applyFlowRecommendation(sectionId, instruction) {
  const prose = state.sections[sectionId]?.prose?.trim();
  const section = SECTIONS.find(s => s.id === sectionId);
  if (!prose) {
    showToast(`Add content to the ${section?.title || sectionId} section first, then apply the recommendation.`, "error");
    return;
  }
  // Scroll to and expand the section
  const panel = document.getElementById(`section-${sectionId}`);
  if (panel) {
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    panel.classList.add("open");
  }
  streamToAiBox("/api/refine", {
    topic: getTopic(),
    sectionTitle: section?.title || sectionId,
    currentDraft: prose,
    instruction,
    pubmedContext: getSelectedPubmedContext(),
    writingStyle: state.writingStyle,
  }, sectionId, "↺ Flow Recommendation", true);
}

function expandToProse(id, title) {
  if (!checkContextGrounding(id)) return;
  const prose = state.sections[id]?.prose || "";
  if (!prose.trim()) { showToast("Paste your bullet points or rough notes into this section first.", "error"); return; }
  const topic = getTopic();
  const pubmedContext = getSelectedPubmedContext();
  const userContext = state.sections[id]?.userContext || "";
  const warn = !hasSelectedRefs();
  streamToAiBox("/api/refine", {
    topic,
    sectionTitle: title,
    currentDraft: prose,
    instruction: "Convert these bullet points and rough notes into flowing, formal academic prose suitable for a peer-reviewed journal review article. Preserve every piece of information provided, expand key points with appropriate context, add smooth transitions between ideas, and insert [Author et al., Year] citation placeholders where evidence is implied. Do not invent facts not present in the input.",
    pubmedContext,
    userContext,
    language: getLanguage(),
    writingStyle: state.writingStyle,
  }, id, "✍ Expanded Prose", true, warn);
}

function applyAiSuggestion(id) {
  const contentEl = document.getElementById(`ai-content-${id}`);
  const suggestion = (contentEl?.innerText || contentEl?.textContent || "").trim();
  if (!suggestion) return;
  const textarea = document.getElementById(`content-${id}`);
  if (textarea) {
    textarea.value = suggestion;
    updateSection(id, suggestion);
  }
  closeAiBox(id);
  showToast("Applied!", "success");
}

function closeAiBox(id) {
  document.getElementById(`ai-${id}`)?.classList.remove("visible");
  const contentEl = document.getElementById(`ai-content-${id}`);
  if (contentEl) contentEl.contentEditable = "false";
  const refineRow = document.getElementById(`refine-row-${id}`);
  if (refineRow) refineRow.style.display = "none";
  const undoBtn = document.getElementById(`ai-undo-${id}`);
  if (undoBtn) undoBtn.style.display = "none";
  refinementHistory[id] = [];
}

// ── Grammar check ──

function getLanguage() {
  return document.getElementById("language-select")?.value || "English";
}

async function runGrammarCheck(id, title) {
  const content = document.getElementById(`section-${id}`)?.value || "";
  if (!content.trim()) {
    showToast("Add some content before running grammar check.", "error");
    return;
  }
  const panel = document.getElementById(`grammar-${id}`);
  const results = document.getElementById(`grammar-results-${id}`);
  panel.style.display = "block";
  results.innerHTML = '<div style="font-size:0.82rem;color:var(--muted);font-style:italic">Checking...</div>';

  const topic = document.getElementById("medical-topic")?.value || "";
  const language = getLanguage();

  try {
    const res = await fetch("/api/grammar-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, topic, sectionTitle: title, language }),
    });
    if (!res.ok) throw new Error("Request failed");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let raw = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      raw += decoder.decode(value, { stream: true });
    }
    renderGrammarResults(id, raw.trim());
  } catch {
    results.innerHTML = '<div style="color:var(--danger);font-size:0.82rem">Failed to check grammar. Please try again.</div>';
  }
}

function renderGrammarResults(id, rawText) {
  const results = document.getElementById(`grammar-results-${id}`);
  if (!results) return;
  if (rawText === "NO_ISSUES" || !rawText.includes("ISSUE |")) {
    results.innerHTML = '<div class="grammar-no-issues">✅ No issues found</div>';
    return;
  }
  const lines = rawText.split("\n").filter(l => l.startsWith("ISSUE |"));
  const typeLabels = { PASSIVE_VOICE: "Passive Voice", LONG_SENTENCE: "Long Sentence", INFORMAL: "Informal", HEDGING: "Hedging" };
  results.innerHTML = lines.map(line => {
    const parts = line.split("|").map(p => p.trim());
    const type = parts[1] || "";
    const fragment = parts[2] || "";
    const suggestion = parts[3] || "";
    return `<div class="grammar-issue-card">
      <span class="grammar-issue-type">${escHtml(typeLabels[type] || type)}</span>
      <div class="grammar-fragment">"${escHtml(fragment)}"</div>
      <div class="grammar-suggestion">${escHtml(suggestion)}</div>
    </div>`;
  }).join("");
}

function closeGrammarPanel(id) {
  document.getElementById(`grammar-${id}`).style.display = "none";
}

// ── PDF export ──
async function downloadPDF() {
  const title = document.getElementById("article-title").value || "article";
  const html = document.getElementById("article-preview").innerHTML;
  showToast("Generating PDF...");
  try {
    const resp = await fetch("/api/export-pdf-server", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html, title }),
    });
    if (!resp.ok) throw new Error("server unavailable");
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_").slice(0, 60)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("PDF downloaded!", "success");
  } catch {
    _downloadPDFFallback(title);
  }
}

function _downloadPDFFallback(title) {
  const el = document.getElementById("article-preview");
  const opt = {
    margin: 0,
    filename: `${title.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_").slice(0, 60)}.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["avoid-all", "css", "legacy"] },
  };
  html2pdf().set(opt).from(el).save().then(() => showToast("PDF downloaded!", "success"));
}

// ── DOCX export ──
async function downloadDOCX() {
  showToast("Generating DOCX...");

  const title = document.getElementById("article-title").value.trim();
  const authors = document.getElementById("authors").value.trim();
  const keywords = document.getElementById("keywords").value.trim();

  const sections = SECTIONS.map(s => ({
    id: s.id,
    title: s.num ? `${s.num}. ${s.title}` : s.title,
    prose: state.sections[s.id]?.prose || "",
    tables: state.sections[s.id]?.tables || [],
  }));

  try {
    const resp = await fetch("/api/export-docx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, authors, keywords, sections }),
    });

    if (!resp.ok) { const e = await resp.json(); throw new Error(e.error); }

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(title || "review_article").replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_").slice(0, 60)}.docx`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("DOCX downloaded!", "success");
  } catch (err) {
    showToast("Error: " + err.message, "error");
  }
}

// ── Auth ──
async function checkAuth() {
  try {
    const res = await fetch("/auth/me");
    if (res.status === 401) {
      window.location.href = "/login";
      return null;
    }
    const user = await res.json();
    hydrateUserWidget(user);
    return user;
  } catch {
    window.location.href = "/login";
    return null;
  }
}

function hydrateUserWidget(user) {
  const wrap = document.getElementById("user-avatar-wrap");
  if (user.avatarUrl) {
    const img = document.createElement("img");
    img.src = user.avatarUrl;
    img.alt = user.name;
    img.className = "user-avatar";
    wrap.appendChild(img);
  } else {
    const div = document.createElement("div");
    div.className = "user-avatar-placeholder";
    div.textContent = (user.name || "U")[0].toUpperCase();
    wrap.appendChild(div);
  }
  document.getElementById("user-name-display").textContent = user.name;
  document.getElementById("user-widget").style.display = "flex";
}

async function signOut() {
  await fetch("/auth/logout", { method: "POST" });
  window.location.href = "/login";
}

// ── Auto-save (localStorage write-behind + server primary) ──
// Stub — full implementation in PR 5 (writing style calibration)
function renderStyleCard(writingStyle) { /* expanded in sprint6-writing-style */ }

function applyViewMode() {
  if (!viewMode) return;
  document.querySelectorAll("textarea, input, select").forEach(el => el.disabled = true);
  document.querySelectorAll("button.ai-btn, button.section-action-btn, #full-draft-btn, #run-flow-check").forEach(el => el.disabled = true);
  const banner = document.createElement("div");
  banner.className = "view-mode-banner";
  banner.textContent = "View-only mode — this article is locked";
  const headerRight = document.querySelector(".header-right");
  if (headerRight) headerRight.prepend(banner);
}

function scheduleAutoSave() {
  if (viewMode) return;
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    const payload = {
      topic: document.getElementById("medical-topic").value,
      title: document.getElementById("article-title").value,
      authors: document.getElementById("authors").value,
      keywords: document.getElementById("keywords").value,
      sections: state.sections,
      library: state.library,
      customSections: SECTIONS.filter(s => s.isCustom),
      language: getLanguage(),
      writingStyle: state.writingStyle,
    };

    // localStorage write-behind (sync, always)
    localStorage.setItem("mm-article", JSON.stringify(payload));

    // Server save (async, only if we have an articleId)
    if (articleId) {
      try {
        const res = await fetch(`/api/articles/${articleId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        showToast("Auto-save to server failed — changes saved locally.", "error");
      }
    }
  }, 1500);
}

// ── Article Versioning ────────────────────────────────────────────────────────

function hashSections() {
  try { return btoa(JSON.stringify(state.sections)).slice(0, 32); }
  catch { return ""; }
}

async function autoSnapshot() {
  if (!articleId || viewMode) return;
  const hash = hashSections();
  if (!hash || hash === lastVersionHash) return;
  try {
    await fetch(`/api/articles/${articleId}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Auto" }),
    });
    lastVersionHash = hash;
  } catch { /* silent — auto-save failures don't alert user */ }
}

async function saveVersionManual() {
  if (!articleId) { showToast("Save the article first.", "error"); return; }
  const label = prompt("Version label (optional):", "") ?? "";
  try {
    const res = await fetch(`/api/articles/${articleId}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    if (!res.ok) throw new Error("Failed");
    lastVersionHash = hashSections();
    showToast("Version saved.", "success");
  } catch {
    showToast("Failed to save version.", "error");
  }
}

async function openVersionHistory() {
  if (!articleId) { showToast("No article loaded.", "error"); return; }
  try {
    const res = await fetch(`/api/articles/${articleId}/versions`);
    if (!res.ok) throw new Error("Failed");
    const { versions } = await res.json();
    renderVersionHistoryPanel(versions);
    document.getElementById("version-history-panel")?.classList.add("open");
  } catch {
    showToast("Failed to load version history.", "error");
  }
}

function closeVersionHistory() {
  document.getElementById("version-history-panel")?.classList.remove("open");
}

function renderVersionHistoryPanel(versions) {
  const panel = document.getElementById("version-history-panel");
  if (!panel) return;
  const list = versions.map(v => {
    const date = new Date(v.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    return `<div class="version-row">
      <div>
        <div class="version-label">${escapeHtml(v.label || "Auto")}</div>
        <div class="version-meta">${date} · ${(v.wordCount || 0).toLocaleString()} words</div>
      </div>
      <div class="version-actions">
        <button class="btn btn-sm" onclick="restoreVersion('${v._id}')">Restore</button>
        <button class="btn btn-sm btn-outline" onclick="deleteVersion('${v._id}')">Delete</button>
      </div>
    </div>`;
  }).join("");

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <strong style="font-size:0.95rem">Version History</strong>
      <button class="btn btn-sm btn-outline" onclick="closeVersionHistory()">✕</button>
    </div>
    ${versions.length ? list : '<p style="color:var(--secondary);font-size:0.82rem">No versions saved yet.</p>'}`;
}

function escapeHtml(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

async function restoreVersion(vid) {
  if (!confirm("Restore this version? The current content will be saved as a new version first.")) return;
  try {
    const res = await fetch(`/api/articles/${articleId}/versions/${vid}/restore`, { method: "POST" });
    if (!res.ok) throw new Error("Failed");
    closeVersionHistory();
    await loadArticle();
    renderSections();
    updatePreview();
    showToast("Version restored.", "success");
  } catch {
    showToast("Failed to restore version.", "error");
  }
}

async function deleteVersion(vid) {
  if (!confirm("Delete this version? This cannot be undone.")) return;
  try {
    await fetch(`/api/articles/${articleId}/versions/${vid}`, { method: "DELETE" });
    await openVersionHistory(); // re-render list
  } catch {
    showToast("Failed to delete version.", "error");
  }
}

// ── Article Sharing ───────────────────────────────────────────────────────────

async function openShareModal() {
  if (!articleId) { showToast("Save the article first.", "error"); return; }
  document.getElementById("share-link-display").style.display = "none";
  document.getElementById("share-link-empty").style.display = "block";
  document.getElementById("generate-share-btn").style.display = "";
  document.getElementById("share-modal").style.display = "flex";
  document.getElementById("collaborators-list").innerHTML = "";
  try {
    const res = await fetch(`/api/articles/${articleId}`);
    if (res.ok) {
      const { article } = await res.json();
      if (article.shareToken) showShareLink(article.shareToken);
      if (article.collaborators?.length) renderCollaborators(article.collaborators);
    }
  } catch { /* ignore */ }
}

function closeShareModal() {
  document.getElementById("share-modal").style.display = "none";
}

function showShareLink(token) {
  const url = `${location.origin}/share/${token}`;
  document.getElementById("share-link-input").value = url;
  document.getElementById("share-link-display").style.display = "block";
  document.getElementById("share-link-empty").style.display = "none";
  document.getElementById("generate-share-btn").style.display = "none";
}

async function generateShareLink() {
  try {
    const res = await fetch(`/api/articles/${articleId}/share`, { method: "POST" });
    if (!res.ok) throw new Error("Failed");
    const { shareToken } = await res.json();
    showShareLink(shareToken);
    showToast("Share link generated!", "success");
  } catch {
    showToast("Failed to generate share link.", "error");
  }
}

function copyShareLink() {
  const input = document.getElementById("share-link-input");
  navigator.clipboard?.writeText(input.value)
    .then(() => showToast("Copied!", "success"))
    .catch(() => { input.select(); document.execCommand("copy"); showToast("Copied!", "success"); });
}

async function revokeShareLink() {
  if (!confirm("Revoke share link? Anyone with the current link will lose access.")) return;
  try {
    const res = await fetch(`/api/articles/${articleId}/share`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed");
    document.getElementById("share-link-display").style.display = "none";
    document.getElementById("share-link-empty").style.display = "block";
    document.getElementById("generate-share-btn").style.display = "";
    showToast("Share link revoked.", "success");
  } catch {
    showToast("Failed to revoke share link.", "error");
  }
}

async function addCollaborator() {
  const email = document.getElementById("collab-email").value.trim();
  const role = document.getElementById("collab-role").value;
  if (!email) { showToast("Enter an email address.", "error"); return; }
  try {
    const res = await fetch(`/api/articles/${articleId}/collaborators`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    if (!res.ok) {
      const body = await res.json();
      showToast(body.error || "Failed to add collaborator.", "error");
      return;
    }
    const { collaborators } = await res.json();
    renderCollaborators(collaborators);
    document.getElementById("collab-email").value = "";
    showToast("Collaborator added.", "success");
  } catch {
    showToast("Failed to add collaborator.", "error");
  }
}

function renderCollaborators(collaborators) {
  const list = document.getElementById("collaborators-list");
  if (!collaborators?.length) { list.innerHTML = ""; return; }
  list.innerHTML = collaborators.map(c =>
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border)">
      <span>${c.role}</span>
      <button class="btn btn-sm btn-outline" onclick="removeCollaborator('${c._userId}')">Remove</button>
    </div>`
  ).join("");
}

async function removeCollaborator(uid) {
  try {
    const res = await fetch(`/api/articles/${articleId}/collaborators/${uid}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed");
    const { collaborators } = await res.json();
    renderCollaborators(collaborators);
    showToast("Collaborator removed.", "success");
  } catch {
    showToast("Failed to remove collaborator.", "error");
  }
}

// ── Load article (server-primary, localStorage fallback) ──
async function loadArticle() {
  if (articleId) {
    try {
      const res = await fetch(`/api/articles/${articleId}`);
      if (res.ok) {
        const { article } = await res.json();
        applyArticleData(article);
        return;
      }
    } catch { /* fall through to localStorage */ }
  }
  loadFromStorage();
}

function loadFromStorage() {
  try {
    const saved = localStorage.getItem("mm-article");
    if (!saved) return;
    applyArticleData(JSON.parse(saved));
  } catch (e) { /* ignore */ }
}

function applyArticleData(data) {
  if (!data) return;
  if (data.topic) document.getElementById("medical-topic").value = data.topic;
  if (data.title) document.getElementById("article-title").value = data.title;
  if (data.authors) document.getElementById("authors").value = data.authors;
  if (data.keywords) document.getElementById("keywords").value = data.keywords;
  if (data.language) {
    const sel = document.getElementById("language-select");
    if (sel) sel.value = data.language;
  }

  // Restore previously saved custom sections
  if (data.customSections?.length) {
    const refIdx = SECTIONS.findIndex(s => s.id === "references");
    for (const cs of data.customSections) {
      if (!SECTIONS.find(s => s.id === cs.id)) {
        SECTIONS.splice(refIdx, 0, cs);
      }
    }
  }

  if (data.sections) {
    // `conclusion` (old key) maps to `conclusions` (new key)
    const LEGACY_REMAP = { conclusion: "conclusions" };
    const knownIds = new Set(SECTIONS.map(s => s.id));
    const refIdx = SECTIONS.findIndex(s => s.id === "references");

    for (const [id, val] of Object.entries(data.sections)) {
      const prose = typeof val === "string" ? val : (val?.prose || "");
      const tables = typeof val === "object" ? (val?.tables || []) : [];
      const targetId = LEGACY_REMAP[id] || id;

      const userContext = typeof val === "object" ? (val?.userContext || "") : "";
      if (knownIds.has(targetId)) {
        // Known section (possibly remapped from a legacy key)
        state.sections[targetId] = { prose, tables, userContext };
      } else if (prose.trim() || tables.length) {
        // Unknown legacy section with content — restore as a custom section
        if (!SECTIONS.find(s => s.id === id)) {
          const title = LEGACY_TITLES[id] || id.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
          SECTIONS.splice(refIdx, 0, { id, num: "", title, placeholder: `Write about ${title}...`, isCustom: true });
          knownIds.add(id);
        }
        state.sections[id] = { prose, tables, userContext };
      }
    }
  }

  if (data.library?.length) {
    state.library = data.library;
    renderLibrary();
  }
  if (data.writingStyle) {
    state.writingStyle = data.writingStyle;
    renderStyleCard(data.writingStyle);
  }
  renumberSections();
  SECTIONS.forEach(s => updateWordCount(s.id));
  updateTotalWordCount();
  applyViewMode();
}

// ── Writing Style ──
async function calibrateStyle() {
  if (!articleId) { showToast("Save the article first (open from Dashboard).", "error"); return; }
  const sampleEl = document.getElementById("style-sample");
  const sampleText = sampleEl?.value.trim() || "";
  if (sampleText.length < 100) { showToast("Paste at least 100 characters of sample text.", "error"); return; }

  const btn = document.getElementById("calibrate-btn");
  btn.disabled = true;
  btn.textContent = "Calibrating…";

  try {
    const res = await fetch(`/api/articles/${articleId}/calibrate-style`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sampleText }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    const { writingStyle } = await res.json();
    state.writingStyle = writingStyle;
    renderStyleCard(writingStyle);
    showToast("Writing style calibrated.", "success");
  } catch (err) {
    showToast("Calibration failed: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Calibrate";
  }
}

function renderStyleCard(writingStyle) {
  const card = document.getElementById("style-card");
  if (!card) return;
  if (!writingStyle?.styleProfile) { card.style.display = "none"; return; }
  const p = writingStyle.styleProfile;
  const calibratedAt = writingStyle.calibratedAt
    ? new Date(writingStyle.calibratedAt).toLocaleDateString()
    : "";
  card.style.display = "";
  card.innerHTML = `
    <div class="style-card-header">Style Profile${calibratedAt ? ` <span class="style-card-date">calibrated ${calibratedAt}</span>` : ""}</div>
    <div class="style-card-metrics">
      ${p.toneDescriptor ? `<div class="style-metric"><span class="style-metric-label">Tone</span><span class="style-metric-value">${p.toneDescriptor}</span></div>` : ""}
      ${p.formalityScore != null ? `<div class="style-metric"><span class="style-metric-label">Formality</span><span class="style-metric-value">${p.formalityScore}/100</span></div>` : ""}
      ${p.avgSentenceLength ? `<div class="style-metric"><span class="style-metric-label">Avg sentence</span><span class="style-metric-value">${p.avgSentenceLength} words</span></div>` : ""}
      ${p.activeVoicePercent != null ? `<div class="style-metric"><span class="style-metric-label">Active voice</span><span class="style-metric-value">${p.activeVoicePercent}%</span></div>` : ""}
      ${p.hedgingFrequency ? `<div class="style-metric"><span class="style-metric-label">Hedging</span><span class="style-metric-value">${p.hedgingFrequency}</span></div>` : ""}
      ${p.citationDensity ? `<div class="style-metric"><span class="style-metric-label">Citations</span><span class="style-metric-value">${p.citationDensity}</span></div>` : ""}
    </div>`;
}

// ── Clear all ──
function clearAll() {
  if (!confirm("Clear all article content? This cannot be undone.")) return;
  document.getElementById("medical-topic").value = "";
  document.getElementById("article-title").value = "";
  document.getElementById("authors").value = "";
  document.getElementById("keywords").value = "";
  // Remove custom sections
  SECTIONS = SECTIONS.filter(s => !s.isCustom);
  SECTIONS.forEach(s => {
    state.sections[s.id] = { prose: "", tables: [] };
    const el = document.getElementById(`content-${s.id}`);
    if (el) el.value = "";
    closeAiBox(s.id);
  });
  state.library = [];
  renderLibrary();
  renderSections();
  updateTotalWordCount();
  updatePreview();
  localStorage.removeItem("mm-article");
  showToast("Cleared.", "success");
}

// ── PubMed search ──
let pubmedArticles = [];

async function searchPubMed() {
  const queryEl = document.getElementById("pubmed-query");
  const topic = getTopic();
  const query = queryEl.value.trim() || topic;
  if (!query) { showToast("Enter a search query or set a Medical Topic first.", "error"); return; }

  const btn = document.getElementById("pubmed-btn");
  const resultsEl = document.getElementById("pubmed-results");
  btn.disabled = true;
  btn.textContent = "Searching...";
  resultsEl.innerHTML = `<div class="pubmed-empty">Searching PubMed...</div>`;

  try {
    const resp = await fetch("/api/pubmed-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, maxResults: 10 }),
    });
    if (!resp.ok) { const e = await resp.json(); throw new Error(e.error); }
    const data = await resp.json();
    pubmedArticles = data.articles || [];
    renderPubmedResults();
  } catch (err) {
    resultsEl.innerHTML = `<div class="pubmed-empty" style="color:#ef4444">Error: ${err.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Search";
  }
}

function renderPubmedResults() {
  const el = document.getElementById("pubmed-results");
  if (!pubmedArticles.length) {
    el.innerHTML = `<div class="pubmed-empty">No results found.</div>`;
    return;
  }
  el.innerHTML = pubmedArticles.map((a, i) => {
    const inLibrary = !!state.library.find(e => e.pmid === a.pmid);
    return `
    <div class="pubmed-article" id="pm-${i}">
      <div class="pubmed-article-title">${htmlEsc(a.title)}</div>
      <div class="pubmed-article-meta">${htmlEsc(a.authors)} &bull; ${htmlEsc(a.journal)} ${htmlEsc(a.year)} &bull; PMID: ${htmlEsc(a.pmid)}</div>
      <div class="pubmed-article-abstract" id="pm-abs-${i}">${htmlEsc(a.abstract || "No abstract available.")}</div>
      ${(a.abstract && a.abstract.length > 200) ? `<span class="pubmed-expand" onclick="toggleAbstract(${i})">Show more</span>` : ""}
      <div style="margin-top:6px">
        <button class="btn btn-sm pubmed-use-btn ${inLibrary ? 'btn-secondary' : 'btn-pubmed'}"
          id="pm-add-${i}" onclick="insertReference(${i})" ${inLibrary ? 'disabled' : ''}>
          ${inLibrary ? '✓ In Library' : '+ Add to Library'}
        </button>
      </div>
    </div>
  `}).join("");
}

function toggleAbstract(i) {
  const el = document.getElementById(`pm-abs-${i}`);
  const isExpanded = el.classList.toggle("expanded");
  el.nextElementSibling.textContent = isExpanded ? "Show less" : "Show more";
}

function getSelectedPubmedContext() {
  const parts = [];
  state.library.filter(e => e.selected).forEach(e => {
    const text = e.fullText || e.abstract || "N/A";
    parts.push(`Title: ${e.title}\nAuthors: ${e.authors}\nJournal: ${e.journal} (${e.year})\nText: ${text.slice(0, 3000)}`);
  });
  return parts.join("\n\n---\n\n");
}

function insertReference(i) {
  const a = pubmedArticles[i];
  if (!a) return;
  if (state.library.find(e => e.pmid === a.pmid)) {
    showToast("Already in library.", "");
    return;
  }
  // Add to library, selected by default so it's active in AI context immediately
  state.library.push({ ...a, refNumber: state.library.length + 1, selected: true });
  renderLibrary();
  scheduleAutoSave();

  // Update button in PubMed results
  const btn = document.getElementById(`pm-add-${i}`);
  if (btn) {
    btn.textContent = "✓ In Library";
    btn.disabled = true;
    btn.classList.remove("btn-pubmed");
    btn.classList.add("btn-secondary");
  }

  // Append to references section text
  if (!state.sections["references"]) state.sections["references"] = { prose: "", tables: [] };
  const ref = `${a.authors}. ${a.title}. ${a.journal}. ${a.year}. PMID: ${a.pmid}.`;
  const current = state.sections["references"].prose || "";
  const lines = current.trim().split("\n").filter(l => l.trim());
  const num = lines.length + 1;
  const newContent = current.trim() ? `${current.trim()}\n${num}. ${ref}` : `1. ${ref}`;
  state.sections["references"].prose = newContent;
  const el = document.getElementById("content-references");
  if (el) el.value = newContent;
  updateWordCount("references");
  updateTotalWordCount();
  updatePreview();
  scheduleAutoSave();
  showToast("Added to library!", "success");
}

// ── Toast ──
function showToast(msg, type = "") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => t.classList.remove("show"), 3000);
}

// ── Reference Library ──
function toggleRefLib() {
  const body = document.getElementById("reflib-body");
  const chevron = document.getElementById("reflib-chevron");
  const open = body.style.display === "none";
  body.style.display = open ? "block" : "none";
  chevron.style.transform = open ? "rotate(90deg)" : "";
}

function switchRefTab(e, tab) {
  e.stopPropagation();
  document.getElementById("reflib-tab-references").style.display = tab === "references" ? "block" : "none";
  document.getElementById("reflib-tab-pubmed").style.display = tab === "pubmed" ? "block" : "none";
  document.querySelectorAll(".reflib-tab").forEach(el => el.classList.remove("active"));
  e.target.classList.add("active");
}

async function fetchPmids() {
  const raw = document.getElementById("pmid-input").value;
  const pmids = raw.split(/[\s,]+/).map(s => s.trim()).filter(s => /^\d+$/.test(s));
  if (!pmids.length) { showToast("No valid PMIDs found.", "error"); return; }
  const btn = document.getElementById("fetch-pmids-btn");
  btn.disabled = true; btn.textContent = "Fetching...";
  try {
    const resp = await fetch("/api/fetch-pmids", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pmids }),
    });
    if (!resp.ok) { const e = await resp.json(); throw new Error(e.error); }
    const data = await resp.json();
    let added = 0;
    for (const a of data.found || []) {
      if (!state.library.find(e => e.pmid === a.pmid)) {
        state.library.push({ ...a, refNumber: state.library.length + 1, selected: true });
        added++;
      }
    }
    // renumber
    state.library.forEach((e, i) => e.refNumber = i + 1);
    renderLibrary();
    scheduleAutoSave();
    const notFound = data.notFound || [];
    showToast(`Added ${added} reference(s).${notFound.length ? ` Not found: ${notFound.join(", ")}` : ""}`, added ? "success" : "");
    document.getElementById("pmid-input").value = "";
  } catch (err) {
    showToast("Error: " + err.message, "error");
  } finally {
    btn.disabled = false; btn.textContent = "Fetch References";
  }
}

function renderLibrary() {
  const list = document.getElementById("reflib-list");
  const count = document.getElementById("reflib-count");
  if (!list) return;
  count.textContent = `${state.library.length} reference${state.library.length !== 1 ? "s" : ""}`;
  if (!state.library.length) {
    list.innerHTML = `<div class="reflib-empty">No references yet. Paste PMIDs above or add from PubMed search results.</div>`;
    return;
  }
  list.innerHTML = state.library.map(e => `
    <div class="reflib-item">
      <span class="reflib-num">[${e.refNumber}]</span>
      <div style="flex:1;min-width:0">
        <div class="reflib-title">${htmlEsc(e.title || "")} ${e.isOA ? '<span class="reflib-oa">OA</span>' : ""}</div>
        <div class="reflib-meta">${htmlEsc(e.authors || "")} &bull; ${htmlEsc(e.journal || "")} ${htmlEsc(e.year || "")} &bull; PMID: ${htmlEsc(e.pmid || "")}</div>
        <div class="reflib-actions">
          <button class="btn btn-outline btn-sm" onclick="toggleLibrarySelect('${e.pmid}')" id="libsel-${e.pmid}" style="${e.selected ? 'background:var(--ai);color:#fff;border-color:var(--ai)' : ''}">
            ${e.selected ? "✓ In AI" : "Use in AI"}
          </button>
          <button class="btn btn-secondary btn-sm" onclick="removeFromLibrary('${e.pmid}')">✕</button>
        </div>
      </div>
    </div>
  `).join("");
  renderConfidenceBars();
}

function removeFromLibrary(pmid) {
  state.library = state.library.filter(e => e.pmid !== pmid);
  state.library.forEach((e, i) => e.refNumber = i + 1);
  renderLibrary();
  renderConfidenceBars();
  updatePreview();
  scheduleAutoSave();
}

function toggleLibrarySelect(pmid) {
  const entry = state.library.find(e => e.pmid === pmid);
  if (entry) { entry.selected = !entry.selected; renderLibrary(); renderConfidenceBars(); }
}

function selectAllLibrary(val) {
  state.library.forEach(e => e.selected = val);
  renderLibrary();
  renderConfidenceBars();
}

// ── AI Confidence Indicator ──
function renderConfidenceBars() {
  const count = state.library.filter(e => e.selected).length;
  const cls = count === 0 ? "conf-red" : count <= 2 ? "conf-yellow" : "conf-green";
  const pmids = state.library.filter(e => e.selected).map(e => `PMID:${e.pmid}`).join(", ") || "none";
  const label = count === 0 ? "⚠ No sources selected"
    : count === 1 ? "1 source selected"
    : `${count} sources selected`;
  SECTIONS.forEach(s => {
    const el = document.getElementById(`conf-${s.id}`);
    if (el) {
      el.className = `confidence-bar ${cls}`;
      el.title = pmids;
      el.textContent = label;
    }
  });
}

function syncReferencesSection() {
  if (!state.library.length) { showToast("No references in library.", "error"); return; }
  const text = state.library.map(e =>
    `${e.refNumber}. ${e.authors}. ${e.title}. ${e.journal}. ${e.year}. PMID: ${e.pmid}.`
  ).join("\n");
  if (!state.sections["references"]) state.sections["references"] = { prose: "", tables: [] };
  state.sections["references"].prose = text;
  const el = document.getElementById("content-references");
  if (el) el.value = text;
  updateWordCount("references");
  updateTotalWordCount();
  updatePreview();
  scheduleAutoSave();
  showToast("References section updated.", "success");
}

// ── Custom Sections ──
async function openAddSectionModal() {
  const sel = document.getElementById("new-section-position");
  sel.innerHTML = SECTIONS
    .filter(s => s.id !== "references")
    .map(s => `<option value="${s.id}">${s.title}</option>`).join("") +
    `<option value="__end__">At end (before References)</option>`;
  sel.value = "__end__";
  document.getElementById("new-section-title").value = "";
  document.getElementById("section-suggestions-area").style.display = "none";
  document.getElementById("section-suggestion-chips").innerHTML = "";
  document.getElementById("add-section-modal").classList.add("open");
  setTimeout(() => document.getElementById("new-section-title").focus(), 50);

  const topic = getTopic();
  if (!topic) return;

  document.getElementById("section-suggestions-loading").style.display = "block";
  try {
    const existingSections = SECTIONS.filter(s => s.id !== "references").map(s => s.title);
    const resp = await fetch("/api/suggest-sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, existingSections }),
    });
    if (!resp.ok) throw new Error("suggestion request failed");
    const { suggestions } = await resp.json();
    if (suggestions?.length) {
      document.getElementById("suggestions-topic-label").textContent = topic;
      document.getElementById("section-suggestion-chips").innerHTML = suggestions
        .map(s => `<button class="suggestion-chip" onclick="pickSuggestion(event,${JSON.stringify(s)})">${htmlEsc(s)}</button>`)
        .join("");
      document.getElementById("section-suggestions-area").style.display = "block";
    }
  } catch {
    // Suggestions are non-critical — silently skip on error
  } finally {
    document.getElementById("section-suggestions-loading").style.display = "none";
  }
}

function pickSuggestion(e, title) {
  document.querySelectorAll(".suggestion-chip").forEach(c => c.classList.remove("chip-selected"));
  e.currentTarget.classList.add("chip-selected");
  const input = document.getElementById("new-section-title");
  input.value = title;
  input.dispatchEvent(new Event("input"));
  input.focus();
}

function closeAddSectionModal() {
  document.getElementById("add-section-modal").classList.remove("open");
}

function confirmAddSection() {
  const title = document.getElementById("new-section-title").value.trim();
  if (!title) { showToast("Enter a section title.", "error"); return; }
  const afterId = document.getElementById("new-section-position").value;
  addCustomSection(title, afterId);
  closeAddSectionModal();
}

function addCustomSection(title, afterId) {
  const id = "custom_" + Date.now();
  const newSection = { id, num: "", title, placeholder: `Write about ${title}...`, isCustom: true };
  state.sections[id] = { prose: "", tables: [] };
  const refIdx = SECTIONS.findIndex(s => s.id === "references");
  let insertIdx = afterId === "__end__"
    ? refIdx
    : SECTIONS.findIndex(s => s.id === afterId) + 1;
  if (insertIdx <= 0 || insertIdx > refIdx) insertIdx = refIdx;
  SECTIONS.splice(insertIdx, 0, newSection);
  renumberSections();
  renderSections();
  document.getElementById(`section-${id}`)?.classList.add("open");
  scheduleAutoSave();
  showToast(`Section "${title}" added.`, "success");
}

function deleteSection(id) {
  const s = SECTIONS.find(s => s.id === id);
  if (!confirm(`Delete section "${s?.title}"? Content will be lost.`)) return;
  SECTIONS.splice(SECTIONS.findIndex(s => s.id === id), 1);
  delete state.sections[id];
  renumberSections();
  renderSections();
  updatePreview();
  scheduleAutoSave();
}

function toggleUserCtx(id) {
  const body = document.getElementById(`user-ctx-body-${id}`);
  const chevron = document.getElementById(`user-ctx-chevron-${id}`);
  if (!body) return;
  const open = body.style.display === "block";
  body.style.display = open ? "none" : "block";
  chevron.textContent = open ? "▶" : "▼";
  if (!open) document.getElementById(`user-ctx-${id}`)?.focus();
}

function updateUserCtx(id, value) {
  if (!state.sections[id]) state.sections[id] = { prose: "", tables: [], userContext: "" };
  state.sections[id].userContext = value;
  scheduleAutoSave();
}

function renameSection(id) {
  const s = SECTIONS.find(s => s.id === id);
  const newTitle = prompt("Rename section:", s?.title || "");
  if (!newTitle?.trim() || newTitle.trim() === s?.title) return;
  s.title = newTitle.trim();
  renderSections();
  scheduleAutoSave();
}

// ── Table Generation ──
function openTablePrompt(sectionId, sectionTitle) {
  tableModalSectionId = sectionId;
  document.getElementById("table-modal-section-name").textContent = sectionTitle;
  document.getElementById("table-description").value = "";
  document.getElementById("table-gen-status").style.display = "none";
  document.getElementById("table-gen-btn").disabled = false;
  document.getElementById("table-modal").classList.add("open");
  setTimeout(() => document.getElementById("table-description").focus(), 50);
}

function closeTableModal() {
  document.getElementById("table-modal").classList.remove("open");
  tableModalSectionId = null;
}

async function generateTable() {
  const desc = document.getElementById("table-description").value.trim();
  if (!desc) { showToast("Describe the table first.", "error"); return; }
  if (!tableModalSectionId) return;
  const sectionTitle = document.getElementById("table-modal-section-name").textContent;
  const btn = document.getElementById("table-gen-btn");
  const status = document.getElementById("table-gen-status");
  btn.disabled = true;
  status.style.display = "block";
  try {
    const resp = await fetch("/api/generate-table", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: getTopic(), sectionTitle,
        tableDescription: desc,
        pubmedContext: getSelectedPubmedContext(),
        language: getLanguage(),
      }),
    });
    if (!resp.ok) { const e = await resp.json(); throw new Error(e.error); }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    const captionMatch = html.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i);
    const caption = captionMatch ? captionMatch[1].replace(/<[^>]+>/g, "").trim() : desc;
    const tableEntry = { id: "tbl_" + Date.now(), caption, html };
    if (!state.sections[tableModalSectionId]) state.sections[tableModalSectionId] = { prose: "", tables: [] };
    if (!state.sections[tableModalSectionId].tables) state.sections[tableModalSectionId].tables = [];
    state.sections[tableModalSectionId].tables.push(tableEntry);
    renderSectionTables(tableModalSectionId);
    updatePreview();
    scheduleAutoSave();
    showToast("Table added!", "success");
    closeTableModal();
  } catch (err) {
    showToast("Table failed: " + err.message, "error");
  } finally {
    btn.disabled = false;
    status.style.display = "none";
  }
}

function renderSectionTables(sectionId) {
  const container = document.getElementById(`tables-${sectionId}`);
  if (!container) return;
  const tables = state.sections[sectionId]?.tables || [];
  if (!tables.length) { container.innerHTML = ""; return; }
  container.innerHTML = tables.map(t => `
    <div class="table-card">
      <div class="table-card-header">
        <span class="table-caption">${htmlEsc(t.caption || "Table")}</span>
        <button class="btn btn-secondary btn-sm" onclick="deleteTable('${sectionId}','${t.id}')">✕ Remove</button>
      </div>
      <div class="table-html-preview">${t.html || ""}</div>
    </div>
  `).join("");
}

function deleteTable(sectionId, tableId) {
  if (!state.sections[sectionId]) return;
  state.sections[sectionId].tables = (state.sections[sectionId].tables || []).filter(t => t.id !== tableId);
  renderSectionTables(sectionId);
  updatePreview();
  scheduleAutoSave();
}

// ── Section Refinement ──
function refineSection(id, title) {
  const instruction = document.getElementById(`refine-input-${id}`)?.value.trim();
  if (!instruction) { showToast("Enter a refinement instruction.", "error"); return; }
  const contentEl = document.getElementById(`ai-content-${id}`);
  const currentDraft = (contentEl?.innerText || contentEl?.textContent || "").trim();
  if (!currentDraft) { showToast("Generate a draft first.", "error"); return; }
  if (!refinementHistory[id]) refinementHistory[id] = [];
  refinementHistory[id].push(currentDraft);
  if (refinementHistory[id].length > 5) refinementHistory[id].shift();
  const undoBtn = document.getElementById(`ai-undo-${id}`);
  if (undoBtn) undoBtn.style.display = "";
  document.getElementById(`refine-input-${id}`).value = "";
  streamToAiBox("/api/refine", {
    topic: getTopic(), sectionTitle: title,
    currentDraft, instruction,
    pubmedContext: getSelectedPubmedContext(),
    language: getLanguage(),
    writingStyle: state.writingStyle,
  }, id, "↺ Refined Draft", true);
}

function undoRefinement(id) {
  if (!refinementHistory[id]?.length) return;
  const prev = refinementHistory[id].pop();
  const contentEl = document.getElementById(`ai-content-${id}`);
  if (contentEl) contentEl.innerText = prev;
  if (!refinementHistory[id].length) {
    const undoBtn = document.getElementById(`ai-undo-${id}`);
    if (undoBtn) undoBtn.style.display = "none";
  }
}

// ── Citation Enhancement ──
function enhanceCitations(text, library) {
  // Escape HTML
  let html = String(text).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  if (!library?.length) return html;
  // Replace [Author et al., YYYY] or [Author, YYYY]
  return html.replace(/\[([A-Z][a-zA-Z\-]+(?:\s+et\s+al\.)?),?\s*(\d{4})\]/g, (match, author, year) => {
    const surname = author.replace(/\s+et\s+al\.?/i, "").trim().toLowerCase();
    const entry = library.find(r =>
      r.authors && r.authors.toLowerCase().includes(surname) && r.year === year
    );
    if (entry) {
      const refText = `${entry.authors}. ${entry.title}. ${entry.journal}. ${entry.year}. PMID: ${entry.pmid}`.replace(/"/g, "&quot;");
      return `<sup class="cite-link" title="${refText}">[${entry.refNumber}]</sup>`;
    }
    return `<span class="cite-unmatched" title="Not found in Reference Library">${match}</span>`;
  });
}

// ── One-click full draft ──
let draftAbortController = null;

async function startFullDraft() {
  const topic = getTopic();
  if (!topic) { showToast("Set a Medical Topic first.", "error"); return; }

  const sectionsPayload = SECTIONS
    .filter(s => s.id !== "references")
    .map(s => ({
      id: s.id,
      title: s.title,
      notes: document.getElementById(`notes-${s.id}`)?.value || "",
      userContext: state.sections[s.id]?.userContext || "",
    }));

  const modal = document.getElementById("draft-progress-modal");
  const list = document.getElementById("draft-section-list");
  const subtitle = document.getElementById("draft-progress-subtitle");

  modal.classList.add("open");
  subtitle.textContent = "Generating drafts for each section…";
  list.innerHTML = sectionsPayload.map(s =>
    `<div class="draft-section-row" id="drow-${s.id}">
      <div class="draft-section-row-title">${escHtml(s.title)}</div>
      <span class="draft-section-status" id="dstatus-${s.id}">Queued</span>
    </div>`
  ).join("");

  draftAbortController = new AbortController();

  try {
    const resp = await fetch("/api/agent/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic,
        sections: sectionsPayload,
        language: getLanguage(),
        pubmedContext: getSelectedPubmedContext(),
        writingStyle: state.writingStyle,
      }),
      signal: draftAbortController.signal,
    });

    if (!resp.ok) { const e = await resp.json(); throw new Error(e.error); }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          handleDraftEvent(evt);
        } catch { /* partial line */ }
      }
    }
  } catch (err) {
    if (err.name !== "AbortError") {
      showToast("Draft generation failed: " + err.message, "error");
    }
    modal.classList.remove("open");
  }
}

function handleDraftEvent(evt) {
  const list = document.getElementById("draft-section-list");
  const subtitle = document.getElementById("draft-progress-subtitle");

  if (evt.type === "section_start") {
    const statusEl = document.getElementById(`dstatus-${evt.id}`);
    if (statusEl) statusEl.textContent = "Generating…";
  } else if (evt.type === "section_done") {
    const row = document.getElementById(`drow-${evt.id}`);
    if (row) {
      const preview = evt.content.slice(0, 120).replace(/\n/g, " ");
      row.innerHTML = `
        <div class="draft-section-row-title">${escHtml(evt.title)}</div>
        <div class="draft-section-preview">${escHtml(preview)}…</div>
        <div class="draft-section-actions">
          <button class="btn btn-ai btn-sm" onclick="approveDraftSection('${evt.id}',${JSON.stringify(evt.content)})">Apply</button>
          <button class="btn btn-secondary btn-sm" onclick="skipDraftSection('${evt.id}')">Skip</button>
        </div>`;
    }
  } else if (evt.type === "complete") {
    subtitle.textContent = "All sections generated. Review and apply below.";
  } else if (evt.type === "error") {
    showToast("Error: " + evt.message, "error");
  }
}

function approveDraftSection(id, content) {
  state.sections[id] = state.sections[id] || { prose: "", tables: [], userContext: "" };
  state.sections[id].prose = content;
  const textarea = document.getElementById(`content-${id}`);
  if (textarea) textarea.value = content;
  updateWordCount(id);
  updatePreview();
  scheduleAutoSave();
  const row = document.getElementById(`drow-${id}`);
  if (row) {
    row.querySelector(".draft-section-actions").innerHTML = '<span style="color:#16a34a;font-size:0.8rem;font-weight:600">✓ Applied</span>';
  }
}

function skipDraftSection(id) {
  const row = document.getElementById(`drow-${id}`);
  if (row) {
    row.querySelector(".draft-section-actions").innerHTML = '<span style="color:var(--muted);font-size:0.8rem">Skipped</span>';
  }
}

function cancelFullDraft() {
  draftAbortController?.abort();
  document.getElementById("draft-progress-modal").classList.remove("open");
}

fetch('/api/version').then(r => r.json()).then(v => {
  const isDev = v.env !== 'production';
  const badge = document.createElement('div');
  badge.id = 'version-badge';
  badge.style.cssText = [
    'position:fixed', 'bottom:8px', 'right:12px', 'font-size:11px',
    'padding:2px 8px', 'border-radius:10px', 'pointer-events:none',
    isDev ? 'background:#1d4ed8;color:#fff;opacity:0.8' : 'background:#6b7280;color:#fff;opacity:0.6'
  ].join(';');
  badge.textContent = isDev ? `v${v.version} · dev` : `v${v.version}`;
  document.body.appendChild(badge);
}).catch(() => {});
