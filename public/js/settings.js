"use strict";

// ── Writing Style Presets ─────────────────────────────────────────────────────

const WRITING_STYLE_PRESETS = [
  {
    id: "none",
    name: "None",
    tagline: "AI default",
    desc: "No style guidance applied. The AI uses its default academic writing voice.",
    styleProfile: null,
  },
  {
    id: "clinical_formal",
    name: "Clinical & Formal",
    tagline: "Dense · High hedging",
    desc: "Dense, precise academic prose with long complex sentences and high hedging. Passive voice used where conventionally expected. Best for high-impact journals such as NEJM, Lancet, JAMA, and JCO.",
    styleProfile: { toneDescriptor: "formal, precise, clinical", formalityScore: 90, avgSentenceLength: 28, hedgingFrequency: "high" },
  },
  {
    id: "clear_accessible",
    name: "Clear & Accessible",
    tagline: "Readable · Active voice",
    desc: "Formal but reader-friendly. Shorter sentences, active voice preferred, technical terms explained on first use. Best for review articles and clinical education targeting clinicians and trainees.",
    styleProfile: { toneDescriptor: "formal yet accessible, reader-friendly", formalityScore: 70, avgSentenceLength: 20, hedgingFrequency: "moderate" },
  },
  {
    id: "concise_direct",
    name: "Concise & Direct",
    tagline: "Tight · Minimal hedging",
    desc: "Tight, economical writing with short sentences, minimal hedging, and active voice throughout. Best for editorials, perspectives, and brief communications where every word counts.",
    styleProfile: { toneDescriptor: "concise, direct, economical", formalityScore: 75, avgSentenceLength: 15, hedgingFrequency: "low" },
  },
  {
    id: "evidence_led",
    name: "Evidence-Led",
    tagline: "Data-forward · Quantitative",
    desc: "Leads with statistics and trial outcomes, integrates citations tightly, uses precise quantitative language throughout. Best for systematic reviews, meta-analyses, and HTA submissions.",
    styleProfile: { toneDescriptor: "data-forward, quantitative, citation-dense", formalityScore: 85, avgSentenceLength: 22, hedgingFrequency: "moderate" },
  },
  {
    id: "narrative_engaging",
    name: "Narrative & Engaging",
    tagline: "Story-driven · Smooth flow",
    desc: "Story-driven flow with smooth transitions, analogies, and progressive argument-building. Best for educational reviews, grand rounds presentations, and CME materials.",
    styleProfile: { toneDescriptor: "narrative, engaging, progressive", formalityScore: 65, avgSentenceLength: 18, hedgingFrequency: "low" },
  },
  {
    id: "guideline_style",
    name: "Guideline Style",
    tagline: "Structured · Prescriptive",
    desc: "Structured, prescriptive writing with clear numbered recommendations and imperative phrasing. Best for consensus statements, clinical practice guidelines, and position papers.",
    styleProfile: { toneDescriptor: "structured, prescriptive, recommendation-led", formalityScore: 88, avgSentenceLength: 16, hedgingFrequency: "low" },
  },
];

let selectedStylePreset = "none";

function renderStylePresets(savedPreset) {
  const grid = document.getElementById("style-preset-grid");
  if (!grid) return;
  grid.innerHTML = WRITING_STYLE_PRESETS.map(p => `
    <button class="style-preset-card${p.id === savedPreset ? " selected" : ""}"
            data-preset-id="${p.id}"
            onclick="selectStylePreset('${p.id}')" type="button">
      <span class="style-preset-name">${p.name}</span>
      <span class="style-preset-tagline">${p.tagline}</span>
    </button>
  `).join("");
  selectedStylePreset = savedPreset || "none";
  updateStyleDesc(selectedStylePreset);
}

function selectStylePreset(id) {
  selectedStylePreset = id;
  document.querySelectorAll(".style-preset-card").forEach(c => {
    c.classList.toggle("selected", c.dataset.presetId === id);
  });
  updateStyleDesc(id);
}

function updateStyleDesc(id) {
  const desc = document.getElementById("style-preset-desc");
  if (!desc) return;
  const preset = WRITING_STYLE_PRESETS.find(p => p.id === id);
  if (!preset || !preset.desc) { desc.classList.remove("visible"); return; }
  desc.textContent = preset.desc;
  desc.classList.add("visible");
}

async function saveWritingStyle() {
  try {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences: { writingStylePreset: selectedStylePreset } }),
    });
    if (!res.ok) throw new Error("Failed");
    showToast("Writing style saved.");
  } catch {
    showToast("Failed to save writing style.", "error");
  }
}

// ── Toast ──────────────────────────────────────────────────────────────────────

function showToast(msg, type = "success") {
  const el = document.getElementById("settings-toast");
  if (!el) return;
  el.textContent = msg;
  el.style.background = type === "error" ? "#991b1b" : "#166534";
  el.style.display = "block";
  setTimeout(() => { el.style.display = "none"; }, 3000);
}

// ── Init ──────────────────────────────────────────────────────────────────────

