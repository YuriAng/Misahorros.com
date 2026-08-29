// Contract tests (task 7.1): GET /api/import/legacy/status, POST /api/import/legacy.
// Task 7.4: idempotency (double import unchanged counts; partial-failure
// retry fills the gap; malformed payload responds 400 with zero writes).
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../server/index.js';
import db from '../../server/db.js';
import { resetDb, closeDb, insertCategory } from './support.js';

beforeEach(resetDb);
afterAll(closeDb);

function legacyFixture() {
  return {
    version: 1,
    settings: { currency: 'USD', activeMonth: '2026-01' },
    categories: [
      { id: 'cat_food0001', name: 'Food', icon: '🍔', color: '#ff0000', archived: false },
      { id: 'cat_rent0001', name: 'Rent', icon: '🏠', color: '#00ff00', archived: false },
      { id: 'cat_fun00001', name: 'Fun', icon: '🎮', color: '#0000ff', archived: false },
    ],
    months: {
      '2026-01': {
        income: { amount: 1000, updatedAt: '2026-01-01T00:00:00.000Z' },
        budgets: { cat_food0001: 300, cat_rent0001: 500 },
        transactions: [
          { id: 'txn_aaa00001', categoryId: 'cat_food0001', amount: 50, note: 'groceries', date: '2026-01-05T12:00:00.000Z' },
          { id: 'txn_aaa00002', categoryId: 'cat_rent0001', amount: 500, note: '', date: '2026-01-01T12:00:00.000Z' },
        ],
      },
    },
  };
}

async function counts() {
  const [{ count: categories }] = (await db.raw('SELECT count(*)::int FROM categories')).rows;
  const [{ count: months }] = (await db.raw('SELECT count(*)::int FROM months')).rows;
  const [{ count: budgets }] = (await db.raw('SELECT count(*)::int FROM category_budgets')).rows;
  const [{ count: transactions }] = (await db.raw('SELECT count(*)::int FROM transactions')).rows;
  return { categories, months, budgets, transactions };
}

describe('GET /api/import/legacy/status', () => {
  it('reports not-imported before any import runs', async () => {
    const res = await request(app).get('/api/import/legacy/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ imported: false, importedAt: null });
  });

  it('reports imported after a successful import', async () => {
    await request(app).post('/api/import/legacy').send(legacyFixture());
    const res = await request(app).get('/api/import/legacy/status');
    expect(res.body.imported).toBe(true);
    expect(typeof res.body.importedAt).toBe('string');
  });
});

describe('POST /api/import/legacy', () => {
  it('responds 400 and creates no records for a malformed payload', async () => {
    const res = await request(app).post('/api/import/legacy').send({ notCategories: [] });
    expect(res.status).toBe(400);
    expect(await counts()).toEqual({ categories: 0, months: 0, budgets: 0, transactions: 0 });
  });

  it('returns a summary of imported counts on first run', async () => {
    const res = await request(app).post('/api/import/legacy').send(legacyFixture());
    expect(res.status).toBe(200);
    expect(res.body.imported).toEqual({ categories: 3, months: 1, budgets: 2, transactions: 2 });
    expect(res.body.skipped).toEqual({ categories: 0, months: 0, budgets: 0, transactions: 0 });
  });

  // task 7.4 — double import unchanged counts
  it('is idempotent: importing the same payload twice yields identical final counts', async () => {
    await request(app).post('/api/import/legacy').send(legacyFixture());
    const firstCounts = await counts();

    const second = await request(app).post('/api/import/legacy').send(legacyFixture());
    expect(second.status).toBe(200);
    expect(second.body.imported).toEqual({ categories: 0, months: 0, budgets: 0, transactions: 0 });
    expect(second.body.skipped).toEqual({ categories: 3, months: 1, budgets: 2, transactions: 2 });

    expect(await counts()).toEqual(firstCounts);
    expect(firstCounts).toEqual({ categories: 3, months: 1, budgets: 2, transactions: 2 });
  });

  // task 7.4 — retry after a partial failure fills only the gap
  it('retrying after a partial failure creates only the missing records', async () => {
    const fixture = legacyFixture();
    // Simulate "a first import call inserted 2 of 3 categories before
    // failing": pre-create 2 of the 3 categories directly, as a genuine
    // failed-first-attempt would have left them.
    await insertCategory({ id: 'cat_food0001', name: 'Food', icon: '🍔', color: '#ff0000' });
    await insertCategory({ id: 'cat_rent0001', name: 'Rent', icon: '🏠', color: '#00ff00' });

    const res = await request(app).post('/api/import/legacy').send(fixture);
    expect(res.status).toBe(200);
    // Only the missing category is newly created; the 2 pre-existing ones
    // are reported as skipped, never duplicated.
    expect(res.body.imported.categories).toBe(1);
    expect(res.body.skipped.categories).toBe(2);
    expect((await counts()).categories).toBe(3);
  });
});
