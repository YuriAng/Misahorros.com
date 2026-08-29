// Contract tests (task 7.1): POST/PUT/DELETE /api/transactions.
// Task 7.3 (Bug Fix B regression): a transaction's `month_key` is always
// derived from its own `date`, both on create and on a date-changing update.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../server/index.js';
import { resetDb, closeDb, insertCategory } from './support.js';

beforeEach(resetDb);
afterAll(closeDb);

describe('POST /api/transactions', () => {
  it('creates a transaction and responds 201 with the derived monthKey', async () => {
    const category = await insertCategory({ id: 'cat_txn01' });
    const res = await request(app)
      .post('/api/transactions')
      .send({ categoryId: category.id, amount: 42.5, note: 'lunch', date: '2026-05-15T12:00:00.000Z' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ categoryId: category.id, amount: 42.5, note: 'lunch', monthKey: '2026-05' });
    expect(typeof res.body.id).toBe('string');
  });

  it('responds 400 when amount is missing', async () => {
    const category = await insertCategory({ id: 'cat_txn02' });
    const res = await request(app).post('/api/transactions').send({ categoryId: category.id });
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe('amount');
  });

  it('responds 400 for an unknown categoryId', async () => {
    const res = await request(app).post('/api/transactions').send({ categoryId: 'cat_ffffff', amount: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe('categoryId');
  });

  // task 7.3 — Bug Fix B regression, create path
  it('files the transaction under the month of its own date, not the currently viewed month', async () => {
    const category = await insertCategory({ id: 'cat_bugfix_b1' });

    // Client UI is "viewing" 2026-08, but posts an expense dated in 2026-05.
    const created = await request(app)
      .post('/api/transactions')
      .send({ categoryId: category.id, amount: 30, date: '2026-05-15' });
    expect(created.body.monthKey).toBe('2026-05');

    const may = await request(app).get('/api/months/2026-05');
    expect(may.body.transactions.map((t) => t.id)).toContain(created.body.id);
    expect(may.body.totals.totalSpent).toBe(30);

    const august = await request(app).get('/api/months/2026-08');
    expect(august.body.transactions).toEqual([]);
    expect(august.body.totals.totalSpent).toBe(0);
  });
});

describe('PUT /api/transactions/{id}', () => {
  it('responds 404 for an unknown transaction', async () => {
    const res = await request(app).put('/api/transactions/txn_deadbeef').send({ amount: 10 });
    expect(res.status).toBe(404);
  });

  it('responds 400 for an unknown categoryId', async () => {
    const category = await insertCategory({ id: 'cat_txn03' });
    const created = await request(app)
      .post('/api/transactions')
      .send({ categoryId: category.id, amount: 10, date: '2026-05-15T12:00:00.000Z' });

    const res = await request(app).put(`/api/transactions/${created.body.id}`).send({ categoryId: 'cat_ffffff' });
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe('categoryId');
  });

  // task 7.3 — Bug Fix B regression, update path
  it('moves the transaction between months when its date changes', async () => {
    const category = await insertCategory({ id: 'cat_bugfix_b2' });
    const created = await request(app)
      .post('/api/transactions')
      .send({ categoryId: category.id, amount: 60, date: '2026-05-15' });
    expect(created.body.monthKey).toBe('2026-05');

    const updated = await request(app)
      .put(`/api/transactions/${created.body.id}`)
      .send({ date: '2026-06-01T12:00:00.000Z' });
    expect(updated.status).toBe(200);
    expect(updated.body.monthKey).toBe('2026-06');

    const may = await request(app).get('/api/months/2026-05');
    expect(may.body.transactions).toEqual([]);

    const june = await request(app).get('/api/months/2026-06');
    expect(june.body.transactions.map((t) => t.id)).toContain(created.body.id);
  });
});

describe('DELETE /api/transactions/{id}', () => {
  it('responds 204 and removes the transaction', async () => {
    const category = await insertCategory({ id: 'cat_txn04' });
    const created = await request(app)
      .post('/api/transactions')
      .send({ categoryId: category.id, amount: 5, date: '2026-05-15T12:00:00.000Z' });

    const res = await request(app).delete(`/api/transactions/${created.body.id}`);
    expect(res.status).toBe(204);

    const month = await request(app).get('/api/months/2026-05');
    expect(month.body.transactions).toEqual([]);
  });

  it('responds 404 for an unknown transaction', async () => {
    const res = await request(app).delete('/api/transactions/txn_deadbeef');
    expect(res.status).toBe(404);
  });
});
