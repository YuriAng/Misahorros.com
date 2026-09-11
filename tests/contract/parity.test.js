// Parity test: server-computed `categoryTotals`/`totals` (via
// `getMonthPayload` / GET /api/months/{k}) equal the client's pure
// functions (`getCategorySpent`/`getCategoryBudget`/`getCategoryRemaining`/
// `getMonthTotals` from src/state.js) over the SAME shared fixture data
// (design.md "Decision: Balances derived in SQL; client re-derives from
// cached rows" — "a Vitest parity test asserts server aggregates equal
// client functions over the same fixture, so drift fails the build").
// Task 7.1-7.2 extends this file: parity MUST independently hold for a
// second, non-default profile too — the derivation logic is profile-blind,
// but the fixture that feeds it must come from each profile's own scoped
// data, never a mix (budget-profiles spec, "Full Data Isolation Across
// Profiles").
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../server/index.js';
import { resetDb, closeDb, insertCategory, setActiveProfile } from './support.js';

// src/state.js's top-level `let cache = defaultData()` only touches
// localStorage lazily (inside storage.js's loadData/api.js's fetch calls),
// neither of which the pure calculation functions below ever invoke — but
// tests/unit/state.test.js installs this same stand-in before importing, so
// we mirror that pattern for consistency with the rest of the suite.
function createLocalStorageMock() {
  let store = {};
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
}

globalThis.localStorage = globalThis.localStorage || createLocalStorageMock();

const { getData, getCategorySpent, getCategoryBudget, getCategoryRemaining, getMonthTotals } = await import(
  '../../src/state.js'
);

beforeEach(resetDb);
afterAll(closeDb);

const MONTH_KEY = '2026-05';

