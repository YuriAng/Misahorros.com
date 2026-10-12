// Task 7.5 — Derived-balance invariant: no persisted `spent`/`remaining`/
// `total_*`/`available` column exists anywhere in the migrated schema
// (design.md "Derived-balance invariant"; specs/budget-persistence
// "Schema has no spent/remaining columns").
//
// `balance` and friends are added by the savings-investment-funds change: a
// fund balance is SUM(deposits) - SUM(withdrawals) at read time, never a
// column. The original list predated funds and omitted every name a stored
// fund balance would plausibly use, so the invariant was documented but not
// enforceable for this entity.
import { describe, it, expect, afterAll } from 'vitest';
import db from '../../server/db.js';
import { closeDb } from './support.js';

afterAll(closeDb);

const FORBIDDEN_COLUMN_NAMES = [
  'spent',
  'remaining',
  'total_spent',
  'total_budgeted',
  'total_available',
  'available',
  'balance',
  'fund_balance',
  'total_deposited',
  'total_withdrawn',
];

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
      [
        'budget_profiles',
        'categories',
        'category_budgets',
        'fund_movements',
        'funds',
        'months',
        'settings',
        'transactions',
      ].sort()
    );
  });
});
