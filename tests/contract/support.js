// Shared helpers for contract tests. Imported by every `tests/contract/*`
// file so they all share the single `server/db.js` Knex instance created
// within their own Vitest module context (Vitest isolates each test file
// into its own module graph, so this is one pool per file, not global).
import db from '../../server/db.js';

// All 5 tables in one statement (CASCADE), so FK RESTRICT constraints
// between them never block the truncate regardless of order.
export async function resetDb() {
  await db.raw(
    'TRUNCATE TABLE transactions, category_budgets, months, categories, settings RESTART IDENTITY CASCADE'
  );
}

export async function closeDb() {
  await db.destroy();
}

export async function monthsRowCount() {
  const { rows } = await db.raw('SELECT count(*)::int AS count FROM months');
  return rows[0].count;
}

export async function insertCategory(overrides = {}) {
  const row = {
    id: overrides.id || `cat_${Math.random().toString(16).slice(2, 10)}`,
    name: overrides.name || 'Groceries',
    icon: overrides.icon || '🛒',
    color: overrides.color || '#4F8EF7',
    archived: overrides.archived || false,
  };
  await db('categories').insert(row);
  return row;
}
