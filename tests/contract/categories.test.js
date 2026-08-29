// Contract tests (task 7.1): GET/POST /api/categories, PATCH /api/categories/{id}.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../server/index.js';
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
