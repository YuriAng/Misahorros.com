// Modelo de datos y "lógica de negocio": todo cálculo de saldos vive aquí,
// nunca en el HTML/render. Los saldos SIEMPRE se derivan (nunca se guardan),
// para que nunca queden desincronizados de las transacciones reales.
//
// Desde server-persistence: las ESCRITURAS son async (pasan por src/api.js
// hacia el servidor) y las LECTURAS siguen siendo síncronas sobre un cache
// en memoria (`cache`) con la misma forma que `defaultData()`, para que
// src/render.js NO necesite cambiar (design.md "Frontend Migration Path").

import * as api from './api.js';
import { defaultData } from './storage.js';
import { getMonthKey } from './utils.js';

let cache = defaultData();

// Mes vacío congelado: lo que ve cualquier lectura sobre un mes que el
// cache todavía no cargó. Nunca crea nada ni llama a la red — reemplaza a
// `ensureMonth` en TODOS los caminos de lectura (Bug Fix A aplicado también
// del lado del cliente: leer jamás debe mutar ni disparar un fetch).
const EMPTY_MONTH = Object.freeze({
  income: Object.freeze({ amount: 0, updatedAt: null }),
  budgets: Object.freeze({}),
  transactions: Object.freeze([]),
  fundMovements: Object.freeze([]),
  materialized: false,
  carryForward: Object.freeze({ available: false, sourceMonth: null })
});

function readMonth(monthKey) {
  return cache.months[monthKey] || EMPTY_MONTH;
}

// Crea (si falta) la entrada mutable del mes en el cache local, para que
// una escritura tenga dónde fusionar la respuesta del servidor. A
// diferencia de la vieja `ensureMonth`, esto NUNCA se llama desde una
// lectura ni dispara una petición de red por sí sola.
function ensureCacheMonth(monthKey) {
  if (!cache.months[monthKey]) {
    cache.months[monthKey] = {
      income: { amount: 0, updatedAt: null },
      budgets: {},
      transactions: [],
      fundMovements: [],
      materialized: false,
      carryForward: { available: false, sourceMonth: null }
    };
  }
  return cache.months[monthKey];
}

function monthFromPayload(payload) {
  return {
    income: { ...payload.income },
    budgets: { ...payload.budgets },
    transactions: payload.transactions.map(t => ({ ...t })),
    fundMovements: (payload.fundMovements || []).map(m => ({ ...m })),
    materialized: payload.materialized,
    carryForward: { ...payload.carryForward }
  };
}

// Llena el cache desde el servidor. Debe llamarse UNA vez al arrancar,
// antes del primer renderApp() (ver main.js: `await bootstrap(); renderApp();`).
export async function bootstrap() {
  const initial = await api.getBootstrap();
  cache.settings = { ...initial.settings };
  cache.categories = initial.categories.map(c => ({ ...c }));
  cache.profiles = initial.profiles.map(p => ({ ...p }));
  cache.funds = initial.funds.map(f => ({ ...f }));

  // Primera vez que corre la app contra este servidor: no hay mes activo
  // todavía. Se fija al mes actual localmente y se persiste, igual que el
  // comportamiento original (antes escrito directo a localStorage).
  if (!cache.settings.activeMonth) {
    const monthKey = getMonthKey();
    cache.settings.activeMonth = monthKey;
    await api.updateSettings({ activeMonth: monthKey });
  }

  const monthKey = cache.settings.activeMonth;
  const monthPayload =
    initial.month && initial.month.monthKey === monthKey ? initial.month : await api.getMonth(monthKey);

  cache.months[monthKey] = monthFromPayload(monthPayload);
}

export function getData() {
  return cache;
}

export function getActiveMonth() {
  return cache.settings.activeMonth;
}

export async function setActiveMonth(monthKey) {
  if (!cache.months[monthKey]) {
    const monthPayload = await api.getMonth(monthKey);
    cache.months[monthKey] = monthFromPayload(monthPayload);
  }
  await api.updateSettings({ activeMonth: monthKey });
  cache.settings.activeMonth = monthKey;
}

export async function setIncome(monthKey, amount) {
  const result = await api.putIncome(monthKey, amount);
  const month = ensureCacheMonth(monthKey);
  month.income = { amount: result.amount, updatedAt: result.updatedAt };
}

// Expone si el mes activo puede copiar ingreso y presupuestos del mes
// anterior (solo cuando el mes aún no fue materializado — ver
// server/services/months.js:getMonthPayload, campo `carryForward`).
export function getCarryForwardInfo(monthKey) {
  return readMonth(monthKey).carryForward;
}

// Copia ingreso y presupuestos del mes anterior hacia `monthKey` (server-side,
// vía POST /months/:monthKey/carry-forward) y refresca el cache con el
// resultado completo, para que quede editable igual que cualquier otro mes.
export async function applyCarryForward(monthKey) {
  await api.carryForward(monthKey);
  const monthPayload = await api.getMonth(monthKey);
  cache.months[monthKey] = monthFromPayload(monthPayload);
}

