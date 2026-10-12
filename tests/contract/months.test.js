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
    expect(res.body.fundMovements).toEqual([]);
    expect(res.body.totals).toEqual({
      income: 0,
      totalBudgeted: 0,
      totalSpent: 0,
      fundDeposits: 0,
      fundWithdrawals: 0,
      totalAvailable: 0,
    });
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

// Task 3.7 — savings-funds spec "Month Totals Include Fund Movement
// Terms": totalAvailable = income - totalSpent - fundDeposits +
// fundWithdrawals. Each test isolates one movement kind in its own month,
// plus a combined case that distinguishes a correct two-term formula from
// a naive net-only one (design.md "Decision: totals gains two gross
// terms").
describe('GET /api/months/{monthKey} — fund movement totals (task 3.7)', () => {
  it('a 200 deposit lowers totalAvailable by exactly 200 and raises fundDeposits by 200', async () => {
    await request(app).put('/api/months/2026-06/income').send({ amount: 1000 });
    const before = await request(app).get('/api/months/2026-06');
    expect(before.body.totals.totalAvailable).toBe(1000);
    expect(before.body.totals.fundDeposits).toBe(0);

    const fund = await request(app).post('/api/funds').send({ name: 'Fondo' });
    await request(app)
      .post(`/api/funds/${fund.body.id}/movements`)
      .send({ type: 'deposit', amount: 200, date: '2026-06-10' });

    const after = await request(app).get('/api/months/2026-06');
    expect(after.body.totals.totalAvailable).toBe(before.body.totals.totalAvailable - 200);
    expect(after.body.totals.fundDeposits).toBe(before.body.totals.fundDeposits + 200);
  });

  it('a 50 withdrawal raises totalAvailable by exactly 50 and raises fundWithdrawals by 50', async () => {
    await request(app).put('/api/months/2026-07/income').send({ amount: 1000 });
    const fund = await request(app).post('/api/funds').send({ name: 'Fondo' });
    // Seed a balance first so the withdrawal itself is valid (otherwise
    // 409 insufficient_funds, not the behavior under test).
    await request(app)
      .post(`/api/funds/${fund.body.id}/movements`)
      .send({ type: 'deposit', amount: 500, date: '2026-07-05' });

    const before = await request(app).get('/api/months/2026-07');

    await request(app)
      .post(`/api/funds/${fund.body.id}/movements`)
      .send({ type: 'withdrawal', amount: 50, date: '2026-07-10' });

    const after = await request(app).get('/api/months/2026-07');
    expect(after.body.totals.totalAvailable).toBe(before.body.totals.totalAvailable + 50);
    expect(after.body.totals.fundWithdrawals).toBe(before.body.totals.fundWithdrawals + 50);
  });

  it('a 200 deposit + 200 withdrawal in the same month leaves totalAvailable unchanged but both terms read 200, not zero', async () => {
    await request(app).put('/api/months/2026-08/income').send({ amount: 1000 });
    const before = await request(app).get('/api/months/2026-08');

    const fund = await request(app).post('/api/funds').send({ name: 'Fondo' });
    await request(app)
      .post(`/api/funds/${fund.body.id}/movements`)
      .send({ type: 'deposit', amount: 200, date: '2026-08-05' });
    await request(app)
      .post(`/api/funds/${fund.body.id}/movements`)
      .send({ type: 'withdrawal', amount: 200, date: '2026-08-10' });

    const after = await request(app).get('/api/months/2026-08');
    // A naive net-only formula would collapse both of these to 0; the
    // two-term design must keep them independently visible.
    expect(after.body.totals.fundDeposits).toBe(200);
    expect(after.body.totals.fundWithdrawals).toBe(200);
    expect(after.body.totals.totalAvailable).toBe(before.body.totals.totalAvailable);
  });
});
