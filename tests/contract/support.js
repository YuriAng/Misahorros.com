// Shared helpers for contract tests. Imported by every `tests/contract/*`
// file so they all share the single `server/db.js` Knex instance created
// within their own Vitest module context (Vitest isolates each test file
// into its own module graph, so this is one pool per file, not global).
import db from '../../server/db.js';

export const DEFAULT_PROFILE_ID = 'prof_default';
export const DEFAULT_PROFILE_NAME = 'General';

// All 6 tables in one statement (CASCADE), so FK RESTRICT constraints
// between them never block the truncate regardless of order. Reseeds the
// single default profile + `settings.active_profile` immediately after,
// mirroring exactly what migration 002 leaves behind on a real database —
// every contract test's baseline is "the migration has just run", never an
// empty budget_profiles table (budget-profiles spec: "the server MUST NOT
// rely on runtime fallback logic for an unset value").
export async function resetDb() {
  await db.raw(
    'TRUNCATE TABLE transactions, category_budgets, months, categories, settings, budget_profiles RESTART IDENTITY CASCADE'
  );
  await db('budget_profiles').insert({ id: DEFAULT_PROFILE_ID, name: DEFAULT_PROFILE_NAME });
  await db('settings').insert({ key: 'active_profile', value: DEFAULT_PROFILE_ID });
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
    profile_id: overrides.profileId || DEFAULT_PROFILE_ID,
    name: overrides.name || 'Groceries',
    icon: overrides.icon || '🛒',
    color: overrides.color || '#4F8EF7',
    archived: overrides.archived || false,
  };
  await db('categories').insert(row);
  return row;
}

// Bypasses PUT /api/profiles/active (not implemented until Phase 4) by
// writing settings.active_profile directly — the same source of truth
// requireActiveProfile reads from (budget-profiles spec, "Server-Resolved
// Active Profile").
export async function setActiveProfile(profileId) {
  await db('settings').where({ key: 'active_profile' }).update({ value: profileId });
}