export async function addCategory({ name, icon, color, budget }) {
  const monthKey = cache.settings.activeMonth;
  const created = await api.createCategory({ name, icon, color, budget, monthKey });
  cache.categories.push(created);
  if (budget != null) {
    const month = ensureCacheMonth(monthKey);
    month.budgets[created.id] = Number(budget) || 0;
  }
  return created.id;
}

export async function updateCategory(id, { name, icon, color, budget }) {
  const monthKey = cache.settings.activeMonth;
  const payload = { name, icon, color };
  if (budget != null) {
    payload.budget = budget;
    payload.monthKey = monthKey;
  }
  const updated = await api.patchCategory(id, payload);
  const idx = cache.categories.findIndex(c => c.id === id);
  if (idx !== -1) cache.categories[idx] = updated;
  if (budget != null) {
    const month = ensureCacheMonth(monthKey);
    month.budgets[id] = Number(budget) || 0;
  }
}

// No se borra físicamente: se archiva, así el histórico de meses pasados
// (transacciones y presupuestos ya registrados) permanece intacto.
export async function archiveCategory(id) {
  const updated = await api.patchCategory(id, { archived: true });
  const idx = cache.categories.findIndex(c => c.id === id);
  if (idx !== -1) cache.categories[idx] = updated;
}

export function getActiveCategories() {
  return cache.categories.filter(c => !c.archived);
}

// --- Presupuestos (profiles) ---

export function getProfiles() {
  return cache.profiles.filter(p => !p.archived);
}

export function getActiveProfile() {
  return cache.profiles.find(p => p.id === cache.settings.activeProfile) || null;
}

export async function addProfile(name) {
  const created = await api.createProfile({ name });
  cache.profiles.push(created);
  return created;
}

export async function renameProfile(id, name) {
  const updated = await api.renameProfile(id, name);
  const idx = cache.profiles.findIndex(p => p.id === id);
  if (idx !== -1) cache.profiles[idx] = updated;
  return updated;
}

// No se borra físicamente: se archiva (mismo criterio que archiveCategory).
export async function archiveProfile(id) {
  await api.archiveProfile(id);
  const idx = cache.profiles.findIndex(p => p.id === id);
  if (idx !== -1) cache.profiles[idx] = { ...cache.profiles[idx], archived: true };
}

// El ÚNICO lugar donde el cache se reemplaza por completo (design.md
// "Decision: Client cache is reset on switch, not keyed by profile"):
// nunca una fusión, para que una fila del perfil anterior sea
// IRREPRESENTABLE en el cache después del cambio, igual que la garantía de
// FK compuesta del lado del servidor.
export async function setActiveProfile(profileId) {
  const payload = await api.setActiveProfile(profileId);
  cache.settings = { ...payload.settings };
  cache.profiles = payload.profiles.map(p => ({ ...p }));
  cache.categories = payload.categories.map(c => ({ ...c }));
  // CRITICAL CACHE-LEAK FIX: cache.funds is a flat array, replaced
  // wholesale exactly like cache.categories/cache.profiles above — never a
  // merge — so a fund (and its balance) from the profile just left behind
  // is unrepresentable afterward, same guarantee as cache.months below.
  cache.funds = payload.funds.map(f => ({ ...f }));
  cache.months = {};
  if (payload.month) cache.months[payload.month.monthKey] = monthFromPayload(payload.month);
}

// `monthKey` se acepta por compatibilidad con el llamador (siempre el mes
// activo mostrado en pantalla), pero el servidor SIEMPRE deriva el mes real
// de la transacción a partir de su `date` (Bug Fix B) — nunca del mes que
// el usuario está viendo. Por eso el resultado puede terminar en un mes
// distinto de `monthKey`, y es al mes devuelto (`created.monthKey`) al que
// se agrega en el cache.
export async function addTransaction(monthKey, { categoryId, amount, note, date }) {
  const created = await api.createTransaction({ categoryId, amount, note, date });
  const month = ensureCacheMonth(created.monthKey);
  const txn = {
    id: created.id,
    categoryId: created.categoryId,
    amount: created.amount,
    note: created.note,
    date: created.date
  };
  month.transactions.unshift(txn);
  return txn;
}

// El PUT puede mover la transacción a otro mes si `date` cambia de mes
// (el servidor recalcula `monthKey` a partir de la fecha, igual que en la
// creación). Por eso se retira del mes de origen (`monthKey`, el que se ve
// en pantalla) y se inserta en el mes que el servidor devuelva.
export async function updateTransaction(monthKey, txnId, { categoryId, amount, note, date }) {
  const updated = await api.updateTransaction(txnId, { categoryId, amount, note, date });

  const sourceMonth = cache.months[monthKey];
  if (sourceMonth) {
    sourceMonth.transactions = sourceMonth.transactions.filter(t => t.id !== txnId);
  }

  const targetMonth = ensureCacheMonth(updated.monthKey);
  targetMonth.transactions.unshift({
    id: updated.id,
    categoryId: updated.categoryId,
    amount: updated.amount,
    note: updated.note,
    date: updated.date
  });

  return updated;
}

