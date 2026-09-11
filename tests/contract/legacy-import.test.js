// Contract tests (task 4.9/4.10): POST /api/import/legacy targets the
// default profile unconditionally (specs/legacy-data-import: "Import
// Targets the Default Profile"). This is a distinct concern from
// import.test.js's payload-shape coverage — these tests exist specifically
// to prove the import endpoint ignores the currently active profile.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../server/index.js';
import db from '../../server/db.js';
import { resetDb, closeDb, DEFAULT_PROFILE_ID } from './support.js';

beforeEach(resetDb);
afterAll(closeDb);

function legacyFixture() {
  return {
    categories: [{ id: 'cat_food0001', name: 'Food', icon: '🍔', color: '#ff0000', archived: false }],
    months: {
      '2026-01': {
        income: { amount: 1000, updatedAt: '2026-01-01T00:00:00.000Z' },
        budgets: { cat_food0001: 300 },
        transactions: [
          { id: 'txn_aaa00001', categoryId: 'cat_food0001', amount: 50, note: 'groceries', date: '2026-01-05T12:00:00.000Z' },
        ],
      },
    },
  };
}

async function createAndActivateProfile(name) {
  const created = await request(app).post('/api/profiles').send({ name });
  const activated = await request(app).put('/api/profiles/active').send({ profileId: created.body.id });
  expect(activated.status).toBe(200);
  return created.body.id;
}

describe('POST /api/import/legacy — profile targeting', () => {
  // legacy-data-import spec: "Import while a different profile is active"
  it('creates every imported record under the default profile even while a different profile is active', async () => {
    const negocioId = await createAndActivateProfile('Negocio');

    const res = await request(app).post('/api/import/legacy').send(legacyFixture());
    expect(res.status).toBe(200);
    expect(res.body.imported).toEqual({ categories: 1, months: 1, budgets: 1, transactions: 1 });

    const [category] = await db('categories').where({ id: 'cat_food0001' });
    expect(category.profile_id).toBe(DEFAULT_PROFILE_ID);
    const [txn] = await db('transactions').where({ id: 'txn_aaa00001' });
    expect(txn.profile_id).toBe(DEFAULT_PROFILE_ID);
    const [month] = await db('months').where({ month_key: '2026-01', profile_id: DEFAULT_PROFILE_ID });
    expect(month).toBeDefined();
    const [budget] = await db('category_budgets').where({ month_key: '2026-01', category_id: 'cat_food0001' });
    expect(budget.profile_id).toBe(DEFAULT_PROFILE_ID);

    // "Negocio" — the profile that was active during import — sees none of it.
    expect(negocioId).not.toBe(DEFAULT_PROFILE_ID);
    const negocioCategories = await request(app).get('/api/categories');
    expect(negocioCategories.body).toEqual([]);
    const negocioMonth = await request(app).get('/api/months/2026-01');
    expect(negocioMonth.body.transactions).toEqual([]);
    expect(negocioMonth.body.materialized).toBe(false);
  });

  // legacy-data-import spec: "Idempotent import stays scoped to the default profile"
  it('running the import twice while a different profile is active still de-duplicates within the default profile only', async () => {
    await createAndActivateProfile('Negocio');

    const first = await request(app).post('/api/import/legacy').send(legacyFixture());
    expect(first.status).toBe(200);

    const second = await request(app).post('/api/import/legacy').send(legacyFixture());
    expect(second.status).toBe(200);
    expect(second.body.imported).toEqual({ categories: 0, months: 0, budgets: 0, transactions: 0 });
    expect(second.body.skipped).toEqual({ categories: 1, months: 1, budgets: 1, transactions: 1 });

    const categoryRows = await db('categories').where({ id: 'cat_food0001' });
    expect(categoryRows).toHaveLength(1);
    expect(categoryRows[0].profile_id).toBe(DEFAULT_PROFILE_ID);
  });
});
