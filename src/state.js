// Modelo de datos y "lógica de negocio": todo cálculo de saldos vive aquí,
// nunca en el HTML/render. Los saldos SIEMPRE se derivan (nunca se guardan),
// para que nunca queden desincronizados de las transacciones reales.

import { loadData, saveData } from './storage.js';
import { generateId, getMonthKey } from './utils.js';

const data = loadData();

if (!data.settings.activeMonth) {
  data.settings.activeMonth = getMonthKey();
  saveData(data);
}

export function getData() {
  return data;
}

export function getActiveMonth() {
  return data.settings.activeMonth;
}

// Crea el mes si no existe, copiando los presupuestos e ingreso del mes
// anterior más reciente como punto de partida editable (soporte multi-mes).
export function ensureMonth(monthKey) {
  if (data.months[monthKey]) return data.months[monthKey];

  const previousKey = Object.keys(data.months)
    .filter(k => k < monthKey)
    .sort()
    .pop();
  const previousMonth = previousKey ? data.months[previousKey] : null;

  data.months[monthKey] = {
    income: {
      amount: previousMonth ? previousMonth.income.amount : 0,
      updatedAt: new Date().toISOString()
    },
    budgets: previousMonth ? { ...previousMonth.budgets } : {},
    transactions: []
  };
  saveData(data);
  return data.months[monthKey];
}

export function setActiveMonth(monthKey) {
  ensureMonth(monthKey);
  data.settings.activeMonth = monthKey;
  saveData(data);
}

export function setIncome(monthKey, amount) {
  const month = ensureMonth(monthKey);
  month.income = { amount: Number(amount) || 0, updatedAt: new Date().toISOString() };
  saveData(data);
}

export function addCategory({ name, icon, color, budget }) {
  const id = generateId('cat');
  data.categories.push({
    id,
    name: (name || '').trim() || 'Sin nombre',
    icon: (icon || '').trim() || '💸',
    color: color || '#4F8EF7',
    archived: false,
    createdAt: new Date().toISOString()
  });
  const month = ensureMonth(data.settings.activeMonth);
  month.budgets[id] = Number(budget) || 0;
  saveData(data);
  return id;
}

export function updateCategory(id, { name, icon, color, budget }) {
  const category = data.categories.find(c => c.id === id);
  if (!category) return;
  if (name != null) category.name = name.trim() || category.name;
  if (icon != null) category.icon = icon.trim() || category.icon;
  if (color != null) category.color = color;
  if (budget != null) {
    const month = ensureMonth(data.settings.activeMonth);
    month.budgets[id] = Number(budget) || 0;
  }
  saveData(data);
}

// No se borra físicamente: se archiva, así el histórico de meses pasados
// (transacciones y presupuestos ya registrados) permanece intacto.
export function archiveCategory(id) {
  const category = data.categories.find(c => c.id === id);
  if (!category) return;
  category.archived = true;
  saveData(data);
}

export function getActiveCategories() {
  return data.categories.filter(c => !c.archived);
}

export function addTransaction(monthKey, { categoryId, amount, note }) {
  const month = ensureMonth(monthKey);
  const txn = {
    id: generateId('txn'),
    categoryId,
    amount: Number(amount) || 0,
    note: (note || '').trim(),
    date: new Date().toISOString()
  };
  month.transactions.unshift(txn);
  saveData(data);
  return txn;
}

export function deleteTransaction(monthKey, txnId) {
  const month = ensureMonth(monthKey);
  month.transactions = month.transactions.filter(t => t.id !== txnId);
  saveData(data);
}

// --- Cálculos derivados (ver Fase 3 para el detalle de estas funciones) ---

export function getCategorySpent(monthKey, categoryId) {
  const month = ensureMonth(monthKey);
  return month.transactions
    .filter(t => t.categoryId === categoryId)
    .reduce((sum, t) => sum + t.amount, 0);
}

export function getCategoryBudget(monthKey, categoryId) {
  const month = ensureMonth(monthKey);
  return month.budgets[categoryId] || 0;
}

export function getCategoryRemaining(monthKey, categoryId) {
  return getCategoryBudget(monthKey, categoryId) - getCategorySpent(monthKey, categoryId);
}

export function getMonthTotals(monthKey) {
  const month = ensureMonth(monthKey);
  const income = month.income.amount;
  const totalBudgeted = Object.values(month.budgets).reduce((sum, v) => sum + v, 0);
  const totalSpent = month.transactions.reduce((sum, t) => sum + t.amount, 0);
  return {
    income,
    totalBudgeted,
    totalSpent,
    totalAvailable: income - totalSpent
  };
}
