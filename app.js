(function () {
  const API = "/api";
  const BANK_SESSION_KEY = "pocketaid-bank-session";
  const TX_CACHE_KEY = "pocketaid-tx-cache";
  const THEME_KEY = "pocketaid-theme";
  const LAST_SYNC_KEY = "pocketaid-last-sync";
  const BALANCE_HIDDEN_KEY = "pocketaid-hide-balance";
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
  const balanceDisplays = document.querySelectorAll("[data-balance-display], .total-amount");
  const balanceToggle = document.querySelector("[data-balance-toggle]");
  const syncMetaEl = document.querySelector("[data-sync-meta]");
  const bankPill = document.querySelector("[data-bank-pill]");
  const monthBtn = document.querySelector("[data-month-btn]");
  const monthLabel = document.querySelector("[data-month-label]");
  const monthMenu = document.querySelector("[data-month-menu]");
  const dashboardSparkline = document.querySelector("[data-dashboard-sparkline]");
  const giroIconEl = document.querySelector("[data-giro-icon]");
  const giroEmpty = document.querySelector("[data-giro-empty]");
  const giroExpSection = document.querySelector("[data-giro-exp-section]");
  const appSubtitle = document.querySelector("[data-app-subtitle]");
  const categoryBars = document.querySelector("[data-category-bars]");
  const themeToggle = document.querySelector("[data-theme-toggle]");
  const logoutBtn = document.querySelector("[data-logout]");
  const userAvatar = document.querySelector("[data-user-avatar]");
  const sparklineEl = document.querySelector("[data-sparkline]");
  const kontenOptionalList = document.querySelector("[data-konten-optional-list]");
  const overviewExpense = document.querySelector("[data-overview-expense]");
  const categoryLegend = document.querySelector("[data-category-legend]");
  const miniBars = document.querySelector("[data-mini-bars]");
  const donutChart = document.querySelector("[data-donut-chart]");

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
  let lastSyncIso = null;
  let balanceHidden = false;
  let cachedNetBalance = 0;
  let selectedMonthKey = null;

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
    if (!currentUser) return;
    const first = currentUser.name?.split(" ")[0] || "du";
    if (appSubtitle) appSubtitle.textContent = `Hi, ${first}!`;
    if (userAvatar) {
      userAvatar.textContent = (currentUser.name?.[0] || "P").toUpperCase();
    }
  }

  function parseGermanDateKey(dateStr) {
    const p = String(dateStr || "").split(".");
    if (p.length !== 3) return "";
    return `${p[2]}-${p[1]}-${p[0]}`;
  }

  function txWithinDays(tx, days) {
    const key = parseGermanDateKey(tx.date);
    if (!key) return false;
    const d = new Date(key);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return d >= cutoff;
  }

  function formatEuroAmount(value) {
    const abs = Math.abs(value).toFixed(2).replace(".", ",");
    const sign = value < 0 ? "-" : "";
    return `${sign}€${abs}`;
  }

  /** Referenz-Design: €45,230.12 */
  function formatEuroKonten(value) {
    const sign = value < 0 ? "-" : "";
    const abs = Math.abs(value);
    const [intPart, dec] = abs.toFixed(2).split(".");
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${sign}€${grouped}.${dec}`;
  }

  function relativeDateLabel(dateStr) {
    const key = parseGermanDateKey(dateStr);
    if (!key) return dateStr || "";
    const d = new Date(key);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const txDay = new Date(d);
    txDay.setHours(0, 0, 0, 0);
    const diff = Math.round((today - txDay) / 86400000);
    if (diff === 0) return "Heute";
    if (diff === 1) return "Gestern";
    return dateStr;
  }

  function toMonthKey(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  function currentMonthKey() {
    return toMonthKey(new Date());
  }

  function txMonthKey(tx) {
    const key = parseGermanDateKey(tx.date);
    if (!key) return null;
    const d = new Date(key);
    if (Number.isNaN(d.getTime())) return null;
    return toMonthKey(d);
  }

  function filterTxBySelectedMonth(list) {
    const target = selectedMonthKey || currentMonthKey();
    return list.filter((tx) => txMonthKey(tx) === target);
  }

  function formatMonthLabel(monthKey) {
    const [y, m] = String(monthKey || "").split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    if (Number.isNaN(d.getTime())) return "Monat wählen";
    return d.toLocaleDateString("de-AT", { month: "long", year: "numeric" });
  }

  function buildAvailableMonths() {
    const set = new Set([currentMonthKey()]);
    transactions.forEach((tx) => {
      const mk = txMonthKey(tx);
      if (mk) set.add(mk);
    });
    return [...set].sort((a, b) => b.localeCompare(a)).slice(0, 24);
  }

  function closeMonthMenu() {
    if (!monthMenu) return;
    monthMenu.hidden = true;
    monthBtn?.setAttribute("aria-expanded", "false");
  }

  function renderMonthMenu() {
    if (!monthMenu) return;
    const months = buildAvailableMonths();
    if (!selectedMonthKey) selectedMonthKey = months[0] || currentMonthKey();
    monthMenu.innerHTML = months
      .map((mk) => {
        const active = mk === selectedMonthKey ? " is-active" : "";
        return `<button type="button" class="konten-month-option${active}" data-month-option="${mk}" role="option" aria-selected="${mk === selectedMonthKey}">${formatMonthLabel(mk)}</button>`;
      })
      .join("");
    if (monthLabel) monthLabel.textContent = formatMonthLabel(selectedMonthKey);
  }

  function maskMoney(formatted) {
    return balanceHidden ? "••••••" : formatted;
  }

  function applyBalanceVisibility() {
    document.documentElement.toggleAttribute("data-hide-balances", balanceHidden);
    if (balanceToggle && window.PocketIcons) {
      balanceToggle.innerHTML = PocketIcons.icon(balanceHidden ? "eyeOff" : "eye");
      balanceToggle.setAttribute("aria-pressed", String(balanceHidden));
      balanceToggle.setAttribute(
        "aria-label",
        balanceHidden ? "Saldo einblenden" : "Saldo ausblenden"
      );
    }
    updateTotal();
  }

  function formatSyncMeta(iso) {
    if (!bankingConnected) return "Bank noch nicht verbunden";
    if (!iso) return "Auto-Sync aktiv";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Auto-Sync aktiv";
    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "Gerade aktualisiert";
    if (mins < 60) return `Aktualisiert vor ${mins} Min.`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `Aktualisiert vor ${hrs} Std.`;
    return `Aktualisiert ${d.toLocaleDateString("de-AT", { day: "numeric", month: "short" })}`;
  }

  function updateSyncMeta() {
    if (syncMetaEl) syncMetaEl.textContent = formatSyncMeta(lastSyncIso);
    if (bankPill) {
      if (bankingConnected && connectedBankName) {
        bankPill.hidden = false;
        bankPill.innerHTML = `<span class="bank-pill__dot"></span>${connectedBankName}`;
      } else {
        bankPill.hidden = true;
        bankPill.textContent = "";
      }
    }
  }

  function renderCategoryIcon(iconKey, name) {
    const key = iconKey || "teal";
    return `<span class="pa-icon pa-icon--${key}" aria-hidden="true">${merchantInitial(name)}</span>`;
  }

  function buildSparklineSvg(dailyNetValues, gradientId) {
    let running = 0;
    const totals = dailyNetValues.map((v) => {
      running += v;
      return running;
    });
    const hasActivity = totals.some((v, i) => i === 0 || v !== totals[0]);
    const series = hasActivity ? totals : totals.map(() => 0);
    const min = Math.min(...series);
    const max = Math.max(...series);
    const range = max - min || 1;
    const w = 200;
    const h = 72;
    const days = series.length;
    const step = w / (days - 1 || 1);
    const points = series
      .map((v, i) => {
        const x = i * step;
        const y = h - ((v - min) / range) * (h - 14) - 7;
        return `${x},${y}`;
      })
      .join(" ");
    const flatY = h - 10;
    const linePoints = hasActivity ? points : `0,${flatY} ${w},${flatY}`;
    const fillPoints = hasActivity ? `${points} ${w},${h} 0,${h}` : `0,${h} ${w},${h}`;
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="sparkline-svg">
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2dd4bf" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="#2dd4bf" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <polygon fill="url(#${gradientId})" points="${fillPoints}"/>
      <polyline fill="none" stroke="#2dd4bf" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${linePoints}"/>
    </svg>`;
  }

  function getDailyNetSeries(dayCount) {
    const daily = Array(dayCount).fill(0);
    const today = new Date();
    transactions.forEach((tx) => {
      const key = parseGermanDateKey(tx.date);
      if (!key) return;
      const d = new Date(key);
      const diff = Math.floor((today - d) / 86400000);
      if (diff >= 0 && diff < dayCount) {
        const amt = parseAmount(tx.amount);
        if (!isNaN(amt)) daily[dayCount - 1 - diff] += amt;
      }
    });
    return daily;
  }

  function getCategoryTotals(list, expensesOnly = true) {
    const byCat = {};
    list.forEach((tx) => {
      const amt = parseAmount(tx.amount);
      if (isNaN(amt)) return;
      if (expensesOnly && amt >= 0) return;
      const cat = tx.category || "Sonstiges";
      byCat[cat] = (byCat[cat] || 0) + Math.abs(amt);
    });
    return Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  }

  function renderSparkline(target, gradientId) {
    if (!target) return;
    const svg = buildSparklineSvg(getDailyNetSeries(12), gradientId);
    target.innerHTML = svg;
    target.classList.toggle("sparkline--empty", transactions.length === 0);
  }

  function renderKontenScreen(monthTx = transactions) {
    const giroBalance = document.querySelector("[data-giro-balance]");
    const giroWhen = document.querySelector("[data-giro-when]");
    const giroName = document.querySelector("[data-giro-name]");
    const giroExpLabel = document.querySelector("[data-giro-exp-label]");
    const giroExpTotal = document.querySelector("[data-giro-exp-total]");
    const giroCategories = document.querySelector("[data-giro-categories]");

    const hasData = monthTx.length > 0;
    const showEmpty = !hasData;

    if (giroIconEl && window.PocketIcons) {
      giroIconEl.innerHTML = PocketIcons.icon("bank");
    }
    const sendIcon = document.querySelector("[data-icon-send]");
    if (sendIcon && window.PocketIcons) sendIcon.innerHTML = PocketIcons.icon("send");

    if (giroEmpty) giroEmpty.hidden = !showEmpty;
    if (giroExpSection) giroExpSection.hidden = showEmpty;
    document.querySelector(".konten-giro-card__actions")?.toggleAttribute("hidden", showEmpty);
    document.querySelector(".konten-giro-card__head")?.toggleAttribute("hidden", showEmpty);

    if (showEmpty) {
      if (giroCategories) giroCategories.innerHTML = "";
      if (kontenOptionalList) {
        kontenOptionalList.innerHTML = `
          <div class="empty-state">
            <p>Noch keine Buchungen. Verbinde deine Bank und synchronisiere deine Umsätze.</p>
            <button type="button" class="btn btn--primary btn--sm" data-go-more>Jetzt verbinden</button>
          </div>`;
        kontenOptionalList.querySelector("[data-go-more]")?.addEventListener("click", () => switchView("more"));
      }
      return;
    }

    const amounts = monthTx.map((t) => parseAmount(t.amount)).filter((n) => !isNaN(n));
    const net = amounts.reduce((s, n) => s + n, 0);

    const catEntries = getCategoryTotals(monthTx, true);
    const totalExp = catEntries.reduce((s, [, v]) => s + v, 0);
    const monthExp = monthTx
      .map((t) => parseAmount(t.amount))
      .filter((n) => !isNaN(n) && n < 0)
      .reduce((s, n) => s + Math.abs(n), 0);

    if (giroName) giroName.textContent = connectedBankName || "Girokonto";
    if (giroBalance) giroBalance.textContent = maskMoney(formatEuroKonten(net));
    if (giroWhen) giroWhen.textContent = hasData ? formatMonthLabel(selectedMonthKey || currentMonthKey()) : "—";
    if (giroExpLabel) giroExpLabel.textContent = maskMoney(formatEuroKonten(monthExp));
    if (giroExpTotal) giroExpTotal.textContent = maskMoney(formatEuroKonten(totalExp));

    const legendLabels = {
      Einkaufen: "Shopping",
      Essen: "Essen",
      Wohnen: "Wohnen",
      Sonstiges: "Etc.",
    };

    if (giroCategories) {
      if (catEntries.length) {
        giroCategories.innerHTML = catEntries
          .slice(0, 4)
          .map(([name, sum], i) => {
            const style = getCategoryStyle(name, i);
            const label = legendLabels[name] || name;
            const amt =
              sum > 0
                ? `<span class="cat-amt money">${maskMoney(formatEuroKonten(sum))}</span>`
                : "";
            return `<li><span class="cat-left"><span class="dot" style="background:${style.color}"></span>${label}</span>${amt}</li>`;
          })
          .join("");
      } else {
        giroCategories.innerHTML =
          '<li class="konten-giro-card__cats-empty">Noch keine Ausgaben in den letzten 30 Tagen.</li>';
      }
    }

    if (kontenOptionalList) {
      const items = monthTx.slice(0, 6);
      kontenOptionalList.innerHTML = items
        .map((tx, i) => {
          const amt = parseAmount(tx.amount);
          const neg = !isNaN(amt) && amt < 0;
          return `<button type="button" class="konten-opt-row" data-konten-tx="${i}">
          ${renderCategoryIcon(tx.icon, tx.name)}
          <span class="konten-opt-row__body">
            <span class="konten-opt-row__name">${tx.name}</span>
            <span class="konten-opt-row__date">${relativeDateLabel(tx.date)}</span>
          </span>
          <span class="konten-opt-row__amount money${neg ? " konten-opt-row__amount--neg" : ""}">${maskMoney(formatEuroKonten(amt))}</span>
        </button>`;
        })
        .join("");

    }
  }

  function renderOverview30() {
    const last30 = transactions.filter((t) => txWithinDays(t, 30));
    const entries = getCategoryTotals(last30, true);
    const totalExp = entries.reduce((s, [, v]) => s + v, 0);

    if (overviewExpense) {
      overviewExpense.textContent = formatEuroAmount(-totalExp);
    }

    const legendLabels = {
      Einkaufen: "Shopping",
      Essen: "Essen",
      Wohnen: "Wohnen",
      Sonstiges: "Etc.",
    };

    if (categoryLegend) {
      const top = entries.slice(0, 4);
      categoryLegend.innerHTML = top
        .map(([name], i) => {
          const style = getCategoryStyle(name, i);
          const label = legendLabels[name] || name;
          return `<li><span class="dot dot--${style.key}"></span>${label}</li>`;
        })
        .join("");
    }

    if (donutChart && entries.length) {
      let gradient = "";
      let acc = 0;
      const stops = entries.slice(0, 4);
      const sum = stops.reduce((s, [, v]) => s + v, 0) || 1;
      stops.forEach(([name], i) => {
        const style = getCategoryStyle(name, i);
        const pct = (stops[i][1] / sum) * 100;
        gradient += `${style.color} ${acc}% ${acc + pct}%`;
        acc += pct;
      });
      donutChart.style.background = `conic-gradient(${gradient})`;
    } else if (donutChart) {
      donutChart.style.background = "conic-gradient(#334155 0% 100%)";
    }

    if (miniBars) {
      const income = last30
        .map((t) => parseAmount(t.amount))
        .filter((n) => !isNaN(n) && n > 0)
        .reduce((s, n) => s + n, 0);
      const expense = totalExp;
      const max = Math.max(income, expense, 1);
      miniBars.innerHTML = `
        <div class="mini-bar">
          <div class="mini-bar__fill" style="height:${Math.round((income / max) * 100)}%;background:#2dd4bf"></div>
          <span class="mini-bar__label">Einnahmen</span>
        </div>
        <div class="mini-bar">
          <div class="mini-bar__fill" style="height:${Math.round((expense / max) * 100)}%;background:#f97316"></div>
          <span class="mini-bar__label">Ausgaben</span>
        </div>`;
    }
  }

  function renderPocketTxRow(tx, index) {
    const amt = parseAmount(tx.amount);
    const neg = !isNaN(amt) && amt < 0;
    const amountStr = maskMoney(
      !isNaN(amt) ? formatEuroKonten(amt) : tx.amount
    );
    return `
      <button type="button" class="tx-row-pocket" data-tx="${index}">
        ${renderCategoryIcon(tx.icon, tx.name)}
        <span class="tx-row-pocket__body">
          <span class="tx-row-pocket__name">${tx.name}</span>
          <span class="tx-row-pocket__date">${relativeDateLabel(tx.date)}</span>
        </span>
        <span class="tx-row-pocket__amount money${neg ? " tx-row-pocket__amount--neg" : ""}">${amountStr}</span>
      </button>`;
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
    lastSyncIso = new Date().toISOString();
    try {
      localStorage.setItem(lastSyncKey(), String(Date.now()));
    } catch (_) {}
    updateSyncMeta();
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
    if (!selectedMonthKey) selectedMonthKey = currentMonthKey();
    const monthTx = filterTxBySelectedMonth(transactions);
    const monthAmounts = monthTx.map((t) => parseAmount(t.amount)).filter((n) => !isNaN(n));
    const monthNet = monthAmounts.reduce((s, n) => s + n, 0);
    cachedNetBalance = monthNet;
    const formatted = formatEuroKonten(monthNet);
    balanceDisplays.forEach((el) => {
      el.textContent = maskMoney(formatted);
    });
    const dashTotal = document.querySelector(".dashboard-total-amount");
    if (dashTotal) {
      const allNet = transactions
        .map((t) => parseAmount(t.amount))
        .filter((n) => !isNaN(n))
        .reduce((s, n) => s + n, 0);
      dashTotal.textContent = maskMoney(formatEuroKonten(allNet));
    }
    renderCategoryBars();
    renderSparkline(sparklineEl, "kontenSpFill");
    renderSparkline(dashboardSparkline, "dashSpFill");
    renderKontenScreen(monthTx);
    renderMonthMenu();
    renderOverview30();
    updateSyncMeta();
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
    let savedTheme = "dark";
    try {
      savedTheme = localStorage.getItem(THEME_KEY) || "dark";
    } catch (_) {}
    applyTheme(savedTheme === "dark");
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
      listFull.innerHTML = transactions
        .map((tx, i) => renderPocketTxRow(tx, i))
        .join("");
      listFull.classList.add("tx-list-pocket");
      bindTxCards(listFull);
    }
    if (dashboardTx) {
      dashboardTx.innerHTML = transactions
        .slice(0, 6)
        .map((tx, i) => renderPocketTxRow(tx, i))
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
      if (data.lastSync) lastSyncIso = data.lastSync;
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
      renderKontenScreen();

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
    const resolved = viewId === "pay" ? "transactions" : viewId;
    views.forEach((v) => v.classList.toggle("view--active", v.dataset.view === resolved));
    navItems.forEach((n) => n.classList.toggle("nav-item--active", n.dataset.nav === viewId));
    if (content) content.scrollTop = 0;
    try {
      document.body.dataset.activeView = resolved;
    } catch (_) {}
    if (resolved === "more") refreshBankStatus();
    if (resolved === "transactions") {
      renderSparkline(sparklineEl, "kontenSpFill");
      renderKontenScreen();
    }
    if (resolved === "chat" && chatFeed) {
      setTimeout(() => (chatFeed.scrollTop = chatFeed.scrollHeight), 50);
    }
  }

  navItems.forEach((item) => {
    item.addEventListener("click", () => switchView(item.dataset.nav));
  });

  document.querySelectorAll("[data-go-chat]").forEach((btn) => {
    btn.addEventListener("click", () => switchView("chat"));
  });

  document.querySelector("[data-go-transactions]")?.addEventListener("click", () => {
    switchView("transactions");
  });
  document.querySelector("[data-go-more]")?.addEventListener("click", () => {
    switchView("more");
  });
  document.querySelector("[data-manage]")?.addEventListener("click", () => {
    switchView("more");
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

  function initPolish() {
    try {
      balanceHidden = localStorage.getItem(BALANCE_HIDDEN_KEY) === "1";
    } catch (_) {}
    applyBalanceVisibility();

    balanceToggle?.addEventListener("click", () => {
      balanceHidden = !balanceHidden;
      try {
        localStorage.setItem(BALANCE_HIDDEN_KEY, balanceHidden ? "1" : "0");
      } catch (_) {}
      applyBalanceVisibility();
    });

    renderMonthMenu();
    monthBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!monthMenu) return;
      const open = monthMenu.hidden;
      monthMenu.hidden = !open;
      monthBtn.setAttribute("aria-expanded", String(open));
    });
    monthMenu?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-month-option]");
      if (!btn) return;
      selectedMonthKey = btn.dataset.monthOption;
      closeMonthMenu();
      updateTotal();
      showToast(`Monat: ${formatMonthLabel(selectedMonthKey)}`);
    });
    document.addEventListener("click", (e) => {
      if (!monthMenu || monthMenu.hidden) return;
      if (monthMenu.contains(e.target) || monthBtn?.contains(e.target)) return;
      closeMonthMenu();
    });

    document.querySelector("[data-giro-transfer]")?.addEventListener("click", () => {
      showToast("Überweisungen kommen in einer späteren Version.");
    });
    document.querySelector("[data-giro-details]")?.addEventListener("click", () => {
      switchView("more");
    });

    kontenOptionalList?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-konten-tx]");
      if (!btn) return;
      const tx = transactions[Number(btn.dataset.kontenTx)];
      if (tx) openModal(tx);
    });
  }

  /* ——— Init ——— */
  initTheme();
  initPolish();
  try {
    const active = document.querySelector('[data-view].view--active')?.dataset.view;
    document.body.dataset.activeView = active || "dashboard";
  } catch (_) {}
  chatHistory = loadHistory();

  requireSession().then((ok) => {
    if (ok) bootstrap();
  });
})();
