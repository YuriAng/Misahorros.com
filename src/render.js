// Capa de presentación: solo lee del estado y pinta el DOM. No muta datos.

import {
  getData, getActiveMonth, getActiveCategories,
  getCategorySpent, getCategoryBudget, getCategoryRemaining, getMonthTotals
} from './state.js';
import { formatCurrency, formatMonthLabel } from './utils.js';

export function renderApp() {
  renderMonthLabel();
  renderSummary();
  renderCategories();
  renderTransactions();
  renderCategorySelectOptions();
}

// Estado visual de una categoría o del total, según % consumido.
function budgetStatus(spent, limit) {
  if (limit <= 0) return spent > 0 ? 'danger' : 'ok';
  const pct = spent / limit;
  if (pct >= 1) return 'danger';
  if (pct >= 0.8) return 'warning';
  return 'ok';
}

function renderMonthLabel() {
  document.getElementById('monthLabel').textContent = formatMonthLabel(getActiveMonth());
}

function renderSummary() {
  const monthKey = getActiveMonth();
  const { income, totalBudgeted, totalSpent, totalAvailable } = getMonthTotals(monthKey);
  const currency = getData().settings.currency;
  const pctUsed = income > 0 ? Math.min((totalSpent / income) * 100, 100) : (totalSpent > 0 ? 100 : 0);
  const status = budgetStatus(totalSpent, income);

  document.getElementById('summaryCard').innerHTML = `
    <div class="summary-row">
      <div>
        <span class="summary-label">Ingreso mensual</span>
        <div class="summary-value">${formatCurrency(income, currency)}</div>
      </div>
      <button class="btn-link" id="editIncomeBtn">Editar</button>
    </div>
    <div class="summary-row">
      <div>
        <span class="summary-label">Disponible</span>
        <div class="summary-value ${status}">${formatCurrency(totalAvailable, currency)}</div>
      </div>
    </div>
    <div class="progress-track">
      <div class="progress-fill ${status}" style="width:${pctUsed}%"></div>
    </div>
    <div class="summary-meta">
      <span>Gastado: ${formatCurrency(totalSpent, currency)}</span>
      <span>Presupuestado: ${formatCurrency(totalBudgeted, currency)}</span>
    </div>
  `;
}

function renderCategories() {
  const monthKey = getActiveMonth();
  const categories = getActiveCategories();
  const currency = getData().settings.currency;
  const list = document.getElementById('categoriesList');

  if (categories.length === 0) {
    list.innerHTML = `<p class="empty-state">Aún no tienes categorías. Toca "+ Nueva" para crear la primera (por ejemplo, las tuyas: Casa, Mascotas...).</p>`;
    return;
  }

  list.innerHTML = categories.map(cat => {
    const spent = getCategorySpent(monthKey, cat.id);
    const budget = getCategoryBudget(monthKey, cat.id);
    const remaining = getCategoryRemaining(monthKey, cat.id);
    const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : (spent > 0 ? 100 : 0);
    const status = budgetStatus(spent, budget);

    return `
      <div class="category-card" style="--cat-color:${cat.color}">
        <div class="category-header">
          <span class="category-icon">${cat.icon}</span>
          <span class="category-name">${cat.name}</span>
          <button class="btn-icon-sm edit-category" data-id="${cat.id}" aria-label="Editar ${cat.name}">✎</button>
        </div>
        <div class="progress-track">
          <div class="progress-fill ${status}" style="width:${pct}%"></div>
        </div>
        <div class="category-meta">
          <span class="${status}">${formatCurrency(remaining, currency)} restante</span>
          <span>${formatCurrency(spent, currency)} / ${formatCurrency(budget, currency)}</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderTransactions() {
  const monthKey = getActiveMonth();
  const data = getData();
  const month = data.months[monthKey];
  const currency = data.settings.currency;
  const list = document.getElementById('transactionsList');

  if (!month || month.transactions.length === 0) {
    list.innerHTML = `<p class="empty-state">Sin gastos registrados este mes.</p>`;
    return;
  }

  list.innerHTML = month.transactions.map(t => {
    const cat = data.categories.find(c => c.id === t.categoryId);
    const dateLabel = new Date(t.date).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
    return `
      <div class="transaction-row">
        <span class="transaction-icon">${cat ? cat.icon : '❓'}</span>
        <div class="transaction-info">
          <span class="transaction-cat">${cat ? cat.name : 'Categoría eliminada'}</span>
          ${t.note ? `<span class="transaction-note">${t.note}</span>` : ''}
        </div>
        <span class="transaction-date">${dateLabel}</span>
        <span class="transaction-amount">-${formatCurrency(t.amount, currency)}</span>
        <button class="btn-icon-sm edit-transaction" data-id="${t.id}" aria-label="Editar gasto">✎</button>
        <button class="btn-icon-sm delete-transaction" data-id="${t.id}" aria-label="Eliminar gasto">🗑</button>
      </div>
    `;
  }).join('');
}

function renderCategorySelectOptions() {
  const select = document.getElementById('expenseCategory');
  const categories = getActiveCategories();
  select.innerHTML = categories.length
    ? categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('')
    : `<option value="">Crea una categoría primero</option>`;
}
