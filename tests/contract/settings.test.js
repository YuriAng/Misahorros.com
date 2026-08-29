// Contract tests (task 7.1): GET/PUT /api/settings.
// Also guards design.md's "PUT /api/settings never materializes a month".
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../server/index.js';
import { resetDb, closeDb, monthsRowCount } from './support.js';

beforeEach(resetDb);
afterAll(closeDb);

describe('GET /api/settings', () => {
  it('returns default currency USD and a null activeMonth on a fresh database', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ currency: 'USD', activeMonth: null });
  });
});

describe('PUT /api/settings', () => {
  it('updates currency and activeMonth and returns the merged settings', async () => {
    const res = await request(app).put('/api/settings').send({ currency: 'EUR', activeMonth: '2026-03' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ currency: 'EUR', activeMonth: '2026-03' });
  });

  it('never creates a months row as a side effect of setting activeMonth', async () => {
    const before = await monthsRowCount();
    await request(app).put('/api/settings').send({ activeMonth: '2026-07' });
    const after = await monthsRowCount();
    expect(after).toBe(before);
    expect(after).toBe(0);
  });

  it('leaves currency unchanged when only activeMonth is sent', async () => {
    await request(app).put('/api/settings').send({ currency: 'EUR' });
    const res = await request(app).put('/api/settings').send({ activeMonth: '2026-08' });
    expect(res.body).toEqual({ currency: 'EUR', activeMonth: '2026-08' });
  });
});
