// Capa de persistencia: única responsable de leer/escribir localStorage.
// Si en el futuro migras a IndexedDB o a un backend, solo este archivo cambia.

const STORAGE_KEY = 'budgetpwa_data_v1';

function defaultData() {
  return {
    version: 1,
    settings: {
      currency: 'USD',
      activeMonth: null // se asigna al mes actual la primera vez que corre la app
    },
    categories: [],
    months: {}
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
    console.error('No se pudieron leer los datos guardados; se reinicia el almacenamiento.', err);
    return defaultData();
  }
}

export function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    // Puede fallar si el dispositivo está sin espacio o en modo privado estricto.
    console.error('No se pudo guardar en localStorage.', err);
  }
}
