// Frontera de datos heredados: este módulo era el único responsable de
// leer/escribir localStorage. Desde server-persistence, el servidor
// (Express + Postgres) es la fuente de verdad y este módulo queda
// SOLO DE LECTURA — existe únicamente para que el banner de importación
// de main.js pueda leer los datos previos a la migración una sola vez.
// `defaultData()` también sirve como fábrica de forma para el cache de
// src/state.js (design.md "Frontend Migration Path").

export const STORAGE_KEY = 'budgetpwa_data_v1';

export function defaultData() {
  return {
    version: 1,
    settings: {
      currency: 'USD',
      activeMonth: null, // se asigna al mes actual la primera vez que corre la app
      activeProfile: null // lo resuelve el servidor; nunca se infiere en el cliente
    },
    categories: [],
    months: {},
    profiles: []
  };
}

export function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.version) return defaultData();
    return parsed;
  } catch (err) {
    console.error('No se pudieron leer los datos guardados localmente.', err);
    return defaultData();
  }
}
