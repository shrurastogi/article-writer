    let articles = [];
    let filteredArticles = [];
    let pendingDeleteId = null;
    let currentView = localStorage.getItem("dashboard-view") || "card";

    // ── Bootstrap ──────────────────────────────────────────────────────────────

    async function init() {
      const user = await checkAuth();
      if (!user) return;
      hydrateUserWidget(user);
      setView(currentView);
      await loadArticles();
    }

    function setView(mode) {
      currentView = mode;
      localStorage.setItem("dashboard-view", mode);
      document.getElementById("view-btn-card").classList.toggle("active", mode === "card");
      document.getElementById("view-btn-list").classList.toggle("active", mode === "list");
      renderArticles();
    }

    async function checkAuth() {
      try {
        const res = await fetch("/auth/me");
        if (res.status === 401) {
          window.location.href = "/login";
          return null;
        }
        return await res.json();
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
      document.getElementById("user-name").textContent = user.name;
      document.getElementById("user-widget").style.display = "flex";
    }

    // ── Article list ───────────────────────────────────────────────────────────

    async function loadArticles() {
      try {
        const res = await fetch("/api/articles");
        if (!res.ok) throw new Error("Failed to load articles");
        const data = await res.json();
        articles = data.articles;
        applyFilters();
      } catch {
        document.getElementById("articles-container").innerHTML =
          '<p style="color:var(--danger);text-align:center;padding:40px 0">Failed to load articles. Please refresh.</p>';
      }
    }

    function applyFilters() {
      const text = (document.getElementById("filter-text")?.value || "").toLowerCase().trim();
      const dateFrom = document.getElementById("filter-date-from")?.value;
      const dateTo = document.getElementById("filter-date-to")?.value;
      const wordsMin = parseInt(document.getElementById("filter-words-min")?.value || "0") || 0;

      filteredArticles = articles.filter(a => {
        if (text && !`${a.title || ""} ${a.topic || ""}`.toLowerCase().includes(text)) return false;
        if (dateFrom && new Date(a.updatedAt) < new Date(dateFrom)) return false;
        if (dateTo && new Date(a.updatedAt) > new Date(dateTo + "T23:59:59")) return false;
        if (wordsMin > 0 && (a.wordCount || 0) < wordsMin) return false;
        return true;
      });

      const hasFilters = text || dateFrom || dateTo || wordsMin > 0;
      document.getElementById("btn-clear-filters").style.display = hasFilters ? "inline-flex" : "none";
      renderFilterChips({ text, dateFrom, dateTo, wordsMin });
      renderArticles(filteredArticles);
    }

    function clearFilters() {
      document.getElementById("filter-text").value = "";
      document.getElementById("filter-date-from").value = "";
      document.getElementById("filter-date-to").value = "";
      document.getElementById("filter-words-min").value = "";
      applyFilters();
    }

    function renderFilterChips({ text, dateFrom, dateTo, wordsMin }) {
      const chips = document.getElementById("filter-chips");
      const parts = [];
      if (text) parts.push({ label: `"${text}"`, clear: () => { document.getElementById("filter-text").value = ""; applyFilters(); } });
      if (dateFrom) parts.push({ label: `From ${dateFrom}`, clear: () => { document.getElementById("filter-date-from").value = ""; applyFilters(); } });
      if (dateTo) parts.push({ label: `To ${dateTo}`, clear: () => { document.getElementById("filter-date-to").value = ""; applyFilters(); } });
      if (wordsMin > 0) parts.push({ label: `≥${wordsMin} words`, clear: () => { document.getElementById("filter-words-min").value = ""; applyFilters(); } });
      chips.innerHTML = "";
      parts.forEach(({ label, clear }) => {
        const chip = document.createElement("span");
        chip.className = "filter-chip";
        chip.innerHTML = `${escHtml(label)} <span class="filter-chip-x" title="Remove filter">✕</span>`;
        chip.querySelector(".filter-chip-x").onclick = clear;
        chips.appendChild(chip);
      });
    }

    function renderArticles(list) {
      const displayList = list !== undefined ? list : filteredArticles.length || articles.length === 0 ? filteredArticles : articles;
      const container = document.getElementById("articles-container");

      if (!displayList.length) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📄</div>
            <h2>No articles yet</h2>
            <p>Click <strong>+ New article</strong> to start writing your first review.</p>
          </div>`;
        return;
      }

      if (currentView === "list") {
        const table = document.createElement("table");
        table.className = "articles-table";
        table.innerHTML = `<thead><tr>
          <th>Title</th><th>Topic</th><th>Words</th><th>Modified</th><th></th>
        </tr></thead>`;
        const tbody = document.createElement("tbody");
        for (const a of displayList) {
          const dateStr = new Date(a.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
          const words = a.wordCount ? a.wordCount.toLocaleString() : "—";
          const tr = document.createElement("tr");
          tr.onclick = () => openArticle(a._id);
          tr.innerHTML = `
            <td class="at-title">${escHtml(a.title || "Untitled Article")}</td>
            <td class="at-topic">${escHtml(a.topic || "—")}</td>
            <td class="at-words">${words}</td>
            <td class="at-date">${dateStr}</td>
            <td class="at-actions" onclick="event.stopPropagation()">
              <button class="delete-btn" title="Delete article" onclick="openDeleteModal(event,'${a._id}',${JSON.stringify(a.title)})">✕</button>
            </td>`;
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        container.innerHTML = "";
        container.appendChild(table);
        return;
      }

      // Card view (default)
      const grid = document.createElement("div");
      grid.className = "articles-grid";

      for (const a of displayList) {
        const card = document.createElement("div");
        card.className = "article-card";
        card.onclick = () => openArticle(a._id);

        const updated = new Date(a.updatedAt);
        const dateStr = updated.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
        const words = a.wordCount ? `${a.wordCount.toLocaleString()} words` : "No content";

        card.innerHTML = `
          <button class="delete-btn" title="Delete article" onclick="openDeleteModal(event, '${a._id}', ${JSON.stringify(a.title)})">✕</button>
          <div class="article-title">${escHtml(a.title || "Untitled Article")}</div>
          <div class="article-topic">${escHtml(a.topic || "")}</div>
          <div class="article-meta">
            <span>Updated ${dateStr}</span>
            <span class="article-words">${words}</span>
          </div>`;

        grid.appendChild(card);
      }

      container.innerHTML = "";
      container.appendChild(grid);
    }

    // ── Actions ────────────────────────────────────────────────────────────────

    async function createArticle() {
      const btn = document.getElementById("btn-new");
      btn.disabled = true;
      btn.innerHTML = '<span class="plus">…</span> Creating…';

      try {
        const res = await fetch("/api/articles", { method: "POST" });
        if (!res.ok) throw new Error("Create failed");
        const data = await res.json();
        window.location.href = `/?id=${data.article._id}`;
      } catch {
        btn.disabled = false;
        btn.innerHTML = '<span class="plus">+</span> New article';
        alert("Failed to create article. Please try again.");
      }
    }

    function openArticle(id) {
      window.location.href = `/?id=${id}`;
    }

    // ── Delete modal ───────────────────────────────────────────────────────────

    function openDeleteModal(e, id, title) {
      e.stopPropagation();
      pendingDeleteId = id;
      document.getElementById("delete-modal-text").textContent =
        `"${title}" will be permanently deleted. This cannot be undone.`;
      document.getElementById("delete-modal").classList.add("visible");
    }

    function closeDeleteModal() {
      pendingDeleteId = null;
      document.getElementById("delete-modal").classList.remove("visible");
    }

    async function confirmDelete() {
      if (!pendingDeleteId) return;
      const btn = document.getElementById("confirm-delete-btn");
      btn.disabled = true;
      btn.textContent = "Deleting…";

      try {
        const res = await fetch(`/api/articles/${pendingDeleteId}`, { method: "DELETE" });
        if (!res.ok && res.status !== 204) throw new Error("Delete failed");
        articles = articles.filter(a => a._id !== pendingDeleteId);
        closeDeleteModal();
        applyFilters();
      } catch {
        btn.disabled = false;
        btn.textContent = "Delete";
        alert("Failed to delete article. Please try again.");
      }
    }

    // ── Auth ───────────────────────────────────────────────────────────────────

    async function signOut() {
      await fetch("/auth/logout", { method: "POST" });
      window.location.href = "/login";
    }

    // ── Util ───────────────────────────────────────────────────────────────────

    function escHtml(str) {
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    // Close modal on overlay click
    document.getElementById("delete-modal").addEventListener("click", function(e) {
      if (e.target === this) closeDeleteModal();
    });

    init();

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
