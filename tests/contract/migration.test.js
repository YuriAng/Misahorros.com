// Contract tests (tasks 1.1, 1.2): server/migrations/002_budget_profiles.js.
// Exercises the migration directly through Knex's migrate API — rolling
// `db` back to the `001` shape, seeding pre-migration data, then replaying
// `002` — rather than through the HTTP layer, because the routes are not
// profile-aware yet at this point in the phased rollout (Phase 3/4).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import db from '../../server/db.js';
import { closeDb } from './support.js';

const DEFAULT_PROFILE_ID = 'prof_default';
const DEFAULT_PROFILE_NAME = 'General';
const BACKFILLED_TABLES = ['categories', 'months', 'category_budgets', 'transactions'];

async function tableCounts() {
  const result = {};
  for (const table of BACKFILLED_TABLES) {
    const [{ count }] = await db(table).count({ count: '*' });
    result[table] = Number(count);
  }
  return result;
}

// Restores the baseline every other contract test file expects: schema at
// latest (002 applied), every table empty, exactly one default profile, and
// `settings.active_profile` pointing at it.
async function restoreCleanLatestState() {
  const migrations = await db.migrate.list();
  const pendingDown = migrations[1].length > 0; // [completed, pending]
  if (pendingDown) {
    await db.migrate.latest();
  }
  await db.raw(
    'TRUNCATE TABLE transactions, category_budgets, months, categories, settings, budget_profiles RESTART IDENTITY CASCADE'
  );
  await db('budget_profiles').insert({ id: DEFAULT_PROFILE_ID, name: DEFAULT_PROFILE_NAME });
  await db('settings').insert({ key: 'active_profile', value: DEFAULT_PROFILE_ID });
}

describe('server/migrations/002_budget_profiles.js', () => {
  // Other contract test files (e.g. isolation.test.js, profiles.test.js)
  // truncate in their OWN beforeEach but never after their last test, so
  // whatever they last left behind is still sitting in the shared physical
  // Postgres when this file's turn comes up (fileParallelism: false runs
  // files sequentially, not isolated). This suite manipulates the schema
  // itself, so it cannot tolerate arbitrary leftover rows/tables — force a
  // known-clean starting point once, up front.
  beforeAll(restoreCleanLatestState);

  afterAll(async () => {
    await restoreCleanLatestState();
    await closeDb();
  });

  it('backfills existing 001-shape data into the default profile with zero loss (task 1.1)', async () => {
    // Roll back to the 001 shape so we can seed data the way a pre-migration
    // production database would actually hold it (no profile_id anywhere).
    await db.migrate.down();

    await db('categories').insert([
      { id: 'cat_a', name: 'Food' },
      { id: 'cat_b', name: 'Rent' },
    ]);
    await db('months').insert([
      { month_key: '2026-01', income_amount: 1000 },
      { month_key: '2026-02', income_amount: 1200 },
    ]);
    await db('category_budgets').insert([{ month_key: '2026-01', category_id: 'cat_a', amount: 300 }]);
    await db('transactions').insert([
      { id: 'txn_a', month_key: '2026-01', category_id: 'cat_a', amount: 50, date: new Date('2026-01-05T12:00:00Z') },
      { id: 'txn_b', month_key: '2026-01', category_id: 'cat_b', amount: 500, date: new Date('2026-01-06T12:00:00Z') },
    ]);

    const before = await tableCounts();
    expect(before).toEqual({ categories: 2, months: 2, category_budgets: 1, transactions: 2 });

    await db.migrate.up();

    const after = await tableCounts();
    expect(after).toEqual(before);

    const profiles = await db('budget_profiles');
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      id: DEFAULT_PROFILE_ID,
      name: DEFAULT_PROFILE_NAME,
      archived: false,
    });

    for (const table of BACKFILLED_TABLES) {
      const rows = await db(table);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.profile_id === DEFAULT_PROFILE_ID)).toBe(true);
    }

    const activeProfileSetting = await db('settings').where({ key: 'active_profile' }).first();
    expect(activeProfileSetting).toBeDefined();
    expect(activeProfileSetting.value).toBe(DEFAULT_PROFILE_ID);
  });

  it('down() succeeds and restores the 001 shape when only the default profile owns data (task 1.2)', async () => {
    // Precondition: previous test left latest schema with all data under
    // prof_default. Confirm that precondition explicitly for this test's
    // own clarity rather than relying on execution order.
    const nonDefaultBefore = await db('categories').whereNot('profile_id', DEFAULT_PROFILE_ID).count();
    expect(Number(nonDefaultBefore[0].count)).toBe(0);

    const rowCountsBefore = await tableCounts();

    await db.migrate.down();

    const { rows: columnRows } = await db.raw(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name = 'profile_id'`
    );
    expect(columnRows).toEqual([]);

    const { rows: tableRows } = await db.raw(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'budget_profiles'`
    );
    expect(tableRows).toEqual([]);

    // down() must not touch the underlying rows themselves, only the
    // profile_id column and the budget_profiles table.
    const rowCountsAfter = {};
    for (const table of BACKFILLED_TABLES) {
      const [{ count }] = await db(table).count({ count: '*' });
      rowCountsAfter[table] = Number(count);
    }
    expect(rowCountsAfter).toEqual(rowCountsBefore);

    // Re-apply so the rest of the suite (and the next test in this file)
    // sees the latest schema again.
    await db.migrate.up();
  });

  it('down() throws once a second profile owns rows, leaving the schema unchanged (task 1.2)', async () => {
    await restoreCleanLatestState();
    await db('categories').insert({ id: 'cat_a', name: 'Food', profile_id: DEFAULT_PROFILE_ID });

    await db('budget_profiles').insert({ id: 'prof_other', name: 'Negocio' });
    await db('categories').insert({ id: 'cat_other', name: 'Marketing', profile_id: 'prof_other' });

    await expect(db.migrate.down()).rejects.toThrow(/non-default profile/);

    // Refusal must be loud AND leave the schema exactly as it was — the
    // profile_id column and budget_profiles table must still exist.
    const { rows: columnRows } = await db.raw(
      `SELECT table_name FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name = 'profile_id' AND table_name = 'categories'`
    );
    expect(columnRows).toHaveLength(1);
    expect(await db('budget_profiles')).toHaveLength(2);
  });

  // budget-persistence spec, "Applying migrations to a fresh database".
  it('applying to a fresh (empty) database creates the default profile with zero rows to backfill', async () => {
    await restoreCleanLatestState(); // all 4 tables empty, one default profile
    await db.migrate.down();
    await db.migrate.up();

    const profiles = await db('budget_profiles');
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ id: DEFAULT_PROFILE_ID, name: DEFAULT_PROFILE_NAME, archived: false });

    for (const table of BACKFILLED_TABLES) {
      expect(await db(table)).toHaveLength(0);
    }

    const activeProfileSetting = await db('settings').where({ key: 'active_profile' }).first();
    expect(activeProfileSetting.value).toBe(DEFAULT_PROFILE_ID);
  });
});
