// Contract tests (task 7.1): GET /api/health, GET /api/bootstrap.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../server/index.js';
import { resetDb, closeDb, DEFAULT_PROFILE_ID } from './support.js';

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
  it('returns settings, profiles, categories and a null month on a fresh database', async () => {
    const res = await request(app).get('/api/bootstrap');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      settings: { currency: 'USD', activeMonth: null, activeProfile: DEFAULT_PROFILE_ID },
      profiles: [{ id: DEFAULT_PROFILE_ID, name: 'General', archived: false, createdAt: expect.any(String) }],
      categories: [],
      funds: [],
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

  // task 4.7 — the profiles array only lists live profiles, mirroring
  // GET /api/profiles' default (an archived profile is never the active
  // one, so it never needs to appear in the switcher payload).
  it('lists only live profiles', async () => {
    const created = await request(app).post('/api/profiles').send({ name: 'Viejo' });
    await request(app).delete(`/api/profiles/${created.body.id}`);

    const res = await request(app).get('/api/bootstrap');
    const ids = res.body.profiles.map((p) => p.id);
    expect(ids).toContain(DEFAULT_PROFILE_ID);
    expect(ids).not.toContain(created.body.id);
  });
});

// Task 3.8 — design.md "Decision: funds (with balance) ship in
// buildBootstrapPayload". buildBootstrapPayload is the SAME shared
// builder used by both GET /api/bootstrap and PUT /api/profiles/active, so
// a profile switch must return funds scoped to the newly activated
// profile in that one response, with no second round trip.
describe('GET /api/bootstrap — funds', () => {
  it('includes a funds array with the expected shape', async () => {
    await request(app).post('/api/funds').send({ name: 'Fondo de ahorro' });

    const res = await request(app).get('/api/bootstrap');
    expect(res.status).toBe(200);
    expect(res.body.funds).toHaveLength(1);
    expect(res.body.funds[0]).toMatchObject({ name: 'Fondo de ahorro', archived: false, balance: 0 });
    expect(typeof res.body.funds[0].id).toBe('string');
    expect(typeof res.body.funds[0].createdAt).toBe('string');
  });

  it('PUT /api/profiles/active returns funds scoped to the newly activated profile only', async () => {
    await request(app).post('/api/funds').send({ name: 'Fondo del perfil original' });

    const otherProfile = await request(app).post('/api/profiles').send({ name: 'Negocio' });
    const switched = await request(app).put('/api/profiles/active').send({ profileId: otherProfile.body.id });
    expect(switched.status).toBe(200);
    // The newly activated profile has no funds of its own yet — if this
    // leaked the original profile's fund, it would be a cross-profile
    // cache/scope leak at the API boundary itself.
    expect(switched.body.funds).toEqual([]);

    await request(app).post('/api/funds').send({ name: 'Fondo de Negocio' });
    const bootstrapForB = await request(app).get('/api/bootstrap');
    expect(bootstrapForB.body.funds).toHaveLength(1);
    expect(bootstrapForB.body.funds[0].name).toBe('Fondo de Negocio');
  });
});
