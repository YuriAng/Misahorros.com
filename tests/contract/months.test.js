// Contract tests (task 7.1): GET /api/months/{k}, PUT income, PUT
// budgets/{catId}, POST carry-forward.
// Task 7.2 (Bug Fix A regression): repeated GETs on an untouched month
// never change the `months` row count and stay byte-identical.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../server/index.js';
import { resetDb, closeDb, monthsRowCount, insertCategory } from './support.js';

beforeEach(resetDb);
afterAll(closeDb);

describe('GET /api/months/{monthKey} — shape and side-effect-free reads', () => {
  it('returns zero-valued totals for an untouched month', async () => {
    const res = await request(app).get('/api/months/2026-03');
    expect(res.status).toBe(200);
    expect(res.body.monthKey).toBe('2026-03');
    expect(res.body.materialized).toBe(false);
    expect(res.body.income).toEqual({ amount: 0, updatedAt: null });
    expect(res.body.budgets).toEqual({});
    expect(res.body.transactions).toEqual([]);
    expect(res.body.totals).toEqual({ income: 0, totalBudgeted: 0, totalSpent: 0, totalAvailable: 0 });
  });

  it('responds 400 for a malformed month key', async () => {
    const res = await request(app).get('/api/months/not-a-month');
    expect(res.status).toBe(400);
  });

  // task 7.2 — Bug Fix A regression
  it('never creates a months row across repeated GETs on an untouched month', async () => {
    const before = await monthsRowCount();
    expect(before).toBe(0);

    const first = await request(app).get('/api/months/2026-03');
    const afterFirst = await monthsRowCount();
    expect(afterFirst).toBe(0);

    const second = await request(app).get('/api/months/2026-03');
    const afterSecond = await monthsRowCount();

    expect(afterSecond).toBe(0);
    expect(second.body).toEqual(first.body);
  });
});

describe('PUT /api/months/{monthKey}/income', () => {
  it('materializes the month and stores the amount', async () => {
    const res = await request(app).put('/api/months/2026-03/income').send({ amount: 1200 });
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(1200);
    expect(typeof res.body.updatedAt).toBe('string');
    expect(await monthsRowCount()).toBe(1);
  });

  it('responds 400 when amount is missing', async () => {
    const res = await request(app).put('/api/months/2026-03/income').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe('amount');
  });
});

describe('PUT /api/months/{monthKey}/budgets/{categoryId}', () => {
  it('materializes the month and stores the budget', async () => {
    const category = await insertCategory({ id: 'cat_budget01' });
    const res = await request(app).put(`/api/months/2026-03/budgets/${category.id}`).send({ amount: 300 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ categoryId: category.id, amount: 300 });

    const month = await request(app).get('/api/months/2026-03');
    expect(month.body.budgets[category.id]).toBe(300);
  });

  it('responds 400 for an unknown category', async () => {
    const res = await request(app).put('/api/months/2026-03/budgets/cat_unknown01').send({ amount: 300 });
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe('categoryId');
  });
});

describe('POST /api/months/{monthKey}/carry-forward', () => {
  it('copies income and budgets from the closest earlier materialized month', async () => {
    const category = await insertCategory({ id: 'cat_carry01' });
    await request(app).put('/api/months/2026-01/income').send({ amount: 900 });
    await request(app).put(`/api/months/2026-01/budgets/${category.id}`).send({ amount: 250 });

    const res = await request(app).post('/api/months/2026-02/carry-forward');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ copiedFrom: '2026-01', income: 900, budgetCount: 1 });

    const month = await request(app).get('/api/months/2026-02');
    expect(month.body.income.amount).toBe(900);
    expect(month.body.budgets[category.id]).toBe(250);
  });

  it('responds 409 when the month is already materialized', async () => {
    await request(app).put('/api/months/2026-02/income').send({ amount: 100 });
    const res = await request(app).post('/api/months/2026-02/carry-forward');
    expect(res.status).toBe(409);
  });
});