describe('server/client balance parity', () => {
  it('server categoryTotals and totals match the client pure functions over the same fixture', async () => {
    const catA = await insertCategory({ id: 'cat_parity_a', name: 'Food' });
    const catB = await insertCategory({ id: 'cat_parity_b', name: 'Fun' });
    const catC = await insertCategory({ id: 'cat_parity_c', name: 'No budget, no spend' });

    await request(app).put(`/api/months/${MONTH_KEY}/income`).send({ amount: 1500 });
    await request(app).put(`/api/months/${MONTH_KEY}/budgets/${catA.id}`).send({ amount: 400 });
    await request(app).put(`/api/months/${MONTH_KEY}/budgets/${catB.id}`).send({ amount: 200 });

    await request(app)
      .post('/api/transactions')
      .send({ categoryId: catA.id, amount: 50, date: `${MONTH_KEY}-05T12:00:00.000Z` });
    await request(app)
      .post('/api/transactions')
      .send({ categoryId: catA.id, amount: 25, date: `${MONTH_KEY}-06T12:00:00.000Z` });
    await request(app)
      .post('/api/transactions')
      .send({ categoryId: catB.id, amount: 500, date: `${MONTH_KEY}-07T12:00:00.000Z` }); // exceeds budget — negative remaining

    const server = await request(app).get(`/api/months/${MONTH_KEY}`);
    expect(server.status).toBe(200);

    // Install the SAME fixture, in the exact `defaultData()` month shape,
    // into the client's in-memory cache — the shared fixture data both
    // derivations run against.
    const state = getData();
    state.months[MONTH_KEY] = {
      income: { ...server.body.income },
      budgets: { ...server.body.budgets },
      transactions: server.body.transactions.map((t) => ({ ...t })),
    };

    for (const categoryId of [catA.id, catB.id, catC.id]) {
      const serverTotals = server.body.categoryTotals[categoryId];
      expect(getCategoryBudget(MONTH_KEY, categoryId)).toBe(serverTotals.budget);
      expect(getCategorySpent(MONTH_KEY, categoryId)).toBe(serverTotals.spent);
      expect(getCategoryRemaining(MONTH_KEY, categoryId)).toBe(serverTotals.remaining);
    }

    // catB's remaining is negative (500 spent against a 200 budget) —
    // confirms parity holds in the over-budget case too, not just the
    // happy path.
    expect(server.body.categoryTotals[catB.id].remaining).toBe(-300);
    expect(getCategoryRemaining(MONTH_KEY, catB.id)).toBe(-300);

    expect(getMonthTotals(MONTH_KEY)).toEqual(server.body.totals);
  });

  it('parity holds for an untouched month too: both sides agree on all-zero totals', async () => {
    const category = await insertCategory({ id: 'cat_parity_zero' });
    const server = await request(app).get('/api/months/2026-09');

    const state = getData();
    state.months['2026-09'] = {
      income: { ...server.body.income },
      budgets: { ...server.body.budgets },
      transactions: [],
    };

    expect(getCategoryBudget('2026-09', category.id)).toBe(0);
    expect(getCategorySpent('2026-09', category.id)).toBe(0);
    expect(getCategoryRemaining('2026-09', category.id)).toBe(0);
    expect(getMonthTotals('2026-09')).toEqual(server.body.totals);
  });

  it('parity holds independently for a second, non-default profile (task 7.1/7.2)', async () => {
    // Seed the default profile with data that must NOT influence profile B's
    // parity check — the two derivations run over B's own fixture only.
    const catDefault = await insertCategory({ id: 'cat_parity_default', name: 'Comida' });
    await request(app).put(`/api/months/${MONTH_KEY}/income`).send({ amount: 5000 });
    await request(app).put(`/api/months/${MONTH_KEY}/budgets/${catDefault.id}`).send({ amount: 4000 });

    const createProfileRes = await request(app).post('/api/profiles').send({ name: 'Negocio' });
    const profileB = createProfileRes.body;
    await setActiveProfile(profileB.id);

    const catB1 = await insertCategory({ id: 'cat_parity_b1', name: 'Ventas', profileId: profileB.id });
    const catB2 = await insertCategory({ id: 'cat_parity_b2', name: 'Insumos', profileId: profileB.id });

    await request(app).put(`/api/months/${MONTH_KEY}/income`).send({ amount: 800 });
    await request(app).put(`/api/months/${MONTH_KEY}/budgets/${catB1.id}`).send({ amount: 300 });
    await request(app)
      .post('/api/transactions')
      .send({ categoryId: catB1.id, amount: 120, date: `${MONTH_KEY}-03T12:00:00.000Z` });
    await request(app)
      .post('/api/transactions')
      .send({ categoryId: catB2.id, amount: 60, date: `${MONTH_KEY}-04T12:00:00.000Z` });

    const server = await request(app).get(`/api/months/${MONTH_KEY}`);
    expect(server.status).toBe(200);
    expect(server.body.income.amount).toBe(800);
    // Profile A's fixture (income 5000, cat_parity_default budget 4000) must
    // be absent from profile B's server response, or the parity check below
    // would trivially pass against a contaminated fixture.
    expect(server.body.categoryTotals[catDefault.id]).toBeUndefined();

    const state = getData();
    state.months[MONTH_KEY] = {
      income: { ...server.body.income },
      budgets: { ...server.body.budgets },
      transactions: server.body.transactions.map((t) => ({ ...t })),
    };

    for (const categoryId of [catB1.id, catB2.id]) {
      const serverTotals = server.body.categoryTotals[categoryId];
      expect(getCategoryBudget(MONTH_KEY, categoryId)).toBe(serverTotals.budget);
      expect(getCategorySpent(MONTH_KEY, categoryId)).toBe(serverTotals.spent);
      expect(getCategoryRemaining(MONTH_KEY, categoryId)).toBe(serverTotals.remaining);
    }

    // catB2 has spend but no budget — a distinct code path from catB1
    // (budget + spend), so this triangulates the aggregate, not just repeats it.
    expect(server.body.categoryTotals[catB2.id]).toEqual({ budget: 0, spent: 60, remaining: -60 });
    expect(getCategoryRemaining(MONTH_KEY, catB2.id)).toBe(-60);

    expect(getMonthTotals(MONTH_KEY)).toEqual(server.body.totals);
  });
});
