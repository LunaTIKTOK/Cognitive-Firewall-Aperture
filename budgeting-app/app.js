(() => {
  "use strict";

  const STORAGE_KEY = "clearspend.budget.v1";
  const HOSTED = !!window.CLEARSPEND_HOSTED; // set by the single-file build, where file downloads are blocked
  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const CHART_COLORS = ["#4f5df7","#16a34a","#e11d48","#d97706","#0891b2","#7c3aed","#db2777","#65a30d","#0284c7","#c2410c"];
  const ENVELOPE_KIND_LABEL = { fixed: "Fixed", variable: "Variable", investment: "Investment" };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function todayISO() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function formatCurrency(n) {
    const sign = n < 0 ? "-" : "";
    return sign + "$" + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function monthKeyOf(dateStr) {
    return dateStr.slice(0, 7); // YYYY-MM
  }

  function monthKeyFromDate(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  function monthLabel(monthKey) {
    const [y, m] = monthKey.split("-").map(Number);
    return MONTH_NAMES[m - 1] + " " + y;
  }

  function addMonths(monthKey, delta) {
    let [y, m] = monthKey.split("-").map(Number);
    m += delta;
    while (m > 12) { m -= 12; y += 1; }
    while (m < 1) { m += 12; y -= 1; }
    return y + "-" + String(m).padStart(2, "0");
  }

  function daysInMonth(monthKey) {
    const [y, m] = monthKey.split("-").map(Number);
    return new Date(y, m, 0).getDate();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- Default / Seed Data ----------

  function defaultEnvelopes() {
    return [
      { id: "fixed", name: "Fixed Expenses", kind: "fixed", allocation: 1800 },
      { id: "variable", name: "Variable Expenses", kind: "variable", allocation: 1300 },
      { id: "investment", name: "Investments", kind: "investment", allocation: 800 },
    ];
  }

  // Category name -> envelope id, used for defaults and for upgrading older saved data.
  const DEFAULT_CATEGORY_ENVELOPE = {
    Income: null,
    Housing: "fixed",
    Utilities: "fixed",
    Groceries: "variable",
    Transportation: "variable",
    "Dining Out": "variable",
    Entertainment: "variable",
    Healthcare: "variable",
    Shopping: "variable",
    Other: "variable",
    Savings: "investment",
    Investments: "investment",
  };

  function defaultCategories() {
    const limits = {
      Income: 0, Housing: 1500, Groceries: 500, Transportation: 200, "Dining Out": 150, Entertainment: 100,
      Utilities: 250, Healthcare: 100, Shopping: 150, Savings: 0, Investments: 0, Other: 100,
    };
    return Object.keys(limits).map((name) => ({ name, limit: limits[name], envelope: DEFAULT_CATEGORY_ENVELOPE[name] }));
  }

  function seedTransactions() {
    const txns = [];
    const now = new Date();
    for (let back = 2; back >= 0; back--) {
      const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
      const mk = monthKeyFromDate(d);
      const rows = [
        { day: 1, description: "Paycheck", category: "Income", amount: 4200, type: "income" },
        { day: 3, description: "Rent", category: "Housing", amount: 1450, type: "expense" },
        { day: 5, description: "Whole Foods", category: "Groceries", amount: 132.45, type: "expense" },
        { day: 7, description: "Gas station", category: "Transportation", amount: 48.2, type: "expense" },
        { day: 9, description: "Electric bill", category: "Utilities", amount: 89.5, type: "expense" },
        { day: 11, description: "Movie night", category: "Entertainment", amount: 32, type: "expense" },
        { day: 13, description: "Sushi dinner", category: "Dining Out", amount: 64.75, type: "expense" },
        { day: 16, description: "Freelance payment", category: "Income", amount: 600, type: "income" },
        { day: 18, description: "Pharmacy", category: "Healthcare", amount: 22.1, type: "expense" },
        { day: 20, description: "Trader Joe's", category: "Groceries", amount: 98.3, type: "expense" },
        { day: 22, description: "New shoes", category: "Shopping", amount: 78.99, type: "expense" },
        { day: 25, description: "Transfer to savings", category: "Savings", amount: 400, type: "expense" },
        { day: 26, description: "Index fund purchase", category: "Investments", amount: 300, type: "expense" },
        { day: 27, description: "Internet bill", category: "Utilities", amount: 60, type: "expense" },
      ];
      for (const r of rows) {
        const day = Math.min(r.day, daysInMonth(mk));
        txns.push({
          id: uid(),
          date: mk + "-" + String(day).padStart(2, "0"),
          description: r.description,
          category: r.category,
          amount: r.amount,
          type: r.type,
          recurring: false,
        });
      }
    }
    return txns;
  }

  function defaultState() {
    return {
      theme: null,
      sample: true,
      envelopes: defaultEnvelopes(),
      categories: defaultCategories(),
      transactions: seedTransactions(),
      recurringTemplates: [],
    };
  }

  // Bring older saved data up to the current shape without losing anything.
  function upgradeState(parsed) {
    if (!Array.isArray(parsed.envelopes) || parsed.envelopes.length === 0) parsed.envelopes = defaultEnvelopes();
    if (!Array.isArray(parsed.recurringTemplates)) parsed.recurringTemplates = [];
    if (typeof parsed.sample !== "boolean") parsed.sample = false;
    const ids = new Set(parsed.envelopes.map((e) => e.id));
    for (const c of parsed.categories) {
      if (c.envelope === undefined || (c.envelope !== null && !ids.has(c.envelope))) {
        const guess = DEFAULT_CATEGORY_ENVELOPE[c.name];
        c.envelope = guess !== undefined ? guess : (c.name === "Income" ? null : "variable");
        if (c.envelope !== null && !ids.has(c.envelope)) c.envelope = parsed.envelopes[0].id;
      }
    }
    return parsed;
  }

  // ---------- State ----------

  let state = loadState();
  let currentMonthKey = monthKeyFromDate(new Date());
  let sortKey = "date";
  let sortDir = "desc";
  let categoryChart = null;
  let trendChart = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.categories) || !Array.isArray(parsed.transactions)) return defaultState();
      return upgradeState(parsed);
    } catch (e) {
      console.warn("Failed to load state, using defaults", e);
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Could not save to browser storage", e);
    }
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 2400);
  }

  // ---------- Theme (system / light / dark) ----------

  function effectiveTheme() {
    const stamped = document.documentElement.getAttribute("data-theme");
    if (stamped === "dark" || stamped === "light") return stamped;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme() {
    if (state.theme === "dark" || state.theme === "light") {
      document.documentElement.setAttribute("data-theme", state.theme);
    }
    $("#themeToggle").textContent = effectiveTheme() === "dark" ? "☀️" : "🌙";
  }

  function cssToken(name, fallback) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  // ---------- Derived data ----------

  function envelopeById(id) {
    return state.envelopes.find((e) => e.id === id) || null;
  }

  function categoryByName(name) {
    return state.categories.find((c) => c.name === name) || null;
  }

  function envelopeForCategory(name) {
    const cat = categoryByName(name);
    return cat && cat.envelope ? envelopeById(cat.envelope) : null;
  }

  function transactionsForMonth(monthKey) {
    return state.transactions.filter((t) => monthKeyOf(t.date) === monthKey);
  }

  function applyFilters(txns) {
    const search = $("#searchInput").value.trim().toLowerCase();
    const type = $("#filterType").value;
    const category = $("#filterCategory").value;
    return txns.filter((t) => {
      if (type !== "all" && t.type !== type) return false;
      if (category !== "all" && t.category !== category) return false;
      if (search && !t.description.toLowerCase().includes(search) && !t.category.toLowerCase().includes(search)) return false;
      return true;
    });
  }

  function sortTxns(txns) {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...txns].sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (sortKey === "amount") { av = Number(av); bv = Number(bv); }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  // income, spent (non-investment outflows), invested (investment-envelope outflows)
  function monthTotals(monthKey) {
    let income = 0, spent = 0, invested = 0;
    for (const t of transactionsForMonth(monthKey)) {
      const amt = Number(t.amount);
      if (t.type === "income") { income += amt; continue; }
      const env = envelopeForCategory(t.category);
      if (env && env.kind === "investment") invested += amt;
      else spent += amt;
    }
    return { income, spent, invested, net: income - spent - invested };
  }

  function categoryTotalsForMonth(monthKey) {
    const totals = {};
    for (const t of transactionsForMonth(monthKey)) {
      if (t.type !== "expense") continue;
      totals[t.category] = (totals[t.category] || 0) + Number(t.amount);
    }
    return totals;
  }

  function envelopeTotalsForMonth(monthKey) {
    const totals = {};
    for (const e of state.envelopes) totals[e.id] = 0;
    for (const t of transactionsForMonth(monthKey)) {
      if (t.type !== "expense") continue;
      const env = envelopeForCategory(t.category);
      if (env) totals[env.id] += Number(t.amount);
    }
    return totals;
  }

  // ---------- Rendering ----------

  function render() {
    $("#currentMonthLabel").textContent = monthLabel(currentMonthKey);
    $("#sampleNotice").hidden = !state.sample;
    renderSummary();
    renderEnvelopes();
    populateCategoryFilterDropdown();
    renderTable();
    renderCategoryChart();
    renderBudgets();
    renderTrendChart();
    renderRecurring();
    saveState();
  }

  function renderSummary() {
    const { income, spent, invested, net } = monthTotals(currentMonthKey);
    $("#sumIncome").textContent = formatCurrency(income);
    $("#sumExpense").textContent = formatCurrency(spent);
    $("#sumInvested").textContent = formatCurrency(invested);
    $("#sumNet").textContent = formatCurrency(net);
    const rate = income > 0 ? Math.round(((invested + net) / income) * 100) : 0;
    $("#sumRate").textContent = rate + "%";
  }

  function renderEnvelopes() {
    const totals = envelopeTotalsForMonth(currentMonthKey);
    const grid = $("#envelopeGrid");
    grid.innerHTML = state.envelopes.map((e) => {
      const used = totals[e.id] || 0;
      const alloc = Number(e.allocation) || 0;
      const ratio = alloc > 0 ? used / alloc : 0;
      const pct = Math.min(100, ratio * 100);
      const isInvest = e.kind === "investment";
      let fillCls = isInvest ? "invest" : "ok";
      if (!isInvest && ratio > 1) fillCls = "over";
      else if (!isInvest && ratio > 0.85) fillCls = "warn";
      const remaining = alloc - used;
      let remainingHtml;
      if (isInvest) {
        remainingHtml = remaining <= 0
          ? `<span class="remaining reached">Goal reached</span>`
          : `<span class="remaining">${formatCurrency(remaining)} to go</span>`;
      } else {
        remainingHtml = remaining < 0
          ? `<span class="remaining over">${formatCurrency(-remaining)} over</span>`
          : `<span class="remaining">${formatCurrency(remaining)} left</span>`;
      }
      const cats = state.categories.filter((c) => c.envelope === e.id);
      const chips = cats.length
        ? cats.map((c) => `<span class="category-pill">${escapeHtml(c.name)}</span>`).join("")
        : `<span class="env-empty">No categories yet. Assign some under Manage.</span>`;
      return `
        <div class="envelope-card" data-id="${e.id}" data-kind="${e.kind}">
          <div class="env-head">
            <span class="env-name">${escapeHtml(e.name)}</span>
            <span class="env-kind">${ENVELOPE_KIND_LABEL[e.kind] || ""}</span>
          </div>
          <div class="env-alloc">
            <span>${isInvest ? "Monthly goal" : "Monthly amount"}</span>
            <label class="env-alloc-field">$<input type="number" class="env-alloc-input" data-id="${e.id}" min="0" step="0.01" value="${alloc}" aria-label="${escapeHtml(e.name)} monthly amount" /></label>
          </div>
          <div class="progress-track"><div class="progress-fill ${fillCls}" style="width:${pct}%"></div></div>
          <div class="env-figures">
            <span class="spent">${formatCurrency(used)} ${isInvest ? "contributed" : "spent"}</span>
            ${remainingHtml}
          </div>
          <div class="env-cats">${chips}</div>
        </div>
      `;
    }).join("");

    $$(".env-alloc-input", grid).forEach((input) => {
      input.addEventListener("change", () => {
        const env = envelopeById(input.dataset.id);
        if (!env) return;
        env.allocation = Math.max(0, parseFloat(input.value) || 0);
        render();
        toast(`${env.name} set to ${formatCurrency(env.allocation)} per month`);
      });
    });
  }

  function populateCategoryFilterDropdown() {
    const sel = $("#filterCategory");
    const prev = sel.value;
    sel.innerHTML = '<option value="all">All categories</option>' +
      state.categories.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join("");
    sel.value = prev && [...sel.options].some((o) => o.value === prev) ? prev : "all";
  }

  function populateCategorySelect(selectEl, selected) {
    selectEl.innerHTML = state.categories.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join("");
    if (selected) selectEl.value = selected;
  }

  function populateEnvelopeSelect(selectEl, selected) {
    selectEl.innerHTML = '<option value="">No envelope (income)</option>' +
      state.envelopes.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join("");
    selectEl.value = selected || "";
  }

  function defaultCategoryForType(type) {
    if (type === "income") {
      return state.categories.some((c) => c.name === "Income") ? "Income" : state.categories[0]?.name;
    }
    const nonIncome = state.categories.find((c) => c.name !== "Income");
    return nonIncome ? nonIncome.name : state.categories[0]?.name;
  }

  function renderTable() {
    const txns = sortTxns(applyFilters(transactionsForMonth(currentMonthKey)));
    const tbody = $("#txnTableBody");
    const emptyState = $("#emptyState");

    if (txns.length === 0) {
      tbody.innerHTML = "";
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;
    tbody.innerHTML = txns.map((t) => {
      const env = envelopeForCategory(t.category);
      const amountCls = t.type === "income" ? "amount-income" : (env && env.kind === "investment" ? "amount-invest" : "amount-expense");
      return `
        <tr data-id="${t.id}">
          <td>${t.date}</td>
          <td>${escapeHtml(t.description)}${t.recurring ? ' <span title="Recurring">🔁</span>' : ""}</td>
          <td><span class="category-pill" title="${env ? escapeHtml(env.name) : ""}">${escapeHtml(t.category)}</span></td>
          <td class="num ${amountCls}">${t.type === "income" ? "+" : "-"}${formatCurrency(Math.abs(t.amount))}</td>
        </tr>
      `;
    }).join("");
    $$("#txnTableBody tr").forEach((row) => {
      row.addEventListener("click", () => openTxnModal(row.dataset.id));
    });
  }

  function legendHtml(totals, labels) {
    if (labels.length === 0) return '<span class="no-budgets">No expenses recorded this month.</span>';
    return labels.map((l, i) => `
      <span class="legend-item">
        <span class="legend-swatch" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></span>
        ${escapeHtml(l)} — ${formatCurrency(totals[l])}
      </span>
    `).join("");
  }

  function renderCategoryChart() {
    const totals = categoryTotalsForMonth(currentMonthKey);
    const labels = Object.keys(totals);
    const data = Object.values(totals);
    $("#categoryLegend").innerHTML = legendHtml(totals, labels);
    if (typeof Chart === "undefined") return;

    Chart.defaults.color = cssToken("--text-muted", "#6b7280");
    Chart.defaults.borderColor = cssToken("--border", "#e3e5ea");
    const ctx = $("#categoryChart").getContext("2d");
    if (categoryChart) categoryChart.destroy();

    categoryChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
          borderWidth: 0,
        }],
      },
      options: {
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.label}: ${formatCurrency(c.parsed)}` } } },
        cutout: "65%",
      },
    });
  }

  function renderBudgets() {
    const totals = categoryTotalsForMonth(currentMonthKey);
    const budgeted = state.categories.filter((c) => c.limit > 0);
    const container = $("#budgetList");

    if (budgeted.length === 0) {
      container.innerHTML = '<div class="no-budgets">No category limits set. Click "Manage" to add some.</div>';
      return;
    }

    container.innerHTML = budgeted.map((c) => {
      const spent = totals[c.name] || 0;
      const ratio = spent / c.limit;
      const pct = Math.min(100, ratio * 100);
      let cls = "ok";
      if (ratio > 1) cls = "over";
      else if (ratio > 0.85) cls = "warn";
      return `
        <div class="budget-row">
          <div class="budget-row-top">
            <span class="cat-name">${escapeHtml(c.name)}</span>
            <span class="cat-amounts">${formatCurrency(spent)} / ${formatCurrency(c.limit)}</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill ${cls}" style="width:${pct}%"></div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderTrendChart() {
    if (typeof Chart === "undefined") return;
    const months = [];
    for (let i = 5; i >= 0; i--) months.push(addMonths(currentMonthKey, -i));
    const totals = months.map((mk) => monthTotals(mk));

    Chart.defaults.color = cssToken("--text-muted", "#6b7280");
    Chart.defaults.borderColor = cssToken("--border", "#e3e5ea");
    const ctx = $("#trendChart").getContext("2d");
    if (trendChart) trendChart.destroy();

    trendChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: months.map((mk) => monthLabel(mk).slice(0, 3) + " '" + mk.slice(2, 4)),
        datasets: [
          { label: "Income", data: totals.map((t) => t.income), backgroundColor: "#16a34a", borderRadius: 4 },
          { label: "Spent", data: totals.map((t) => t.spent), backgroundColor: "#e11d48", borderRadius: 4 },
          { label: "Invested", data: totals.map((t) => t.invested), backgroundColor: "#0891b2", borderRadius: 4 },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: "bottom" } },
        scales: { y: { beginAtZero: true, ticks: { callback: (v) => "$" + v } } },
      },
    });
  }

  function renderRecurring() {
    const container = $("#recurringList");
    if (state.recurringTemplates.length === 0) {
      container.innerHTML = '<div class="no-budgets">No recurring items yet. Add rent, subscriptions, or your paycheck.</div>';
      return;
    }
    container.innerHTML = state.recurringTemplates.map((r) => `
      <div class="recurring-item" data-id="${r.id}">
        <div>
          <div>${escapeHtml(r.description)} — <span class="${r.type === "income" ? "amount-income" : "amount-expense"}">${formatCurrency(r.amount)}</span></div>
          <div class="rec-meta">${escapeHtml(r.category)} · day ${r.dayOfMonth} of each month</div>
        </div>
        <div class="recurring-item-actions">
          <button class="btn btn-ghost btn-sm rec-delete" data-id="${r.id}">Remove</button>
        </div>
      </div>
    `).join("");
    $$(".rec-delete").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        state.recurringTemplates = state.recurringTemplates.filter((r) => r.id !== btn.dataset.id);
        render();
      });
    });
  }

  // ---------- Transaction Modal ----------

  function updateTxnEnvelopeHint() {
    const env = envelopeForCategory($("#txnCategory").value);
    $("#txnEnvelopeHint").textContent = env ? `Counts toward the ${env.name} envelope` : "";
  }

  function openTxnModal(id) {
    const modal = $("#txnModalOverlay");
    const form = $("#txnForm");
    form.reset();
    populateCategorySelect($("#txnCategory"));

    if (id) {
      const t = state.transactions.find((x) => x.id === id);
      if (!t) return;
      $("#txnModalTitle").textContent = "Edit Transaction";
      $("#txnId").value = t.id;
      $("#txnDate").value = t.date;
      $("#txnDescription").value = t.description;
      $("#txnCategory").value = t.category;
      $("#txnAmount").value = t.amount;
      $("#txnRecurring").checked = !!t.recurring;
      setTxnTypeSegment(t.type);
      $("#txnDeleteBtn").hidden = false;
    } else {
      $("#txnModalTitle").textContent = "Add Transaction";
      $("#txnId").value = "";
      $("#txnDate").value = todayISO();
      setTxnTypeSegment("expense");
      $("#txnCategory").value = defaultCategoryForType("expense");
      $("#txnDeleteBtn").hidden = true;
    }
    updateTxnEnvelopeHint();
    modal.hidden = false;
  }

  function closeTxnModal() {
    $("#txnModalOverlay").hidden = true;
  }

  function setTxnTypeSegment(value) {
    $$("#txnTypeSegment .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.value === value));
    $("#txnTypeSegment").dataset.value = value;
  }

  function onTxnTypeChanged(value) {
    const categorySelect = $("#txnCategory");
    const isDefaultForOtherType = categorySelect.value === defaultCategoryForType(value === "income" ? "expense" : "income");
    if (isDefaultForOtherType) categorySelect.value = defaultCategoryForType(value);
    updateTxnEnvelopeHint();
  }

  function getTxnTypeSegment() {
    return $("#txnTypeSegment").dataset.value || "expense";
  }

  // ---------- Manage modal (envelopes + categories) ----------

  function openBudgetModal() {
    renderEnvelopeEditList();
    renderBudgetEditList();
    populateEnvelopeSelect($("#newCategoryEnvelope"), "variable");
    $("#budgetModalOverlay").hidden = false;
  }

  function closeBudgetModal() {
    $("#budgetModalOverlay").hidden = true;
  }

  function renderEnvelopeEditList() {
    const container = $("#envelopeEditList");
    container.innerHTML = state.envelopes.map((e) => `
      <div class="edit-row env-row" data-id="${e.id}">
        <input type="text" class="env-name-input" value="${escapeHtml(e.name)}" aria-label="Envelope name" />
        <input type="number" class="env-alloc-edit" value="${Number(e.allocation) || 0}" min="0" step="0.01" aria-label="Monthly amount" />
      </div>
    `).join("");
    $$(".env-name-input", container).forEach((input) => {
      input.addEventListener("change", () => {
        const env = envelopeById(input.closest(".edit-row").dataset.id);
        env.name = input.value.trim() || env.name;
        input.value = env.name;
        render();
      });
    });
    $$(".env-alloc-edit", container).forEach((input) => {
      input.addEventListener("change", () => {
        const env = envelopeById(input.closest(".edit-row").dataset.id);
        env.allocation = Math.max(0, parseFloat(input.value) || 0);
        render();
      });
    });
  }

  function renderBudgetEditList() {
    const container = $("#budgetEditList");
    container.innerHTML = state.categories.map((c, idx) => `
      <div class="edit-row" data-idx="${idx}">
        <input type="text" class="cat-name-input" value="${escapeHtml(c.name)}" aria-label="Category name" />
        <input type="number" class="cat-limit-input" value="${c.limit}" min="0" step="0.01" placeholder="Limit" aria-label="Monthly limit" />
        <select class="cat-env-select" aria-label="Envelope"></select>
        <button type="button" class="icon-btn cat-delete" title="Delete category">✕</button>
      </div>
    `).join("");

    $$(".cat-env-select", container).forEach((sel, idx) => {
      populateEnvelopeSelect(sel, state.categories[idx].envelope || "");
      sel.addEventListener("change", () => {
        state.categories[idx].envelope = sel.value || null;
        render();
      });
    });
    $$(".cat-name-input", container).forEach((input, idx) => {
      input.addEventListener("change", () => {
        const cat = state.categories[idx];
        const newName = input.value.trim();
        if (!newName || newName === cat.name) { input.value = cat.name; return; }
        if (state.categories.some((c, i) => i !== idx && c.name.toLowerCase() === newName.toLowerCase())) {
          toast("A category with that name already exists");
          input.value = cat.name;
          return;
        }
        // Keep existing transactions and recurring items attached to the renamed category.
        for (const t of state.transactions) if (t.category === cat.name) t.category = newName;
        for (const r of state.recurringTemplates) if (r.category === cat.name) r.category = newName;
        cat.name = newName;
        render();
      });
    });
    $$(".cat-limit-input", container).forEach((input, idx) => {
      input.addEventListener("change", () => {
        state.categories[idx].limit = Math.max(0, parseFloat(input.value) || 0);
        render();
      });
    });
    $$(".cat-delete", container).forEach((btn, idx) => {
      btn.addEventListener("click", () => {
        const cat = state.categories[idx];
        const inUse = state.transactions.some((t) => t.category === cat.name);
        if (inUse && !confirm(`"${cat.name}" is used by existing transactions. Delete anyway?`)) return;
        state.categories.splice(idx, 1);
        renderBudgetEditList();
        render();
      });
    });
  }

  // ---------- Backup / Restore ----------

  function restoreFromText(text) {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.categories) || !Array.isArray(parsed.transactions)) throw new Error("Invalid backup");
    if (!confirm("Replace everything in this app with this backup?")) return false;
    state = upgradeState(parsed);
    state.sample = false;
    applyTheme();
    $("#backupModalOverlay").hidden = true;
    render();
    toast("Backup restored");
    return true;
  }

  // ---------- Wiring ----------

  function init() {
    applyTheme();
    if (HOSTED) $$(".local-only").forEach((el) => { el.hidden = true; });

    $("#prevMonth").addEventListener("click", () => { currentMonthKey = addMonths(currentMonthKey, -1); render(); });
    $("#nextMonth").addEventListener("click", () => { currentMonthKey = addMonths(currentMonthKey, 1); render(); });

    $("#themeToggle").addEventListener("click", () => {
      state.theme = effectiveTheme() === "dark" ? "light" : "dark";
      applyTheme();
      saveState();
      renderCategoryChart();
      renderTrendChart();
    });

    $("#sampleKeepBtn").addEventListener("click", () => {
      state.sample = false;
      render();
    });
    $("#sampleClearBtn").addEventListener("click", () => {
      if (!confirm("Remove all sample transactions and start with an empty ledger?")) return;
      state.transactions = [];
      state.sample = false;
      render();
      toast("Sample data removed");
    });

    $("#addTxnBtn").addEventListener("click", () => openTxnModal(null));
    $("#emptyAddBtn").addEventListener("click", () => openTxnModal(null));
    $("#txnModalClose").addEventListener("click", closeTxnModal);
    $("#txnCancelBtn").addEventListener("click", closeTxnModal);
    $("#txnModalOverlay").addEventListener("click", (e) => { if (e.target.id === "txnModalOverlay") closeTxnModal(); });
    $("#txnCategory").addEventListener("change", updateTxnEnvelopeHint);

    $$("#txnTypeSegment .seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        setTxnTypeSegment(btn.dataset.value);
        onTxnTypeChanged(btn.dataset.value);
      });
    });

    $("#txnForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const id = $("#txnId").value;
      const payload = {
        date: $("#txnDate").value,
        description: $("#txnDescription").value.trim(),
        category: $("#txnCategory").value,
        amount: Math.abs(parseFloat($("#txnAmount").value)) || 0,
        type: getTxnTypeSegment(),
        recurring: $("#txnRecurring").checked,
      };
      if (!payload.description || !payload.date || payload.amount <= 0) {
        toast("Please fill in all fields with a valid amount.");
        return;
      }
      if (id) {
        const t = state.transactions.find((x) => x.id === id);
        Object.assign(t, payload);
        toast("Transaction updated");
      } else {
        state.transactions.push({ id: uid(), ...payload });
        toast("Transaction added");
      }
      closeTxnModal();
      currentMonthKey = monthKeyOf(payload.date);
      render();
    });

    $("#txnDeleteBtn").addEventListener("click", () => {
      const id = $("#txnId").value;
      if (!id) return;
      if (!confirm("Delete this transaction?")) return;
      state.transactions = state.transactions.filter((t) => t.id !== id);
      closeTxnModal();
      render();
      toast("Transaction deleted");
    });

    $("#searchInput").addEventListener("input", renderTable);
    $("#filterType").addEventListener("change", renderTable);
    $("#filterCategory").addEventListener("change", renderTable);

    $$(".txn-table th[data-sort]").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (sortKey === key) sortDir = sortDir === "asc" ? "desc" : "asc";
        else { sortKey = key; sortDir = "asc"; }
        renderTable();
      });
    });

    // Manage modal
    $("#manageBudgetsBtn").addEventListener("click", openBudgetModal);
    $("#budgetModalClose").addEventListener("click", closeBudgetModal);
    $("#budgetModalDone").addEventListener("click", closeBudgetModal);
    $("#budgetModalOverlay").addEventListener("click", (e) => { if (e.target.id === "budgetModalOverlay") closeBudgetModal(); });

    $("#newCategoryForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("#newCategoryName").value.trim();
      const limit = Math.max(0, parseFloat($("#newCategoryLimit").value) || 0);
      const envelope = $("#newCategoryEnvelope").value || null;
      if (!name) return;
      if (state.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
        toast("Category already exists");
        return;
      }
      state.categories.push({ name, limit, envelope });
      $("#newCategoryForm").reset();
      populateEnvelopeSelect($("#newCategoryEnvelope"), "variable");
      renderBudgetEditList();
      render();
      toast(`Added ${name}`);
    });

    // Recurring
    $("#addRecurringBtn").addEventListener("click", () => {
      const form = $("#recurringForm");
      form.hidden = !form.hidden;
      if (!form.hidden) {
        populateCategorySelect($("#recCategory"), defaultCategoryForType($("#recType").value));
        const daySel = $("#recDay");
        if (!daySel.options.length) {
          daySel.innerHTML = Array.from({ length: 28 }, (_, i) => i + 1).map((d) => `<option value="${d}">Day ${d}</option>`).join("");
        }
      }
    });

    $("#recType").addEventListener("change", () => {
      $("#recCategory").value = defaultCategoryForType($("#recType").value);
    });

    $("#recurringForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const description = $("#recDescription").value.trim();
      const amount = Math.abs(parseFloat($("#recAmount").value)) || 0;
      if (!description || amount <= 0) return;
      state.recurringTemplates.push({
        id: uid(),
        description,
        category: $("#recCategory").value,
        type: $("#recType").value,
        amount,
        dayOfMonth: parseInt($("#recDay").value, 10),
      });
      $("#recurringForm").reset();
      $("#recurringForm").hidden = true;
      render();
      toast("Recurring item saved");
    });

    $("#applyRecurringBtn").addEventListener("click", () => {
      if (state.recurringTemplates.length === 0) {
        toast("No recurring items to apply");
        return;
      }
      let added = 0;
      for (const r of state.recurringTemplates) {
        const day = Math.min(r.dayOfMonth, daysInMonth(currentMonthKey));
        const date = currentMonthKey + "-" + String(day).padStart(2, "0");
        const exists = state.transactions.some((t) => t.recurringSourceId === r.id && monthKeyOf(t.date) === currentMonthKey);
        if (exists) continue;
        state.transactions.push({
          id: uid(),
          date,
          description: r.description,
          category: r.category,
          amount: r.amount,
          type: r.type,
          recurring: true,
          recurringSourceId: r.id,
        });
        added++;
      }
      render();
      toast(added > 0 ? `Added ${added} recurring transaction(s)` : "Recurring items already applied this month");
    });

    // Backup / Restore
    $("#backupBtn").addEventListener("click", () => {
      $("#backupText").value = JSON.stringify(state, null, 2);
      $("#backupModalOverlay").hidden = false;
    });
    $("#backupModalClose").addEventListener("click", () => { $("#backupModalOverlay").hidden = true; });
    $("#backupModalOverlay").addEventListener("click", (e) => { if (e.target.id === "backupModalOverlay") $("#backupModalOverlay").hidden = true; });

    $("#backupCopyBtn").addEventListener("click", async () => {
      const text = $("#backupText").value;
      try {
        await navigator.clipboard.writeText(text);
        toast("Backup copied to clipboard");
      } catch (err) {
        $("#backupText").select();
        toast("Press Ctrl+C / Cmd+C to copy");
      }
    });

    $("#backupRestoreBtn").addEventListener("click", () => {
      try {
        restoreFromText($("#backupText").value);
      } catch (err) {
        toast("That isn't a valid Clearspend backup");
      }
    });

    $("#backupDownloadBtn").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clearspend-backup-${todayISO()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });

    $("#importInput").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          restoreFromText(reader.result);
        } catch (err) {
          toast("That file isn't a valid Clearspend backup");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    });

    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
