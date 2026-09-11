// Contract tests (tasks 2.1, 2.2): GET/POST/PATCH/DELETE /api/profiles.
// budget-profiles spec: "Profile Entity", "Create, Rename, List Profiles",
// "Default Profile and Minimum-One Invariant", "Archiving the Active
// Profile Is Rejected".
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../server/index.js';
import db from '../../server/db.js';
import { resetDb, closeDb, DEFAULT_PROFILE_ID } from './support.js';
import { requireActiveProfile } from '../../server/services/profiles.js';

beforeEach(resetDb);
afterAll(closeDb);

// task 2.3 — supersedes the Phase 1 stub coverage: requireActiveProfile now
// resolves req.profileId from settings.active_profile (budget-profiles
// spec, "Server-Resolved Active Profile") instead of always calling next().
describe('requireActiveProfile middleware', () => {
  it('sets req.profileId from settings.active_profile and calls next()', async () => {
    const req = {};
    let called = false;
    await requireActiveProfile(req, {}, () => {
      called = true;
    });
    expect(called).toBe(true);
    expect(req.profileId).toBe(DEFAULT_PROFILE_ID);
  });

  it('passes a 500 error to next() when active_profile is unset (should never happen post-migration)', async () => {
    await db('settings').where({ key: 'active_profile' }).delete();
    const req = {};
    let receivedErr;
    await requireActiveProfile(req, {}, (err) => {
      receivedErr = err;
    });
    expect(receivedErr).toBeDefined();
    expect(receivedErr.status).toBe(500);
    expect(req.profileId).toBeUndefined();
  });
});