export async function deleteTransaction(monthKey, txnId) {
  await api.deleteTransaction(txnId);
  const month = cache.months[monthKey];
  if (month) {
    month.transactions = month.transactions.filter(t => t.id !== txnId);
  }
}

// --- Fondos de ahorro/inversión ---

export function getFunds() {
  return cache.funds.filter(f => !f.archived);
}

// El saldo lo DERIVA el servidor (todo el histórico), porque el cache del
// cliente es por mes y no puede sumar meses que nunca cargó. No se
// almacena en ninguna columna: se recalcula en cada lectura, server-side.
export function getFundBalance(fundId) {
  const fund = cache.funds.find(f => f.id === fundId);
  return fund ? fund.balance : 0;
}

// Movimientos del mes dado para un fondo dado, para pintar la tarjeta.
export function getFundMonthMovements(monthKey, fundId) {
  return readMonth(monthKey).fundMovements.filter(m => m.fundId === fundId);
}

export async function addFund(name) {
  const created = await api.createFund({ name });
  cache.funds.push(created);
  return created;
}

export async function renameFund(id, name) {
  const updated = await api.renameFund(id, name);
  const idx = cache.funds.findIndex(f => f.id === id);
  if (idx !== -1) cache.funds[idx] = updated;
  return updated;
}

// No se borra físicamente: se archiva. El servidor RECHAZA (409
// fund_has_balance) archivar un fondo con saldo — ese dinero existe y no se
// arrastra al mes siguiente, así que quedaría invisible para siempre.
export async function archiveFund(id) {
  await api.archiveFund(id);
  const idx = cache.funds.findIndex(f => f.id === id);
  if (idx !== -1) cache.funds[idx] = { ...cache.funds[idx], archived: true };
}

// `monthKey` NO se envía: el servidor deriva el mes real del `date` del
// movimiento (Bug Fix B), igual que addTransaction. Por eso el movimiento
// puede caer en un mes distinto del que se ve en pantalla, y es al mes
// devuelto (`movement.monthKey`) al que se agrega en el cache.
export async function addFundMovement(fundId, { type, amount, note, date }) {
  const { movement, balance } = await api.createFundMovement(fundId, { type, amount, note, date });
  const idx = cache.funds.findIndex(f => f.id === fundId);
  if (idx !== -1) cache.funds[idx] = { ...cache.funds[idx], balance };
  const month = ensureCacheMonth(movement.monthKey);
  month.fundMovements.unshift({
    id: movement.id,
    fundId: movement.fundId,
    type: movement.type,
    amount: movement.amount,
    note: movement.note,
    date: movement.date
  });
  return movement;
}

// --- Cálculos derivados ---
// Cuerpos EXACTAMENTE iguales a la versión anterior a esta migración, con
// el único cambio de `ensureMonth` -> `readMonth`: siguen siendo funciones
// puras y síncronas, por eso los tests unitarios existentes no cambian
// (design.md "Frontend Migration Path").

export function getCategorySpent(monthKey, categoryId) {
  const month = readMonth(monthKey);
  return month.transactions
    .filter(t => t.categoryId === categoryId)
    .reduce((sum, t) => sum + t.amount, 0);
}

export function getCategoryBudget(monthKey, categoryId) {
  const month = readMonth(monthKey);
  return month.budgets[categoryId] || 0;
}

export function getCategoryRemaining(monthKey, categoryId) {
  return getCategoryBudget(monthKey, categoryId) - getCategorySpent(monthKey, categoryId);
}

export function getMonthTotals(monthKey) {
  const month = readMonth(monthKey);
  const income = month.income.amount;
  const totalBudgeted = Object.values(month.budgets).reduce((sum, v) => sum + v, 0);
  const totalSpent = month.transactions.reduce((sum, t) => sum + t.amount, 0);

  // `|| []` protege a un mes cacheado por una versión anterior del
  // cliente: una función pura de lectura nunca debe lanzar. Mismo reduce
  // que server/services/months.js:getMonthPayload() sobre las MISMAS
  // filas, para que la paridad sea estructural y no una coincidencia que
  // un test atrape (design.md "one row query reduced in JS, not a second
  // SQL aggregate").
  const movements = month.fundMovements || [];
  let fundDeposits = 0;
  let fundWithdrawals = 0;
  for (const movement of movements) {
    if (movement.type === 'deposit') fundDeposits += movement.amount;
    else fundWithdrawals += movement.amount;
  }

  return {
    income,
    totalBudgeted,
    totalSpent,
    fundDeposits,
    fundWithdrawals,
    // Un depósito mueve dinero FUERA de lo disponible este mes; un retiro
    // lo trae de vuelta — por eso el depósito resta y el retiro suma
    // (design.md "Decision: totals gains two gross terms; totalAvailable
    // keeps its name").
    totalAvailable: income - totalSpent - fundDeposits + fundWithdrawals
  };
}
