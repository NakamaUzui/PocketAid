(function () {
  const API = "/api";
  const mode = document.body.dataset.authMode || "login";
  const isRegister = mode === "register";

  const overlay = document.querySelector("[data-auth-overlay]");
  const overlayTitle = document.querySelector("[data-overlay-title]");
  const overlaySub = document.querySelector("[data-overlay-sub]");
  const overlayIcon = document.querySelector("[data-overlay-icon]");
  const errEl = document.querySelector("[data-auth-error]");
  const oauthBlock = document.querySelector("[data-auth-oauth]");
  const oauthDivider = document.querySelector("[data-auth-divider]");

  let authConfig = { google: false, apple: false, googleClientId: null, appleClientId: null };
  let googleReady = false;

  const CHECK_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || "";
    errEl.hidden = !msg;
  }

  function setFormBusy(form, busy) {
    const btn = form?.querySelector(".auth-submit");
    if (btn) {
      btn.disabled = busy;
      btn.classList.toggle("is-loading", busy);
    }
    form?.querySelectorAll("input, button[data-toggle-pw]").forEach((el) => {
      if (!el.classList.contains("auth-submit")) el.disabled = busy;
    });
  }

  function showOverlay(state, title, sub) {
    if (!overlay) return;
    overlay.hidden = false;
    overlay.classList.add("is-visible");
    overlay.classList.remove("auth-overlay--loading", "auth-overlay--success");
    overlay.classList.add(state === "success" ? "auth-overlay--success" : "auth-overlay--loading");
    if (overlayTitle) overlayTitle.textContent = title;
    if (overlaySub) overlaySub.textContent = sub || "";
    if (overlayIcon) {
      overlayIcon.innerHTML = state === "success" ? CHECK_SVG : "";
    }
    overlay.setAttribute("aria-busy", state === "loading" ? "true" : "false");
  }

  function hideOverlay() {
    overlay?.classList.remove("is-visible");
    setTimeout(() => {
      if (overlay && !overlay.classList.contains("is-visible")) overlay.hidden = true;
    }, 350);
  }

  function successThenRedirect(user, wasRegister) {
    const name = user?.name || user?.email?.split("@")[0] || "";
    const title = wasRegister ? "Konto erfolgreich erstellt!" : "Willkommen zurück!";
    const sub = wasRegister
      ? `Schön, dass du da bist${name ? ", " + name : ""}. Wir leiten dich weiter …`
      : "Du wirst zur App weitergeleitet …";

    showOverlay("success", title, sub);
    setTimeout(() => {
      window.location.href = "/";
    }, 1800);
  }

  async function apiAuth(path, body) {
    const res = await fetch(`${API}/auth/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    let data = {};
    try {
      data = await res.json();
    } catch (_) {}
    if (!res.ok) throw new Error(data.error || "Anfrage fehlgeschlagen");
    return data;
  }

  async function checkAlreadyLoggedIn() {
    try {
      const res = await fetch(`${API}/auth/me`, { credentials: "include" });
      if (res.ok) window.location.href = "/";
    } catch (_) {}
  }

  async function loadAuthConfig() {
    try {
      const res = await fetch(`${API}/auth/config`);
      if (res.ok) authConfig = await res.json();
    } catch (_) {}
    setupOAuthUI();
  }

  function setupOAuthUI() {
    const googleBtn = document.querySelector("[data-google-signin]");
    const appleBtn = document.querySelector("[data-apple-signin]");
    const hasOAuth = authConfig.google || authConfig.apple;

    if (oauthBlock) oauthBlock.hidden = !hasOAuth;
    if (oauthDivider) oauthDivider.hidden = !hasOAuth;

    if (authConfig.google && googleBtn) {
      googleBtn.hidden = false;
      loadGoogleScript(authConfig.googleClientId);
    }
    if (authConfig.apple && appleBtn) {
      appleBtn.hidden = false;
      loadAppleScript(authConfig.appleClientId);
    }
  }

  function loadGoogleScript(clientId) {
    if (!clientId || googleReady) return;
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    const init = () => {
      if (!window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      googleReady = true;
      const slot = document.querySelector("[data-google-slot]");
      if (slot) {
        window.google.accounts.id.renderButton(slot, {
          type: "standard",
          theme: "outline",
          size: "large",
          width: 360,
        });
      }
    };
    if (existing) {
      init();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = init;
    document.head.appendChild(s);
  }

  function loadAppleScript(clientId) {
    if (!clientId || window.AppleID) {
      if (window.AppleID) initApple(clientId);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
    s.async = true;
    s.onload = () => initApple(clientId);
    document.head.appendChild(s);
  }

  function initApple(clientId) {
    if (!window.AppleID?.auth || !clientId) return;
    const redirectURI = window.location.origin + window.location.pathname;
    window.AppleID.auth.init({
      clientId,
      scope: "name email",
      redirectURI,
      usePopup: true,
    });
  }

  async function handleGoogleCredential(response) {
    showError("");
    showOverlay("loading", isRegister ? "Konto wird erstellt …" : "Anmeldung läuft …", "Mit Google verbinden");
    try {
      const data = await apiAuth("google", { idToken: response.credential });
      successThenRedirect(data.user, isRegister);
    } catch (err) {
      hideOverlay();
      showError(err.message);
    }
  }

  document.querySelector("[data-google-signin]")?.addEventListener("click", () => {
    if (!authConfig.googleClientId) {
      showError("Google-Anmeldung ist noch nicht eingerichtet.");
      return;
    }
    showError("");
    if (window.google?.accounts?.id) {
      const slotBtn = document.querySelector("[data-google-slot] div[role='button']");
      if (slotBtn) {
        slotBtn.click();
        return;
      }
      window.google.accounts.id.prompt();
    } else {
      showError("Google wird geladen – bitte kurz warten und erneut versuchen.");
    }
  });

  document.querySelector("[data-apple-signin]")?.addEventListener("click", async () => {
    if (!authConfig.appleClientId) {
      showError("Apple-Anmeldung ist noch nicht eingerichtet.");
      return;
    }
    if (!window.AppleID?.auth) {
      showError("Apple wird geladen – bitte kurz warten und erneut versuchen.");
      return;
    }
    showError("");
    showOverlay("loading", isRegister ? "Konto wird erstellt …" : "Anmeldung läuft …", "Mit Apple verbinden");
    try {
      const response = await window.AppleID.auth.signIn();
      const idToken = response?.authorization?.id_token;
      if (!idToken) throw new Error("Apple-Anmeldung abgebrochen.");
      const data = await apiAuth("apple", {
        idToken,
        name: response?.user?.name,
      });
      successThenRedirect(data.user, isRegister);
    } catch (err) {
      hideOverlay();
      if (err?.error === "popup_closed_by_user") return;
      showError(err.message || "Apple-Anmeldung fehlgeschlagen.");
    }
  });

  document.querySelectorAll("[data-toggle-pw]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = btn.closest(".auth-input-wrap")?.querySelector("input");
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.setAttribute("aria-label", show ? "Passwort verbergen" : "Passwort anzeigen");
    });
  });

  document.querySelector("[data-login-form]")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    showError("");
    setFormBusy(form, true);
    showOverlay("loading", "Anmeldung läuft …", "Einen Moment bitte");

    try {
      const data = await apiAuth("login", {
        email: form.email.value,
        password: form.password.value,
      });
      successThenRedirect(data.user, false);
    } catch (err) {
      hideOverlay();
      showError(err.message);
      setFormBusy(form, false);
    }
  });

  document.querySelector("[data-register-form]")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    showError("");
    setFormBusy(form, true);
    showOverlay("loading", "Konto wird erstellt …", "Das dauert nur einen Moment");

    try {
      const data = await apiAuth("register", {
        name: form.name.value,
        email: form.email.value,
        password: form.password.value,
      });
      successThenRedirect(data.user, true);
    } catch (err) {
      hideOverlay();
      showError(err.message);
      setFormBusy(form, false);
    }
  });

  window.handleGoogleCredential = handleGoogleCredential;

  checkAlreadyLoggedIn();
  loadAuthConfig();
})();
