// Contract tests (tasks 3.1-3.3, extended by Phase 6 tasks 6.1-6.3): cross-
// profile isolation on categories/months/transactions, and foreign-id
// mutations returning 404. budget-profiles spec: "Full Data Isolation
// Across Profiles", "Carry-Forward Stays Within the Active Profile". The
// blocks above this comment (Category/Month/Cross-profile-reference/
// Foreign-id) are the Phase 3 foundation slice; everything below "Phase 6:
// complete isolation matrix" fills the remaining endpoints/aggregates the
// spec's matrix requires: PUT income, categoryTotals aggregate, the
// carry-forward hint field, a direct-SQL FK rejection, and an explicit
// POST-created transaction round trip.
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

// ---------------------------------------------------------------------------
// Phase 6: complete isolation matrix (tasks 6.1-6.3)
// ---------------------------------------------------------------------------

describe('Transaction isolation via POST + month payload (task 6.1)', () => {
  it('a transaction POSTed under profile A never appears in profile B\'s month payload', async () => {
    const category = await request(app).post('/api/categories').send({ name: 'Comida' });
    const created = await request(app)
      .post('/api/transactions')
      .send({ categoryId: category.body.id, amount: 42, date: '2026-06-10T12:00:00.000Z' });
    expect(created.status).toBe(201);

    const profileB = await createProfile('Negocio');
    await setActiveProfile(profileB.id);

    const resB = await request(app).get('/api/months/2026-06');
    expect(resB.status).toBe(200);
    expect(resB.body.transactions).toEqual([]);
    expect(resB.body.transactions.map((t) => t.id)).not.toContain(created.body.id);
  });
});

describe('Income isolation (task 6.1)', () => {
  it('PUT /api/months/:monthKey/income is fully isolated in both directions', async () => {
    const putA = await request(app).put('/api/months/2026-06/income').send({ amount: 1000 });
    expect(putA.body.amount).toBe(1000);

    const profileB = await createProfile('Negocio');
    await setActiveProfile(profileB.id);

    // B sees none of A's income before writing its own.
    const resBBefore = await request(app).get('/api/months/2026-06');
    expect(resBBefore.body.income.amount).toBe(0);

    // B writes its own income, independent of A's.
    await request(app).put('/api/months/2026-06/income').send({ amount: 500 });
    const resBAfter = await request(app).get('/api/months/2026-06');
    expect(resBAfter.body.income.amount).toBe(500);

    // Switching back, A's income is untouched by B's write.
    await setActiveProfile(DEFAULT_PROFILE_ID);
    const resA = await request(app).get('/api/months/2026-06');
    expect(resA.body.income.amount).toBe(1000);
  });
});

describe('categoryTotals aggregate isolation (task 6.1)', () => {
  it('GET /api/months/:monthKey categoryTotals never includes another profile\'s category id', async () => {
    const catA = await insertCategory({ id: 'cat_agg_a', name: 'Comida' });
    await request(app).put(`/api/months/2026-06/budgets/${catA.id}`).send({ amount: 300 });

    const profileB = await createProfile('Negocio');
    const catB = await insertCategory({ id: 'cat_agg_b', name: 'Ventas', profileId: profileB.id });
    await setActiveProfile(profileB.id);
    await request(app).put(`/api/months/2026-06/budgets/${catB.id}`).send({ amount: 700 });

    const resB = await request(app).get('/api/months/2026-06');
    expect(Object.keys(resB.body.categoryTotals)).toEqual([catB.id]);
    expect(resB.body.categoryTotals[catB.id].budget).toBe(700);
    expect(resB.body.categoryTotals[catA.id]).toBeUndefined();
  });
});

describe('Carry-forward hint isolation (task 6.2)', () => {
  it('carryForward.sourceMonth reflects only the active profile\'s own prior month, and the endpoint copies exactly that month', async () => {
    // Profile A materializes July with income.
    await request(app).put('/api/months/2026-07/income').send({ amount: 1200 });

    const profileB = await createProfile('Negocio');
    await setActiveProfile(profileB.id);

    // Profile B has no prior month yet: the hint must be null, not leak A's July.
    const resNoPrior = await request(app).get('/api/months/2026-08');
    expect(resNoPrior.body.carryForward).toEqual({ available: false, sourceMonth: null });

    // Profile B materializes its OWN July with different data.
    await request(app).put('/api/months/2026-07/income').send({ amount: 300 });
    const resOwnPrior = await request(app).get('/api/months/2026-08');
    expect(resOwnPrior.body.carryForward).toEqual({ available: true, sourceMonth: '2026-07' });

    // The endpoint's actual copy source matches the hint exactly, and uses B's
    // own income (300), never A's (1200).
    const carryRes = await request(app).post('/api/months/2026-08/carry-forward');
    expect(carryRes.body.copiedFrom).toBe(resOwnPrior.body.carryForward.sourceMonth);
    expect(carryRes.body.income).toBe(300);
  });
});

describe('Carry-forward budgets isolation (task 6.2/6.5)', () => {
  it('carry-forward copies only the active profile\'s own budgets, even when both profiles have prior-month data', async () => {
    const catA = await request(app).post('/api/categories').send({ name: 'Renta' });
    await request(app).put(`/api/months/2026-07/budgets/${catA.body.id}`).send({ amount: 900 });

    const profileB = await createProfile('Negocio');
    await setActiveProfile(profileB.id);
    const catB = await request(app).post('/api/categories').send({ name: 'Insumos' });
    await request(app).put(`/api/months/2026-07/budgets/${catB.body.id}`).send({ amount: 250 });

    const carryB = await request(app).post('/api/months/2026-08/carry-forward');
    expect(carryB.body).toEqual({ copiedFrom: '2026-07', income: 0, budgetCount: 1 });

    const resB = await request(app).get('/api/months/2026-08');
    expect(Object.keys(resB.body.budgets)).toEqual([catB.body.id]);
    expect(resB.body.budgets[catA.body.id]).toBeUndefined();
  });
});

describe('Database-level rejection of cross-profile references (task 6.3)', () => {
  it('a direct INSERT into transactions with a cross-profile category_id is rejected by the composite FK, not just the route', async () => {
    const profileB = await createProfile('Negocio');
    const catB = await insertCategory({ id: 'cat_fk_b', name: 'Ventas', profileId: profileB.id });
    // The (profile_id, month_key) FK target must exist for profile A too, so
    // the failure below is unambiguously the (profile_id, category_id) FK,
    // not a missing-month FK.
    await db('months').insert({ profile_id: DEFAULT_PROFILE_ID, month_key: '2026-06' });

    await expect(
      db('transactions').insert({
        id: 'txn_fk_bad',
        profile_id: DEFAULT_PROFILE_ID, // profile A is the writer
        month_key: '2026-06',
        category_id: catB.id, // but this category belongs to profile B
        amount: 10,
        date: new Date('2026-06-05T12:00:00Z'),
      })
    ).rejects.toThrow(/foreign key constraint/i);

    const row = await db('transactions').where({ id: 'txn_fk_bad' }).first();
    expect(row).toBeUndefined();
  });
});
