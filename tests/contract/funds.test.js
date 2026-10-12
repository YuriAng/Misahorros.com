// Contract tests (tasks 2.6, 2.7): GET/POST/PATCH/DELETE /api/funds,
// GET/POST /api/funds/{id}/movements. savings-funds spec: "Fund Entity",
// "Fund Movements", "Derived Fund Balance", "Profile Isolation For Funds",
// "Archiving a Fund With a Nonzero Balance". budget-api spec: "Fund
// Management Endpoints".
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../server/index.js';
import db from '../../server/db.js';
import { resetDb, closeDb, DEFAULT_PROFILE_ID } from './support.js';

beforeEach(resetDb);
afterAll(closeDb);

describe('GET /api/funds', () => {
  it('returns an empty array on a fresh database', async () => {
    const res = await request(app).get('/api/funds');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns every field the client data model expects, including balance', async () => {
    await request(app).post('/api/funds').send({ name: 'Fondo de ahorro' });
    const res = await request(app).get('/api/funds');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ name: 'Fondo de ahorro', archived: false, balance: 0 });
    expect(typeof res.body[0].id).toBe('string');
    expect(typeof res.body[0].createdAt).toBe('string');
  });

  it('excludes archived funds by default and includes them with ?includeArchived=1', async () => {
    const created = await request(app).post('/api/funds').send({ name: 'Fondo viejo' });
    await request(app).delete(`/api/funds/${created.body.id}`);

    const withoutArchived = await request(app).get('/api/funds');
    expect(withoutArchived.body.map((f) => f.id)).not.toContain(created.body.id);

    const withArchived = await request(app).get('/api/funds?includeArchived=1');
    const target = withArchived.body.find((f) => f.id === created.body.id);
    expect(target).toBeDefined();
    expect(target.archived).toBe(true);
  });
});

