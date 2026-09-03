(() => {
  "use strict";

  const STORAGE_KEY = "clearspend.budget.v1";
  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const CHART_COLORS = ["#4f5df7","#16a34a","#e11d48","#d97706","#0891b2","#7c3aed","#db2777","#65a30d","#0284c7","#c2410c"];

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function todayISO(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
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

  // ---------- Default / Seed Data ----------

  function defaultCategories() {
    return [
      { name: "Income", limit: 0 },
      { name: "Housing", limit: 1500 },
      { name: "Groceries", limit: 500 },
      { name: "Transportation", limit: 200 },
      { name: "Dining Out", limit: 150 },
      { name: "Entertainment", limit: 100 },
      { name: "Utilities", limit: 250 },
      { name: "Healthcare", limit: 100 },
      { name: "Shopping", limit: 150 },
      { name: "Savings", limit: 0 },
      { name: "Other", limit: 100 },
    ];
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
      theme: "light",
      categories: defaultCategories(),
      transactions: seedTransactions(),
      recurringTemplates: [],
    };
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
      if (!parsed.categories || !parsed.transactions) return defaultState();
      if (!parsed.recurringTemplates) parsed.recurringTemplates = [];
      return parsed;
    } catch (e) {
      console.warn("Failed to load state, using defaults", e);
      return defaultState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 2400);
  }

  // ---------- Derived data ----------

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

  function monthTotals(monthKey) {
    const txns = transactionsForMonth(monthKey);
    let income = 0, expense = 0;
    for (const t of txns) {
      if (t.type === "income") income += Number(t.amount);
      else expense += Number(t.amount);
    }
    return { income, expense, net: income - expense };
  }

  function categoryTotalsForMonth(monthKey) {
    const txns = transactionsForMonth(monthKey).filter((t) => t.type === "expense");
    const totals = {};
    for (const t of txns) {
      totals[t.category] = (totals[t.category] || 0) + Number(t.amount);
    }
    return totals;
  }

  // ---------- Rendering ----------

  function render() {
    $("#currentMonthLabel").textContent = monthLabel(currentMonthKey);
    renderSummary();
    populateCategoryFilterDropdown();
    renderTable();
    renderCategoryChart();
    renderBudgets();
    renderTrendChart();
    renderRecurring();
    saveState();
  }

  function renderSummary() {
    const { income, expense, net } = monthTotals(currentMonthKey);
    $("#sumIncome").textContent = formatCurrency(income);
    $("#sumExpense").textContent = formatCurrency(expense);
    $("#sumNet").textContent = formatCurrency(net);
    const rate = income > 0 ? Math.round((net / income) * 100) : 0;
    $("#sumRate").textContent = rate + "%";
  }

  function populateCategoryFilterDropdown() {
    const sel = $("#filterCategory");
    const prev = sel.value;
    sel.innerHTML = '<option value="all">All categories</option>' +
      state.categories.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join("");
    sel.value = prev && [...sel.options].some(o => o.value === prev) ? prev : "all";
  }

  function populateCategorySelect(selectEl, selected) {
    selectEl.innerHTML = state.categories.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join("");
    if (selected) selectEl.value = selected;
  }

  function defaultCategoryForType(type) {
    if (type === "income") {
      return state.categories.some((c) => c.name === "Income") ? "Income" : state.categories[0]?.name;
    }
    const nonIncome = state.categories.find((c) => c.name !== "Income");
    return nonIncome ? nonIncome.name : state.categories[0]?.name;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function renderTable() {
    const txns = sortTxns(applyFilters(transactionsForMonth(currentMonthKey)));
    const tbody = $("#txnTableBody");
    const emptyState = $("#emptyState");

    if (txns.length === 0) {
      tbody.innerHTML = "";
      emptyState.hidden = false;
    } else {
      emptyState.hidden = true;
      tbody.innerHTML = txns.map((t) => `
        <tr data-id="${t.id}">
          <td>${t.date}</td>
          <td>${escapeHtml(t.description)}${t.recurring ? ' <span title="Recurring">🔁</span>' : ""}</td>
          <td><span class="category-pill">${escapeHtml(t.category)}</span></td>
          <td class="num ${t.type === "income" ? "amount-income" : "amount-expense"}">
            ${t.type === "income" ? "+" : "-"}${formatCurrency(Math.abs(t.amount))}
          </td>
          <td></td>
        </tr>
      `).join("");
      $$("#txnTableBody tr").forEach((row) => {
        row.addEventListener("click", () => openTxnModal(row.dataset.id));
      });
    }
  }

  function renderCategoryChart() {
    const totals = categoryTotalsForMonth(currentMonthKey);
    const labels = Object.keys(totals);
    const data = Object.values(totals);
    const ctx = $("#categoryChart").getContext("2d");

    if (categoryChart) categoryChart.destroy();

    if (labels.length === 0) {
      $("#categoryLegend").innerHTML = '<span class="no-budgets">No expenses recorded this month.</span>';
      categoryChart = new Chart(ctx, { type: "doughnut", data: { labels: [], datasets: [] } });
      return;
    }

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
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.parsed)}` } } },
        cutout: "65%",
      },
    });

    $("#categoryLegend").innerHTML = labels.map((l, i) => `
      <span class="legend-item">
        <span class="legend-swatch" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></span>
        ${escapeHtml(l)} — ${formatCurrency(totals[l])}
      </span>
    `).join("");
  }

  function renderBudgets() {
    const totals = categoryTotalsForMonth(currentMonthKey);
    const budgeted = state.categories.filter((c) => c.limit > 0);
    const container = $("#budgetList");

    if (budgeted.length === 0) {
      container.innerHTML = '<div class="no-budgets">No budgets set. Click "Manage" to add category limits.</div>';
      return;
    }

    container.innerHTML = budgeted.map((c) => {
      const spent = totals[c.name] || 0;
      const pct = Math.min(100, (spent / c.limit) * 100);
      let cls = "ok";
      if (spent / c.limit > 1) cls = "over";
      else if (spent / c.limit > 0.85) cls = "warn";
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
    const months = [];
    for (let i = 5; i >= 0; i--) months.push(addMonths(currentMonthKey, -i));
    const incomeData = months.map((mk) => monthTotals(mk).income);
    const expenseData = months.map((mk) => monthTotals(mk).expense);
    const ctx = $("#trendChart").getContext("2d");

    if (trendChart) trendChart.destroy();
    trendChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: months.map((mk) => monthLabel(mk).split(" ")[0].slice(0, 3) + " '" + mk.slice(2, 4)),
        datasets: [
          { label: "Income", data: incomeData, backgroundColor: "#16a34a", borderRadius: 4 },
          { label: "Expenses", data: expenseData, backgroundColor: "#e11d48", borderRadius: 4 },
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
  }

  function getTxnTypeSegment() {
    return $("#txnTypeSegment").dataset.value || "expense";
  }

  // ---------- Wiring ----------

  function init() {
    document.documentElement.setAttribute("data-theme", state.theme);
    $("#themeToggle").textContent = state.theme === "dark" ? "☀️" : "🌙";

    $("#prevMonth").addEventListener("click", () => { currentMonthKey = addMonths(currentMonthKey, -1); render(); });
    $("#nextMonth").addEventListener("click", () => { currentMonthKey = addMonths(currentMonthKey, 1); render(); });

    $("#themeToggle").addEventListener("click", () => {
      state.theme = state.theme === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", state.theme);
      $("#themeToggle").textContent = state.theme === "dark" ? "☀️" : "🌙";
      saveState();
    });

    $("#addTxnBtn").addEventListener("click", () => openTxnModal(null));
    $("#emptyAddBtn").addEventListener("click", () => openTxnModal(null));
    $("#txnModalClose").addEventListener("click", closeTxnModal);
    $("#txnCancelBtn").addEventListener("click", closeTxnModal);
    $("#txnModalOverlay").addEventListener("click", (e) => { if (e.target.id === "txnModalOverlay") closeTxnModal(); });

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

    // Budget management modal
    $("#manageBudgetsBtn").addEventListener("click", openBudgetModal);
    $("#budgetModalClose").addEventListener("click", closeBudgetModal);
    $("#budgetModalDone").addEventListener("click", closeBudgetModal);
    $("#budgetModalOverlay").addEventListener("click", (e) => { if (e.target.id === "budgetModalOverlay") closeBudgetModal(); });

    $("#newCategoryForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("#newCategoryName").value.trim();
      const limit = parseFloat($("#newCategoryLimit").value) || 0;
      if (!name) return;
      if (state.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
        toast("Category already exists");
        return;
      }
      state.categories.push({ name, limit });
      $("#newCategoryForm").reset();
      renderBudgetEditList();
      render();
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

    // Export / Import
    $("#exportBtn").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clearspend-export-${todayISO()}.json`;
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
          const parsed = JSON.parse(reader.result);
          if (!parsed.categories || !parsed.transactions) throw new Error("Invalid file");
          if (!parsed.recurringTemplates) parsed.recurringTemplates = [];
          state = parsed;
          document.documentElement.setAttribute("data-theme", state.theme || "light");
          $("#themeToggle").textContent = state.theme === "dark" ? "☀️" : "🌙";
          render();
          toast("Data imported");
        } catch (err) {
          toast("Import failed: invalid file");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    });

    render();
  }

  function openBudgetModal() {
    renderBudgetEditList();
    $("#budgetModalOverlay").hidden = false;
  }

  function closeBudgetModal() {
    $("#budgetModalOverlay").hidden = true;
  }

  function renderBudgetEditList() {
    const container = $("#budgetEditList");
    container.innerHTML = state.categories.map((c, idx) => `
      <div class="budget-edit-row" data-idx="${idx}">
        <input type="text" class="cat-name-input" value="${escapeHtml(c.name)}" />
        <input type="number" class="cat-limit-input" value="${c.limit}" min="0" step="0.01" placeholder="Limit" />
        <button type="button" class="icon-btn cat-delete" title="Delete category">✕</button>
      </div>
    `).join("");

    $$(".cat-name-input", container).forEach((input, idx) => {
      input.addEventListener("change", () => {
        state.categories[idx].name = input.value.trim() || state.categories[idx].name;
        render();
      });
    });
    $$(".cat-limit-input", container).forEach((input, idx) => {
      input.addEventListener("change", () => {
        state.categories[idx].limit = parseFloat(input.value) || 0;
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

  document.addEventListener("DOMContentLoaded", init);
})();
