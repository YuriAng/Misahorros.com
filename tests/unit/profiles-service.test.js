// Unit test (task 1.6): server/services/profiles.js's `requireActiveProfile`
// middleware. Phase 1 stub only — it must exist and behave as a no-op
// pass-through so router wiring in later phases has something to import;
// real `settings.active_profile` resolution lands in Phase 2 (task 2.3).
// Triangulation skipped: purely structural stub, single behavior (call
// `next()`), no branching yet.
import { describe, it, expect } from 'vitest';
import { requireActiveProfile } from '../../server/services/profiles.js';

describe('requireActiveProfile (Phase 1 stub)', () => {
  it('calls next() without throwing', async () => {
    const req = {};
    const res = {};
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    await requireActiveProfile(req, res, next);

    expect(nextCalled).toBe(true);
  });
});
