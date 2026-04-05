    let articles = [];
    let pendingDeleteId = null;

    // ── Bootstrap ──────────────────────────────────────────────────────────────

    async function init() {
      const user = await checkAuth();
      if (!user) return;
      hydrateUserWidget(user);
      await loadArticles();
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
        renderArticles();
      } catch {
        document.getElementById("articles-container").innerHTML =
          '<p style="color:var(--danger);text-align:center;padding:40px 0">Failed to load articles. Please refresh.</p>';
      }
    }

    function renderArticles() {
      const container = document.getElementById("articles-container");

      if (!articles.length) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📄</div>
            <h2>No articles yet</h2>
            <p>Click <strong>+ New article</strong> to start writing your first review.</p>
          </div>`;
        return;
      }

      const grid = document.createElement("div");
      grid.className = "articles-grid";

      for (const a of articles) {
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
        renderArticles();
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
