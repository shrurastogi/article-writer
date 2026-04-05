    // Show error from query string (e.g. ?error=auth_failed from OAuth callback)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("error") === "auth_failed") {
      showError("login-error", "Google sign-in failed. Please try again.");
    }

    function switchTab(tab) {
      document.querySelectorAll(".tab-btn").forEach((b, i) => {
        b.classList.toggle("active", (i === 0 && tab === "login") || (i === 1 && tab === "register"));
      });
      document.getElementById("pane-login").classList.toggle("active", tab === "login");
      document.getElementById("pane-register").classList.toggle("active", tab === "register");
      hideError("login-error");
      hideError("register-error");
    }

    function showError(id, msg) {
      const el = document.getElementById(id);
      el.textContent = msg;
      el.classList.add("visible");
    }
    function hideError(id) {
      document.getElementById(id).classList.remove("visible");
    }

    async function handleLogin(e) {
      e.preventDefault();
      hideError("login-error");
      const btn = document.getElementById("login-btn");
      btn.disabled = true;
      btn.textContent = "Signing in…";

      try {
        const res = await fetch("/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: document.getElementById("login-email").value,
            password: document.getElementById("login-password").value,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          window.location.href = "/dashboard";
        } else {
          showError("login-error", data.error || "Sign in failed.");
          btn.disabled = false;
          btn.textContent = "Sign in";
        }
      } catch {
        showError("login-error", "Network error. Please try again.");
        btn.disabled = false;
        btn.textContent = "Sign in";
      }
    }

    async function handleRegister(e) {
      e.preventDefault();
      hideError("register-error");
      const btn = document.getElementById("register-btn");
      btn.disabled = true;
      btn.textContent = "Creating account…";

      try {
        const res = await fetch("/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: document.getElementById("reg-name").value,
            email: document.getElementById("reg-email").value,
            password: document.getElementById("reg-password").value,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          window.location.href = "/dashboard";
        } else {
          showError("register-error", data.error || "Registration failed.");
          btn.disabled = false;
          btn.textContent = "Create account";
        }
      } catch {
        showError("register-error", "Network error. Please try again.");
        btn.disabled = false;
        btn.textContent = "Create account";
      }
    }
  </script>
