// Contract tests (tasks 3.1-3.3): cross-profile isolation on
// categories/months/transactions, and foreign-id mutations returning 404.
// budget-profiles spec: "Full Data Isolation Across Profiles",
// "Carry-Forward Stays Within the Active Profile". Phase 6 (task 6.1)
// extends this file into the complete per-endpoint matrix; this is the
// Phase 3 foundation slice.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../server/index.js';
import db from '../../server/db.js';
import { resetDb, closeDb, insertCategory, setActiveProfile, DEFAULT_PROFILE_ID } from './support.js';

beforeEach(resetDb);
afterAll(closeDb);

async function createProfile(name) {
  const res = await request(app).post('/api/profiles').send({ name });
  return res.body;
}

describe('Category isolation (task 3.1)', () => {
  it('GET /api/categories excludes categories from a non-active profile', async () => {
    const profileB = await createProfile('Negocio');
    await insertCategory({ id: 'cat_a1', name: 'Comida' }); // DEFAULT_PROFILE_ID
    await insertCategory({ id: 'cat_b1', name: 'Ventas', profileId: profileB.id });

    await setActiveProfile(profileB.id);
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    const ids = res.body.map((c) => c.id);
    expect(ids).toEqual(['cat_b1']);
    expect(ids).not.toContain('cat_a1');
  });
});

describe('Month/income/transaction isolation (task 3.2)', () => {
  it('GET /api/months/:monthKey reports zero income/spent for a non-active profile', async () => {
    const category = await insertCategory({ id: 'cat_a2', name: 'Comida' });
    await db('months').insert({ profile_id: DEFAULT_PROFILE_ID, month_key: '2026-06', income_amount: 1000 });
    await db('transactions').insert({
      id: 'txn_a2',
      profile_id: DEFAULT_PROFILE_ID,
      month_key: '2026-06',
      category_id: category.id,
      amount: 50,
      date: new Date('2026-06-05T12:00:00Z'),
    });

    const profileB = await createProfile('Negocio');
    await setActiveProfile(profileB.id);

    const res = await request(app).get('/api/months/2026-06');
    expect(res.status).toBe(200);
    expect(res.body.income.amount).toBe(0);
    expect(res.body.totals.totalSpent).toBe(0);
    expect(res.body.transactions).toEqual([]);
  });

  it('carry-forward only copies budgets from the active profile\'s own prior month', async () => {
    const category = await request(app).post('/api/categories').send({ name: 'Renta' });
    await request(app).put(`/api/months/2026-07/budgets/${category.body.id}`).send({ amount: 900 });

    const profileB = await createProfile('Negocio');
    await setActiveProfile(profileB.id);

    const res = await request(app).post('/api/months/2026-08/carry-forward');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ copiedFrom: null, income: 0, budgetCount: 0 });
  });
});

describe('Cross-profile category reference is rejected (task 3.2)', () => {
  it('POST /api/transactions with a categoryId from another profile responds 400', async () => {
    const profileB = await createProfile('Negocio');
    await insertCategory({ id: 'cat_foreign1', name: 'Ventas', profileId: profileB.id });

    const res = await request(app)
      .post('/api/transactions')
      .send({ categoryId: 'cat_foreign1', amount: 10, date: '2026-06-10T12:00:00.000Z' });
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe('categoryId');
  });
});

describe('Foreign-id mutations return 404, not 403 (task 3.3)', () => {
  it('PATCH /api/categories/{foreignId} returns 404 and does not mutate', async () => {
    const created = await request(app).post('/api/categories').send({ name: 'Comida' });

    const profileB = await createProfile('Negocio');
    await setActiveProfile(profileB.id);

    const res = await request(app).patch(`/api/categories/${created.body.id}`).send({ archived: true });
    expect(res.status).toBe(404);

    const row = await db('categories').where({ id: created.body.id }).first();
    expect(row.archived).toBe(false);
  });

  it('PUT /api/transactions/{foreignId} returns 404 and does not mutate', async () => {
    const category = await request(app).post('/api/categories').send({ name: 'Comida' });
    const txn = await request(app)
      .post('/api/transactions')
      .send({ categoryId: category.body.id, amount: 20, date: '2026-06-10T12:00:00.000Z' });

    const profileB = await createProfile('Negocio');
    await setActiveProfile(profileB.id);

    const res = await request(app).put(`/api/transactions/${txn.body.id}`).send({ amount: 999 });
    expect(res.status).toBe(404);

    const row = await db('transactions').where({ id: txn.body.id }).first();
    expect(Number(row.amount)).toBe(20);
  });

  it('DELETE /api/transactions/{foreignId} returns 404 and does not delete', async () => {
    const category = await request(app).post('/api/categories').send({ name: 'Comida' });
    const txn = await request(app)
      .post('/api/transactions')
      .send({ categoryId: category.body.id, amount: 20, date: '2026-06-10T12:00:00.000Z' });

    const profileB = await createProfile('Negocio');
    await setActiveProfile(profileB.id);

    const res = await request(app).delete(`/api/transactions/${txn.body.id}`);
    expect(res.status).toBe(404);

    const row = await db('transactions').where({ id: txn.body.id }).first();
    expect(row).toBeDefined();
  });
});
