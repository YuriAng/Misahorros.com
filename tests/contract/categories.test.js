// Contract tests (task 7.1): GET/POST /api/categories, PATCH /api/categories/{id}.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../server/index.js';
import db from '../../server/db.js';
import { resetDb, closeDb } from './support.js';

beforeEach(resetDb);
afterAll(closeDb);

describe('GET /api/categories', () => {
  it('returns an empty array on a fresh database', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns every field the client data model expects', async () => {
    await request(app).post('/api/categories').send({ name: 'Groceries', icon: '🛒', color: '#ff0000' });
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      name: 'Groceries',
      icon: '🛒',
      color: '#ff0000',
      archived: false,
    });
    expect(typeof res.body[0].id).toBe('string');
    expect(typeof res.body[0].createdAt).toBe('string');
  });
});

describe('POST /api/categories', () => {
  it('creates a category and responds 201', async () => {
    const res = await request(app).post('/api/categories').send({ name: 'Entertainment' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Entertainment');
    expect(res.body.archived).toBe(false);
  });

  it('responds 400 when name is missing', async () => {
    const res = await request(app).post('/api/categories').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe('name');
  });

  it('applies budget + monthKey atomically on create', async () => {
    const res = await request(app)
      .post('/api/categories')
      .send({ name: 'Utilities', budget: 150, monthKey: '2026-02' });
    expect(res.status).toBe(201);

    const month = await request(app).get('/api/months/2026-02');
    expect(month.body.budgets[res.body.id]).toBe(150);
    expect(month.body.materialized).toBe(true);
  });
});

describe('PATCH /api/categories/{id}', () => {
  it('updates fields and returns the category', async () => {
    const created = await request(app).post('/api/categories').send({ name: 'Health' });
    const res = await request(app).patch(`/api/categories/${created.body.id}`).send({ archived: true });
    expect(res.status).toBe(200);
    expect(res.body.archived).toBe(true);
    expect(res.body.name).toBe('Health');
  });

  it('responds 404 for an unknown category id', async () => {
    const res = await request(app).patch('/api/categories/cat_ffffffff').send({ archived: true });
    expect(res.status).toBe(404);
  });

  it('responds 400 when clearing name to blank', async () => {
    const created = await request(app).post('/api/categories').send({ name: 'Travel' });
    const res = await request(app).patch(`/api/categories/${created.body.id}`).send({ name: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe('name');
  });
});

// budget-persistence spec, "Foreign Key Integrity" requirement. There is no
// DELETE /api/categories route (design.md: archiving replaces hard delete),
// so this exercises the database constraint directly.
describe('Foreign key integrity (budget-persistence)', () => {
  it('rejects a hard delete of a category with an existing transaction', async () => {
    const created = await request(app).post('/api/categories').send({ name: 'Rent' });
    await request(app)
      .post('/api/transactions')
      .send({ categoryId: created.body.id, amount: 500, date: '2026-03-15T12:00:00.000Z' });

    await expect(db('categories').where({ id: created.body.id }).del()).rejects.toMatchObject({
      code: '23503', // foreign_key_violation
    });
  });

  it('archiving a category with transactions preserves them as queryable history', async () => {
    const created = await request(app).post('/api/categories').send({ name: 'Rent' });
    // Mid-month, not the 1st: avoids the UTC-midnight/APP_TZ boundary shift
    // (a UTC "day 1" timestamp can land in the previous month under UTC-4).
    await request(app)
      .post('/api/transactions')
      .send({ categoryId: created.body.id, amount: 500, date: '2026-03-15T12:00:00.000Z' });

    const archived = await request(app)
      .patch(`/api/categories/${created.body.id}`)
      .send({ archived: true });
    expect(archived.status).toBe(200);
    expect(archived.body.archived).toBe(true);

    const month = await request(app).get('/api/months/2026-03');
    expect(month.body.categoryTotals[created.body.id].spent).toBe(500);
  });
});
