"use strict";

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

  // Load models
  try {
    const modelsRes = await fetch("/api/llm/models");
    if (modelsRes.ok) {
      const { models } = await modelsRes.json();
      const sel = document.getElementById("llm-model");
      models.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.name;
        sel.appendChild(opt);
      });
    }
  } catch { /* ignore */ }

  // Load current settings
  try {
    const res = await fetch("/api/settings");
    if (!res.ok) { window.location.href = "/login"; return; }
    const data = await res.json();

    document.getElementById("llm-provider").value = data.llmConfig.provider || "groq";
    document.getElementById("llm-model").value = data.llmConfig.model || "";

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
  } catch {
    showToast("Failed to load settings.", "error");
  }
})();

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
