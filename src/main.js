// Punto de entrada: conecta eventos del DOM con el estado (state.js)
// y vuelve a renderizar (render.js) después de cada cambio.
//
// Desde server-persistence: toda escritura es async, así que cada handler
// que escribe se envuelve con `withBusy()` — deshabilita el control mientras
// espera la respuesta del servidor, vuelve a renderizar al terminar, y
// muestra un mensaje visible (en vez de un `console.error` silencioso) si
// la petición falla.

import './style.css';
import { renderApp } from './render.js';
import {
  bootstrap, getData, getActiveMonth, setActiveMonth,
  setIncome, addCategory, updateCategory, archiveCategory,
  addTransaction, updateTransaction, deleteTransaction, getCategoryBudget,
  getActiveProfile, addProfile, renameProfile, archiveProfile, setActiveProfile
} from './state.js';
import { ApiError, getImportStatus, importLegacy } from './api.js';
import { loadData, STORAGE_KEY } from './storage.js';
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

// --- Mensajes visibles de error (reemplaza el "console.error y listo") ---

function ensureErrorBanner() {
  let el = document.getElementById('errorBanner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'errorBanner';
    el.className = 'error-banner';
    el.hidden = true;
    document.getElementById('app').prepend(el);
  }
  return el;
}

let errorBannerTimer = null;

function showError(message) {
  const el = ensureErrorBanner();
  el.textContent = message;
  el.hidden = false;
  clearTimeout(errorBannerTimer);
  errorBannerTimer = setTimeout(() => { el.hidden = true; }, 6000);
}

// Envuelve un handler que escribe: deshabilita `control` mientras `fn`
// (async) está en curso, vuelve a renderizar cuando termina (haya
// funcionado o no, para reflejar cualquier estado parcial), y convierte un
// `ApiError` en un mensaje visible en vez de perderlo en la consola.
function withBusy(getControl, fn) {
  return async (...args) => {
    const control = typeof getControl === 'function' ? getControl() : getControl;
    if (control) control.disabled = true;
    try {
      await fn(...args);
      renderApp();
    } catch (err) {
      renderApp();
      if (err instanceof ApiError) {
        showError(err.message);
      } else {
        showError('Ocurrió un error inesperado. Intenta de nuevo.');
      }
    } finally {
      if (control) control.disabled = false;
    }
  };
}

function submitButtonOf(formId) {
  return () => document.getElementById(formId).querySelector('button[type="submit"]');
}

