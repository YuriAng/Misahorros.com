// Thin fetch client for the Express `/api/*` contract (design.md "REST API
// Contract"). Every method returns parsed JSON on success and throws
// `ApiError` on any non-2xx response or network failure — no silent
// catches, so a caller always knows a write did not happen.

export class ApiError extends Error {
  constructor(status, code, message, field) {
    super(message || `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

async function request(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (err) {
    throw new ApiError(0, 'network_error', 'No se pudo conectar con el servidor.');
  }

  if (response.status === 204) return null;

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const error = (data && data.error) || {};
    throw new ApiError(
      response.status,
      error.code || 'unknown_error',
      error.message || 'Error inesperado del servidor.',
      error.field
    );
  }

  return data;
}

// --- health / bootstrap ---

export function getHealth() {
  return request('/health');
}

export function getBootstrap(monthKey) {
  const qs = monthKey ? `?month=${encodeURIComponent(monthKey)}` : '';
  return request(`/bootstrap${qs}`);
}

// --- settings ---

export function getSettings() {
  return request('/settings');
}

export function updateSettings(payload) {
  return request('/settings', { method: 'PUT', body: payload });
}

// --- categories ---

export function getCategories() {
  return request('/categories');
}

export function createCategory(payload) {
  return request('/categories', { method: 'POST', body: payload });
}

export function patchCategory(id, payload) {
  return request(`/categories/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload });
}

// --- months ---

export function getMonth(monthKey) {
  return request(`/months/${encodeURIComponent(monthKey)}`);
}

export function putIncome(monthKey, amount) {
  return request(`/months/${encodeURIComponent(monthKey)}/income`, {
    method: 'PUT',
    body: { amount }
  });
}

export function putBudget(monthKey, categoryId, amount) {
  return request(`/months/${encodeURIComponent(monthKey)}/budgets/${encodeURIComponent(categoryId)}`, {
    method: 'PUT',
    body: { amount }
  });
}

export function carryForward(monthKey) {
  return request(`/months/${encodeURIComponent(monthKey)}/carry-forward`, { method: 'POST' });
}

// --- transactions ---

export function createTransaction(payload) {
  return request('/transactions', { method: 'POST', body: payload });
}

export function updateTransaction(id, payload) {
  return request(`/transactions/${encodeURIComponent(id)}`, { method: 'PUT', body: payload });
}

export function deleteTransaction(id) {
  return request(`/transactions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// --- legacy import ---

export function getImportStatus() {
  return request('/import/legacy/status');
}

export function importLegacy(payload) {
  return request('/import/legacy', { method: 'POST', body: payload });
}