(async () => {
  // Apply saved theme
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") document.documentElement.setAttribute("data-theme", "dark");

  // Load current settings first so we know the saved provider before populating models
  let savedProvider = "groq";
  let savedModel = "";
  try {
    const res = await fetch("/api/settings");
    if (!res.ok) { window.location.href = "/login"; return; }
    const data = await res.json();

    savedProvider = data.llmConfig.provider || "groq";
    savedModel = data.llmConfig.model || "";

    if (data.llmConfig.hasKey) {
      document.getElementById("llm-key-badge").style.display = "";
      document.getElementById("delete-llm-key-btn").style.display = "";
    }

    if (data.researchConfig.hasNcbiKey) {
      document.getElementById("ncbi-key-badge").style.display = "";
      document.getElementById("delete-ncbi-key-btn").style.display = "";
    }

    const p = data.preferences;
    document.getElementById("pref-theme").value = p.theme || "light";
    document.getElementById("pref-font-size").value = String(p.fontSize || 14);
    document.getElementById("pref-language").value = p.language || "English";
    document.getElementById("pref-strict-mode").checked = !!p.strictMode;
    renderStylePresets(p.writingStylePreset || "none");
  } catch {
    showToast("Failed to load settings.", "error");
  }

  // Initialize provider card UI, load models, then restore saved model selection
  selectProvider(savedProvider);
  await loadModels(savedProvider);
  document.getElementById("llm-model").value = savedModel;
})();

// ── Model loading ─────────────────────────────────────────────────────────────

async function loadModels(provider) {
  try {
    const modelsRes = await fetch(`/api/llm/models?provider=${encodeURIComponent(provider)}`);
    if (!modelsRes.ok) return;
    const { models } = await modelsRes.json();
    const sel = document.getElementById("llm-model");
    sel.innerHTML = '<option value="">Provider default</option>';
    models.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.name;
      sel.appendChild(opt);
    });
  } catch { /* ignore */ }
}

// ── Provider selection ────────────────────────────────────────────────────────

const PROVIDER_META = {
  groq:    { keyPlaceholder: "gsk_••••••••••••••••••", keyHint: 'Free key at <a href="https://console.groq.com" target="_blank">console.groq.com</a>' },
  mistral: { keyPlaceholder: "••••••••••••••••••••••••••••••••", keyHint: 'Free tier at <a href="https://console.mistral.ai" target="_blank">console.mistral.ai</a>' },
  openai:  { keyPlaceholder: "sk-proj-••••••••••••••••", keyHint: 'Paid API at <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com</a>' },
};

function selectProvider(provider) {
  document.getElementById("llm-provider").value = provider;
  document.querySelectorAll(".provider-card").forEach(c => c.classList.toggle("selected", c.dataset.provider === provider));
  const meta = PROVIDER_META[provider] || PROVIDER_META.groq;
  document.getElementById("llm-api-key").placeholder = meta.keyPlaceholder;
  document.getElementById("provider-key-hint").innerHTML = meta.keyHint;
  loadModels(provider);
  document.getElementById("llm-model").value = "";
}

// ── Save handlers ─────────────────────────────────────────────────────────────

async function saveLlmSettings() {
  const provider = document.getElementById("llm-provider").value;
  const model = document.getElementById("llm-model").value;
  const apiKey = document.getElementById("llm-api-key").value;
  try {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, model, ...(apiKey ? { apiKey } : {}) }),
    });
    if (!res.ok) throw new Error("Failed");
    const data = await res.json();
    document.getElementById("llm-api-key").value = "";
    document.getElementById("llm-key-badge").style.display = data.llmConfig.hasKey ? "" : "none";
    document.getElementById("delete-llm-key-btn").style.display = data.llmConfig.hasKey ? "" : "none";
    showToast("LLM settings saved.");
  } catch {
    showToast("Failed to save LLM settings.", "error");
  }
}

async function saveNcbiSettings() {
  const ncbiKey = document.getElementById("ncbi-api-key").value;
  if (!ncbiKey) { showToast("Enter an NCBI API key.", "error"); return; }
  try {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ncbiKey }),
    });
    if (!res.ok) throw new Error("Failed");
    document.getElementById("ncbi-api-key").value = "";
    document.getElementById("ncbi-key-badge").style.display = "";
    document.getElementById("delete-ncbi-key-btn").style.display = "";
    showToast("NCBI key saved.");
  } catch {
    showToast("Failed to save NCBI key.", "error");
  }
}

async function deleteLlmKey() {
  if (!confirm("Remove your LLM API key? The system key will be used instead.")) return;
  try {
    const res = await fetch("/api/settings/llm-key", { method: "DELETE" });
    if (!res.ok) throw new Error("Failed");
    document.getElementById("llm-key-badge").style.display = "none";
    document.getElementById("delete-llm-key-btn").style.display = "none";
    showToast("LLM key removed.");
  } catch {
    showToast("Failed to remove key.", "error");
  }
}

async function deleteNcbiKey() {
  if (!confirm("Remove your NCBI API key?")) return;
  try {
    const res = await fetch("/api/settings/ncbi-key", { method: "DELETE" });
    if (!res.ok) throw new Error("Failed");
    document.getElementById("ncbi-key-badge").style.display = "none";
    document.getElementById("delete-ncbi-key-btn").style.display = "none";
    showToast("NCBI key removed.");
  } catch {
    showToast("Failed to remove NCBI key.", "error");
  }
}

async function savePreferences() {
  const preferences = {
    theme:      document.getElementById("pref-theme").value,
    fontSize:   parseInt(document.getElementById("pref-font-size").value),
    language:   document.getElementById("pref-language").value,
    strictMode: document.getElementById("pref-strict-mode").checked,
  };
  try {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences }),
    });
    if (!res.ok) throw new Error("Failed");
    // Apply theme change immediately
    localStorage.setItem("theme", preferences.theme);
    document.documentElement.setAttribute("data-theme", preferences.theme === "dark" ? "dark" : "");
    localStorage.setItem("font-size", preferences.fontSize);
    showToast("Preferences saved.");
  } catch {
    showToast("Failed to save preferences.", "error");
  }
}
