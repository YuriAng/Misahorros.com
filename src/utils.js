// Utilidades puras: ids, manejo de meses y formato. Sin dependencias del DOM.

export function generateId(prefix = 'id') {
  const rand = (crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));
  return `${prefix}_${rand}`;
}

export function getMonthKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function shiftMonthKey(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, (m - 1) + delta, 1);
  return getMonthKey(d);
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export function formatMonthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function formatCurrency(amount, currency = 'USD') {
  const value = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat('es-VE', { style: 'currency', currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}