// Formatea a "YYYY-MM-DD" en hora local (no UTC) para que el <input type="date">
// muestre el mismo día que el usuario ve en la lista de gastos.
function toDateInputValue(date) {
  const d = date ? new Date(date) : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// --- Navegación entre meses ---

document.getElementById('prevMonth').addEventListener('click', withBusy(
  () => document.getElementById('prevMonth'),
  async () => { await setActiveMonth(shiftMonthKey(getActiveMonth(), -1)); }
));

document.getElementById('nextMonth').addEventListener('click', withBusy(
  () => document.getElementById('nextMonth'),
  async () => { await setActiveMonth(shiftMonthKey(getActiveMonth(), 1)); }
));

// --- Presupuestos (profiles): cambiar activo / crear / renombrar / archivar ---

document.getElementById('profileSelect').addEventListener('change', withBusy(
  () => document.getElementById('profileSelect'),
  async (e) => { await setActiveProfile(e.target.value); }
));

function openProfileFormFor(profile) {
  document.getElementById('profileForm').reset();
  if (profile) {
    document.getElementById('profileFormTitle').textContent = 'Editar presupuesto activo';
    document.getElementById('profileId').value = profile.id;
    document.getElementById('profileName').value = profile.name;
    document.getElementById('deleteProfileBtn').hidden = false;
  } else {
    document.getElementById('profileFormTitle').textContent = 'Nuevo presupuesto';
    document.getElementById('profileId').value = '';
    document.getElementById('deleteProfileBtn').hidden = true;
  }
  openOverlay('profileFormOverlay');
}

document.getElementById('manageProfilesBtn').addEventListener('click', () => {
  openProfileFormFor(getActiveProfile());
});

document.getElementById('newProfileBtn').addEventListener('click', () => {
  openProfileFormFor(null);
});

document.getElementById('profileForm').addEventListener('submit', withBusy(
  submitButtonOf('profileForm'),
  async (e) => {
    e.preventDefault();
    const id = document.getElementById('profileId').value;
    const name = document.getElementById('profileName').value;
    if (id) {
      await renameProfile(id, name);
    } else {
      await addProfile(name);
    }
    closeOverlay('profileFormOverlay');
  }
));

document.getElementById('deleteProfileBtn').addEventListener('click', () => {
  const id = document.getElementById('profileId').value;
  if (!id) return;
  const ok = confirm('¿Archivar este presupuesto? Deja de aparecer en el selector, pero su histórico se conserva. Si es el activo, cambia a otro primero.');
  if (!ok) return;
  withBusy(
    () => document.getElementById('deleteProfileBtn'),
    async () => {
      await archiveProfile(id);
      closeOverlay('profileFormOverlay');
    }
  )();
});

// --- Ingreso mensual ---

document.getElementById('summaryCard').addEventListener('click', (e) => {
  if (e.target.id !== 'editIncomeBtn') return;
  const monthKey = getActiveMonth();
  const month = getData().months[monthKey];
  document.getElementById('incomeAmount').value = month?.income.amount || 0;
  openOverlay('incomeFormOverlay');
});

document.getElementById('incomeForm').addEventListener('submit', withBusy(
  submitButtonOf('incomeForm'),
  async (e) => {
    e.preventDefault();
    await setIncome(getActiveMonth(), document.getElementById('incomeAmount').value);
    closeOverlay('incomeFormOverlay');
  }
));

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

document.getElementById('categoryForm').addEventListener('submit', withBusy(
  submitButtonOf('categoryForm'),
  async (e) => {
    e.preventDefault();
    const id = document.getElementById('categoryId').value;
    const payload = {
      name: document.getElementById('categoryName').value,
      icon: document.getElementById('categoryIcon').value,
      color: document.getElementById('categoryColor').value,
      budget: document.getElementById('categoryBudget').value
    };
    if (id) {
      await updateCategory(id, payload);
    } else {
      await addCategory(payload);
    }
    closeOverlay('categoryFormOverlay');
  }
));

document.getElementById('deleteCategoryBtn').addEventListener('click', () => {
  const id = document.getElementById('categoryId').value;
  if (!id) return;
  const ok = confirm('¿Eliminar esta categoría? Se archivará: dejará de aparecer para nuevos gastos, pero su histórico se conserva.');
  if (!ok) return;
  withBusy(
    () => document.getElementById('deleteCategoryBtn'),
    async () => {
      await archiveCategory(id);
      closeOverlay('categoryFormOverlay');
    }
  )();
});

// --- Gastos: alta, edición y borrado ---

document.getElementById('fabAddExpense').addEventListener('click', () => {
  document.getElementById('expenseForm').reset();
  document.getElementById('expenseFormTitle').textContent = 'Nuevo gasto';
  document.getElementById('expenseId').value = '';
  document.getElementById('expenseDate').value = toDateInputValue();
  openOverlay('expenseFormOverlay');
});

document.getElementById('expenseForm').addEventListener('submit', withBusy(
  submitButtonOf('expenseForm'),
  async (e) => {
    e.preventDefault();
    const categoryId = document.getElementById('expenseCategory').value;
    if (!categoryId) {
      alert('Primero crea una categoría para poder registrar gastos.');
      return;
    }
    const id = document.getElementById('expenseId').value;
    const payload = {
      categoryId,
      amount: document.getElementById('expenseAmount').value,
      note: document.getElementById('expenseNote').value,
      date: document.getElementById('expenseDate').value
    };
    if (id) {
      await updateTransaction(getActiveMonth(), id, payload);
    } else {
      await addTransaction(getActiveMonth(), payload);
    }
    closeOverlay('expenseFormOverlay');
  }
));

document.getElementById('transactionsList').addEventListener('click', (e) => {
  const editBtn = e.target.closest('.edit-transaction');
  if (editBtn) {
    const month = getData().months[getActiveMonth()];
    const txn = month?.transactions.find(t => t.id === editBtn.dataset.id);
    if (!txn) return;

    document.getElementById('expenseFormTitle').textContent = 'Editar gasto';
    document.getElementById('expenseId').value = txn.id;
    document.getElementById('expenseAmount').value = txn.amount;
    document.getElementById('expenseCategory').value = txn.categoryId;
    document.getElementById('expenseDate').value = toDateInputValue(txn.date);
    document.getElementById('expenseNote').value = txn.note || '';
    openOverlay('expenseFormOverlay');
    return;
  }

  const deleteBtn = e.target.closest('.delete-transaction');
  if (!deleteBtn) return;
  if (!confirm('¿Eliminar este gasto? El monto volverá al saldo disponible de su categoría.')) return;
  withBusy(
    () => deleteBtn,
    async () => { await deleteTransaction(getActiveMonth(), deleteBtn.dataset.id); }
  )();
});

// --- Importación única de datos heredados (localStorage -> servidor) ---
//
// El estado de "ya importado" vive en el servidor (`settings.legacy_import_at`,
// vía GET /api/import/legacy/status), nunca en una bandera local nueva: así
// sobrevive a un cambio de navegador y no se puede perder junto con la
// bandera de localStorage que reemplaza (design.md "Sequence: Legacy Data
// Import").
function renderImportSummary(banner, summary) {
  banner.innerHTML = `
    <p>Importación completa: ${summary.imported.categories} categorías, ${summary.imported.months} meses,
      ${summary.imported.budgets} presupuestos, ${summary.imported.transactions} gastos.</p>
    <button type="button" class="btn-link" id="dismissImportBanner">Cerrar</button>
  `;
  document.getElementById('dismissImportBanner').addEventListener('click', () => banner.remove());
}

function showImportBanner() {
  const banner = document.createElement('div');
  banner.id = 'legacyImportBanner';
  banner.className = 'import-banner';
  banner.innerHTML = `
    <p>Detectamos datos guardados en este navegador de una versión anterior. ¿Quieres importarlos al nuevo servidor?</p>
    <button type="button" class="btn-primary" id="importLegacyBtn">Importar mis datos</button>
  `;
  document.getElementById('app').prepend(banner);

  document.getElementById('importLegacyBtn').addEventListener('click', withBusy(
    () => document.getElementById('importLegacyBtn'),
    async () => {
      const legacyData = loadData();
      const summary = await importLegacy(legacyData);
      await bootstrap();
      renderImportSummary(banner, summary);
    }
  ));
}

async function checkLegacyImport() {
  try {
    const status = await getImportStatus();
    if (status.imported) return;
    if (!localStorage.getItem(STORAGE_KEY)) return;
    showImportBanner();
  } catch (err) {
    // No bloquea el arranque de la app: si la verificación falla, esta
    // sesión simplemente no ofrece el banner de importación.
    console.error('No se pudo verificar el estado de importación de datos heredados.', err);
  }
}

// --- Arranque ---

(async () => {
  await bootstrap();
  renderApp();
  await checkLegacyImport();
})();
