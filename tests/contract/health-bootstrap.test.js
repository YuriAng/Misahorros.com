// Contract tests (task 7.1): GET /api/health, GET /api/bootstrap.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../server/index.js';
import { resetDb, closeDb } from './support.js';

beforeEach(resetDb);
afterAll(closeDb);

describe('GET /api/health', () => {
  it('returns status ok with a working db connection', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'ok' });
  });
});

describe('GET /api/bootstrap', () => {
  it('returns settings, categories and a null month on a fresh database', async () => {
    const res = await request(app).get('/api/bootstrap');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      settings: { currency: 'USD', activeMonth: null },
      categories: [],
      month: null,
    });
  });

  it('aggregates the requested month payload in one call', async () => {
    await request(app).post('/api/categories').send({ name: 'Rent' });
    await request(app)
      .post('/api/transactions')
      .send({ categoryId: (await request(app).get('/api/categories')).body[0].id, amount: 10, date: '2026-04-10' });

    const res = await request(app).get('/api/bootstrap?month=2026-04');
    expect(res.status).toBe(200);
    expect(res.body.month.monthKey).toBe('2026-04');
    expect(res.body.month.materialized).toBe(true);
    expect(res.body.categories).toHaveLength(1);
  });
});
