// Task 7.5 — Derived-balance invariant: no persisted `spent`/`remaining`/
// `total_*`/`available` column exists anywhere in the migrated schema
// (design.md "Derived-balance invariant"; specs/budget-persistence
// "Schema has no spent/remaining columns").
import { describe, it, expect, afterAll } from 'vitest';
import db from '../../server/db.js';
import { closeDb } from './support.js';

afterAll(closeDb);

const FORBIDDEN_COLUMN_NAMES = ['spent', 'remaining', 'total_spent', 'total_budgeted', 'total_available', 'available'];

describe('information_schema invariant: no derived-balance column exists', () => {
  it('finds zero matching columns across the whole public schema', async () => {
    const { rows } = await db.raw(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name = ANY(?)`,
      [FORBIDDEN_COLUMN_NAMES]
    );
    expect(rows).toEqual([]);
  });

  it('confirms the expected tables and columns still exist (sanity check on the query itself)', async () => {
    const { rows } = await db.raw(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );
    const tableNames = rows.map((r) => r.table_name).filter((name) => name !== 'knex_migrations' && name !== 'knex_migrations_lock');
    expect(tableNames.sort()).toEqual(
      ['categories', 'category_budgets', 'months', 'settings', 'transactions'].sort()
    );
  });
});
