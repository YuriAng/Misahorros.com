// Punto de entrada: conecta eventos del DOM con el estado (state.js)
// y vuelve a renderizar (render.js) después de cada cambio.

import './style.css';
import { renderApp } from './render.js';
import {
  getData, getActiveMonth, setActiveMonth,
  setIncome, addCategory, updateCategory, archiveCategory,
  addTransaction, deleteTransaction, getCategoryBudget
} from './state.js';
import { shiftMonthKey } from './utils.js';

// Cierra cualquier overlay que haya quedado abierto antes de abrir uno nuevo,
// para que nunca puedan quedar dos formularios visibles a la vez.
function closeAllOverlays() {
  document.querySelectorAll('.overlay').forEach(el => { el.hidden = true; });
}

function openOverlay(id) {
  closeAllOverlays();
  document.getElementById(id).hidden = false;
}

function closeOverlay(id) { document.getElementById(id).hidden = true; }

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => { btn.closest('.overlay').hidden = true; });
});

// --- Navegación entre meses ---

document.getElementById('prevMonth').addEventListener('click', () => {
  setActiveMonth(shiftMonthKey(getActiveMonth(), -1));
  renderApp();
});

document.getElementById('nextMonth').addEventListener('click', () => {
  setActiveMonth(shiftMonthKey(getActiveMonth(), 1));
  renderApp();
});

// --- Ingreso mensual ---

document.getElementById('summaryCard').addEventListener('click', (e) => {
  if (e.target.id !== 'editIncomeBtn') return;
  const monthKey = getActiveMonth();
  const month = getData().months[monthKey];
  document.getElementById('incomeAmount').value = month?.income.amount || 0;
  openOverlay('incomeFormOverlay');
});

document.getElementById('incomeForm').addEventListener('submit', (e) => {
  e.preventDefault();
  setIncome(getActiveMonth(), document.getElementById('incomeAmount').value);
  closeOverlay('incomeFormOverlay');
  renderApp();
});

// --- Categorías: crear / editar / archivar ---

function setCategoryColor(color) {
  document.getElementById('categoryColor').value = color;
  document.querySelectorAll('.color-swatch').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.color.toLowerCase() === color.toLowerCase());
  });
}

document.getElementById('colorSwatches').addEventListener('click', (e) => {
  const btn = e.target.closest('.color-swatch');
  if (!btn) return;
  setCategoryColor(btn.dataset.color);
});

document.getElementById('categoryColor').addEventListener('input', (e) => {
  setCategoryColor(e.target.value);
});

document.getElementById('addCategoryBtn').addEventListener('click', () => {
  document.getElementById('categoryFormTitle').textContent = 'Nueva categoría';
  document.getElementById('categoryForm').reset();
  document.getElementById('categoryId').value = '';
  setCategoryColor('#4F8EF7');
  document.getElementById('deleteCategoryBtn').hidden = true;
  openOverlay('categoryFormOverlay');
});

document.getElementById('categoriesList').addEventListener('click', (e) => {
  const btn = e.target.closest('.edit-category');
  if (!btn) return;
  const category = getData().categories.find(c => c.id === btn.dataset.id);
  if (!category) return;

  document.getElementById('categoryFormTitle').textContent = 'Editar categoría';
  document.getElementById('categoryId').value = category.id;
  document.getElementById('categoryName').value = category.name;
  document.getElementById('categoryIcon').value = category.icon;
  setCategoryColor(category.color);
  document.getElementById('categoryBudget').value = getCategoryBudget(getActiveMonth(), category.id);
  document.getElementById('deleteCategoryBtn').hidden = false;
  openOverlay('categoryFormOverlay');
});

document.getElementById('categoryForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('categoryId').value;
  const payload = {
    name: document.getElementById('categoryName').value,
    icon: document.getElementById('categoryIcon').value,
    color: document.getElementById('categoryColor').value,
    budget: document.getElementById('categoryBudget').value
  };
  if (id) {
    updateCategory(id, payload);
  } else {
    addCategory(payload);
  }
  closeOverlay('categoryFormOverlay');
  renderApp();
});

document.getElementById('deleteCategoryBtn').addEventListener('click', () => {
  const id = document.getElementById('categoryId').value;
  if (!id) return;
  const ok = confirm('¿Eliminar esta categoría? Se archivará: dejará de aparecer para nuevos gastos, pero su histórico se conserva.');
  if (!ok) return;
  archiveCategory(id);
  closeOverlay('categoryFormOverlay');
  renderApp();
});

// --- Gastos: alta rápida y borrado ---

document.getElementById('fabAddExpense').addEventListener('click', () => {
  document.getElementById('expenseForm').reset();
  openOverlay('expenseFormOverlay');
});

document.getElementById('expenseForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const categoryId = document.getElementById('expenseCategory').value;
  if (!categoryId) {
    alert('Primero crea una categoría para poder registrar gastos.');
    return;
  }
  addTransaction(getActiveMonth(), {
    categoryId,
    amount: document.getElementById('expenseAmount').value,
    note: document.getElementById('expenseNote').value
  });
  closeOverlay('expenseFormOverlay');
  renderApp();
});

document.getElementById('transactionsList').addEventListener('click', (e) => {
  const btn = e.target.closest('.delete-transaction');
  if (!btn) return;
  if (confirm('¿Eliminar este gasto? El monto volverá al saldo disponible de su categoría.')) {
    deleteTransaction(getActiveMonth(), btn.dataset.id);
    renderApp();
  }
});

renderApp();
