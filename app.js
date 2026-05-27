(function () {
  const API = "/api";
  const BANK_SESSION_KEY = "pocketaid-bank-session";
  const TX_CACHE_KEY = "pocketaid-tx-cache";
  const THEME_KEY = "pocketaid-theme";
  const LAST_SYNC_KEY = "pocketaid-last-sync";
  const AUTO_SYNC_MS = 4 * 60 * 60 * 1000;

  const ICON_CHECK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';
  const ICON_ERROR =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  const CATEGORY_PALETTE = [
    { key: "orange", color: "#f97316" },
    { key: "purple", color: "#8b5cf6" },
    { key: "teal", color: "#14b8a6" },
    { key: "pink", color: "#ec4899" },
    { key: "green", color: "#22c55e" },
    { key: "yellow", color: "#eab308" },
  ];

  const CATEGORY_COLOR_MAP = {
    "Auto / Tanken": "orange",
    Mobilität: "yellow",
    Auto: "yellow",
    Essen: "purple",
    Einkaufen: "purple",
    Abos: "teal",
    Gesundheit: "teal",
    Haustiere: "pink",
    Freizeit: "pink",
    Versicherung: "green",
    Wohnen: "green",
    Sparen: "green",
    Sonstiges: "teal",
  };

  const views = document.querySelectorAll("[data-view]");
  const navItems = document.querySelectorAll("[data-nav]");
  const content = document.querySelector(".content");
  const bellBtn = document.querySelector(".bell-btn");
  const bellDot = document.querySelector(".bell-dot");
  const notifPanel = document.querySelector(".notif-panel");
  const modal = document.querySelector(".modal");
  const modalTitle = document.querySelector(".modal-title");
  const modalBody = document.querySelector(".modal-body");
  const modalClose = document.querySelector(".modal-close");
  const toast = document.querySelector(".toast");
  const aiStatus = document.querySelector("[data-ai-status]");
  const chatFeed = document.querySelector("[data-chat-feed]");
  const chatInput = document.querySelector("[data-chat-input]");
  const chatSend = document.querySelector("[data-chat-send]");

  const bankStatus = document.querySelector("[data-bank-status]");
  const bankSelect = document.querySelector("[data-bank-select]");
  const bankConnect = document.querySelector("[data-bank-connect]");
  const bankSync = document.querySelector("[data-bank-sync]");
  const bankDisconnect = document.querySelector("[data-bank-disconnect]");
  const bankHint = document.querySelector("[data-bank-hint]");
  const bankSetup = document.querySelector("[data-bank-setup]");
  const bankConnectedBadge = document.querySelector("[data-bank-connected-badge]");
  const bankConnectedLabel = document.querySelector("[data-bank-connected-label]");
  const flowOverlay = document.querySelector("[data-flow-overlay]");
  const flowIcon = document.querySelector("[data-flow-icon]");
  const flowTitle = document.querySelector("[data-flow-title]");
  const flowSub = document.querySelector("[data-flow-sub]");
  const flowAction = document.querySelector("[data-flow-action]");
  const dashboardTx = document.querySelector("[data-dashboard-tx]");
  const totalAmount = document.querySelector(".total-amount");
  const balanceMeta = document.querySelector("[data-balance-meta]");
  const appSubtitle = document.querySelector("[data-app-subtitle]");
  const categoryBars = document.querySelector("[data-category-bars]");
  const themeToggle = document.querySelector("[data-theme-toggle]");
  const logoutBtn = document.querySelector("[data-logout]");

  let currentUser = null;
  let transactions = [];
  let toastTimer;
  let chatHistory;
  let aiReady = false;
  let chatBusy = false;
  let bankingConfigured = false;
  let bankingConnected = false;
  let connectedBankName = null;
  let bankCountry = "AT";

  const WELCOME_MSG =
    "Hallo! Ich bin dein PocketAid Finanz-Assistent. Verbinde deine Bank unter „Mehr“, oder frag mich zu deinen Ausgaben und Kategorien.";

  function txToUi(tx) {
    return {
      name: tx.merchant,
      date: tx.date,
      amount: tx.amountDisplay,
      category: tx.category,
      icon: tx.icon || "teal",
      source: tx.source,
    };
  }

  const STORAGE_KEY = "pocketaid-chat-v2";

  function chatStorageKey() {
    return currentUser ? `${STORAGE_KEY}-${currentUser.id}` : STORAGE_KEY;
  }

  function txCacheKey() {
    return currentUser ? `${TX_CACHE_KEY}-${currentUser.id}` : TX_CACHE_KEY;
  }

  function bankSessionKey() {
    return currentUser ? `${BANK_SESSION_KEY}-${currentUser.id}` : BANK_SESSION_KEY;
  }

  function updateUserHeader() {
    if (!appSubtitle || !currentUser) return;
    const first = currentUser.name?.split(" ")[0] || "du";
    appSubtitle.textContent = `Hallo, ${first}`;
  }

  function getLocalBankSession() {
    try {
      const raw = sessionStorage.getItem(bankSessionKey());
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function setLocalBankSession(payload) {
    try {
      if (payload?.sessionId) {
        sessionStorage.setItem(bankSessionKey(), JSON.stringify(payload));
      } else {
        sessionStorage.removeItem(bankSessionKey());
      }
    } catch (_) {}
  }

  function cacheTransactions(list) {
    try {
      sessionStorage.setItem(txCacheKey(), JSON.stringify(list));
    } catch (_) {}
  }

  function loadCachedTransactions() {
    try {
      const raw = sessionStorage.getItem(txCacheKey());
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: options.headers || {},
      credentials: "include",
    });
    if (res.status === 401) {
      window.location.href = "/login.html";
      throw new Error("Nicht angemeldet");
    }
    return res;
  }

  function loadHistory() {
    try {
      const raw = sessionStorage.getItem(chatStorageKey());
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return [{ role: "assistant", content: WELCOME_MSG }];
  }

  function saveHistory() {
    sessionStorage.setItem(chatStorageKey(), JSON.stringify(chatHistory));
  }

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("toast--visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("toast--visible"), 2800);
  }

  let flowCloseTimer = null;
  let flowActionHandler = null;

  function showFlowOverlay(state, title, sub, options = {}) {
    if (!flowOverlay) return;
    flowOverlay.hidden = false;
    flowOverlay.classList.add("is-visible");
    flowOverlay.classList.remove("flow-overlay--loading", "flow-overlay--success", "flow-overlay--error");
    flowOverlay.classList.add(`flow-overlay--${state}`);

    if (flowTitle) flowTitle.textContent = title;
    if (flowSub) flowSub.textContent = sub || "";
    if (flowIcon) {
      flowIcon.innerHTML = state === "success" ? ICON_CHECK : state === "error" ? ICON_ERROR : "";
    }

    if (flowAction) {
      if (options.actionLabel) {
        flowAction.hidden = false;
        flowAction.textContent = options.actionLabel;
        flowActionHandler = options.onAction || null;
      } else {
        flowAction.hidden = true;
        flowActionHandler = null;
      }
    }

    clearTimeout(flowCloseTimer);
    if (options.autoCloseMs) {
      flowCloseTimer = setTimeout(() => hideFlowOverlay(), options.autoCloseMs);
    }
  }

  function hideFlowOverlay() {
    clearTimeout(flowCloseTimer);
    flowOverlay?.classList.remove("is-visible");
    setTimeout(() => {
      if (flowOverlay && !flowOverlay.classList.contains("is-visible")) {
        flowOverlay.hidden = true;
      }
    }, 350);
  }

  flowAction?.addEventListener("click", () => {
    if (typeof flowActionHandler === "function") flowActionHandler();
    hideFlowOverlay();
  });

  function lastSyncKey() {
    return currentUser ? `${LAST_SYNC_KEY}-${currentUser.id}` : LAST_SYNC_KEY;
  }

  function shouldAutoSync() {
    if (!bankingConnected) return false;
    try {
      const raw = localStorage.getItem(lastSyncKey());
      if (!raw) return true;
      return Date.now() - Number(raw) > AUTO_SYNC_MS;
    } catch (_) {
      return true;
    }
  }

  function markSynced() {
    try {
      localStorage.setItem(lastSyncKey(), String(Date.now()));
    } catch (_) {}
  }

  function updateBankPanelUI() {
    const connected = bankingConnected;
    if (bankConnectedBadge) bankConnectedBadge.hidden = !connected;
    if (bankSetup) bankSetup.hidden = connected;
    if (bankConnect) bankConnect.disabled = !bankingConfigured || connected;
    if (bankSync) {
      bankSync.hidden = !connected;
      bankSync.disabled = !connected;
    }
    if (bankDisconnect) {
      bankDisconnect.disabled = !connected;
    }
    if (bankSelect) bankSelect.disabled = !bankingConfigured || connected;
    if (bankConnectedLabel && connected) {
      bankConnectedLabel.textContent = connectedBankName
        ? `${connectedBankName} · Auto-Sync aktiv`
        : "Bank verbunden · Auto-Sync aktiv";
    }
    if (bankHint) {
      bankHint.textContent = connected
        ? "Deine Bank bleibt verbunden. Umsätze werden beim Öffnen der App automatisch aktualisiert – kein erneutes Verbinden nötig."
        : "Verbinde deine Bank einmal – danach läuft der Rest automatisch.";
    }
  }

  async function syncTransactions(options = {}) {
    const { silent = false } = options;
    if (!bankingConnected) {
      throw new Error("Keine Bank verbunden.");
    }
    if (!silent) showFlowOverlay("loading", "Umsätze werden geladen…", "Das kann einen Moment dauern.");

    const bankSession = getLocalBankSession();
    const res = await apiFetch(`${API}/banking/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bankSession ? { bankSession } : {}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Synchronisation fehlgeschlagen");

    await loadTransactions();
    markSynced();

    if (!silent) {
      hideFlowOverlay();
      const n = data.count ?? transactions.length;
      const bankN = data.fetched ?? data.raw ?? n;
      const pages = data.pages ? ` · ${data.pages} API-Seite(n)` : "";
      const chunks = data.accountStats?.some((a) => a.usedDateChunks)
        ? " · Monats-Chunks"
        : "";
      showToast(`${n} Transaktionen (${bankN} von Bank)${pages}${chunks}`);
    }

    return data.count || 0;
  }

  function setAiStatus(ready, detail) {
    aiReady = ready;
    if (!aiStatus) return;
    aiStatus.textContent = detail || (ready ? "KI online" : "KI offline");
    aiStatus.classList.toggle("ai-status--online", ready);
    aiStatus.classList.toggle("ai-status--offline", !ready);
  }

  function sortTxByDate(list) {
    return [...list].sort((a, b) => {
      const key = (tx) => {
        if (tx.dateSort) return tx.dateSort;
        const p = String(tx.date || "").split(".");
        if (p.length !== 3) return "";
        return `${p[2]}-${p[1]}-${p[0]}`;
      };
      const cmp = key(b).localeCompare(key(a));
      if (cmp !== 0) return cmp;
      return String(b.id || "").localeCompare(String(a.id || ""));
    });
  }

  async function loadTransactions() {
    try {
      const res = await apiFetch(`${API}/banking/transactions`);
      const data = await res.json();
      const list = sortTxByDate(data.transactions || []);
      if (list.length) {
        transactions = list.map(txToUi);
        cacheTransactions(list);
      } else {
        const cached = sortTxByDate(loadCachedTransactions() || []);
        if (cached?.length) transactions = cached.map(txToUi);
      }
      renderAllTransactions();
      updateTotal();
    } catch (e) {
      const cached = sortTxByDate(loadCachedTransactions() || []);
      if (cached?.length) {
        transactions = cached.map(txToUi);
        renderAllTransactions();
        updateTotal();
      }
      console.warn("Transaktionen laden fehlgeschlagen", e);
    }
  }

  function parseAmount(str) {
    return parseFloat(String(str).replace(/[^\d,.-]/g, "").replace(",", "."));
  }

  function getCategoryStyle(name, index) {
    const key = CATEGORY_COLOR_MAP[name] || CATEGORY_PALETTE[index % CATEGORY_PALETTE.length].key;
    const entry = CATEGORY_PALETTE.find((p) => p.key === key) || CATEGORY_PALETTE[0];
    return { key, color: entry.color };
  }

  function renderCategoryBars() {
    if (!categoryBars) return;

    const byCat = {};
    transactions.forEach((tx) => {
      const amt = parseAmount(tx.amount);
      if (isNaN(amt) || amt >= 0) return;
      const cat = tx.category || "Sonstiges";
      byCat[cat] = (byCat[cat] || 0) + Math.abs(amt);
    });

    const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, v]) => s + v, 0);

    if (!total) {
      categoryBars.innerHTML =
        '<li class="categories-empty">Noch keine Ausgaben — unter Einstellungen Bank verbinden & synchronisieren.</li>';
      return;
    }

    const top = entries.slice(0, 6);
    categoryBars.innerHTML = top
      .map(([name, sum], i) => {
        const pct = Math.max(4, Math.round((sum / total) * 100));
        const style = getCategoryStyle(name, i);
        const amountStr = sum.toFixed(2).replace(".", ",") + " €";
        return `
      <li data-category="${name.replace(/"/g, "&quot;")}">
        <div class="cat-row">
          <span class="cat-name"><span class="dot dot--${style.key}"></span>${name}</span>
          <span class="cat-pct">${pct}% · ${amountStr}</span>
        </div>
        <div class="cat-track">
          <div class="cat-fill" style="width:${pct}%;background:${style.color}"></div>
        </div>
      </li>`;
      })
      .join("");

    bindCategoryClicks(categoryBars);
  }

  function bindCategoryClicks(root) {
    root.querySelectorAll("[data-category]").forEach((item) => {
      item.addEventListener("click", () => {
        const label = item.dataset.category;
        if (aiReady) {
          switchView("chat");
          runChatTurn(`Wie viel habe ich für „${label}“ ausgegeben?`);
        } else {
          showToast(`Kategorie: ${label}`);
        }
      });
    });
  }

  function updateTotal() {
    if (!totalAmount) return;
    const negatives = transactions
      .map((t) => parseAmount(t.amount))
      .filter((n) => !isNaN(n) && n < 0);
    const sum = negatives.reduce((s, n) => s + Math.abs(n), 0);
    totalAmount.textContent = sum.toFixed(2).replace(".", ",") + " €";
    if (balanceMeta) {
      const n = transactions.length;
      balanceMeta.textContent =
        n > 0
          ? `${n} Umsätze · ${negatives.length} Ausgaben`
          : "Verbinde deine Bank unter „Einstellungen“";
    }
    renderCategoryBars();
  }

  function applyTheme(dark) {
    if (dark) {
      document.documentElement.setAttribute("data-theme", "dark");
      try {
        localStorage.setItem(THEME_KEY, "dark");
      } catch (_) {}
    } else {
      document.documentElement.removeAttribute("data-theme");
      try {
        localStorage.setItem(THEME_KEY, "light");
      } catch (_) {}
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? "#0f172a" : "#2563eb";
    if (themeToggle) themeToggle.checked = dark;
  }

  function initTheme() {
    let dark = false;
    try {
      dark = localStorage.getItem(THEME_KEY) === "dark";
    } catch (_) {}
    applyTheme(dark);
    themeToggle?.addEventListener("change", () => applyTheme(themeToggle.checked));
  }

  function updateHeaderDate() {
    if (!appSubtitle) return;
    const now = new Date();
    const label = now.toLocaleDateString("de-AT", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    appSubtitle.textContent = label;
  }

  function merchantInitial(name) {
    const t = String(name || "?").trim();
    return (t[0] || "?").toUpperCase();
  }

  function renderTxCard(tx, index) {
    const amt = parseAmount(tx.amount);
    const isNeg = !isNaN(amt) && amt < 0;
    const amountClass = isNeg ? "tx-amount tx-amount--neg" : "tx-amount";
    return `
      <button type="button" class="tx-card" data-tx="${index}">
        <div class="tx-icon tx-icon--${tx.icon}">${merchantInitial(tx.name)}</div>
        <div class="tx-info">
          <p class="tx-name">${tx.name}</p>
          <p class="tx-date">${tx.date}</p>
        </div>
        <div class="tx-right">
          <span class="${amountClass}">${tx.amount}</span>
          ${tx.category ? `<span class="tx-category">${tx.category}</span>` : ""}
        </div>
      </button>`;
  }

  function bindTxCards(root) {
    root?.querySelectorAll("[data-tx]").forEach((card) => {
      card.addEventListener("click", () => {
        const tx = transactions[Number(card.dataset.tx)];
        if (tx) openModal(tx);
      });
    });
  }

  function renderAllTransactions() {
    const listFull = document.querySelector("[data-tx-list-full]");
    if (listFull) {
      listFull.innerHTML = transactions.map((tx, i) => renderTxCard(tx, i)).join("");
      bindTxCards(listFull);
    }
    if (dashboardTx) {
      dashboardTx.innerHTML = transactions
        .slice(0, 2)
        .map((tx, i) => renderTxCard(tx, i))
        .join("");
      bindTxCards(dashboardTx);
    }
  }

  /* ——— Enable Banking UI ——— */

  async function refreshBankStatus() {
    try {
      const res = await apiFetch(`${API}/banking/status`);
      const data = await res.json();
      bankingConfigured = data.configured;
      bankingConnected = data.connected;
      connectedBankName = data.bank?.name || null;
      bankCountry = data.country || "AT";
      if (data.sessionPayload) setLocalBankSession(data.sessionPayload);
      else if (!data.connected) setLocalBankSession(null);

      if (bankStatus) {
        const env = data.environment === "production" ? "Produktion" : "Sandbox";
        if (!data.configured) {
          bankStatus.textContent =
            data.configHint ||
            "Banking nicht konfiguriert – App-ID & PEM in Netlify Environment Variables";
        } else if (data.configured && data.keyValid === false) {
          bankStatus.textContent = "PEM ungültig – in Netlify mit Zeilenumbrüchen einfügen";
        } else if (data.connected) {
          bankStatus.textContent = `Verbunden (${env}): ${data.bank?.name || "Bank"}`;
        } else {
          bankStatus.textContent = `${env} – Bank einmal verbinden, danach automatisch`;
        }
      }

      updateBankPanelUI();

      if (data.configured && data.keyValid !== false && bankSelect?.options.length <= 1) {
        try {
          await loadBanks();
        } catch (err) {
          if (bankStatus) bankStatus.textContent = `Bankliste: ${err.message}`;
        }
      }
    } catch (e) {
      if (bankStatus) {
        bankStatus.textContent =
          "Server nicht erreichbar";
      }
    }
  }

  async function loadBanks() {
    const res = await apiFetch(`${API}/banking/banks?country=${bankCountry}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    if (!bankSelect) return;
    bankSelect.innerHTML = '<option value="">— Bank wählen —</option>';
    data.banks.forEach((b) => {
      const opt = document.createElement("option");
      opt.value = JSON.stringify({ name: b.name, country: b.country });
      opt.textContent = b.name;
      bankSelect.appendChild(opt);
    });
  }

  bankConnect?.addEventListener("click", async () => {
    const val = bankSelect?.value;
    if (!val) return showToast("Bitte zuerst eine Bank wählen");
    const { name, country } = JSON.parse(val);

    if (/mock/i.test(name)) {
      showToast("Mock: Zuerst „Create Account“ im Enable-Banking-Portal!");
    }
    showFlowOverlay("loading", "Weiterleitung zur Bank…", "Du wirst gleich zur Anmeldung weitergeleitet.");
    try {
      const res = await apiFetch(`${API}/banking/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankName: name, country }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.href = data.url;
    } catch (e) {
      hideFlowOverlay();
      showToast(e.message);
    }
  });

  bankSync?.addEventListener("click", async () => {
    bankSync.disabled = true;
    try {
      await syncTransactions({ silent: false });
    } catch (e) {
      hideFlowOverlay();
      showFlowOverlay("error", "Sync fehlgeschlagen", e.message, {
        actionLabel: "OK",
      });
    } finally {
      bankSync.disabled = !bankingConnected;
    }
  });

  bankDisconnect?.addEventListener("click", async () => {
    await apiFetch(`${API}/banking/disconnect`, { method: "POST" });
    setLocalBankSession(null);
    try {
      sessionStorage.removeItem(txCacheKey());
      localStorage.removeItem(lastSyncKey());
    } catch (_) {}
    transactions = [];
    connectedBankName = null;
    renderAllTransactions();
    updateTotal();
    showToast("Bank-Verbindung getrennt");
    await refreshBankStatus();
  });

  async function processBankReturnFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const bank = params.get("bank");
    if (!bank) return false;

    window.history.replaceState({}, "", window.location.pathname);

    if (bank === "connected") {
      showFlowOverlay(
        "loading",
        "Bank wird verbunden…",
        "Einen Moment – wir richten dein Konto ein und laden deine Umsätze."
      );

      await refreshBankStatus();

      if (!bankingConnected) {
        await new Promise((r) => setTimeout(r, 800));
        await refreshBankStatus();
      }

      try {
        const count = await syncTransactions({ silent: true });
        hideFlowOverlay();
        showFlowOverlay(
          "success",
          "Alles erledigt!",
          count > 0
            ? `${connectedBankName || "Deine Bank"} ist verbunden. ${count} Transaktionen wurden geladen – ab jetzt aktualisiert sich alles automatisch.`
            : `${connectedBankName || "Deine Bank"} ist verbunden. Umsätze werden automatisch aktualisiert, sobald verfügbar.`,
          { autoCloseMs: 3200 }
        );
        await new Promise((r) => setTimeout(r, 3200));
        hideFlowOverlay();
        switchView("dashboard");
        return true;
      } catch (e) {
        showFlowOverlay(
          "error",
          "Bank verbunden – Sync fehlgeschlagen",
          e.message + " Tippe auf „Jetzt aktualisieren“ in den Einstellungen.",
          {
            actionLabel: "Erneut versuchen",
            onAction: async () => {
              try {
                await syncTransactions({ silent: false });
              } catch (err) {
                showFlowOverlay("error", "Sync fehlgeschlagen", err.message, { actionLabel: "OK" });
              }
            },
          }
        );
        switchView("more");
        return true;
      }
    }

    if (bank === "error") {
      const msg = decodeURIComponent(params.get("message") || "Die Verbindung ist fehlgeschlagen.");
      if (bankStatus) {
        bankStatus.textContent = `Fehler: ${msg}`;
      }
      showFlowOverlay(
        "error",
        "Bank-Verbindung fehlgeschlagen",
        msg,
        {
          actionLabel: "Erneut versuchen",
          onAction: () => switchView("more"),
        }
      );
      switchView("more");
      return true;
    }

    return false;
  }

  /* ——— KI Chat ——— */

  async function checkHealth() {
    try {
      const res = await apiFetch(`${API}/health`);
      const data = await res.json();
      const label = data.aiConfigured
        ? `KI online (${data.provider || "?"})`
        : "API-Key fehlt";
      setAiStatus(data.aiConfigured, label);
      return data.aiConfigured;
    } catch (e) {
      setAiStatus(
        false,
        "Server nicht erreichbar"
      );
      return false;
    }
  }

  function getTransactionsForAgent() {
    const cached = loadCachedTransactions();
    if (cached?.length) {
      return cached.map((t) => ({
        merchant: t.merchant,
        name: t.merchant,
        date: t.date,
        amount: t.amount,
        amountDisplay: t.amountDisplay,
        category: t.category,
        source: t.source || "enable-banking",
      }));
    }
    return transactions.map((t) => ({
      name: t.name,
      merchant: t.name,
      date: t.date,
      amount: parseAmount(t.amount),
      amountDisplay: t.amount,
      category: t.category,
      source: t.source || "enable-banking",
    }));
  }

  async function sendToAgent(userText) {
    chatHistory.push({ role: "user", content: userText });
    saveHistory();
    const res = await apiFetch(`${API}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: chatHistory,
        transactions: getTransactionsForAgent(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "KI-Anfrage fehlgeschlagen");
    chatHistory.push({ role: "assistant", content: data.reply });
    saveHistory();
    return data.reply;
  }

  function appendBubble(text, role) {
    const div = document.createElement("div");
    div.className = role === "user" ? "bubble bubble--user" : "bubble";
    const p = document.createElement("p");
    p.textContent = text;
    div.appendChild(p);
    return div;
  }

  function appendTyping() {
    const div = document.createElement("div");
    div.className = "bubble bubble--typing";
    div.dataset.typing = "1";
    div.innerHTML = "<span></span><span></span><span></span>";
    return div;
  }

  function removeTyping() {
    chatFeed?.querySelectorAll("[data-typing]").forEach((el) => el.remove());
  }

  function renderChatFeed() {
    if (!chatFeed) return;
    chatFeed.innerHTML = "";
    chatHistory.forEach((msg) => chatFeed.appendChild(appendBubble(msg.content, msg.role)));
    chatFeed.scrollTop = chatFeed.scrollHeight;
  }

  async function runChatTurn(userText, opts = {}) {
    if (chatBusy) return;
    if (!aiReady) return showToast("KI nicht bereit – prüfe .env & Server");

    chatBusy = true;
    if (chatSend) chatSend.disabled = true;
    if (chatInput) chatInput.disabled = true;

    if (chatFeed) {
      chatFeed.appendChild(appendBubble(userText, "user"));
      chatFeed.appendChild(appendTyping());
      chatFeed.scrollTop = chatFeed.scrollHeight;
    }
    try {
      const reply = await sendToAgent(userText);
      removeTyping();
      if (chatFeed) {
        chatFeed.appendChild(appendBubble(reply, "assistant"));
        chatFeed.scrollTop = chatFeed.scrollHeight;
      }
    } catch (err) {
      removeTyping();
      showToast(err.message);
      chatHistory.pop();
      saveHistory();
    } finally {
      chatBusy = false;
      if (chatSend) chatSend.disabled = false;
      if (chatInput) chatInput.disabled = false;
    }
  }

  function initChat() {
    renderChatFeed();
    chatSend?.addEventListener("click", () => {
      const text = chatInput?.value?.trim();
      if (!text) return;
      chatInput.value = "";
      runChatTurn(text);
    });
    chatInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        chatSend?.click();
      }
    });
  }

  function switchView(viewId) {
    views.forEach((v) => v.classList.toggle("view--active", v.dataset.view === viewId));
    navItems.forEach((n) => n.classList.toggle("nav-item--active", n.dataset.nav === viewId));
    if (content) content.scrollTop = 0;
    if (viewId === "more") refreshBankStatus();
    if (viewId === "chat" && chatFeed) {
      setTimeout(() => (chatFeed.scrollTop = chatFeed.scrollHeight), 50);
    }
  }

  navItems.forEach((item) => {
    item.addEventListener("click", () => switchView(item.dataset.nav));
  });

  document.querySelectorAll("[data-go-chat]").forEach((btn) => {
    btn.addEventListener("click", () => switchView("chat"));
  });

  function openModal(tx) {
    if (!modal) return;
    modalTitle.textContent = tx.name;
    modalBody.innerHTML = `
      <p><strong>Datum:</strong> ${tx.date}</p>
      <p><strong>Betrag:</strong> ${tx.amount}</p>
      <p><strong>Kategorie:</strong> ${tx.category}</p>
      ${tx.source ? `<p><strong>Quelle:</strong> ${tx.source}</p>` : ""}`;
    modal.classList.add("modal--open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    modal?.classList.remove("modal--open");
    modal?.setAttribute("aria-hidden", "true");
  }

  modalClose?.addEventListener("click", closeModal);
  modal?.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  bellBtn?.addEventListener("click", () => {
    const open = notifPanel?.classList.toggle("notif-panel--open");
    if (bellDot) bellDot.style.display = open ? "none" : "";
    showToast(open ? "Benachrichtigungen geöffnet" : "Geschlossen");
  });

  document.querySelectorAll("[data-more-action]").forEach((btn) => {
    btn.addEventListener("click", () => showToast(btn.dataset.moreAction));
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  logoutBtn?.addEventListener("click", async () => {
    try {
      await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" });
    } catch (_) {}
    window.location.href = "/login.html";
  });

  async function requireSession() {
    try {
      const res = await fetch(`${API}/auth/me`, { credentials: "include" });
      if (!res.ok) {
        window.location.href = "/login.html";
        return false;
      }
      const data = await res.json();
      currentUser = data.user;
      updateUserHeader();
      return true;
    } catch {
      window.location.href = "/login.html";
      return false;
    }
  }

  async function bootstrap() {
    await refreshBankStatus();
    const hadBankReturn = await processBankReturnFromUrl();
    if (!hadBankReturn) {
      await Promise.all([loadTransactions(), checkHealth()]);
      if (bankingConnected && shouldAutoSync()) {
        syncTransactions({ silent: true }).catch(() => {});
      }
    } else {
      await checkHealth();
    }
    initChat();
  }

  /* ——— Init ——— */
  initTheme();
  chatHistory = loadHistory();

  requireSession().then((ok) => {
    if (ok) bootstrap();
  });
})();