describe('POST /api/funds', () => {
  it('creates a fund and responds 201 with balance 0', async () => {
    const res = await request(app).post('/api/funds').send({ name: 'Fondo de inversión' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Fondo de inversión', archived: false, balance: 0 });
  });

  it('responds 400 when name is blank', async () => {
    const res = await request(app).post('/api/funds').send({ name: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe('name');
  });

  it('responds 409 duplicate_name for a duplicate live fund name in the same profile', async () => {
    await request(app).post('/api/funds').send({ name: 'Ahorro' });
    const res = await request(app).post('/api/funds').send({ name: 'Ahorro' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('duplicate_name');
  });

  it('an archived fund does not block a new one with the same name', async () => {
    const created = await request(app).post('/api/funds').send({ name: 'Viejo' });
    const archived = await request(app).delete(`/api/funds/${created.body.id}`);
    expect(archived.status).toBe(204);

    const recreated = await request(app).post('/api/funds').send({ name: 'Viejo' });
    expect(recreated.status).toBe(201);
  });
});

describe('PATCH /api/funds/:id', () => {
  it('renames a fund', async () => {
    const created = await request(app).post('/api/funds').send({ name: 'Ahorro' });
    const res = await request(app).patch(`/api/funds/${created.body.id}`).send({ name: 'Ahorro 2026' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Ahorro 2026');

    const list = await request(app).get('/api/funds');
    expect(list.body.find((f) => f.id === created.body.id).name).toBe('Ahorro 2026');
  });

  it('responds 404 for an unknown fund id', async () => {
    const res = await request(app).patch('/api/funds/fnd_ffffffff').send({ name: 'X' });
    expect(res.status).toBe(404);
  });

  it('responds 400 when clearing name to blank', async () => {
    const created = await request(app).post('/api/funds').send({ name: 'Ahorro' });
    const res = await request(app).patch(`/api/funds/${created.body.id}`).send({ name: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe('name');
  });

  it('responds 409 duplicate_name when renaming to a duplicate live name', async () => {
    await request(app).post('/api/funds').send({ name: 'Ahorro' });
    const other = await request(app).post('/api/funds').send({ name: 'Inversión' });
    const res = await request(app).patch(`/api/funds/${other.body.id}`).send({ name: 'Ahorro' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('duplicate_name');
  });
});

describe('DELETE /api/funds/:id (archive)', () => {
  it('archives a fund at zero balance and responds 204', async () => {
    const created = await request(app).post('/api/funds').send({ name: 'Ahorro' });
    const res = await request(app).delete(`/api/funds/${created.body.id}`);
    expect(res.status).toBe(204);

    const row = await db('funds').where({ id: created.body.id }).first();
    expect(row.archived).toBe(true);
  });

  it('responds 409 fund_has_balance when the fund has a nonzero balance', async () => {
    const created = await request(app).post('/api/funds').send({ name: 'Ahorro' });
    await request(app)
      .post(`/api/funds/${created.body.id}/movements`)
      .send({ type: 'deposit', amount: 100, date: '2026-03-10' });

    const res = await request(app).delete(`/api/funds/${created.body.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('fund_has_balance');

    const row = await db('funds').where({ id: created.body.id }).first();
    expect(row.archived).toBe(false);
  });

  it('archiving succeeds after withdrawing the full balance to zero', async () => {
    const created = await request(app).post('/api/funds').send({ name: 'Ahorro' });
    await request(app)
      .post(`/api/funds/${created.body.id}/movements`)
      .send({ type: 'deposit', amount: 100, date: '2026-03-10' });
    await request(app)
      .post(`/api/funds/${created.body.id}/movements`)
      .send({ type: 'withdrawal', amount: 100, date: '2026-03-12' });

    const res = await request(app).delete(`/api/funds/${created.body.id}`);
    expect(res.status).toBe(204);
  });

  it('responds 404 for an unknown fund id', async () => {
    const res = await request(app).delete('/api/funds/fnd_ffffffff');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/funds/:id/movements', () => {
  it('lists movements for a fund, newest first, and respects ?limit=', async () => {
    const created = await request(app).post('/api/funds').send({ name: 'Ahorro' });
    await request(app)
      .post(`/api/funds/${created.body.id}/movements`)
      .send({ type: 'deposit', amount: 100, date: '2026-03-10' });
    await request(app)
      .post(`/api/funds/${created.body.id}/movements`)
      .send({ type: 'deposit', amount: 50, date: '2026-03-15' });

    const res = await request(app).get(`/api/funds/${created.body.id}/movements`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].amount).toBe(50);
    expect(res.body[1].amount).toBe(100);

    const limited = await request(app).get(`/api/funds/${created.body.id}/movements?limit=1`);
    expect(limited.body).toHaveLength(1);
    expect(limited.body[0].amount).toBe(50);
  });

  it('responds 404 for a fund id belonging to another profile', async () => {
    const otherProfile = await request(app).post('/api/profiles').send({ name: 'Negocio' });
    const [{ id: foreignFundId }] = await db('funds')
      .insert({ id: 'fnd_foreign1', name: 'Fondo ajeno', profile_id: otherProfile.body.id })
      .returning('id');

    const res = await request(app).get(`/api/funds/${foreignFundId}/movements`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/funds/:id/movements', () => {
  it('records a deposit, derives month_key server-side, and returns the new balance', async () => {
    const created = await request(app).post('/api/funds').send({ name: 'Ahorro' });
    const res = await request(app)
      .post(`/api/funds/${created.body.id}/movements`)
      .send({ type: 'deposit', amount: 100, date: '2026-03-10' });

    expect(res.status).toBe(201);
    expect(res.body.movement).toMatchObject({ type: 'deposit', amount: 100, fundId: created.body.id, monthKey: '2026-03' });
    expect(res.body.balance).toBe(100);
  });

  it('records a withdrawal and returns the decreased balance', async () => {
    const created = await request(app).post('/api/funds').send({ name: 'Ahorro' });
    await request(app)
      .post(`/api/funds/${created.body.id}/movements`)
      .send({ type: 'deposit', amount: 100, date: '2026-03-10' });

    const res = await request(app)
      .post(`/api/funds/${created.body.id}/movements`)
      .send({ type: 'withdrawal', amount: 40, date: '2026-03-15' });

    expect(res.status).toBe(201);
    expect(res.body.movement.type).toBe('withdrawal');
    expect(res.body.balance).toBe(60);
  });

  it('derives the balance correctly across three different months', async () => {
    const created = await request(app).post('/api/funds').send({ name: 'Ahorro' });
    await request(app)
      .post(`/api/funds/${created.body.id}/movements`)
      .send({ type: 'deposit', amount: 100, date: '2026-01-10' });
    await request(app)
      .post(`/api/funds/${created.body.id}/movements`)
      .send({ type: 'deposit', amount: 50, date: '2026-02-10' });
    const res = await request(app)
      .post(`/api/funds/${created.body.id}/movements`)
      .send({ type: 'withdrawal', amount: 30, date: '2026-03-10' });

    expect(res.body.balance).toBe(120);
  });

  it('responds 400 for an invalid movement type', async () => {
    const created = await request(app).post('/api/funds').send({ name: 'Ahorro' });
    const res = await request(app)
      .post(`/api/funds/${created.body.id}/movements`)
      .send({ type: 'transfer', amount: 100, date: '2026-03-10' });
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe('type');
  });

  it('responds 400 for a missing or non-positive amount', async () => {
    const created = await request(app).post('/api/funds').send({ name: 'Ahorro' });
    const res = await request(app)
      .post(`/api/funds/${created.body.id}/movements`)
      .send({ type: 'deposit', amount: 0, date: '2026-03-10' });
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe('amount');
  });

  it('responds 409 insufficient_funds when a withdrawal exceeds the balance, and inserts nothing', async () => {
    const created = await request(app).post('/api/funds').send({ name: 'Ahorro' });
    await request(app)
      .post(`/api/funds/${created.body.id}/movements`)
      .send({ type: 'deposit', amount: 50, date: '2026-03-10' });

    const res = await request(app)
      .post(`/api/funds/${created.body.id}/movements`)
      .send({ type: 'withdrawal', amount: 100, date: '2026-03-15' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('insufficient_funds');

    const rows = await db('fund_movements').where({ fund_id: created.body.id, type: 'withdrawal' });
    expect(rows).toHaveLength(0);
  });

  it('responds 409 fund_archived when recording a movement against an archived fund', async () => {
    const created = await request(app).post('/api/funds').send({ name: 'Ahorro' });
    await request(app).delete(`/api/funds/${created.body.id}`);

    const res = await request(app)
      .post(`/api/funds/${created.body.id}/movements`)
      .send({ type: 'deposit', amount: 50, date: '2026-03-10' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('fund_archived');
  });

  it('responds 404 for a fund id belonging to another profile and writes nothing', async () => {
    const otherProfile = await request(app).post('/api/profiles').send({ name: 'Negocio' });
    const [{ id: foreignFundId }] = await db('funds')
      .insert({ id: 'fnd_foreign2', name: 'Fondo ajeno', profile_id: otherProfile.body.id })
      .returning('id');

    const res = await request(app)
      .post(`/api/funds/${foreignFundId}/movements`)
      .send({ type: 'deposit', amount: 50, date: '2026-03-10' });

    expect(res.status).toBe(404);
    const rows = await db('fund_movements').where({ fund_id: foreignFundId });
    expect(rows).toHaveLength(0);
  });
});

describe('Cross-profile isolation (savings-funds spec, "Profile Isolation For Funds")', () => {
  it('a fund created under profile A is not visible or writable while profile B is active', async () => {
    const createdA = await request(app).post('/api/funds').send({ name: 'Fondo A' });

    const profileB = await request(app).post('/api/profiles').send({ name: 'Negocio' });
    await request(app).put('/api/profiles/active').send({ profileId: profileB.body.id });

    const list = await request(app).get('/api/funds');
    expect(list.body.map((f) => f.id)).not.toContain(createdA.body.id);

    const patch = await request(app).patch(`/api/funds/${createdA.body.id}`).send({ name: 'Hijack' });
    expect(patch.status).toBe(404);

    const archive = await request(app).delete(`/api/funds/${createdA.body.id}`);
    expect(archive.status).toBe(404);

    const movement = await request(app)
      .post(`/api/funds/${createdA.body.id}/movements`)
      .send({ type: 'deposit', amount: 10, date: '2026-03-10' });
    expect(movement.status).toBe(404);
  });

  it('rejects a cross-profile movement at the database level via the composite FK', async () => {
    const createdA = await request(app).post('/api/funds').send({ name: 'Fondo A' });
    const profileB = await request(app).post('/api/profiles').send({ name: 'Negocio' });

    await expect(
      db('fund_movements').insert({
        id: 'fmv_hijack1',
        profile_id: profileB.body.id,
        fund_id: createdA.body.id,
        month_key: '2026-03',
        type: 'deposit',
        amount: 10,
        date: new Date('2026-03-10T12:00:00.000Z'),
      })
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('fund movements recorded under profile A do not affect profile B\'s balance for a same-named fund', async () => {
    const createdA = await request(app).post('/api/funds').send({ name: 'Ahorro' });
    await request(app)
      .post(`/api/funds/${createdA.body.id}/movements`)
      .send({ type: 'deposit', amount: 500, date: '2026-03-10' });

    const profileB = await request(app).post('/api/profiles').send({ name: 'Negocio' });
    await request(app).put('/api/profiles/active').send({ profileId: profileB.body.id });

    const createdB = await request(app).post('/api/funds').send({ name: 'Ahorro' });
    const list = await request(app).get('/api/funds');
    expect(list.body.find((f) => f.id === createdB.body.id).balance).toBe(0);
    expect(DEFAULT_PROFILE_ID).not.toBe(profileB.body.id);
  });
});
