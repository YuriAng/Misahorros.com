// Capa de presentación: solo lee del estado y pinta el DOM. No muta datos.

import {
  getData, getActiveMonth, getActiveCategories,
  getCategorySpent, getCategoryBudget, getCategoryRemaining, getMonthTotals,
  getProfiles, getCarryForwardInfo, getFunds, getFundMonthMovements
} from './state.js';
import { formatCurrency, formatMonthLabel } from './utils.js';

export function renderApp() {
  renderProfileSelect();
  renderMonthLabel();
  renderSummary();
  renderFunds();
  renderCategories();
  renderTransactions();
  renderCategorySelectOptions();
}

function renderProfileSelect() {
  const select = document.getElementById('profileSelect');
  const profiles = getProfiles();
  const activeId = getData().settings.activeProfile;
  select.innerHTML = profiles
    .map(p => `<option value="${p.id}" ${p.id === activeId ? 'selected' : ''}>${p.name}</option>`)
    .join('');
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
  const { income, totalBudgeted, totalSpent, fundDeposits, fundWithdrawals, totalAvailable } = getMonthTotals(monthKey);
  const currency = getData().settings.currency;
  // El dinero que entra por retiros cuenta como disponible, y los depósitos
  // cuentan como salida: la barra y el número "Disponible" deben describir
  // el MISMO dinero, o la tarjeta se contradice (depositar todo el ingreso
  // mostraría $0 disponible sobre una barra verde al 0%).
  const outflow = totalSpent + fundDeposits;
  const inflow = income + fundWithdrawals;
  const pctUsed = inflow > 0 ? Math.min((outflow / inflow) * 100, 100) : (outflow > 0 ? 100 : 0);
  const status = budgetStatus(outflow, inflow);
  const carryForward = getCarryForwardInfo(monthKey);

  const carryForwardBanner = carryForward.available ? `
    <div class="summary-row carry-forward-banner">
      <div>
        <span class="summary-label">¿Copiar datos de ${formatMonthLabel(carryForward.sourceMonth)}?</span>
        <div class="summary-meta">Trae el ingreso y los presupuestos por categoría; luego puedes editarlos.</div>
      </div>
      <button class="btn-link" id="carryForwardBtn">Copiar</button>
    </div>
  ` : '';

  const fundMeta = (fundDeposits || fundWithdrawals) ? `
    <div class="summary-meta">
      <span>A fondos: ${formatCurrency(fundDeposits, currency)}</span>
      <span>Desde fondos: ${formatCurrency(fundWithdrawals, currency)}</span>
    </div>
  ` : '';

  document.getElementById('summaryCard').innerHTML = `
    ${carryForwardBanner}
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
    ${fundMeta}
  `;
}

function renderFunds() {
  const monthKey = getActiveMonth();
  const funds = getFunds();
  const currency = getData().settings.currency;
  const list = document.getElementById('fundsList');

  if (funds.length === 0) {
    list.innerHTML = `<p class="empty-state">Aún no tienes fondos. Toca "+ Nuevo" para crear uno (por ejemplo: Fondo de ahorro, Fondo de inversión).</p>`;
    return;
  }

  list.innerHTML = funds.map(fund => {
    const movements = getFundMonthMovements(monthKey, fund.id);
    const inThis = movements.filter(m => m.type === 'deposit').reduce((s, m) => s + m.amount, 0);
    const outThis = movements.filter(m => m.type === 'withdrawal').reduce((s, m) => s + m.amount, 0);
    const monthMeta = (inThis || outThis)
      ? `<span>Este mes: +${formatCurrency(inThis, currency)} / −${formatCurrency(outThis, currency)}</span>`
      : `<span>Sin movimientos este mes</span>`;

    const movementsList = movements.length === 0
      ? ''
      : `
        <div class="fund-movements-list">
          ${movements.map(m => {
            const dateLabel = new Date(m.date).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
            const isDeposit = m.type === 'deposit';
            return `
              <div class="fund-movement-row">
                <span class="fund-movement-icon">${isDeposit ? '⬆' : '⬇'}</span>
                <div class="fund-movement-info">
                  <span class="fund-movement-type">${isDeposit ? 'Depósito' : 'Retiro'}</span>
                  ${m.note ? `<span class="fund-movement-note">${m.note}</span>` : ''}
                </div>
                <span class="fund-movement-date">${dateLabel}</span>
                <span class="fund-movement-amount ${isDeposit ? 'deposit' : 'withdrawal'}">${isDeposit ? '+' : '-'}${formatCurrency(m.amount, currency)}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;

    return `
      <div class="fund-card" data-id="${fund.id}">
        <div class="fund-header">
          <span class="fund-name">${fund.name}</span>
          <button class="btn-icon-sm edit-fund" data-id="${fund.id}" aria-label="Editar ${fund.name}">✎</button>
        </div>
        <div class="fund-balance">${formatCurrency(fund.balance, currency)}</div>
        <div class="fund-meta">${monthMeta}</div>
        <div class="fund-actions">
          <button class="btn-link fund-deposit" data-id="${fund.id}">Depositar</button>
          <button class="btn-link fund-withdraw" data-id="${fund.id}" ${fund.balance <= 0 ? 'disabled' : ''}>Retirar</button>
        </div>
        ${movementsList}
      </div>
    `;
  }).join('');
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