describe('POST /api/profiles', () => {
  it('creates a profile and responds 201', async () => {
    const res = await request(app).post('/api/profiles').send({ name: 'Negocio' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Negocio', archived: false });
    expect(typeof res.body.id).toBe('string');
    expect(typeof res.body.createdAt).toBe('string');
  });

  it('responds 400 when name is blank', async () => {
    const res = await request(app).post('/api/profiles').send({ name: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe('name');
  });

  it('responds 409 for a duplicate live name', async () => {
    await request(app).post('/api/profiles').send({ name: 'Personal' });
    const res = await request(app).post('/api/profiles').send({ name: 'Personal' });
    expect(res.status).toBe(409);
  });

  it('an archived profile does not block a new one with the same name', async () => {
    const created = await request(app).post('/api/profiles').send({ name: 'Viejo' });
    // Two live profiles exist now (default + "Viejo"), so archiving "Viejo" is legal.
    const archived = await request(app).delete(`/api/profiles/${created.body.id}`);
    expect(archived.status).toBe(204);

    const recreated = await request(app).post('/api/profiles').send({ name: 'Viejo' });
    expect(recreated.status).toBe(201);
    expect(recreated.body.name).toBe('Viejo');
  });
});

describe('GET /api/profiles', () => {
  it('lists only live profiles by default', async () => {
    const created = await request(app).post('/api/profiles').send({ name: 'Negocio' });
    await request(app).delete(`/api/profiles/${created.body.id}`);

    const res = await request(app).get('/api/profiles');
    expect(res.status).toBe(200);
    const ids = res.body.map((p) => p.id);
    expect(ids).toContain(DEFAULT_PROFILE_ID);
    expect(ids).not.toContain(created.body.id);
  });

  it('includes archived profiles with ?includeArchived=1', async () => {
    const created = await request(app).post('/api/profiles').send({ name: 'Negocio' });
    await request(app).delete(`/api/profiles/${created.body.id}`);

    const res = await request(app).get('/api/profiles?includeArchived=1');
    expect(res.status).toBe(200);
    const target = res.body.find((p) => p.id === created.body.id);
    expect(target).toBeDefined();
    expect(target.archived).toBe(true);
  });
});

describe('PATCH /api/profiles/:id', () => {
  it('renames a profile', async () => {
    const created = await request(app).post('/api/profiles').send({ name: 'Personal' });
    const res = await request(app).patch(`/api/profiles/${created.body.id}`).send({ name: 'Personal 2026' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Personal 2026');

    const list = await request(app).get('/api/profiles');
    expect(list.body.find((p) => p.id === created.body.id).name).toBe('Personal 2026');
  });

  it('responds 404 for an unknown profile id', async () => {
    const res = await request(app).patch('/api/profiles/prof_ffffffff').send({ name: 'X' });
    expect(res.status).toBe(404);
  });

  it('responds 409 when renaming to a duplicate live name', async () => {
    const created = await request(app).post('/api/profiles').send({ name: 'Negocio' });
    const res = await request(app).patch(`/api/profiles/${created.body.id}`).send({ name: 'General' });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/profiles/:id (archive)', () => {
  it('archives a non-last, non-active profile and its data remains in the database', async () => {
    const created = await request(app).post('/api/profiles').send({ name: 'Negocio' });
    const [{ id: categoryId }] = await db('categories')
      .insert({ id: 'cat_negocio1', name: 'Marketing', profile_id: created.body.id })
      .returning('id');

    const res = await request(app).delete(`/api/profiles/${created.body.id}`);
    expect(res.status).toBe(204);

    const row = await db('budget_profiles').where({ id: created.body.id }).first();
    expect(row.archived).toBe(true);

    const category = await db('categories').where({ id: categoryId }).first();
    expect(category).toBeDefined();
  });

  it('responds 409 last_profile when archiving the only remaining profile', async () => {
    const res = await request(app).delete(`/api/profiles/${DEFAULT_PROFILE_ID}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('last_profile');

    const row = await db('budget_profiles').where({ id: DEFAULT_PROFILE_ID }).first();
    expect(row.archived).toBe(false);
  });

  it('responds 409 profile_is_active when archiving the currently active profile (2+ profiles exist)', async () => {
    await request(app).post('/api/profiles').send({ name: 'Negocio' });
    // DEFAULT_PROFILE_ID is active per resetDb's seeded settings row.
    const res = await request(app).delete(`/api/profiles/${DEFAULT_PROFILE_ID}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('profile_is_active');

    const row = await db('budget_profiles').where({ id: DEFAULT_PROFILE_ID }).first();
    expect(row.archived).toBe(false);
  });

  it('responds 404 for an unknown profile id', async () => {
    const res = await request(app).delete('/api/profiles/prof_ffffffff');
    expect(res.status).toBe(404);
  });
});

// task 4.5/4.6 — budget-api spec: "Creating and switching to a new profile",
// "Setting active profile to an archived profile is rejected".
describe('PUT /api/profiles/active', () => {
  it('switches the active profile and returns a full bootstrap payload for it', async () => {
    const created = await request(app).post('/api/profiles').send({ name: 'Negocio' });

    const res = await request(app).put('/api/profiles/active').send({ profileId: created.body.id });
    expect(res.status).toBe(200);
    expect(res.body.settings.activeProfile).toBe(created.body.id);
    expect(res.body.profiles.map((p) => p.id)).toContain(created.body.id);
    expect(res.body.categories).toEqual([]);
    expect(res.body.month).toBeNull();

    const settings = await request(app).get('/api/settings');
    expect(settings.body.activeProfile).toBe(created.body.id);
  });

  it('only returns the newly active profile\'s categories, not the previous profile\'s', async () => {
    await request(app).post('/api/categories').send({ name: 'Comida (default profile)' });
    const created = await request(app).post('/api/profiles').send({ name: 'Negocio' });

    const res = await request(app).put('/api/profiles/active').send({ profileId: created.body.id });
    expect(res.status).toBe(200);
    expect(res.body.categories).toEqual([]);
  });

  it('responds 404 for an unknown profileId and leaves the active profile unchanged', async () => {
    const res = await request(app).put('/api/profiles/active').send({ profileId: 'prof_ffffffff' });
    expect(res.status).toBe(404);

    const settings = await request(app).get('/api/settings');
    expect(settings.body.activeProfile).toBe(DEFAULT_PROFILE_ID);
  });

  it('responds 409 for an archived profileId and leaves the active profile unchanged', async () => {
    const created = await request(app).post('/api/profiles').send({ name: 'Viejo' });
    await request(app).delete(`/api/profiles/${created.body.id}`);

    const res = await request(app).put('/api/profiles/active').send({ profileId: created.body.id });
    expect(res.status).toBe(409);

    const settings = await request(app).get('/api/settings');
    expect(settings.body.activeProfile).toBe(DEFAULT_PROFILE_ID);
  });

  it('responds 400 when profileId is missing', async () => {
    const res = await request(app).put('/api/profiles/active').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe('profileId');
  });
});
